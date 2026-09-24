# Архитектурная спецификация (ADR): Событийная модель тикетов, Outbox, доставка уведомлений клиентам и механизм подавления

- **Статус:** Утверждено к реализации
- **Ответственный архитектор:** CTO (`71e9a980-ae7d-4335-bf89-6cbfd4006d36`)
- **Исполнитель реализации:** Backend Dev (`78b0d447-f324-4e8b-9329-250791bd443a`)
- **Связанные задачи:** [HOM-30](/HOM/issues/HOM-30), [HOM-47](/HOM/issues/HOM-47), [HOM-48](/HOM/issues/HOM-48)

---

## 1. Контекст и архитектурные цели

В рамках подсистемы Helpdesk после запуска ядра `chatballs.tickets` ([HOM-47](/HOM/issues/HOM-47)) требуется реализовать асинхронный, устойчивый к сбоям конвейер доставки клиентских и внутренних уведомлений с гарантией at-least-once, защитой от дубликатов и раздельными потоками внутренних и внешних сообщений.

### Ключевые требования:
1. **Транзакционный Outbox и модель `TicketDelivery`:**
   - Каждое внешнее событие или изменение заявки, требующее доставки, регистрирует запись `TicketDelivery` со статусом жизненного цикла: `PENDING`, `SENT`, `FAILED`, `SUPPRESSED`, `UNCERTAIN`.
   - Взаимодействие с внешними провайдерами выполняется асинхронно через стандартный механизм `OutboxEvent` и воркер `run_worker`.
   - Дедупликация доставок по уникальному ключу `(event_id, destination_key_hash)`.
2. **Механизм избирательного подавления клиентских уведомлений («Галочка»):**
   - Поддержка параметра `customerNotice: "SEND" | "SUPPRESS" | "NOT_REQUIRED"`.
   - Если оператор при смене статуса или добавлении комментария указал «Не уведомлять клиента» (`SUPPRESS`), внешнее сообщение не отправляется, статус `TicketDelivery` помечается как `SUPPRESSED`, а причина подавления фиксируется в аудит-логе `TicketEvent`.
   - Транзакционные и обязательные сервисные события подавлять запрещено.
3. **Строгая изоляция потоков доставки:**
   - **Внутренние уведомления сотрудникам:** Создаются через существующий модуль `chatballs.notifications` (модель `Notification`) со специфичными типами (`TICKET_NEW`, `TICKET_ASSIGNED`, `TICKET_STATUS_CHANGED`, `TICKET_CUSTOMER_REPLIED`).
   - **Внешние сообщения клиенту:** Отправляются строго в диалог клиента (`conversations.transports`) через привязанные интеграции каналов (Email, Telegram, VK, MAX, Web).
4. **Realtime-сигнализация:**
   - Системный сигнал `tickets.inbox.changed` в существующий WebSocket `/ws/organizations/{uuid}/conversations/` без PII-данных для инициации REST-синхронизации клиентского UI.

---

## 2. Схема данных: `TicketDelivery`

Таблица `tickets_ticketdelivery` создается в модуле `chatballs/tickets/models/delivery.py` и наследуется от `TenantRelationModel` с полной поддержкой RLS и cross-tenant DB guards.

