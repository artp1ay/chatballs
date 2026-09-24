# ADR: Архитектура backend-ядра Heldesk (chatballs.tickets)

- **Статус:** Принято к реализации
- **Ответственный архитектор:** CTO
- **Исполнитель реализации:** Backend Dev
- **Связанные задачи:** [HOM-30](/HOM/issues/HOM-30), [HOM-47](/HOM/issues/HOM-47)

---

## 1. Контекст и цели

В рамках создания подсистемы Heldesk в Chatballs необходимо реализовать надёжное, строго изолированное по тенантам серверное ядро учета заявок (тикетов) в модуле `chatballs.tickets`.

### Основные требования
1. **Мультитенантность и RLS:** Все данные заявок строго изолированы на уровне БД PostgreSQL с использованием Row Level Security (RLS) и триггеров DB-guards `chatballs.enforce_tenant_fk`. Модели наследуются от `TenantRelationModel`.
2. **Консистентная нумерация заявок:** Номера заявок генерируются атомарно в формате `TKT-000001` (с настраиваемым префиксом) через блокировку строки счетчика `TicketNumberCounter` (`select_for_update`).
3. **Оптимистическая блокировка (Optimistic Concurrency):** Каждая заявка имеет поле `version: int`. Любое изменение статуса или данных инкрементирует `version`. При передаче клиентом неактуальной версии возвращается `409 Conflict`.
4. **Связь с оперативным чатом:** Заявка может быть создана из существующего диалога (`Conversation`) или привязана к нему позже (`TicketConversationLink`). При удалении диалога заявка и ее история сохраняются (`on_delete=models.SET_NULL`).
5. **Машина состояний (State Machine):** Строгий переход между статусами:
   - `NEW` (Новая)
   - `IN_PROGRESS` (В работе)
   - `WAITING_CUSTOMER` (Ожидание клиента)
   - `RESOLVED` (Решена)
   - `CLOSED` (Закрыта)
   - Дополнительные терминальные: `CANCELLED` (Отменена), `DUPLICATE` (Дубликат).
6. **Разделение коммуникаций:** Внутренние заметки (`TicketNote`) доступны только операторам; публичные комментарии (`TicketComment`) и события (`TicketEvent`) формируют историю и базу для клиентских уведомлений.
7. **Гостевой доступ:** `TicketPublicAccess` с криптографическим хэшем токена для просмотра статуса заявки без входа в систему.

---

## 2. Структура приложения `chatballs.tickets`

В соответствии с правилом **NO GOD FILES** (не более 300 строк на файл) структура приложения разбивается на специализированные модули:

```text
chatballs/tickets/
├── __init__.py
├── apps.py                  # Конфигурация Django App (TicketsConfig)
├── models.py                # Импорт моделей из подмодулей models/
├── models/
│   ├── __init__.py
│   ├── settings.py          # HeldeskSettings, TicketNumberCounter
│   ├── ticket.py            # Ticket (агрегат)
│   ├── links.py             # TicketConversationLink, TicketContactLink
│   ├── activities.py        # TicketNote, TicketComment, TicketEvent
│   └── access.py            # TicketPublicAccess
├── authorization.py         # Capabilities: TICKETS_VIEW, TICKETS_MANAGE
├── state_machine.py         # Доменный сервис переходов состояний и валидации инвариантов
├── services/
│   ├── __init__.py
│   ├── ticket_creation.py   # Создание тикетов (в т.ч. из диалогов чата), генерация номеров
│   ├── ticket_mutation.py   # Редактирование, заметки, комментарии
│   └── public_access.py     # Генерация и проверка публичных токенов
├── selectors.py             # Чтение и фильтрация тикетов, списки, аудит-логи
├── payloads.py              # Сериализация моделей в JSON-структуры
├── api/
│   ├── __init__.py
│   ├── ticket_list_views.py # List & Create тикетов, keyset пагинация
│   ├── ticket_detail_views.py # Detail, Patch, Transitions
│   ├── conversation_views.py # Создание заявки из диалога чата
│   ├── activity_views.py    # Notes, Comments, Events
│   └── public_views.py      # Публичный просмотр по токену
├── urls.py                  # Маршруты внутри организации
├── public_urls.py           # Маршруты гостевого доступа (/api/v1/help/tickets/...)
├── migrations/
│   ├── 0001_initial.py      # Создание таблиц
│   └── 0002_tickets_rls.py  # RLS политики, DB-guards триггеры
└── tests/
    ├── __init__.py
    ├── test_models.py
    ├── test_state_machine.py
    ├── test_api_tickets.py
    ├── test_conversation_tickets.py
    └── test_rls.py
```

---

## 3. Схема данных и модели

