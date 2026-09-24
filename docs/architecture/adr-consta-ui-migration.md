# ADR: Полный перевод дизайн-системы и фронтенд-приложений на Consta UI

- **Статус:** Принято (Accepted)
- **Дата:** 2026-09-24
- **Автор:** CTO и Главный системный архитектор
- **Связанные задачи:** [HOM-5](/HOM/issues/HOM-5), [HOM-7](/HOM/issues/HOM-7), [HOM-8](/HOM/issues/HOM-8), [HOM-9](/HOM/issues/HOM-9)
- **Связанные документы:**
  - `docs/design-system/tokens-and-theme.md`
  - `docs/design-system/layout-architecture.md`
  - `docs/design-system/components-mapping.md`
  - `docs/testing/consta-ui-migration-test-plan.md`

---

## 1. Контекст и проблематика

Исторически часть фронтенд-компонентов панели управления (`@chatballs/internal-ui`) и базовая темизация (`@chatballs/ui`) опирались на библиотеку Ant Design (`antd` v5). В виджете клиентского веб-чата (`@chatballs/web-chat`) зависимость присутствовала транзитивно/в манифесте `package.json`, не используясь напрямую.

Недостатки текущего решения:
1. Тяжеловесный бандл Ant Design со специфическим CSS-in-JS рантаймом.
2. Неполное соответствие корпоративным стандартам и дизайн-системе Consta UI.
3. Размытая стилистика между кастомными контролами и компонентами Ant Design (`Modal`, `Dropdown`, `Drawer`, `notification`).
4. Наличие неиспользуемых и устаревших зависимостей (`@ant-design/icons`, `antd` в `web-chat`).

Руководством компании (CEO) поставлена задача: **полностью исключить Ant Design из всех фронтенд-приложений и дизайн-системы, переведя интерфейсы на экосистему Consta UI (`@consta/uikit`)**.

---

## 2. Архитектурное решение

### 2.1. Выбор библиотек и зависимостей
1. Основная библиотека UI-компонентов: **`@consta/uikit`** (v5.x).
2. Набор иконок: **`@consta/icons`** (в дополнение к существующим Lucide).
3. Инфраструктурные зависимости: **`@bem-react/classname`** (БЭМ-модель стилизации Consta).
4. Полное удаление пакетов: `antd`, `@ant-design/icons`, `@ant-design/*`, `/rc-*`.

### 2.2. Архитектура пакета `@chatballs/ui`
- Удаление `antd` из `peerDependencies`.
- Рефакторинг модуля `src/theme.ts`:
  - Использование базовых пресетов Consta: `presetGpnDefault` (светлая тема) и `presetGpnDark` (тёмная тема).
  - Интеграция кастомного акцентного цвета через CSS Custom Properties (`--color-control-bg-primary`, `--color-control-bg-primary-hover`, `--color-typo-brand`).
  - Экспорт функции получения пресета темы и токенов оформления.

### 2.3. Архитектура приложения `@chatballs/internal-ui`
1. **Корневой провайдер темы (`src/App.tsx`):**
   - Замена `ConfigProvider` на компонент `Theme` из `@consta/uikit/Theme`.
   - Динамическое переключение светлого/тёмного пресета с инъекцией CSS-переменных акцента.
2. **Система всплывающих уведомлений (Toasts):**
   - Замена `antd.notification` на `SnackBar` (`@consta/uikit/SnackBar`).
   - Размещение глобального контейнера `SnackBar` в корне приложения и адаптация хука `useNotificationAlerts.ts`.
3. **Шторки и боковые панели:**
   - Замена `antd.Drawer` в `NotificationDrawer.tsx` на `Sidebar` (`@consta/uikit/Sidebar`) с параметром `position="right"`.
4. **Модальные окна и диалоги подтверждения:**
   - Перевод базового `DecisionDialog.tsx` на `Modal` (`@consta/uikit/Modal`).
   - Унификация и миграция всех 14 специализированных диалогов на Consta `Modal`.
