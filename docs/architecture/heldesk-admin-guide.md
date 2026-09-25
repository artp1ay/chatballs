# Архитектурное руководство Heldesk для администраторов и инженеров

**Версия документации:** 1.0
**Версия продукта:** 1.15.0
**Статус:** Действующая документация
**Связанные задачи:** HOM-30, HOM-33, HOM-47, HOM-48, HOM-49
**Аудитория:** администраторы установки, backend-инженеры, инженеры эксплуатации

---

## 1. Обзор модуля

Доменное ядро заявок реализовано в Django-приложении `chatballs.tickets`. Модуль строго изолирован по организациям (мультитенантность), использует транзакционный Outbox для гарантированной доставки уведомлений и realtime-сигнал для обновления интерфейса операторов.

Состав приложения:

```text
chatballs/tickets/
├── apps.py
├── models.py
├── models/
│   ├── ticket.py        # Ticket (агрегат)
│   ├── activities.py    # TicketNote, TicketComment, TicketEvent
│   ├── delivery.py      # TicketDelivery, политики уведомления
│   ├── links.py         # TicketConversationLink, TicketContactLink
│   ├── access.py        # TicketPublicAccess
│   └── settings.py      # HeldeskSettings, TicketNumberCounter
├── state_machine.py     # Матрица переходов, optimistic concurrency
├── authorization.py     # Полномочия TICKETS_VIEW, TICKETS_MANAGE
├── selectors.py         # Чтение и фильтрация
├── payloads.py          # Сериализация в JSON
├── services/
│   ├── ticket_creation.py       # Создание, генерация номеров
│   ├── ticket_mutation.py       # Редактирование, заметки, комментарии
│   ├── delivery_dispatch.py     # Оркестрация уведомлений
│   ├── customer_notifications.py# Разрешение канала клиента
│   ├── staff_notifications.py   # Внутренние уведомления
│   └── public_access.py         # Гостевые токены
├── event_handlers.py    # Обработчики Outbox-событий
├── realtime.py          # Сигнал tickets.inbox.changed
├── api/                 # REST-представления
├── urls.py              # Внутренние маршруты
└── public_urls.py       # Гостевые маршруты
```

Смежные модули:

- `chatballs.notifications` — внутренние уведомления сотрудникам (`Notification` с типами `TICKET_NEW`, `TICKET_ASSIGNED`, `TICKET_STATUS_CHANGED`, `TICKET_CUSTOMER_REPLIED`);
- `chatballs.conversations.transports` — отправка внешних сообщений клиенту в привязанный диалог;
- `chatballs.events` — транзакционный Outbox (`OutboxEvent`, `enqueue_event`, воркер `run_worker`).

---

## 2. Доменная модель

### 2.1. `HeldeskSettings` и `TicketNumberCounter`

- `HeldeskSettings`: настройки раздела на организацию (связь один к одному с `Organization`, `on_delete=PROTECT`). Поля: `is_enabled` (по умолчанию `true`), `ticket_number_prefix` (по умолчанию `TKT`), `default_category` (по умолчанию `general`), `auto_close_resolved_days` (по умолчанию `7`).
- `TicketNumberCounter`: счётчик номеров на организацию (связь один к одному, `on_delete=PROTECT`). Поле `next_number` (по умолчанию `1`).

Генерация номера выполняется в транзакции с блокировкой строки счётчика (`select_for_update`). Формат: `{prefix}-{next_number:06d}`, например `TKT-000104`. Пара (`organization`, `number`) уникальна.

### 2.2. `Ticket` (агрегат)

Ключевые поля:

- `organization` (`PROTECT`), `number` (уникален в паре с организацией, индекс), `subject`, `description`;
- `status` (по умолчанию `NEW`, индекс), `priority` (по умолчанию `NORMAL`, индекс), `category` (по умолчанию `general`, индекс);
- `requester_contact` (`PROTECT`, связь с `conversations.Contact`);
- `assignee_membership` (`SET_NULL`, связь с `identity.OrganizationMembership`);
- `group` (`SET_NULL`, связь с `identity.EmployeeGroup`);
- `origin_conversation` (`SET_NULL`, связь с `conversations.Conversation`);
- `version` (оптимистическая блокировка, по умолчанию `1`);
- `resolution_reason`, `cancellation_reason`;
- `created_at` (индекс), `updated_at`, `resolved_at`, `closed_at`.

Важные инварианты:

- удаление диалога не удаляет заявку: `on_delete=SET_NULL` для `origin_conversation` и связей `TicketConversationLink`;
- удаление заявителя запрещено, пока есть заявки (`PROTECT`);
- каждое изменение статуса или полей увеличивает `version` и пишет событие в `TicketEvent`.

### 2.3. Связи с диалогами и контактами

- `TicketConversationLink`: связь заявки с диалогами. Поля: `ticket` (`CASCADE`), `conversation` (`SET_NULL`), `origin_channel` (`SET_NULL`), `link_type` (`primary` или `referenced`), `created_at`.
- `TicketContactLink`: связь заявки с контактами. Поля: `ticket` (`CASCADE`), `contact` (`PROTECT`), `role` (`requester`, `participant`, `cc`).

### 2.4. Коммуникации и аудит

- `TicketNote`: внутренняя заметка. Поля: `ticket` (`CASCADE`), `author_membership` (`PROTECT`), `text`, `created_at`. Клиентской доставки не порождает.
- `TicketComment`: публичный комментарий. Поля: `ticket` (`CASCADE`), `author_membership` (`SET_NULL`), `author_contact` (`SET_NULL`), `text`, `is_public` (по умолчанию `true`), `created_at`.
- `TicketEvent`: неизменяемый аудит. Поля: `ticket` (`CASCADE`), `event_type` (индекс), `actor_membership` (`SET_NULL`), `actor_contact` (`SET_NULL`), `old_values` (`JSON`), `new_values` (`JSON`), `notify_customer` (по умолчанию `false`), `suppression_reason`, `created_at` (индекс).

Типы событий: `CREATED`, `CREATED_FROM_CONVERSATION`, `STATUS_CHANGED`, `ASSIGNEE_CHANGED`, `PRIORITY_CHANGED`, `COMMENT_ADDED`, `NOTE_ADDED`, `LINKED_TO_CONVERSATION`, `UPDATED`.

### 2.5. `TicketDelivery` (очередь клиентской доставки)

Таблица `tickets_ticketdelivery` (модель `chatballs/tickets/models/delivery.py`):

- `ticket` (`CASCADE`), `event` (`CASCADE`);
- `channel`: `EMAIL`, `TELEGRAM`, `VK`, `MAX`, `WEB`;
- `destination`: адрес получателя (адрес почты, идентификатор чата);
- `destination_key_hash`: SHA-256 от строки `{channel}:{destination}`, индекс;
- `status`: `PENDING`, `SENT`, `FAILED`, `SUPPRESSED`, `UNCERTAIN` (по умолчанию `PENDING`, индекс);
- `customer_notice`: `SEND`, `SUPPRESS`, `NOT_REQUIRED` (по умолчанию `SEND`);
- `suppression_reason`, `attempts` (по умолчанию `0`), `max_attempts` (по умолчанию `5`), `last_error`;
- `lease_expires_at`, `sent_at`, `created_at` (индекс), `updated_at`.

Ограничения:

- уникальность (`event`, `destination_key_hash`) — защита от дублей;
- составной индекс (`status`, `lease_expires_at`) — выборка очереди воркером.

### 2.6. `TicketPublicAccess`

Гостевой доступ: `ticket` (один к одному, `CASCADE`), `token_hash` (уникальный, индекс; хранится только хэш), `expires_at`, `is_active` (по умолчанию `true`), `created_at`.

### 2.7. Структура базы данных

Основные таблицы:

- `tickets_ticket`;
- `tickets_ticketconversationlink`;
- `tickets_ticketcontactlink`;
- `tickets_ticketnote`;
- `tickets_ticketcomment`;
- `tickets_ticketevent`;
- `tickets_ticketdelivery`;
- `tickets_ticketpublicaccess`;
- `tickets_heldesksettings`;
- `tickets_ticketnumbercounter`.

Миграции:

- `0001_initial` — создание таблиц;
- `0002_tickets_rls` — политики изоляции и триггеры для базовых таблиц;
- `0003_ticket_delivery` — таблица доставок;
- `0004_ticket_delivery_rls` — политики изоляции для доставок.

---

## 3. Изоляция арендаторов: RLS и межарендные триггеры

### 3.1. Принципы

Все модели заявок наследуются от `TenantRelationModel` и объявляют `tenant_relation_fields` — список внешних ключей, которые должны принадлежать той же организации.

Примеры:

- `Ticket`: `("requester_contact", "assignee_membership", "group", "origin_conversation")`;
- `TicketDelivery`: `("ticket", "event")`;
- `TicketEvent`: `("ticket", "actor_membership", "actor_contact")`.

### 3.2. Политики PostgreSQL RLS

Каждая таблица включается в режим принудительной изоляции:

```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
```

Политики:

- `chatballs_tenant_isolation`: `USING (organization_id = chatballs.current_organization_id()) WITH CHECK (organization_id = chatballs.current_organization_id())`;
- `chatballs_schema_access`: доступ для служебной схемы миграций.

Контекст организации задаётся функцией `chatballs.current_organization_id()` на время запроса и фоновой обработки. Прямые SQL-запросы без установленного контекста данных заявок не видят.

### 3.3. Триггеры межарендных связей

На все внешние ключи ставятся триггеры `chatballs.enforce_tenant_fk`, проверяющие совпадение `organization_id` связанных строк. Нарушение отклоняется на уровне базы независимо от прикладного кода.

Покрытие для заявок:

- `tickets_ticket` → `conversations_contact`, `identity_organizationmembership`, `identity_employeegroup`, `conversations_conversation`;
- `tickets_ticketconversationlink` → `tickets_ticket`, `conversations_conversation`;
- `tickets_ticketnote` → `tickets_ticket`, `identity_organizationmembership`;
- `tickets_ticketcomment` → `tickets_ticket`;
- `tickets_ticketevent` → `tickets_ticket`;
- таблицы доставок и гостевого доступа → родительские заявки и события.

Модели дополнительно реализуют проверку в `clean()`, но триггер остаётся последней линией защиты.

### 3.4. Проверка изоляции

Для проверки используйте тесты `test_cross_tenant.py` и `test_rls.py` модуля заявок: попытка привязать заявку к контакту, сотруднику, группе или диалогу другой организации должна отклоняться. После изменения политик обязательно прогоняйте эти тесты с флагом `--reuse-db`.

---

## 4. Конвейер уведомлений и Outbox

### 4.1. Разделение потоков

- **Внутренние уведомления сотрудникам** создаются через `chatballs.notifications.services.notify()` с типами `TICKET_NEW`, `TICKET_ASSIGNED`, `TICKET_STATUS_CHANGED`, `TICKET_CUSTOMER_REPLIED`. Они не зависят от флага подавления клиентских уведомлений.
- **Внешние сообщения клиенту** отправляются только в привязанный диалог через `conversations.transports` (или прямые канальные адаптеры). Без привязанного диалога и разрешённого адресата доставка не создаётся.

Решение о клиентской доставке принимает `should_deliver_to_customer` (см. спецификацию API). Внутренние заметки и служебные правки клиентской доставки не создают.

### 4.2. Жизненный цикл `TicketDelivery`

```text
PENDING → SENT | FAILED → PENDING (повтор) → SENT | FAILED
PENDING → SUPPRESSED (при политике SUPPRESS)
PENDING/FAILED → UNCERTAIN (при неоднозначном исходе транспорта)
```

