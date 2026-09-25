# Спецификация REST API и событий раздела Heldesk

**Версия документации:** 1.0
**Версия продукта:** 1.15.0
**Статус:** Действующая документация
**Связанные задачи:** HOM-30, HOM-33, HOM-47, HOM-48
**Аудитория:** разработчики интеграций, frontend-разработчики, инженеры поддержки

---

## 1. Общие положения

### 1.1. Базовые адреса и авторизация

Все внутренние эндпоинты работают в контексте организации и требуют полномочия через `HasCapability`:

- чтение (метод `GET`): полномочие `tickets.view`;
- изменение (методы `POST`, `PATCH`): полномочие `tickets.manage`.

Фактические маршруты, используемые клиентским приложением (`apps/internal-ui/src/features/tickets/api.ts`):

- реестр и создание: `/api/v1/tickets/`;
- карточка и редактирование: `/api/v1/tickets/{ticket_id}/`;
- переходы статуса: `/api/v1/tickets/{ticket_id}/transitions/` (синоним `/api/v1/tickets/{ticket_id}/transition/`);
- заметки, комментарии, события: `/api/v1/tickets/{ticket_id}/notes/`, `/comments/`, `/events/`;
- гостевой токен: `/api/v1/tickets/{ticket_id}/public-access/`;
- создание из диалога: `/api/v1/conversations/{conversation_id}/ticket/`.

Проектные спецификации ядра описывают те же операции в нотации `/api/v1/organizations/{org_id}/tickets/...` и `/api/v1/organizations/{org_id}/conversations/{conv_id}/tickets/`. Обе нотации эквивалентны: организация определяется контекстом арендатора текущего запроса.

Гостевые эндпоинты не требуют авторизации сотрудника и работают по токену: `/api/v1/help/tickets/{token}/`, `/api/v1/help/tickets/{token}/comments/`.

Формат обмена — `application/json`. Кодировка — UTF-8.

### 1.2. Общие соглашения

- Идентификаторы заявок во внутренних эндпоинтах — числовые (`ticket_id`).
- Версия оптимистической блокировки передаётся как `expected_version`. Принимаются синонимы `expectedVersion` и (для `PATCH`) `version`.
- Политика уведомления клиента передаётся как `customer_notice`. Принимается синоним `customerNotice`. Допустимые значения: `SEND`, `SUPPRESS`, `NOT_REQUIRED`.
- Причина подавления передаётся как `suppression_reason`. Принимается синоним `suppressionReason`.
- Даты в ответах — строки ISO 8601 (`created_at`, `updated_at`, `resolved_at`, `closed_at`).
- Пустые необязательные даты возвращаются как `null`.

### 1.3. Модель ошибок

Ошибки возвращаются объектом с полями `error` (машинный код) и `detail` (текст на языке запроса из каталога `chatballs/i18n`).

| Код HTTP | Поле `error` | Когда возвращается |
|---|---|---|
| 400 | `validation_error` | Пустая тема, пустой текст заметки или комментария |
| 400 | `bad_request` | Недопустимый переход статуса, отсутствует обязательная причина, недопустимая политика уведомления, отсутствует причина подавления |
| 403 | `permission_denied` / стандартное запрещение прав | Нет полномочия `tickets.view` или `tickets.manage` |
| 404 | `not_found` | Заявка, контакт, сотрудник или группа не найдены в текущей организации |
| 409 | `version_conflict` | Версия заявки не совпала с `expected_version` |

Тело ответа при конфликте версий:

```json
{
  "error": "version_conflict",
  "detail": "Заявка была изменена другим пользователем. Обновите данные",
  "current_version": 3
}
```

Каталожные ключи текстов ошибок: `tickets.subject_required`, `tickets.note_text_required`, `tickets.comment_text_required`, `tickets.status_required`, `tickets.invalid_transition`, `tickets.cancellation_reason_required`, `tickets.duplicate_reason_required`, `tickets.resolution_reason_required`, `tickets.version_conflict`, `tickets.customer_notice_invalid`, `tickets.suppression_reason_required`, `tickets.not_found`, `tickets.contact_not_found`, `tickets.assignee_not_found`, `tickets.group_not_found`, `tickets.permission_denied`, `tickets.public_ticket_not_found`.

---

## 2. Эндпоинты заявок

### 2.1. Получение списка заявок

`GET /api/v1/tickets/`

Параметры запроса:

