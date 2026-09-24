# Архитектурная спецификация: Гибкая маршрутизация диалогов и движок правил подключения AI (Rules Engine)

**Статус:** Утверждено техническим советом (CTO / Chief System Architect)  
**Область действия:** `apps/backend/chatballs/channels`, `apps/backend/chatballs/conversations`, `apps/backend/chatballs/ai`, `apps/internal-ui`  
**Связанные тикеты:** HOM-6, HOM-10, HOM-11, HOM-12  

---

## 1. Контекст и архитектурные цели

### 1.1. Текущее состояние платформы (AI-First по умолчанию)
В существующей архитектуре Chatballs ядром обработки входящих сообщений (`ingest_inbound` в `chatballs.conversations.ingest`) заложена жесткая парадигма:
1. При поступлении входящего сообщения диалог создается или переводится в режим `ControlMode.AI`, если у канала настроен и активен `AIAgent`.
2. Входящее сообщение безусловно планирует запуск асинхронного шага генерации ответа модели (`request_ai_turn` -> Celery / Event handler).
3. Переход в очередь операторов (`ControlMode.PAUSED`, `enter_queue`) происходит только постфактум: если агент отсутствует/выключен, при фатальном сбое модели, либо при явном ручном перехвате диалога живым оператором (`take_conversation`).

### 1.2. Проблематика
- Отсутствует возможность использовать Chatballs как классический Helpdesk / контакт-центр без обязательного вовлечения LLM.
- Невозможно гибко настраивать гибридные сценарии: например, запускать AI только в нерабочее время, отключать AI для VIP-клиентов или определенных очередей/групп, маршрутизировать диалоги напрямую на профильные группы операторов.
- Нет модульного механизма правил (Rules Engine), способного на этапе входящего события оценить контекст (время, атрибуты клиента, канал, содержание сообщения) и принять решение о целевом исполнителе (`AI` vs `HUMAN/QUEUE`).

### 1.3. Цели и принципы проектирования
1. **Гибкость режимов маршрутизации:** Возможность работы канала в режимах `AI_FIRST`, `HUMAN_ONLY` (только операторы) и `RULE_BASED` (гибридная маршрутизация по правилам).
2. **Движок правил (Rules Engine):** Декларативное описание триггеров и условий (расписание, атрибуты контакта, ключевые слова/интенты, нагрузка).
3. **Обратная совместимость и мягкая деградация:** Существующие каналы без сконфигурированных правил продолжают работать в режиме `AI_FIRST` без деградации SLA.
4. **Human-in-the-Loop & Copilot-готовность:** Если AI отключен от публичных ответов в чат, сохраняется архитектурная база для вспомогательных инструментов оператора (AI-саммаризация, автогенерация черновиков ответов, умный поиск по базе знаний).
5. **Соответствие стандартам Chatballs:**
   - Строгая изоляция арендаторов (`TenantRelationModel`, валидация `organization_id`).
   - Принцип **NO GOD FILES**: разделение ответственности по отдельным компактным сервисам и селекторам (<300 строк).
   - Транзакционная целостность и четкое разграничение транзакций БД и внешних вызовов.

---

## 2. Модель данных (Data Model)

### 2.1. Режимы маршрутизации канала (`Channel.routing_mode`)
В модель `chatballs.channels.models.Channel` добавляется перечисление `ChannelRoutingMode`:

```python
class ChannelRoutingMode(models.TextChoices):
    AI_FIRST = "AI_FIRST", "AI по умолчанию"
    HUMAN_ONLY = "HUMAN_ONLY", "Только операторы"
    RULE_BASED = "RULE_BASED", "По правилам (гибридный)"
```

В таблицу `channels_channel` добавляется поле:
- `routing_mode`: `CharField(max_length=16, choices=ChannelRoutingMode.choices, default=ChannelRoutingMode.AI_FIRST, db_index=True)`

### 2.2. Модель правил маршрутизации (`ChannelRoutingRule`)
Для поддержки сценариев `RULE_BASED` проектируется отдельная сущность правил в приложении `channels` (или выделенном модуле `channels.rules`):