### 3.1 `HeldeskSettings`
- `organization`: 1:1 к `Organization`, `on_delete=models.PROTECT`.
- `is_enabled`: `BooleanField(default=True)`.
- `ticket_number_prefix`: `CharField(max_length=16, default="TKT")`.
- `default_category`: `CharField(max_length=64, default="general")`.
- `auto_close_resolved_days`: `PositiveIntegerField(default=7)`.
- `tenant_relation_fields = ()`.

### 3.2 `TicketNumberCounter`
- `organization`: 1:1 к `Organization`, `on_delete=models.PROTECT`.
- `next_number`: `PositiveBigIntegerField(default=1)`.
- Метод генерации номера: `select_for_update()` в транзакции. Формирует строку `{prefix}-{next_number:06d}` (например, `TKT-000001`).
- `tenant_relation_fields = ()`.

### 3.3 `Ticket` (Агрегат)
- `id`: `BigAutoField(primary_key=True)`.
- `organization`: `ForeignKey("identity.Organization", on_delete=models.PROTECT)`.
- `number`: `CharField(max_length=32, db_index=True)`. Уникален в паре с организацией (`unique_together = ("organization", "number")`).
- `subject`: `CharField(max_length=255)`.
- `description`: `TextField(blank=True, default="")`.
- `status`: `CharField(max_length=32, choices=TicketStatus.choices, default=TicketStatus.NEW, db_index=True)`.
- `priority`: `CharField(max_length=32, choices=TicketPriority.choices, default=TicketPriority.NORMAL, db_index=True)`.
  - Варианты: `LOW`, `NORMAL`, `HIGH`, `URGENT`.
- `category`: `CharField(max_length=64, default="general", db_index=True)`.
- `requester_contact`: `ForeignKey("conversations.Contact", on_delete=models.PROTECT, related_name="requested_tickets", null=True, blank=True)`.
- `assignee_membership`: `ForeignKey("identity.OrganizationMembership", on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_tickets")`.
- `group`: `ForeignKey("identity.EmployeeGroup", on_delete=models.SET_NULL, null=True, blank=True, related_name="tickets")`.
- `origin_conversation`: `ForeignKey("conversations.Conversation", on_delete=models.SET_NULL, null=True, blank=True, related_name="origin_tickets")`.
- `version`: `PositiveIntegerField(default=1)` (для Optimistic Concurrency).
- `resolution_reason`: `TextField(blank=True, default="")`.
- `cancellation_reason`: `TextField(blank=True, default="")`.
- `created_at`: `DateTimeField(auto_now_add=True, db_index=True)`.
- `updated_at`: `DateTimeField(auto_now=True)`.
- `resolved_at`: `DateTimeField(null=True, blank=True)`.
- `closed_at`: `DateTimeField(null=True, blank=True)`.
- `tenant_relation_fields = ("requester_contact", "assignee_membership", "group", "origin_conversation")`.

### 3.4 `TicketConversationLink`
- `ticket`: `ForeignKey(Ticket, on_delete=models.CASCADE, related_name="conversation_links")`.
- `conversation`: `ForeignKey("conversations.Conversation", on_delete=models.SET_NULL, null=True, blank=True, related_name="ticket_links")`.
- `origin_channel`: `ForeignKey("channels.Channel", on_delete=models.SET_NULL, null=True, blank=True)`.
- `link_type`: `CharField(max_length=32, default="primary")` (`primary`, `referenced`).
- `created_at`: `DateTimeField(auto_now_add=True)`.
- `tenant_relation_fields = ("ticket", "conversation", "origin_channel")`.

### 3.5 `TicketContactLink`
- `ticket`: `ForeignKey(Ticket, on_delete=models.CASCADE, related_name="contact_links")`.
- `contact`: `ForeignKey("conversations.Contact", on_delete=models.PROTECT, related_name="ticket_contact_links")`.
- `role`: `CharField(max_length=32, default="participant")` (`requester`, `participant`, `cc`).
- `tenant_relation_fields = ("ticket", "contact")`.

### 3.6 `TicketNote` (Внутренние заметки)
- `ticket`: `ForeignKey(Ticket, on_delete=models.CASCADE, related_name="notes")`.
- `author_membership`: `ForeignKey("identity.OrganizationMembership", on_delete=models.PROTECT, related_name="ticket_notes")`.
- `text`: `TextField()`.
- `created_at`: `DateTimeField(auto_now_add=True)`.
- `tenant_relation_fields = ("ticket", "author_membership")`.

### 3.7 `TicketComment` (Публичные сообщения и переписка)
- `ticket`: `ForeignKey(Ticket, on_delete=models.CASCADE, related_name="comments")`.
- `author_membership`: `ForeignKey("identity.OrganizationMembership", on_delete=models.SET_NULL, null=True, blank=True)`.
- `author_contact`: `ForeignKey("conversations.Contact", on_delete=models.SET_NULL, null=True, blank=True)`.
- `text`: `TextField()`.
- `is_public`: `BooleanField(default=True)`.
- `created_at`: `DateTimeField(auto_now_add=True)`.
- `tenant_relation_fields = ("ticket", "author_membership", "author_contact")`.