| Параметр | Тип | Описание |
|---|---|---|
| `status` | строка | Фильтр по статусам через запятую. Пример: `status=NEW,IN_PROGRESS` |
| `priority` | строка | Фильтр по приоритетам через запятую. Пример: `priority=HIGH,URGENT` |
| `assignee_id` | число | Фильтр по идентификатору членства ответственного (`assignee_membership_id`) |
| `requester_id` | число | Фильтр по идентификатору контакта заявителя |
| `group_id` | число | Фильтр по идентификатору группы сотрудников |
| `search` | строка | Поиск по частичному совпадению номера (`number`) и подстроке темы (`subject`) |
| `sort` | строка | Сортировка: `created_at`, `updated_at`, `priority`. Префикс `-` задаёт убывание. Пример: `sort=-updated_at`. По умолчанию `created_at` по убыванию с досортировкой по `id` |
| `after` | число | Курсор keyset-пагинации (идентификатор, после которого продолжить выборку) |
| `window_size` (`limit` в проектной нотации) | число | Размер страницы. Клиент использует 20, 50 или 100 |

Ответ `200 OK`:

```json
{
  "items": [
    {
      "id": 101,
      "organization_id": 7,
      "number": "TKT-000104",
      "subject": "Не работает оплата на сайте",
      "description": "Ошибка 500 при оплате по СБП",
      "status": "NEW",
      "priority": "HIGH",
      "category": "billing",
      "requester_contact_id": 42,
      "requester_contact": { "id": 42, "name": "Иван Петров" },
      "assignee_membership_id": 12,
      "assignee": { "id": 12, "user_id": 5, "name": "Анна Соколова", "email": "anna@example.ru" },
      "group_id": 3,
      "group": { "id": 3, "name": "Биллинг" },
      "origin_conversation_id": 9001,
      "version": 1,
      "resolution_reason": "",
      "cancellation_reason": "",
      "created_at": "2026-09-20T10:15:00+00:00",
      "updated_at": "2026-09-20T10:15:00+00:00",
      "resolved_at": null,
      "closed_at": null
    }
  ],
  "total": 1,
  "next_cursor": null,
  "has_more": false
}
```

Некорректные числовые фильтры (`assignee_id`, `requester_id`, `group_id`) игнорируются без ошибки. Неизвестное значение `sort` возвращает сортировку по умолчанию.

### 2.2. Создание заявки

`POST /api/v1/tickets/`

Тело запроса:

```json
{
  "subject": "Не работает оплата на сайте",
  "description": "Клиент сообщает об ошибке 500 при оплате по СБП",
  "priority": "HIGH",
  "category": "billing",
  "requester_contact_id": 42,
  "assignee_membership_id": 12,
  "group_id": 3
}
```

Обязательно только поле `subject` (непустая строка). Значения по умолчанию: `priority = NORMAL`, `category = general`, `description = ""`.

Поведение:

- проверяет принадлежность контакта, сотрудника и группы текущей организации;
- атомарно выделяет номер вида `{prefix}-{next_number:06d}` через блокировку счётчика;
- создаёт событие `CREATED`;
- запускает конвейер уведомлений и realtime-сигнал (см. раздел 5).

Ответ `201 Created`: полный объект заявки (см. раздел 2.1).

Ошибки: `validation_error` при пустой теме; `not_found` (`tickets.contact_not_found`, `tickets.assignee_not_found`, `tickets.group_not_found`) при ссылке на чужую или несуществующую сущность.

### 2.3. Создание заявки из диалога

`POST /api/v1/conversations/{conversation_id}/ticket/`

Тело запроса:

```json
{
  "subject": "Проблема с авторизацией",
  "description": "Создано из обращения в Telegram",
  "priority": "NORMAL",
  "category": "technical",
  "assignee_membership_id": 12,
  "group_id": 3
}
```

Поведение:

- диалог должен принадлежать текущей организации, иначе `404 conversations.not_found`;
- заявитель подставляется из `conversation.contact` автоматически;
- поле `origin_conversation` устанавливается в текущий диалог;
- создаётся связь `TicketConversationLink` с типом `primary` и каналом диалога;
- создаётся событие `CREATED_FROM_CONVERSATION`.

Ответ `201 Created`: полный объект заявки.

### 2.4. Получение карточки заявки

`GET /api/v1/tickets/{ticket_id}/`

Ответ `200 OK`: полный объект заявки. При отсутствии заявки в текущей организации — `404 tickets.not_found`.

