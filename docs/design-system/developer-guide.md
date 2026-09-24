# Руководство разработчика по использованию Consta UI в Chatballs

Данный документ является обязательным практическим стандартом разработки пользовательских интерфейсов платформы **Chatballs** на базе дизайн-системы **Consta UI** (`@consta/uikit`, `@consta/icons` и сателлитные пакеты).

---

## 1. Архитектура и подключение темы

Интерфейсы приложений (`@chatballs/internal-ui`, `@chatballs/web-chat`) и общие компоненты (`@chatballs/ui`) подключаются к единой системе темизации Consta UI.

### 1.1. Корневой провайдер темы
Подключение темы выполняется в корне приложения через компонент `Theme`:

```tsx
import React, { useState } from 'react';
import { Theme, presetGpnDefault, presetGpnDark } from '@consta/uikit/Theme';

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(false);
  const currentPreset = isDark ? presetGpnDark : presetGpnDefault;

  return (
    <Theme preset={currentPreset} className="chatballs-theme-root">
      {children}
    </Theme>
  );
};
```

### 1.2. Пресеты и инъекция фирменного стиля
Для брендирования Chatballs базовые пресеты Consta дополняются кастомными CSS-переменными акцента и брендовых цветов:

```css
:root {
  --color-control-bg-primary: #0070f0;
  --color-control-bg-primary-hover: #0059c6;
  --color-typo-brand: #0070f0;
  --color-bg-brand: #0070f0;
}

.Theme_color_chatballsDark,
.Theme_color_gpnDark {
  --color-control-bg-primary: #2985f8;
  --color-control-bg-primary-hover: #1971e2;
  --color-typo-brand: #2985f8;
  --color-bg-brand: #2985f8;
}
```

---

## 2. Правила использования базовых компонентов

### 2.1. Типографика (`Text`)
**Правило:** Прямое указание `font-size` и `line-height` в CSS-классах компонентов строго запрещено. Весь текст оформляется компонентом `Text` из `@consta/uikit/Text`.

```tsx
import { Text } from '@consta/uikit/Text';

// Заголовок карточки или модального окна
<Text size="3xl" weight="semibold" view="primary">
  Параметры маршрутизации
</Text>

// Вспомогательный текст или подпись
<Text size="s" view="secondary">
  Изменения вступят в силу немедленно для новых обращений
</Text>

// Предупреждение или ошибка
<Text size="s" view="alert" weight="medium">
  Укажите расписание рабочих часов
</Text>
```

- **Размеры (`size`):** `s` (12px, подписи), `m` (14px, базовый текст интерфейса), `l` (16px, заголовки форм), `xl`–`3xl` (заголовки блоков и диалогов), `4xl`–`5xl` (заголовки страниц).
- **Начертания (`weight`):** `regular`, `medium`, `semibold`, `bold`.
- **Цветовые роли (`view`):** `primary` (основной), `secondary` (приглушенный), `ghost` (неактивный), `brand` (акцентный), `alert` (ошибка), `success` (успех).

### 2.2. Оверлеи: модальные окна (`Modal`) и поповеры (`Popover`, `Tooltip`)

#### Модальные окна (`Modal`)
Диалоги строятся на компоненте `Modal` (`@consta/uikit/Modal`) в связке с контейнером `Card`:

```tsx
import React from 'react';
import { Modal } from '@consta/uikit/Modal';
import { Card } from '@consta/uikit/Card';
import { Text } from '@consta/uikit/Text';
import { Button } from '@consta/uikit/Button';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
}

export const ConfirmDialog: React.FC<DialogProps> = ({ isOpen, onClose, onConfirm, title }) => (
  <Modal
    isOpen={isOpen}
    hasOverlay
    onClickOutside={onClose}
    onEsc={onClose}
    className="chatballs-modal"
  >
    <Card verticalSpace="l" horizontalSpace="l" status="border">
      <Text size="2xl" weight="semibold" view="primary" space="m">
        {title}
      </Text>
      <div className="chatballs-modal-actions">
        <Button view="secondary" size="m" label="Отмена" onClick={onClose} />
        <Button view="primary" size="m" label="Подтвердить" onClick={onConfirm} />
      </div>
    </Card>
  </Modal>
);
```