- `PENDING`: ожидает обработки воркером.
- `SENT`: транспорт подтвердил отправку, проставлено `sent_at`.
- `FAILED`: исчерпаны попытки или ошибка без права повтора, причина в `last_error`.
- `SUPPRESSED`: уведомление подавлено оператором, транспорт не вызывался, причина в `suppression_reason`.
- `UNCERTAIN`: исход неизвестен (таймаут, обрыв), требуется сверка с провайдером.

Дедупликация: повторная постановка того же события на тот же адрес разрешается ограничением `uniq_ticket_delivery_event_destination` и не создаёт второй строки.

### 4.3. Подавление уведомлений

Политика `CustomerNoticePolicy`:

- `SEND` — отправить уведомление (по умолчанию);
- `SUPPRESS` — не отправлять внешнее сообщение, зафиксировать `SUPPRESSED` и причину;
- `NOT_REQUIRED` — доставка не требуется (например, внутренний комментарий или заметка), запись доставки не создаётся.

При `SUPPRESS` без причины API возвращает `400 suppression_reason_required`. Транзакционные и обязательные сервисные события подавить нельзя.

### 4.4. Воркеры Outbox

Доставка выполняется стандартным механизмом `OutboxEvent` и воркером `run_worker`:

1. Сервисный слой `dispatch_ticket_event` создаёт `TicketDelivery`, ставит `tickets.delivery_dispatched` и `tickets.staff_notification` в Outbox и отправляет realtime-сигнал.
2. Обработчик `@register("tickets.delivery_dispatched")` в `chatballs/tickets/event_handlers.py` забирает доставку с блокировкой `select_for_update(skip_locked=True)`.
3. Если политика `SUPPRESS` — статус переводится в `SUPPRESSED` без вызова транспорта.
4. Если политика `SEND` — вызывается транспорт канала. При успехе статус `SENT`, при временной ошибке планируется повтор с экспоненциальной задержкой (`attempts`, `max_attempts = 5`, `lease_expires_at`, `last_error`).

Настройка воркера выполняется общими параметрами фоновой обработки установки (число реплик, интервал опроса Outbox, таймауты транспортов). Отдельных очередей только для заявок нет: заявки используют общую очередь доменных событий с типом `tickets.delivery_dispatched`.

### 4.5. Мониторинг

Минимальный набор проверок:

| Сигнал | Где смотреть | Действие |
|---|---|---|
| Рост `PENDING` с просроченным `lease_expires_at` | Выборка `tickets_ticketdelivery` по индексу (`status`, `lease_expires_at`) | Проверить живость воркера `run_worker` и доступность транспортов |
| Рост `FAILED` | Поле `last_error`, группировка по `channel` | Проверить интеграции каналов (Email, Telegram, VK, MAX, веб-чат) |
| Рост `UNCERTAIN` | Журнал воркера и ответы провайдеров | Сверить факт отправки с провайдером, при необходимости перевести вручную |
| Доля `SUPPRESSED` выше обычной | История `TicketEvent.suppression_reason` | Проверить, не злоупотребляют ли операторы тихим режимом |
| Отсутствие `tickets.inbox.changed` при изменениях | Журнал realtime-публикаций | Проверить публикацию в `inbox_group` и подключение WebSocket |

Полезные запросы для диагностики:

```sql
SELECT status, channel, count(*)
FROM tickets_ticketdelivery
WHERE created_at > now() - interval '1 day'
GROUP BY status, channel;

SELECT id, ticket_id, event_id, channel, attempts, last_error, lease_expires_at
FROM tickets_ticketdelivery
WHERE status IN ('PENDING', 'FAILED', 'UNCERTAIN')
ORDER BY created_at DESC
LIMIT 50;
```

Журналы обработчика ведутся через стандартный логгер модуля `delivery_dispatch`. Ошибки транспорта фиксируются в `last_error` с числом попыток.

### 4.6. Восстановление после сбоев