### 2.5. Частичное обновление заявки

`PATCH /api/v1/tickets/{ticket_id}/`

Тело запроса (все поля необязательны):

```json
{
  "subject": "Уточнённая тема",
  "description": "Дополненное описание",
  "priority": "URGENT",
  "category": "billing",
  "assignee_membership_id": 12,
  "group_id": null,
  "expected_version": 2
}
```

Особенности:

- передача `assignee_membership_id: null` или `group_id: null` снимает назначение;
- ссылка на чужого сотрудника или группу возвращает `400 tickets.assignee_not_found` или `tickets.group_not_found`;
- при расхождении версии возвращается `409 version_conflict`;
- успешное обновление увеличивает `version` и создаёт событие `UPDATED` (а при смене ответственного или приоритета — также `ASSIGNEE_CHANGED` или `PRIORITY_CHANGED` через сервисный слой).

Ответ `200 OK`: полный объект заявки.

### 2.6. Переход статуса

`POST /api/v1/tickets/{ticket_id}/transitions/`

Синоним: `POST /api/v1/tickets/{ticket_id}/transition/`.

Тело запроса:

```json
{
  "target_status": "RESOLVED",
  "expected_version": 2,
  "reason": "Вопрос решён установкой нового сертификата",
  "comment": "Отправили инструкцию пользователю",
  "customer_notice": "SEND",
  "suppression_reason": ""
}
```

Правила:

- `target_status` обязателен, иначе `400 tickets.status_required`.
- Допустимые переходы заданы матрицей `TRANSITIONS` в `chatballs/tickets/state_machine.py` (см. руководство оператора). Недопустимый переход возвращает `400 tickets.invalid_transition`.
- Для `CANCELLED` и `DUPLICATE` обязательна непустая причина (`reason`), иначе `400 tickets.cancellation_reason_required` или `tickets.duplicate_reason_required`.
- `customer_notice` должен входить в `SEND | SUPPRESS | NOT_REQUIRED`, иначе `400 tickets.customer_notice_invalid`.
- При `customer_notice = SUPPRESS` обязательна непустая причина подавления, иначе `400 tickets.suppression_reason_required`.
- При расхождении `expected_version` возвращается `409 version_conflict`.
- Необязательное поле `comment` создаёт публичный комментарий в рамках той же транзакции перехода.

Успешный переход увеличивает `version`, проставляет `resolved_at` или `closed_at` по правилам статусов, создаёт событие `STATUS_CHANGED` с полями `old_values.status`, `new_values.status`, `new_values.reason`, `new_values.version` и запускает конвейер уведомлений.

Ответ `200 OK`: полный объект заявки.

---

## 3. Переписка и история

### 3.1. Внутренние заметки

- `GET /api/v1/tickets/{ticket_id}/notes/` — список заметок по возрастанию `created_at`. Требуется `tickets.view`.
- `POST /api/v1/tickets/{ticket_id}/notes/` — создать заметку. Требуется `tickets.manage`.

Тело запроса:

```json
{ "text": "Проверил логи: ошибка только при оплате по СБП" }
```

Ответ `201 Created`:

```json
{
  "id": 55,
  "ticket_id": 101,
  "author_membership_id": 12,
  "author_name": "Анна Соколова",
  "text": "Проверил логи: ошибка только при оплате по СБП",
  "created_at": "2026-09-20T11:00:00+00:00"
}
```

Пустой текст возвращает `400 tickets.note_text_required`. Создание заметки фиксирует событие `NOTE_ADDED` и не создаёт клиентской доставки.

### 3.2. Комментарии

- `GET /api/v1/tickets/{ticket_id}/comments/` — список комментариев. Требуется `tickets.view`.
- `POST /api/v1/tickets/{ticket_id}/comments/` — добавить комментарий. Требуется `tickets.manage`.

Тело запроса:

```json
{
  "text": "Исправили ошибку, проверьте оплату повторно",
  "is_public": true,
  "customer_notice": "SEND",
  "suppression_reason": ""
}
```

Поведение:

- `is_public` по умолчанию `true`. Непубличные комментарии не порождают клиентской доставки (`NOT_REQUIRED` на уровне конвейера).
- при `is_public = true` и `customer_notice = SUPPRESS` обязательна причина подавления, иначе `400 tickets.suppression_reason_required`;
- пустой текст возвращает `400 tickets.comment_text_required`;
- успешное создание фиксирует событие `COMMENT_ADDED` с признаком `notify_customer` и запускает конвейер уведомлений.