```python
from chatballs.tenancy.models import TenantRelationModel

class RuleTriggerEvent(models.TextChoices):
    CONVERSATION_CREATED = "CONVERSATION_CREATED", "Создание диалога"
    MESSAGE_RECEIVED = "MESSAGE_RECEIVED", "Входящее сообщение"

class RuleActionTarget(models.TextChoices):
    ROUTE_TO_AI = "ROUTE_TO_AI", "Направить агенту AI"
    ROUTE_TO_HUMAN = "ROUTE_TO_HUMAN", "Направить в очередь операторов"
    ASSIGN_GROUP = "ASSIGN_GROUP", "Назначить группу операторов"
    DROP_SILENTLY = "DROP_SILENTLY", "Игнорировать / Спам"

class ChannelRoutingRule(TenantRelationModel):
    """Правило гибкой маршрутизации входящих диалогов и сообщений."""
    
    tenant_relation_fields = ("channel", "target_group")
    
    organization = models.ForeignKey(
        "identity.Organization",
        on_delete=models.PROTECT,
        related_name="routing_rules",
    )
    channel = models.ForeignKey(
        "channels.Channel",
        on_delete=models.CASCADE,
        related_name="routing_rules",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    
    # Приоритет правила (меньше число = выше приоритет, исполняется первым)
    priority = models.PositiveIntegerField(default=100, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    
    # Триггерное событие
    trigger_event = models.CharField(
        max_length=32,
        choices=RuleTriggerEvent.choices,
        default=RuleTriggerEvent.CONVERSATION_CREATED,
    )
    
    # Декларативное дерево условий (JSON Schema)
    # Пример:
    # {
    #   "all": [
    #     {"field": "schedule.is_working_hours", "op": "eq", "value": true},
    #     {"field": "contact.is_vip", "op": "eq", "value": false}
    #   ]
    # }
    conditions = models.JSONField(default=dict, blank=True)
    
    # Целевое действие
    action_target = models.CharField(
        max_length=32,
        choices=RuleActionTarget.choices,
        default=RuleActionTarget.ROUTE_TO_AI,
    )
    
    # Дополнительные параметры действия (например, переопределение группы)
    target_group = models.ForeignKey(
        "identity.EmployeeGroup",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["priority", "id"]
        indexes = [
            models.Index(fields=["channel", "is_active", "priority"]),
        ]
```

### 2.3. График работы канала (`ChannelBusinessHours`)
Ключевое условие для гибридных схем — учет рабочих/нерабочих часов:
```python
class ChannelBusinessHours(TenantRelationModel):
    """Расписание доступности живых операторов для канала."""
    
    tenant_relation_fields = ("channel",)
    
    organization = models.ForeignKey("identity.Organization", on_delete=models.PROTECT, related_name="+")
    channel = models.OneToOneField("channels.Channel", on_delete=models.CASCADE, related_name="business_hours")
    
    timezone = models.CharField(max_length=64, default="UTC")
    # Структура дней недели: { "mon": [{"start": "09:00", "end": "18:00"}], ... }
    weekly_schedule = models.JSONField(default=dict, blank=True)
    # Праздничные/выходные дни: ["2026-01-01", "2026-05-01"]
    holidays = models.JSONField(default=list, blank=True)
```

---

## 3. Архитектура движка правил (Rules Engine)

### 3.1. Структура модуля
Для предотвращения появления God-файлов движок выносится в пакет `chatballs.channels.rules`:
```
chatballs/channels/rules/
├── __init__.py
├── engine.py          # Фасад движка: evaluate_routing()
├── evaluator.py       # Декларативный вычислитель предикатов (all, any, operators)
├── context.py         # Подготовка контекста вычисления (RoutingContext)
├── actions.py         # Применение результатов маршрутизации к диалогу
└── validators.py      # Валидация JSON-схемы условий при сохранении правила
```