5. **Выпадающие меню и фильтры:**
   - Перевод `SelectMenu` и `FilterDropdown` в `src/shared/ui-controls.tsx` на `ContextMenu` / `Select` из `@consta/uikit`.
   - Замена прямых вызовов `Dropdown` в `layout/` и карточках на Consta UI.
6. **Очистка стилей и бандлера:**
   - Удаление классов `.ant-*` из CSS файлов (`menu.css`, `form-controls.css`, `call.css`, `styles.css`).
   - Обновление ручного сплиттинга чанков в `vite.config.ts`: замена путей antd на `@consta`.

### 2.4. Пакет `@chatballs/web-chat`
- Удаление неиспользуемой записи `antd` из `package.json`.
- Проверка и сохранение изолированности бандла виджета.

---

## 3. Матрица миграции компонентов

| Элемент UI / Место | Текущая реализация (Ant Design) | Целевая реализация (Consta UI) | Примечания |
| :--- | :--- | :--- | :--- |
| Корневая тема (`App.tsx`) | `<ConfigProvider theme={...}>` | `<Theme preset={...}>` | Пресеты `presetGpnDefault` / `presetGpnDark` |
| Уведомления оператора | `notification.open()` (`useNotificationAlerts`) | `<SnackBar items={...}>` | Статусы: alert, warning, normal, success |
| Шторка уведомлений | `Drawer` (`NotificationDrawer.tsx`) | `Sidebar position="right"` | Плавная анимация, переиспользование контента |
| Диалоги подтверждения | `Modal` (`DecisionDialog.tsx`) | `Modal` (`@consta/uikit/Modal`) | Автоматически обновляет все диалоги с DecisionDialog |
| Диалоги сущностей (14 окон) | `Modal` (`antd`) | `Modal` (`@consta/uikit/Modal`) | Карточки настроек, порталы, звонки, агенты, знания |
| Селекты и фильтры списков | `Dropdown` (`SelectMenu`, `FilterDropdown`) | `ContextMenu` / `Select` | Поддержка одиночного и множественного выбора |
| Меню в строках и шапке | `Dropdown` (`layout/`, `rows.tsx`) | `ContextMenu` | Контекстные действия для таблиц и сайдбара |
| Темизация пакета UI | `ThemeConfig`, `darkAlgorithm` | `presetGpnDefault`, `presetGpnDark` | Динамический акцент через CSS-переменные |

---

## 4. План реализации и декомпозиция задач

Разработка декомпозирована на 5 последовательных задач с чётким разграничением ответственности:

1. **Задача 1 (Frontend Dev):** Базовая инфраструктура и темизация: перевод `@chatballs/ui` на Consta UI и подключение провайдера темы в `internal-ui`.
2. **Задача 2 (Frontend Dev):** Миграция глобальных оверлеев и общих контролов: NotificationDrawer (Sidebar), useNotificationAlerts (SnackBar), DecisionDialog (Modal) и SelectMenu (ContextMenu/Select).
3. **Задача 3 (Frontend Dev):** Полная миграция всех модальных окон и выпадающих меню в функциональных разделах `internal-ui`.
4. **Задача 4 (Frontend Dev):** Полное удаление зависимости Ant Design, очистка CSS/Vite и финальная верификация сборки.
5. **Задача 5 (QA Engineer):** Комплексное регрессионное тестирование миграции на Consta UI.

---

## 5. Критерии готовности (Definition of Done)

1. Полное отсутствие `antd`, `@ant-design/icons` и сопутствующих библиотек в `package.json` и коде (`grep -rn "antd" .` дает 0 совпадений в исходниках).
2. Сборка всех пакетов `npm run build` проходит без ошибок.
3. Проверка типов `npm run typecheck` завершается успешно без единой ошибки.
4. Отсутствие визуальных артефактов и корректная поддержка светлой/тёмной тем и акцентных цветов.
5. Прохождение полного тест-плана QA Engineer (`docs/testing/consta-ui-migration-test-plan.md`).