Ответ `201 Created`:

```json
{
  "id": 77,
  "ticket_id": 101,
  "author_membership_id": 12,
  "author_contact_id": null,
  "author_name": "Анна Соколова",
  "text": "Исправили ошибку, проверьте оплату повторно",
  "is_public": true,
  "created_at": "2026-09-20T11:05:00+00:00"
}
```

### 3.3. История событий

`GET /api/v1/tickets/{ticket_id}/events/`

Требуется `tickets.view`. Возвращает массив событий в хронологическом порядке:

```json
[
  {
    "id": 201,
    "ticket_id": 101,
    "event_type": "STATUS_CHANGED",
    "actor_membership_id": 12,
    "actor_contact_id": null,
    "actor_name": "Анна Соколова",
    "old_values": { "status": "IN_PROGRESS" },
    "new_values": { "status": "RESOLVED", "reason": "Установлен новый сертификат", "version": 3 },
    "notify_customer": true,
    "suppression_reason": "",
    "created_at": "2026-09-20T11:10:00+00:00"
  }
]
```

### 3.4. Гостевой доступ

- `POST /api/v1/tickets/{ticket_id}/public-access/` — выпустить или получить действующий гостевой токен. Требуется `tickets.manage`. Ответ: `{ "token": "<непрозрачный токен>" }`.
- `GET /api/v1/help/tickets/{token}/` — публичный просмотр заявки без авторизации.
- `POST /api/v1/help/tickets/{token}/comments/` — публичный ответ клиента.

При недействительном, просроченном или деактивированном токене возвращается `404 tickets.public_ticket_not_found`. Гостевые ответы видят только публичные комментарии, внутренние заметки не возвращаются.

---

## 4. Модель событий `TicketEvent`

### 4.1. Назначение и свойства

`TicketEvent` — неизменяемый аудит-журнал заявки. Каждая запись содержит:

| Поле | Тип | Описание |
|---|---|---|
| `id` | число | Идентификатор события |
| `ticket_id` | число | Заявка-владелец |
| `event_type` | строка | Тип события (см. раздел 4.2) |
| `actor_membership_id` | число или `null` | Сотрудник-автор действия |
| `actor_contact_id` | число или `null` | Контакт-автор (для действий клиента) |
| `actor_name` | строка | Отображаемое имя автора (`System`, если автор не задан) |
| `old_values` | объект | Значения до изменения |
| `new_values` | объект | Значения после изменения |
| `notify_customer` | логическое | Признак того, что событие должно уведомлять клиента |
| `suppression_reason` | строка | Причина подавления уведомления, если уведомление отключено |
| `created_at` | строка ISO 8601 | Время фиксации события |

Поле `organization` хранится на уровне модели для изоляции арендаторов, но в публичный payload не входит.

### 4.2. Типы событий (`TicketEventType`)

| Тип | Когда создаётся |
|---|---|
| `CREATED` | Создание заявки из реестра |
| `CREATED_FROM_CONVERSATION` | Создание заявки из диалога чата |
| `STATUS_CHANGED` | Смена статуса через переход |
| `ASSIGNEE_CHANGED` | Смена ответственного |
| `PRIORITY_CHANGED` | Смена приоритета |
| `COMMENT_ADDED` | Добавление комментария |
| `NOTE_ADDED` | Добавление внутренней заметки |
| `LINKED_TO_CONVERSATION` | Привязка дополнительного диалога |
| `UPDATED` | Прочее редактирование полей карточки |

### 4.3. Связь событий с уведомлениями

Не каждое событие порождает внешнее уведомление. Решение принимает функция `should_deliver_to_customer`:

- `STATUS_CHANGED` — всегда основание для клиентской доставки;
- `COMMENT_ADDED` — только если комментарий публичный (`new_values.is_public = true`) и оставлен сотрудником или системой, а не контактом клиента;
- `CREATED`, `CREATED_FROM_CONVERSATION` — основание для стартового уведомления;
- остальные типы (`NOTE_ADDED`, `UPDATED`, `ASSIGNEE_CHANGED`, `PRIORITY_CHANGED`, `LINKED_TO_CONVERSATION`) клиентской доставки не создают, но создают внутренние уведомления сотрудникам при необходимости.

---

## 5. Realtime-сигналы и WebSocket

### 5.1. Канал и формат сигнала