### 3.8 `TicketEvent` (Аудит и история)
- `ticket`: `ForeignKey(Ticket, on_delete=models.CASCADE, related_name="events")`.
- `event_type`: `CharField(max_length=64, db_index=True)`.
  - Примеры: `CREATED`, `STATUS_CHANGED`, `ASSIGNEE_CHANGED`, `PRIORITY_CHANGED`, `COMMENT_ADDED`, `NOTE_ADDED`, `LINKED_TO_CONVERSATION`.
- `actor_membership`: `ForeignKey("identity.OrganizationMembership", on_delete=models.SET_NULL, null=True, blank=True)`.
- `actor_contact`: `ForeignKey("conversations.Contact", on_delete=models.SET_NULL, null=True, blank=True)`.
- `old_values`: `JSONField(default=dict, blank=True)`.
- `new_values`: `JSONField(default=dict, blank=True)`.
- `notify_customer`: `BooleanField(default=False)`.
- `created_at`: `DateTimeField(auto_now_add=True, db_index=True)`.
- `tenant_relation_fields = ("ticket", "actor_membership", "actor_contact")`.

### 3.9 `TicketPublicAccess`
- `ticket`: `OneToOneField(Ticket, on_delete=models.CASCADE, related_name="public_access")`.
- `token_hash`: `CharField(max_length=128, unique=True, db_index=True)`.
- `expires_at`: `DateTimeField(null=True, blank=True)`.
- `is_active`: `BooleanField(default=True)`.
- `created_at`: `DateTimeField(auto_now_add=True)`.
- `tenant_relation_fields = ("ticket",)`.

---

## 4. Машина состояний (State Machine)

### 4.1 Статусы и разрешённые переходы
```text
           ┌──────────────────────┐
           │         NEW          │
           └──────────┬───────────┘
                      │
                      ▼
           ┌──────────────────────┐ ◄──────────┐
           │     IN_PROGRESS      │            │
           └───┬──────────────┬───┘            │
               │              │                │
               ▼              ▼                │
     ┌──────────────────┐   ┌──────────────────┴┐
     │ WAITING_CUSTOMER │   │     RESOLVED      │
     └─────────┬────────┘   └──────────┬────────┘
               │                       │
               ▼                       ▼
     (возврат в IN_PROGRESS)┌──────────────────┐
                            │      CLOSED      │
                            └──────────────────┘

Дополнительные терминальные переходы:
- Из любого активного (NEW, IN_PROGRESS, WAITING_CUSTOMER) -> CANCELLED (требуется reason)
- Из любого активного -> DUPLICATE (требуется duplicate_of_ticket_id или reason)
- Из RESOLVED -> IN_PROGRESS (reopen при несогласии клиента или возобновлении работ)
- Из CLOSED -> переходы запрещены (финальное состояние).
```

### 4.2 Оптимистическая блокировка
При запросе перехода статуса клиент обязан передать `expected_version` (или `expectedVersion`).
1. В транзакции: `SELECT * FROM tickets_ticket WHERE id = :id AND organization_id = :org_id FOR UPDATE`.
2. Если `ticket.version != expected_version`:
   - Откат транзакции.
   - Возврат ответа `409 Conflict`:
     ```json
     {
       "error": "version_conflict",
       "detail": "Заявка была изменена другим пользователем.",
       "current_version": 3
     }
     ```
3. Если версия совпала:
   - Выполнить проверку правил перехода.
   - Обновить статус, `updated_at`, `version = F('version') + 1`.
   - Записать `TicketEvent`.

---

## 5. Контракт REST API

### 5.1 Авторизация и контекст
Все эндпоинты организации требуют `HasCapability`:
- Чтение: `tickets.view`
- Мутации и переходы: `tickets.manage`

### 5.2 Список заявок
`GET /api/v1/organizations/{org_id}/tickets/`
- **Параметры фильтрации:**
  - `status`: фильтр по статусу (например, `status=NEW,IN_PROGRESS`).
  - `priority`: фильтр по приоритету.
  - `assignee_id`: фильтр по сотруднику (`assignee_membership`).
  - `requester_id`: фильтр по контакту клиента.
  - `group_id`: фильтр по группе.
  - `search`: поиск по `number` (префиксное совпадение) и подстроке в `subject`.
- **Пагинация:** Keyset-пагинация через курсор (`cursor`, `limit=50`).
- **Сортировка:** `created_at` (по умолчанию desc), `updated_at`, `priority`.