```python
class TicketDeliveryStatus(models.TextChoices):
    PENDING = "PENDING", "В очереди"
    SENT = "SENT", "Отправлено"
    FAILED = "FAILED", "Ошибка"
    SUPPRESSED = "SUPPRESSED", "Подавлено"
    UNCERTAIN = "UNCERTAIN", "Неопределенно"


class TicketDeliveryChannel(models.TextChoices):
    EMAIL = "EMAIL", "Email"
    TELEGRAM = "TELEGRAM", "Telegram"
    VK = "VK", "VK"
    MAX = "MAX", "MAX"
    WEB = "WEB", "Web"


class CustomerNoticePolicy(models.TextChoices):
    SEND = "SEND", "Отправить"
    SUPPRESS = "SUPPRESS", "Подавить"
    NOT_REQUIRED = "NOT_REQUIRED", "Не требуется"


class TicketDelivery(TenantRelationModel):
    tenant_relation_fields = ("ticket", "event")

    id = models.BigAutoField(primary_key=True)
    ticket = models.ForeignKey("tickets.Ticket", on_delete=models.CASCADE, related_name="deliveries")
    event = models.ForeignKey("tickets.TicketEvent", on_delete=models.CASCADE, related_name="deliveries")
    channel = models.CharField(max_length=32, choices=TicketDeliveryChannel.choices)
    destination = models.CharField(max_length=255)
    destination_key_hash = models.CharField(max_length=64, db_index=True)
    status = models.CharField(
        max_length=32,
        choices=TicketDeliveryStatus.choices,
        default=TicketDeliveryStatus.PENDING,
        db_index=True,
    )
    customer_notice = models.CharField(
        max_length=32,
        choices=CustomerNoticePolicy.choices,
        default=CustomerNoticePolicy.SEND,
    )
    suppression_reason = models.TextField(blank=True, default="")
    attempts = models.PositiveIntegerField(default=0)
    max_attempts = models.PositiveIntegerField(default=5)
    last_error = models.TextField(blank=True, default="")
    lease_expires_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["event", "destination_key_hash"],
                name="uniq_ticket_delivery_event_destination",
            )
        ]
        indexes = [
            models.Index(fields=["status", "lease_expires_at"]),
        ]
```

---

## 3. Интеграция с Outbox и обработка воркером

1. **Типы OutboxEvent:**
   - `tickets.delivery_dispatched`: событие для асинхронной доставки внешних уведомлений клиенту.
   - `tickets.staff_notification`: событие постановки внутренних уведомлений для операторов/наблюдателей.
2. **Обработчик OutboxEvent (`chatballs/tickets/event_handlers.py`):**
   - Регистрируется через декоратор `@register("tickets.delivery_dispatched")`.
   - Извлекает `TicketDelivery` с блокировкой `select_for_update(skip_locked=True)`.
   - Проверяет `customer_notice`: если `SUPPRESS`, переводит статус в `SUPPRESSED` без вызова транспорта.
   - При `SEND` вызывает соответствующий транспорт (`conversations.transports`), обновляя статус на `SENT` при успехе или планируя повтор (`mark_retry`) с экспоненциальным backoff.
3. **Дедупликация:**
   - `destination_key_hash` формируется как `hashlib.sha256(f"{channel}:{destination}".encode()).hexdigest()`.

---

## 4. Разделение потоков: Внутренние уведомления vs Внешние клиенту

1. **Внутренние уведомления сотрудникам:**
   - Модель `Notification` расширяется типами:
     - `TICKET_NEW`
     - `TICKET_ASSIGNED`
     - `TICKET_STATUS_CHANGED`
     - `TICKET_CUSTOMER_REPLIED`
   - Создаются через сервисный слой `chatballs.notifications.services.notify()` с корректной установкой `audience` / `audience_group` / `recipient_user`.
   - Внутренние уведомления **не зависят** от флага клиентского подавления (`customerNotice`).
2. **Внешние сообщения клиенту:**
   - Отправляются в привязанный `Conversation` клиента через `conversations.transports.send_reply` (или прямые канальные адаптеры), если тикет привязан к активному диалогу и клиенту положено уведомление.

---

## 5. Realtime-сигнализация через WebSocket

1. Расширение сервиса `chatballs.tickets.realtime`:
   ```python
   TICKETS_INBOX_EVENT = "tickets.inbox.changed"

   def notify_tickets_inbox_changed(organization_id: int) -> None:
       publish(inbox_group(organization_id), {"type": TICKETS_INBOX_EVENT})
   ```
2. Отправка сигнала при любых изменениях списка или деталей тикета: клиентский SPA слушает этот сигнал и выполняет перезапрос данных через REST API без передачи PII через сокет.

---

## 6. Требования к коду и модульности (NO GOD FILES)

- Каждый файл строго менее 300 строк.
- Логика разбита на подмодули:
  - `chatballs/tickets/models/delivery.py`
  - `chatballs/tickets/services/delivery_dispatch.py`
  - `chatballs/tickets/services/customer_notifications.py`
  - `chatballs/tickets/services/staff_notifications.py`
  - `chatballs/tickets/event_handlers.py`
  - `chatballs/tickets/realtime.py`
- Локализация всех системных сообщений в каталогах `chatballs/i18n/messages/ru.py` и `en.py`.