Сигналы заявок доставляются через существующий WebSocket диалогов:

```text
/ws/organizations/{uuid}/conversations/
```

Имя события:

```text
tickets.inbox.changed
```

Пример полезной нагрузки (без персональных данных):

```json
{ "type": "tickets.inbox.changed" }
```

Константа отправителя: `TICKETS_INBOX_EVENT = "tickets.inbox.changed"` в модуле `chatballs/tickets/realtime.py`. Функция `notify_tickets_inbox_changed(organization_id)` публикует сигнал в групповой канал организации через `inbox_group(organization_id)`.

### 5.2. Правила для клиентов

- Сигнал отправляется при любом изменении списка или деталей заявки: создание, обновление, переход статуса, комментарий, заметка.
- Сигнал не содержит персональных данных клиента, текста переписки и идентификаторов заявок. Получив сигнал, клиентское одностраничное приложение должно перезапросить данные через REST API.
- Сигнал scoped на организацию: клиенты одной организации не получают сигналы другой организации.
- Разделение ответственности: realtime-сигнал отвечает за свежесть интерфейса, а гарантированная доставка уведомлений — за конвейер Outbox и `TicketDelivery` (см. руководство администратора).

### 5.3. Внутренние события Outbox

Для асинхронной доставки используются доменные события:

- `tickets.delivery_dispatched` — доставка внешнего уведомления клиенту (агрегат `TicketDelivery`);
- `tickets.staff_notification` — постановка внутренних уведомлений сотрудникам.

Полезная нагрузка события доставки:

```json
{
  "delivery_id": 301,
  "ticket_id": 101,
  "event_id": 201
}
```

Эти события обрабатываются воркером Outbox и не предназначены для прямого потребления клиентским интерфейсом.

---

## 6. Примеры сквозных сценариев

### 6.1. Создание и решение заявки

```http
POST /api/v1/tickets/ HTTP/1.1
Content-Type: application/json

{
  "subject": "Не входит в личный кабинет",
  "description": "Ошибка авторизации после смены пароля",
  "priority": "HIGH",
  "category": "technical",
  "requester_contact_id": 42
}
```

```http
POST /api/v1/tickets/101/transitions/ HTTP/1.1
Content-Type: application/json

{
  "target_status": "IN_PROGRESS",
  "expected_version": 1,
  "reason": "Взято в работу второй линией"
}
```

```http
POST /api/v1/tickets/101/comments/ HTTP/1.1
Content-Type: application/json

{
  "text": "Сбросили пароль вручную, проверьте вход",
  "is_public": true,
  "customer_notice": "SEND"
}
```

```http
POST /api/v1/tickets/101/transitions/ HTTP/1.1
Content-Type: application/json

{
  "target_status": "RESOLVED",
  "expected_version": 3,
  "reason": "Вход восстановлен, клиент подтвердил",
  "comment": "Решение подтверждено клиентом в чате"
}
```

### 6.2. Тихое внутреннее действие

```http
POST /api/v1/tickets/101/comments/ HTTP/1.1
Content-Type: application/json

{
  "text": "Промежуточная пометка для смены: ждём ответ биллинга",
  "is_public": true,
  "customer_notice": "SUPPRESS",
  "suppression_reason": "Промежуточная пометка, ответ клиенту уйдёт после проверки"
}
```

В истории событие будет отмечено как `notify_customer = false` с указанной причиной, а в очереди доставок появится запись `SUPPRESSED`.

---

## 7. Контроль соответствия реализации

- Матрица переходов сверена с `chatballs/tickets/state_machine.py` (`TRANSITIONS`, `validate_transition`, `execute_transition`).
- Параметры списка сверены с `chatballs/tickets/selectors.py` (`list_tickets`, `get_sort_keys`) и `chatballs/tickets/api/ticket_list_views.py`.
- Поля создания и обновления сверены с `ticket_list_views.py`, `ticket_detail_views.py`, `conversation_views.py`.
- Поля комментариев, заметок и подавления сверены с `activity_views.py` и `services/ticket_mutation.py`.
- Типы событий сверены с `models/activities.py` (`TicketEventType`), логика клиентской доставки — с `services/delivery_dispatch.py` (`should_deliver_to_customer`).
- Формат realtime-сигнала сверен с `tickets/realtime.py`.
- Клиентские маршруты сверены с `apps/internal-ui/src/features/tickets/api.ts` и `types.ts`.