### 3.2. Контекст вычисления (`RoutingContext`)
Контекст собирает все факты о входящем событии без дополнительных «тяжелых» запросов к БД:
```python
@dataclass(frozen=True, slots=True)
class RoutingContext:
    channel: Channel
    contact: Contact
    conversation: Conversation | None
    inbound_message_text: str
    is_new_conversation: bool
    current_time: datetime
    has_active_ai_agent: bool
    # Дополнительные предикаты вычисляются лениво (cached_property)
```

### 3.3. Поддерживаемые предикаты и операторы
Движок поддерживает логические комбинаторы (`all`, `any`, `not`) и листовые предикаты:
- **`schedule.is_working_hours`**: `true` / `false` на основе `weekly_schedule` и часового пояса.
- **`channel.routing_mode`**: режим канала.
- **`contact.has_phone`**: наличие подтвержденного номера телефона.
- **`contact.labels`**: наличие определенных меток контакта.
- **`message.text_contains`**: поиск стоп-слов или ключевых фраз (без учета регистра).
- **`message.regex_match`**: сопоставление регулярным выражением (например, номер заказа).
- **`conversation.is_first_message`**: первый ли это контакт пользователя.

### 3.4. Алгоритм вычисления решения
1. Если `channel.routing_mode == ChannelRoutingMode.HUMAN_ONLY`:
   - Безусловный возврат: `RouteDecision(target=ROUTE_TO_HUMAN)`.
2. Если `channel.routing_mode == ChannelRoutingMode.AI_FIRST`:
   - Если активный `AIAgent` доступен: `RouteDecision(target=ROUTE_TO_AI)`.
   - Иначе fallback: `RouteDecision(target=ROUTE_TO_HUMAN)`.
3. Если `channel.routing_mode == ChannelRoutingMode.RULE_BASED`:
   - Загружаются активные правила канала, отсортированные по `priority ASC`.
   - Поочередно вычисляется дерево `conditions`.
   - Первое сработавшее правило формирует `RouteDecision(target=rule.action_target, target_group=rule.target_group)`.
   - Если ни одно правило не сработало (default fallback): направление в очередь операторов (`ROUTE_TO_HUMAN`).

---

## 4. Схема интеграции в пайплайн обработки входящих (`ingest_inbound`)

### 4.1. Изменения в `chatballs.conversations.ingest`
Вместо жесткой проверки `if conversation.control_mode != ControlMode.AI: return`:

```
                 [Входящее сообщение InboundMessage]
                                 │
                                 ▼
                     [Идентификация контакта]
                                 │
                                 ▼
                  [Поиск/создание Conversation]
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │   Rules Engine Evaluation    │
                  │ (evaluate_channel_routing)   │
                  └──────────────┬───────────────┘
                                 │
         ┌───────────────────────┴───────────────────────┐
         ▼                                               ▼
  [Решение: ROUTE_TO_AI]                     [Решение: ROUTE_TO_HUMAN]
         │                                               │
 ┌───────┴───────────────┐                               ▼
 │ AI доступен и активен?│ ──(Нет)──> [Постановка в очередь операторов]
 └───────┬───────────────┘            - ControlMode.PAUSED
         │ (Да)                       - ExpectedResponder.OPERATOR
         ▼                            - waiting_since = now()
[Активация режима AI]                 - notify(OPERATOR_REQUESTED)
- ControlMode.AI
- ExpectedResponder.AI
- request_ai_turn(...)
```

### 4.2. Гарантии целостности
- Решение маршрутизатора сохраняется в `conversation.control_mode` и `expected_responder` в рамках единой транзакции создания/обновления диалога.
- Если диалог перенаправлен операторам (`ROUTE_TO_HUMAN`), `request_ai_turn` **не вызывается**. Модели LLM не расходуют токены и не тратят время ожидания.

---

## 5. Контракты API

### 5.1. Управление режимом канала и расписанием
`PATCH /api/channels/{channel_id}/`
```json
{
  "routing_mode": "RULE_BASED"
}
```