#### Всплывающие подсказки (`Tooltip`) и контекстные блоки (`Popover`)
- `Tooltip` вызывается с указанием ссылки на элемент-триггер (`anchorRef`), направлением (`direction="downCenter"`) и размером `size="s"`.
- Запрещено размещать сложные интерактивные формы внутри `Tooltip`; для этого используется `Popover` или `Modal`.

### 2.3. Система оповещений (`SnackBar`)
Для вывода всплывающих тостов используется `SnackBar` (`@consta/uikit/SnackBar`). Прямое использование `window.alert`, `notification` или кастомных плашек запрещено.

```tsx
import { SnackBar, SnackBarItemDefault } from '@consta/uikit/SnackBar';

export interface ToastItem extends SnackBarItemDefault {
  id: string;
  message: string;
  status: 'normal' | 'system' | 'success' | 'warning' | 'alert';
  autoClose?: boolean;
}

export const GlobalToasts: React.FC<{ items: ToastItem[]; onClose: (item: ToastItem) => void }> = ({
  items,
  onClose,
}) => (
  <SnackBar
    items={items}
    getItemAutoClose={() => 4000}
    onItemClose={onClose}
    className="chatballs-snackbar-container"
  />
);
```

### 2.4. Выпадающие списки и меню (`Select`, `ContextMenu`)

#### Выбор значений (`Select` и `Combobox`)
Компонент `Select` (`@consta/uikit/Select`) строго типизируется списком элементов:

```tsx
import { Select } from '@consta/uikit/Select';

interface OptionItem {
  label: string;
  id: string;
}

const items: OptionItem[] = [
  { label: 'Только операторы', id: 'human_only' },
  { label: 'Маршрутизация по правилам', id: 'rules' },
  { label: 'ИИ-агент по умолчанию', id: 'ai_first' },
];

<Select
  items={items}
  value={selectedItem}
  onChange={({ value }) => setSelectedItem(value)}
  getItemLabel={(item) => item.label}
  getItemKey={(item) => item.id}
  size="m"
  placeholder="Выберите режим"
/>
```

#### Контекстное меню (`ContextMenu`)
Для строк таблиц, карточек и меню действий используется `ContextMenu` (`@consta/uikit/ContextMenu`):

```tsx
import React, { useRef, useState } from 'react';
import { ContextMenu } from '@consta/uikit/ContextMenu';
import { Button } from '@consta/uikit/Button';
import { IconKebab } from '@consta/icons/IconKebab';

export const RowActions: React.FC<{ onEdit: () => void; onDelete: () => void }> = ({ onEdit, onDelete }) => {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { label: 'Редактировать', onClick: onEdit },
    { label: 'Удалить', onClick: onDelete, status: 'alert' as const },
  ];

  return (
    <>
      <Button
        ref={anchorRef}
        view="ghost"
        size="s"
        iconOnly
        iconLeft={IconKebab}
        onClick={() => setIsOpen(!isOpen)}
        className="row-menu-button"
      />
      <ContextMenu
        isOpen={isOpen}
        anchorRef={anchorRef}
        items={menuItems}
        getItemLabel={(item) => item.label}
        onItemClick={({ item }) => {
          item.onClick();
          setIsOpen(false);
        }}
        onClickOutside={() => setIsOpen(false)}
        direction="downRight"
      />
    </>
  );
};
```

---

## 3. Паттерны композиции и запрет кастомных CSS-стилей

В кодовой базе Chatballs действуют строгие архитектурные правила верстки:

1. **Никаких "магических чисел" и сырых цветов в CSS:**
   - Запрещены значения вроде `color: #0070f0` или `background: #101113`.
   - Разрешено только: `color: var(--color-typo-brand)`, `background: var(--color-bg-default)`.
2. **Модульная сетка и отступы:**
   - Отступы задаются переменными `--space-xs` (8px), `--space-s` (12px), `--space-m` (16px), `--space-l` (24px) или пропсами `space`/`horizontalSpace`/`verticalSpace` в контейнерах Consta (`Layout`, `Card`).