- Временные ошибки транспорта переводят доставку в повтор с ростом задержки. Вмешательство не требуется, пока `attempts < max_attempts`.
- При исчерпании попыток доставка остаётся `FAILED` с текстом ошибки. После устранения причины (например, восстановлен токен бота) инженер может вернуть запись в `PENDING` штатной процедурой повторной постановки или создать компенсирующее событие.
- Дубликаты исключены ограничением уникальности: повторная постановка того же события безопасна.
- Потерянные лизы (воркер упал между захватом и отправкой) подбираются по истечении `lease_expires_at` другим воркером благодаря `skip_locked`.

---

## 5. Realtime и масштабирование чтения

Сигнал `tickets.inbox.changed` публикуется при каждом изменении заявки через `notify_tickets_inbox_changed(organization_id)` в групповой канал `inbox_group(organization_id)`.

Рекомендации:

- не передавать через сокет тексты, персональные данные и идентификаторы заявок — только факт изменения;
- клиентский интерфейс после сигнала перезапрашивает REST-список или карточку;
- списки используют keyset-пагинацию (`after`, `window_size`) и стабильную сортировку, что позволяет держать реестр отзывчивым при десятках тысяч заявок;
- тяжёлые выборки истории (`events`, `comments`, `notes`) выполняются отдельными запросами вкладок, а не в составе списка.

---

## 6. Конфигурация и установка

### 6.1. Включение раздела

Раздел управляется записью `HeldeskSettings` на организацию:

- `is_enabled` — главный выключатель раздела;
- `ticket_number_prefix` — префикс номеров (изменение не переименовывает уже выданные номера);
- `default_category` — категория по умолчанию для новых заявок;
- `auto_close_resolved_days` — плановый срок автозакрытия решённых заявок (дней).

### 6.2. Права доступа

Полномочия модуля (`chatballs/tickets/authorization.py`):

- `TICKETS_VIEW` (`tickets.view`) — чтение реестра, карточки, истории;
- `TICKETS_MANAGE` (`tickets.manage`) — создание, редактирование, переходы, комментарии, выпуск гостевых токенов.

Маршруты раздела в интерфейсе (`tickets`, `ticketDetail`) доступны руководителям и сотрудникам с `tickets.view`. Без полномочий раздел скрыт из меню.

### 6.3. Локализация

Системные тексты заявок хранятся в каталогах `chatballs/i18n/messages/ru.py` и `en.py` (ключи `tickets.*`). Интерфейс использует `apps/internal-ui/src/i18n/ru.ts` и `en.ts` (секция `tickets`). Новые статусы, приоритеты и тексты ошибок добавляются сначала в русскую версию, затем зеркалятся в английскую. Рассогласование каталогов выявляется тестом каталога и проверкой типов.

### 6.4. Правила разработки

- Лимит размера файлов: не более 300 строк на файл, доменная логика разнесена по подмодулям.
- Язык системных событий и подписей журнала: в базе хранится код, фраза собирается на языке читателя. Готовые русские фразы в историю не пишутся.
- Тексты, уходящие клиенту, формируются на языке организации, а не на языке оператора.
- Тексты интерфейса не хранятся в коде напрямую, а подставляются через `t(...)`.

---

## 7. Контроль соответствия реализации

- Модели сверены с `chatballs/tickets/models/*.py` (`ticket.py`, `activities.py`, `delivery.py`, `links.py`, `access.py`, `settings.py`).
- Машина состояний сверена с `chatballs/tickets/state_machine.py`.
- Конвейер уведомлений сверен с `services/delivery_dispatch.py`, `services/customer_notifications.py`, `services/staff_notifications.py`, `event_handlers.py`.
- Realtime-сигнал сверен с `chatballs/tickets/realtime.py`.
- Миграции сверены с `chatballs/tickets/migrations/0001_initial.py` … `0004_ticket_delivery_rls.py`.
- Полномочия сверены с `chatballs/tickets/authorization.py`.
- Интерфейс сверен с `apps/internal-ui/src/features/tickets/` и `docs/architecture/adr-heldesk-frontend-baseline.md`.
