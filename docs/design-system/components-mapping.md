# Каталог компонентов и интерактивные состояния

## 1. Таблица маппинга компонентов (Ant Design → Consta UI)

Все компоненты `antd` и иконки `@ant-design/icons` в проекте заменяются на нативные аналоги Consta UI.

| Компонент Ant Design | Компонент Consta UI | Пакет Consta | Правила миграции и свойства |
|---|---|---|---|
| `<Button type="primary">` | `<Button view="primary">` | `@consta/uikit/Button` | `size`: `"small"` → `"s"`, `"middle"` → `"m"`, `"large"` → `"l"`. Иконки: `iconLeft`/`iconRight`. |
| `<Button type="default">` | `<Button view="secondary">` | `@consta/uikit/Button` | Вторичная кнопка с нейтральной рамкой. |
| `<Button type="text" \| "link">` | `<Button view="ghost" \| "clear">` | `@consta/uikit/Button` | Кнопка без фона/границы. |
| `<Button danger>` | `<Button view="ghost" status="alert">` | `@consta/uikit/Button` | Деструктивные действия (удаление). |
| `<Input>` | `<TextField>` | `@consta/uikit/TextField` | `value`, `onChange`, `size="m"`, `status="alert"`, `leftSide`, `rightSide`. |
| `<Input.TextArea>` | `<TextField type="textarea">` | `@consta/uikit/TextField` | `rows`, `minRows`, `maxRows`. |
| `<Select>` | `<Select>` / `<Combobox>` | `@consta/uikit/Select` | Передача данных: `{ label: string, id: string \| number }[]`. |
| `<Table>` | `<Table>` | `@consta/uikit/Table` | Типизированные колонки `TableColumn<T>`, встроенная сортировка и фильтрация. |
| `<Modal>` | `<Modal>` | `@consta/uikit/Modal` | `isOpen`, `onClickOutside`, `onEsc`. Контент оборачивается в `Card`. |
| `<Drawer>` | `<Sidebar>` | `@consta/uikit/Sidebar` | `isOpen`, `position="right"`, `size="m" \| "l"`, `hasOverlay`. |
| `<Dropdown overlay={<Menu />}>` | `<ContextMenu>` / `<ActionMenu>` | `@consta/uikit/ContextMenu` | `items`, `getItemLabel`, `onItemClick`, `anchorRef`. |
| `<Tabs>` | `<Tabs>` | `@consta/uikit/Tabs` | `items`, `value`, `onChange`, `size="s" \| "m"`. |
| `<Badge count={n}>` | `<Badge label={String(n)}>` | `@consta/uikit/Badge` | `size="s"`, `status="error" \| "success" \| "warning"`, `form="round"`. |
| `<Tag>` | `<Tag>` | `@consta/uikit/Tag` | Интерактивные чипсы, теги клиентов, `onCancel`. |
| `<Avatar>` | `<Avatar>` | `@consta/uikit/Avatar` | `name`, `url`, `size="m"`, `form="round"`. Монограмма генерируется автоматически. |
| `<Tooltip>` | `<Tooltip>` | `@consta/uikit/Tooltip` | `anchorRef`, `direction="downCenter"`, `size="s"`. |
| `<Spin>` | `<Loader>` | `@consta/uikit/Loader` | `size="s" \| "m"`, индикатор загрузки. |
| `<Alert>` | `<Informer>` | `@consta/uikit/Informer` | `status="system" \| "alert" \| "warning" \| "success"`, `title`, `label`. |
| `message.success/error()` | `<SnackBar>` | `@consta/uikit/SnackBar` | Глобальный стек системных тостов. |
| `<Switch>` | `<Switch>` | `@consta/uikit/Switch` | `checked`, `onChange`, `label`, `size="m"`. |
| `<Checkbox>` | `<Checkbox>` | `@consta/uikit/Checkbox` | `checked`, `onChange`, `label`. |
| `<Radio.Group>` | `<RadioGroup>` | `@consta/uikit/RadioGroup` | Групповой выбор взаимоисключающих опций. |
| `<Pagination>` | `<Pagination>` | `@consta/uikit/Pagination` | `currentPage`, `totalPages`, `onChange`. |
| `<Breadcrumb>` | `<Breadcrumbs>` | `@consta/uikit/Breadcrumbs` | Цепочки навигации. |
| `@ant-design/icons` | `@consta/icons` | `@consta/icons` | Нативные иконки (IconSearch, IconSend, IconAttach, IconUser и др.). |

---

## 2. Спецификация интерактивных состояний компонентов

Все интерактивные элементы платформы должны поддерживать 7 базовых состояний:

### 2.1. Кнопки (`Button`)
1. **Default:**
   - `view="primary"`: заливка `--color-control-bg-primary`, текст белый, без внешней рамки.
   - `view="secondary"`: фон прозрачный, граница `1px solid --color-bg-border`, текст `--color-typo-primary`.
   - `view="ghost"`: фон прозрачный, без границы, текст `--color-typo-primary`.
2. **Hover:**
   - `view="primary"`: плавное затемнение фона на 8%, появление легкой тени Level 1.
   - `view="secondary"`: подложка `--color-bg-stripe`, граница подсвечивается `--color-typo-brand`.
3. **Focus / Focus-Visible:**
   - Внешнее кольцо фокуса `outline: 2px solid var(--color-typo-brand)` с отступом `2px`. Соответствие стандарту WCAG 2.1 AA.
4. **Active / Pressed:**
   - Масштабирование `transform: scale(0.98)`, максимальная насыщенность цвета подложки.
5. **Loading:**
   - Свойство `loading={true}`. Замена текста/иконки на встроенный `Loader size="s"`. Размер кнопки фиксирован для предотвращения сдвига контента. Клик заблокирован (`pointer-events: none`).
6. **Disabled:**
   - `disabled={true}`. `opacity: 0.4`, курсор `not-allowed`, отсутствие ховер-эффектов.
7. **Alert (Деструктивное):**
   - `status="alert"`. Красный акцент границы и текста, предупреждающий ховер.

### 2.2. Поля ввода (`TextField`)
1. **Default:**
   - Фон `--color-bg-default`, граница `1px solid --color-bg-border`, плейсхолдер `--color-typo-ghost`.
2. **Hover:**
   - Граница окрашивается в оттенок `--color-typo-secondary`.
3. **Focus:**
   - Граница становится акцентной `1px solid var(--color-control-bg-primary)` с мягким ореолом `box-shadow: 0 0 0 3px rgba(0, 112, 240, 0.15)`.
4. **Alert / Error:**
   - Свойство `status="alert"`. Граница красная `1px solid var(--color-typo-alert)`.
   - Под полем выводится сообщение об ошибке `caption` красного цвета с иконкой ошибки.
5. **Disabled:**
   - Фон `--color-bg-secondary`, граница приглушена, ввод текста заблокирован.

### 2.3. Таблицы (`Table`)
1. **Header:** фон `--color-bg-secondary`, шрифт `weight="medium" size="s"`, текст `--color-typo-secondary`.
2. **Row Default:** чередующийся фон `--color-bg-default` / `--color-bg-stripe` (режим «зебры»).
3. **Row Hover:** фоновая подсветка `--color-bg-stripe` с мягкой анимацией перехода.
4. **Row Selected:** подложка `--color-bg-tone` с левым акцентным бордером `3px solid var(--color-typo-brand)`.
5. **Loading:** оверлей с полупрозрачным фоном и центральным `Loader size="m"`.
6. **Empty State:** центрированная иллюстрация или иконка с поясняющим текстом `Text size="m" view="secondary"`.