`PUT /api/channels/{channel_id}/business-hours/`
```json
{
  "timezone": "Europe/Moscow",
  "weekly_schedule": {
    "mon": [{"start": "09:00", "end": "18:00"}],
    "tue": [{"start": "09:00", "end": "18:00"}],
    "wed": [{"start": "09:00", "end": "18:00"}],
    "thu": [{"start": "09:00", "end": "18:00"}],
    "fri": [{"start": "09:00", "end": "17:00"}]
  },
  "holidays": ["2026-01-01", "2026-05-01"]
}
```

### 5.2. Управление правилами маршрутизации
`GET /api/channels/{channel_id}/routing-rules/`  
`POST /api/channels/{channel_id}/routing-rules/`
```json
{
  "name": "VIP клиенты сразу людям",
  "priority": 10,
  "is_active": true,
  "trigger_event": "CONVERSATION_CREATED",
  "conditions": {
    "any": [
      {"field": "contact.labels", "op": "contains", "value": "VIP"},
      {"field": "message.text_contains", "op": "contains_any", "value": ["жалоба", "директор", "претензия"]}
    ]
  },
  "action_target": "ROUTE_TO_HUMAN",
  "target_group_id": 4
}
```

---

## 6. Декомпозиция задач для инженеров команды

### Пакет 1: Backend (Backend Dev `78b0d447-f324-4e8b-9329-250791bd443a`)
- **Задача 1.1:** Миграция БД: добавление `Channel.routing_mode`, создание моделей `ChannelRoutingRule` и `ChannelBusinessHours`.
- **Задача 1.2:** Реализация модуля `chatballs.channels.rules` (evaluator, context, engine).
- **Задача 1.3:** Интеграция `evaluate_routing` в конвейер `chatballs.conversations.ingest`.
- **Задача 1.4:** REST API для управления расписанием и правилами маршрутизации каналов с проверкой прав доступа.
- **Критерии готовности (DoD):** Юнит-тесты и интеграционные тесты на все сценарии переключения; отсутствие N+1 запросов; изоляция тенантов; соответствие NO GOD FILES (<300 строк на модуль).

### Пакет 2: Frontend (Frontend Dev `ec17c7db-3b63-4355-8025-a0c37e8799ca`)
- **Задача 2.1:** Добавление переключателя режимов маршрутизации (`AI_FIRST`, `HUMAN_ONLY`, `RULE_BASED`) в настройки канала в `internal-ui`.
- **Задача 2.2:** Форма настройки рабочих часов канала (Business Hours / Timezone).
- **Задача 2.3:** Конструктор/список правил маршрутизации (создание, порядок/drag-and-drop приоритетов, переключение активности).
- **Критерии готовности (DoD):** Полное соответствие дизайн-системе Consta UI; отсутствие служебных терминов на экране; интернационализация через `t(...)`.

### Пакет 3: DevOps & Platform (DevOps Engineer `fa09a00a-de38-4c21-ba31-a656b51870b7`)
- **Задача 3.1:** Проверка влияния нового пайплайна маршрутизации на производительность и задержки очереди входящих сообщений.
- **Задача 3.2:** Актуализация мониторинга метрик диалогов: раздельный сбор счетчиков диалогов, обработанных AI vs Операторами.
- **Критерии готовности (DoD):** Дашборд Grafana отображает распределение трафика по `routing_mode`; миграции выполняются без простоя.

### Пакет 4: Контроль качества (QA Engineer `896422f3-8e10-4da1-a80a-92a37dd3adb9`)
- **Задача 4.1:** Разработка тестовой модели и e2e-сценариев проверки всех вариантов маршрутизации:
  1. Режим `HUMAN_ONLY` — проверка, что AI ни при каких условиях не шлет ответы.
  2. Режим `AI_FIRST` — регрессионное тестирование стандартного сценария.
  3. Режим `RULE_BASED` — проверка срабатывания по времени (рабочие/нерабочие часы), по стоп-словам, по VIP-меткам.
  4. Проверка корректности очередей ожидания (`waiting_since`, уведомления операторам).
- **Критерии готовности (DoD):** Комплексный отчет о тестировании; отсутствие регрессий в существующих транспортах (Telegram, WebChat, Email).