3. **Единый стандарт ссылок:**
   - Базовый класс `.link` из `shared/links.css` применяется как для `<a>`, так и для `<button>`.
   - Модификаторы: `.is-strong` (название сущности), `.is-neutral` (темная с ховером), `.is-muted` (отмена/назад), `.is-mono` (хеши и идентификаторы), `.has-icon`.
   - Запрещено создавать локальные классы типа `agent-link`, `custom-button-link`.
4. **Запрет самодельных оверлеев:**
   - Категорически запрещено создавать самодельные меню и шторки через `position: fixed` или `position: absolute` с ручным вычислением `left`/`top` и `z-index`. Все всплывающие элементы используют порталы Consta UI (`Modal`, `Sidebar`, `ContextMenu`, `Popover`).
5. **Модульность и запрет "God Files":**
   - Размер файла компонента не должен превышать 200–300 строк.
   - Сложные экраны разбиваются на композицию независимых подкомпонентов (view-компоненты, контроллер данных, вспомогательные UI-контролы).

---

## 4. Каталог отказа от Ant Design и чек-лист чистоты кода

### 4.1. Экспресс-матрица замены компонентов

| Компонент Ant Design | Компонент Consta UI | Пакет |
|---|---|---|
| `<ConfigProvider>` | `<Theme preset={...}>` | `@consta/uikit/Theme` |
| `<Button>` | `<Button view="primary\|secondary\|ghost">` | `@consta/uikit/Button` |
| `<Input>`, `<Input.TextArea>` | `<TextField>` | `@consta/uikit/TextField` |
| `<Select>` | `<Select>`, `<Combobox>` | `@consta/uikit/Select` |
| `<Modal>` | `<Modal>` + `<Card>` | `@consta/uikit/Modal` |
| `<Drawer>` | `<Sidebar position="right">` | `@consta/uikit/Sidebar` |
| `<Dropdown>` + `<Menu>` | `<ContextMenu>` | `@consta/uikit/ContextMenu` |
| `notification.open()` | `<SnackBar>` | `@consta/uikit/SnackBar` |
| `<Table>` | `<Table>` | `@consta/uikit/Table` |
| `<Tabs>` | `<Tabs>` | `@consta/uikit/Tabs` |
| `<Badge>` | `<Badge form="round">` | `@consta/uikit/Badge` |
| `<Tag>` | `<Tag>` | `@consta/uikit/Tag` |
| `<Avatar>` | `<Avatar form="round">` | `@consta/uikit/Avatar` |
| `<Tooltip>` | `<Tooltip>` | `@consta/uikit/Tooltip` |
| `<Alert>` | `<Informer>` | `@consta/uikit/Informer` |
| `@ant-design/icons` | `@consta/icons` | `@consta/icons` |

### 4.2. Чек-лист чистоты кода (Code Health Checklist)

Перед сдачей любого изменения разработчик обязан выполнить проверки:

- [ ] **Отсутствие прямых импортов `antd`:** В коде отсутствуют импорты из `antd`, `antd/es/*`, `@ant-design/*`, `rc-*`.
- [ ] **Отсутствие служебных классов `.ant-*` в CSS:** Все кастомные CSS-правила очищены от селекторов вроде `.ant-modal`, `.ant-btn`, `.ant-dropdown`.
- [ ] **Чистота манифестов `package.json`:** Зависимости `antd` и `@ant-design/icons` удалены из `dependencies` и `peerDependencies`.
- [ ] **Конфигурация бандлера:** Из `vite.config.ts` удалены чанки, связанные с antd; добавлены разделы для `@consta`.
- [ ] **Проверка типизации:** Команда `npm run typecheck` завершается с кодом 0 без ошибок типов.
- [ ] **Команда статического контроля:**
  ```bash
  # Проверка отсутствия артефактов antd в кодовой базе
  grep -rn "from ['\"]antd" apps/ packages/
  grep -rn "@ant-design" apps/ packages/
  grep -rn "\.ant-" apps/ packages/
  ```
  Команды должны возвращать пустой результат.