### 5.3 Создание заявки
`POST /api/v1/organizations/{org_id}/tickets/`
- **Тело запроса:**
  ```json
  {
    "subject": "Не работает оплата на сайте",
    "description": "Клиент сообщает об ошибке 500 при клике на СБП",
    "priority": "HIGH",
    "category": "billing",
    "requester_contact_id": 42,
    "assignee_membership_id": 12,
    "group_id": 3
  }
  ```
- **Ответ 201 Created:** Полный payload заявки, включая присвоенный `number` (например, `TKT-000104`) и `version: 1`.

### 5.4 Создание заявки напрямую из диалога чата
`POST /api/v1/organizations/{org_id}/conversations/{conv_id}/tickets/`
- **Тело запроса:**
  ```json
  {
    "subject": "Проблема с авторизацией",
    "description": "Создано из обращения в Telegram",
    "priority": "NORMAL",
    "category": "technical",
    "assignee_membership_id": 12
  }
  ```
- **Поведение:**
  - Автоматически берет `requester_contact` из `conversation.contact`.
  - Устанавливает `origin_conversation = conversation`.
  - Создает `TicketConversationLink` со ссылкой на `conversation` и его канал `origin_channel`.
  - Создает `TicketEvent` с типом `CREATED_FROM_CONVERSATION`.
- **Ответ 201 Created.**

### 5.5 Детали и частичное обновление
`GET /api/v1/organizations/{org_id}/tickets/{id}/`
`PATCH /api/v1/organizations/{org_id}/tickets/{id}/`
- Редактирование темы, описания, категории, приоритета, ответственного или группы с проверкой `expected_version`.

### 5.6 Переход статуса
`POST /api/v1/organizations/{org_id}/tickets/{id}/transitions/`
- **Тело запроса:**
  ```json
  {
    "target_status": "RESOLVED",
    "expected_version": 2,
    "reason": "Вопрос решён установкой нового сертификата",
    "comment": "Отправили инструкцию пользователю"
  }
  ```
- При успехе: `200 OK` с обновленным объектом тикета.
- При несовпадении версии: `409 Conflict`.
- При недопустимом переходе: `400 Bad Request` с кодом ошибки и описанием из i18n.

### 5.7 Заметки, комментарии и аудит
- `GET /api/v1/organizations/{org_id}/tickets/{id}/notes/` — список внутренних заметок.
- `POST /api/v1/organizations/{org_id}/tickets/{id}/notes/` — добавить внутреннюю заметку.
- `GET /api/v1/organizations/{org_id}/tickets/{id}/comments/` — список комментариев.
- `POST /api/v1/organizations/{org_id}/tickets/{id}/comments/` — добавить комментарий.
- `GET /api/v1/organizations/{org_id}/tickets/{id}/events/` — история событий заявки.

---

## 6. Безопасность БД: RLS и Cross-Tenant Guards

Все таблицы `tickets_*` настраиваются миграцией аналогично `chatballs/tenancy/migrations/0038_channel_routing_guards.py`:
1. Включение RLS: `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY; ALTER TABLE {table} FORCE ROW LEVEL SECURITY;`
2. Политика `chatballs_tenant_isolation`:
   `USING (organization_id = chatballs.current_organization_id()) WITH CHECK (organization_id = chatballs.current_organization_id())`.
3. Политика для схемы миграций: `chatballs_schema_access`.
4. DB-guards триггеры на всех внешних ключах:
   - `tickets_ticket` -> `conversations_contact` (`requester_contact_id`)
   - `tickets_ticket` -> `identity_organizationmembership` (`assignee_membership_id`)
   - `tickets_ticket` -> `identity_employeegroup` (`group_id`)
   - `tickets_ticket` -> `conversations_conversation` (`origin_conversation_id`)
   - `tickets_ticketconversationlink` -> `tickets_ticket`, `conversations_conversation`
   - `tickets_ticketnote` -> `tickets_ticket`, `identity_organizationmembership`
   - `tickets_ticketcomment` -> `tickets_ticket`
   - `tickets_ticketevent` -> `tickets_ticket`.

---

## 7. Критерии приёмки (Definition of Done)

1. Созданы и применены миграции таблиц `chatballs.tickets` и RLS-политики без конфликтов со схемой базы данных.
2. Проверены cross-tenant ограничения: попытка связать тикет с сущностью другой организации отклоняется триггером БД и методом `clean()` модели.
3. Машина состояний покрыта модульными тестами: корректные переходы выполняются, некорректные отклоняются, optimistic concurrency возвращает 409 при гонках.
4. Все REST API эндпоинты функционируют в соответствии со спецификацией.
5. Удаление `Conversation` не приводит к каскадному удалению связанных заявок (`on_delete=models.SET_NULL`).
6. Текстовые сообщения об ошибках и статусы используют ключи каталога `chatballs/i18n`.
7. Ни один файл модуля не превышает 300 строк.
