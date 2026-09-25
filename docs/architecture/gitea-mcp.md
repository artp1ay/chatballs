# Gitea MCP для Paperclip

## Назначение

Проект может использовать официальный Gitea MCP server для работы с
`https://git.freakware.ru`: чтение и изменение репозиториев, issues, pull request,
веток, файлов, wiki и releases.

Интеграция выполняется через Paperclip native tool connection, а не через
`opencode.jsonc`: Paperclip запускает агентов с
`OPENCODE_DISABLE_PROJECT_CONFIG=true`, поэтому проектный файл OpenCode не был бы
загружен в runtime агентов.

## Текущее состояние

- Создан approved local-stdio template `freakware.gitea-mcp.v1` с каталогом из
  55 инструментов официального Gitea MCP server `1.7.0`.
- Создано подключение Paperclip `Gitea MCP — git.freakware.ru (1.7.0)`.
- Транспорт: Docker stdio через официальный образ
  `docker.gitea.com/gitea-mcp-server`.
- Образ закреплён digest'ом, соответствующим Gitea MCP server `1.7.0`.
- Подключение установлено на компанию, активно и доступно агентам.
- PAT добавлен в зашифрованный Paperclip secret и привязан как
  `env.GITEA_ACCESS_TOKEN`; значение secret не возвращается в API или логах.
- Для destructive-инструментов создана политика `require_approval`; операции
  удаления и другие необратимые действия потребуют подтверждения.
- Smoke-проверка `get_me` через Paperclip tool gateway успешна.

## Повторная активация и ротация

1. При ротации создать в Gitea PAT с минимальными необходимыми правами. Для
   выбранного read/write режима обычно нужны права на repository, issues, pull
   requests и wiki; отдельно выдавать Actions/административные права без
   необходимости не следует.
2. Сохранить новый PAT только в зашифрованном Paperclip secret с именем
   `GITEA_ACCESS_TOKEN`. Не помещать значение в URL, файл, коммит, комментарий
   или лог.
3. Привязать secret к подключению `Gitea MCP — git.freakware.ru (1.7.0)` с
   `configPath: env.GITEA_ACCESS_TOKEN` и убедиться, что Paperclip показывает
   только метаданные secret.
4. Проверить каталог инструментов и профиль доступа; необратимые операции
   должны оставаться под политикой `require_approval`.
5. Включить подключение только после успешного `get_me` и чтения тестового
   репозитория.
6. Проверить, что выбранные агенты видят `gitea_*` tools, и выполнить
   read-only smoke call.

## Откат

Если интеграция не нужна, отключить подключение в Paperclip и отозвать
`GITEA_ACCESS_TOKEN` в Gitea. Удаление или отзыв secret должен выполняться
через Paperclip/Gitea, без публикации значения токена.
