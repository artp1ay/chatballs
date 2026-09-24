# Контракт API гибкой маршрутизации каналов

Документ описывает backend-контракт для карточки агента и приёмной команды.
Все маршруты работают внутри organization-контекста и доступны только после
авторизации:

```text
/api/v1/organizations/{organization_public_id}/channels/{channel_id}/
```

## Режим маршрутизации

`GET /channels/{channel_id}/` возвращает режим канала:

```json
{
  "id": 17,
  "name": "Приёмная",
  "code": "support",
  "routing_mode": "RULE_BASED",
  "routingMode": "RULE_BASED"
}
```

`PATCH /channels/{channel_id}/` принимает `routing_mode` или `routingMode`.
Допустимые значения: `AI_FIRST`, `HUMAN_ONLY`, `RULE_BASED`. Изменение требует
`channels.manage`; ответ имеет тот же формат, что и `GET`.

## Рабочие часы

- `GET /channels/{channel_id}/business-hours/` — получить расписание;
- `PUT` или `PATCH` — создать либо полностью заменить расписание.

Поля запроса и ответа:

```json
{
  "timezone": "Europe/Moscow",
  "weekly_schedule": {
    "mon": [{"start": "09:00", "end": "18:00"}],
    "tue": [{"start": "09:00", "end": "18:00"}]
  },
  "holidays": ["2026-05-01"]
}
```

Для совместимости принимается также `weeklySchedule`. Валидатор проверяет
IANA-часовой пояс, формат `ЧЧ:ММ`, пересечение интервалов и даты `ГГГГ-ММ-ДД`.
Пустой сохранённый график означает круглосуточную доступность; отсутствие
записи означает, что расписание не настроено. Операция требует
`channels.manage`.

## Правила

- `GET /channels/{channel_id}/routing-rules/` — список в порядке приоритета;
- `POST` — создать правило;
- `GET/PATCH/PUT/DELETE /channels/{channel_id}/routing-rules/{rule_id}/` —
  изменить или удалить правило;
- `POST /channels/{channel_id}/routing-rules/reorder/` — атомарно задать порядок.

Тело правила:

```json
{
  "name": "VIP-клиенты сразу людям",
  "description": "",
  "priority": 10,
  "is_active": true,
  "trigger_event": "CONVERSATION_CREATED",
  "conditions": {
    "any": [
      {"field": "contact.labels", "op": "contains", "value": "VIP"},
      {
        "field": "message.text_contains",
        "op": "contains_any",
        "value": ["жалоба", "директор"]
      }
    ]
  },
  "action_target": "ROUTE_TO_HUMAN",
  "target_group_id": 4
}
```

Принимаются camelCase-алиасы `isActive`, `triggerEvent`, `actionTarget`,
`targetGroupId`. В ответе доступны `target_group` и `target_group_id`, а также
`target_group_name` для отображения группы операторов.

Для `ASSIGN_GROUP` обязательна группа той же организации. Для reorder передаётся
полный список идентификаторов в `rule_ids` или `ruleIds`; приоритеты назначаются
атомарно. Все операции записи требуют `channels.manage`, чтение — `channels.view`.

## Условия

Поддерживаются блоки `all`, `any`, `not` и листья `field`, `op`, `value`.
Поля:

- `schedule.is_working_hours` — `eq` или `neq`;
- `channel.routing_mode` — `eq` или `neq`;
- `contact.has_phone` — `eq` или `neq`;
- `contact.labels` — `contains`, `not_contains`, `contains_any`, `contains_all`;
- `message.text_contains` — строковые операторы;
- `message.regex_match` — `regex_match`;
- `conversation.is_first_message` — `eq` или `neq`.

Пустое дерево условий (`{}`) означает правило без дополнительных условий.
Неверное дерево, неизвестное поле, недопустимый оператор или некорректное
регулярное выражение отклоняются с `400`; невалидная сохранённая строка не
блокирует приём входящих и пропускается с журналированием.

## Поведение движка

1. `HUMAN_ONLY` всегда направляет диалог в очередь операторов.
2. `AI_FIRST` направляет в AI при активном агенте, иначе — оператору.
3. `RULE_BASED` проверяет активные правила по возрастанию `priority`, затем `id`.
   Первое совпавшее правило определяет действие; без совпадения используется
   очередь операторов.
4. `DROP_SILENTLY` не отправляет уведомление и не запускает AI.
5. Ручной режим `HUMAN` не переводится автоматическим входящим сообщением.

Все выборки правил и расписания ограничены текущей организацией. Для новых
таблиц включены RLS и проверки межtenant-связей канала и группы операторов.
