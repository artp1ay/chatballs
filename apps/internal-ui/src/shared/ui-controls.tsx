import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type RefObject } from "react";

import { Icon } from "./icons";
import { t } from "../i18n";

type IconName = Parameters<typeof Icon>[0]["name"];

type ButtonVariant = "action" | "danger-outline" | "primary" | "secondary";

const buttonVariantClass: Record<ButtonVariant, string> = {
  action: "ui-action-button",
  "danger-outline": "danger-outline",
  primary: "primary-button",
  secondary: "secondary-button",
};

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: IconName;
  iconSize?: number;
};

type ButtonProps = ActionButtonProps & {
  variant: ButtonVariant;
};

type SearchInputProps = {
  className?: string;
  placeholder: string;
  value?: string;
  onChange?: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
};

type UnderlineTabsProps<T extends string> = {
  className?: string;
  items: Array<{ key: T; label: string; count?: number; disabled?: boolean }>;
  value: T;
  onChange: (value: T) => void;
};

type ToneBadgeProps = {
  bg: string;
  children: ReactNode;
  className?: string;
  color: string;
};

export function Button({ children, className = "", icon, iconSize = 15, type = "button", variant, ...buttonProps }: ButtonProps) {
  return (
    <button className={`${buttonVariantClass[variant]} ${className}`.trim()} type={type} {...buttonProps}>
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
    </button>
  );
}

/** Кнопка «копировать» рядом со значением (контекст-панель чата и карточка
 *  контакта): на 1.2 с превращается в галочку. */
export function CopyButton({ value, className = "", label }: { value: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`${className} ${copied ? "is-copied" : ""}`.trim()}
      aria-label={t("common.copy_clipboard")}
      title={copied ? t("common.copied") : t("common.copy_clipboard")}
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={13} strokeWidth={label ? 2 : 1.8} />
      {label && (copied ? t("common.copied") : label)}
    </button>
  );
}

/** «Назад» над карточкой сущности: шеврон и название раздела (дизайн-базлайн
 *  v2 — кадры K3 «Контакты», G3 «Агенты»). */
export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="ui-back-link" type="button" onClick={onClick}>
      <Icon name="chevronLeft" size={14} strokeWidth={2.2} />{label}
    </button>
  );
}

export function ActionButton(props: ActionButtonProps) {
  return <Button {...props} variant="action" />;
}

/** Кнопка-иконка: подпись обязательна и уходит в aria-label и title. */
export function IconButton({ icon, iconSize = 16, label, bare = false, className = "", ...buttonProps }: Omit<ActionButtonProps, "icon"> & { icon: IconName; label: string; bare?: boolean }) {
  return (
    <button className={`ui-icon-button ${bare ? "is-bare" : ""} ${className}`.trim()} type="button" aria-label={label} title={label} {...buttonProps}>
      <Icon name={icon} size={iconSize} />
    </button>
  );
}

/** Поиск списка — один на всё приложение: иконка, поле, подсказка горячей
 *  клавиши. С `hotkey` клавиша ставит фокус в поле, если пользователь не пишет
 *  в другом поле и не открыл меню (SPEC-CHATBALLS-0031 §9). */
export function SearchInput({ className = "", placeholder, value, onChange, inputRef, hotkey }: SearchInputProps & { hotkey?: string }) {
  const ownRef = useRef<HTMLInputElement | null>(null);
  const field = inputRef ?? ownRef;

  useEffect(() => {
    if (!hotkey) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== hotkey || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      // Не перехватываем клавишу, когда человек пишет в другом поле или открыл меню.
      if (target instanceof Element && target.closest("input, textarea, [contenteditable], .app-dropdown, .ContextMenu, .Popover")) return;
      event.preventDefault();
      field.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [field, hotkey]);

  return (
    <label className={`ui-search-input ${className}`.trim()}>
      <Icon name="search" size={15} />
      <input ref={field} value={value} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} />
      {hotkey && !value && <kbd>{hotkey}</kbd>}
    </label>
  );
}

export { FilterDropdown, SelectMenu } from "./SelectMenu";
export type { FilterOption, SelectOption } from "./SelectMenu";

export function UnderlineTabs<T extends string>({ className = "", items, value, onChange }: UnderlineTabsProps<T>) {
  return (
    <div className={`ui-underline-tabs ${className}`.trim()}>
      {items.map((item) => (
        <button className={value === item.key ? "active" : ""} type="button" disabled={item.disabled} onClick={() => onChange(item.key)} key={item.key}>
          {item.label}
          {item.count !== undefined && <span>{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ToneBadge({ bg, className = "", color, children }: ToneBadgeProps) {
  return <span className={`ui-tone-badge ${className}`.trim()} style={{ background: bg, color }}>{children}</span>;
}

/** Номера страниц с многоточиями: 1 … 4 5 6 … 20. Один расчёт на приложение —
 *  им живут пагинаторы контактов и журнала аудита. */
export function paginationItems(page: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const visible = [...pages].filter((item) => item >= 1 && item <= pageCount).sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  visible.forEach((item, index) => {
    if (index > 0 && item - visible[index - 1] > 1) result.push("ellipsis");
    result.push(item);
  });
  return result;
}

