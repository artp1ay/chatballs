import { ContextMenu } from "@consta/uikit/ContextMenu";
import { cloneElement, useCallback, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type MouseEventHandler, type ReactElement, type ReactNode, type Ref, type RefObject } from "react";

import { Icon } from "./icons";
import { handleMenuNavigation, useMenuEscapeLayer } from "./menuNavigation";

export type SelectOption = { value: string; label: string; dot?: string };

/** Совместимое имя: фильтры списков звали вариант `FilterOption`. */
export type FilterOption = SelectOption;

type SelectTriggerProps = {
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  ref?: Ref<HTMLElement>;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: "menu" | "listbox" | "tree" | "grid" | "dialog";
};

type SelectMenuItem = SelectOption & {
  key: string;
  selected: boolean;
  checked: boolean;
  leftSide: ReactNode;
};

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    (ref as { current: T | null }).current = value;
  }
}

/** Выпадающий список приложения — один на все селекты: и на фильтры списков, и
 * на поля форм. Меню рисует Consta UI, а триггер и состояние остаются у
 * вызывающего экрана. `multiple` оставляет меню открытым после выбора. */
export function SelectMenu({ anchorRef, children, disabled = false, multiple = false, onOpenChange, onSelect, open, options, overlayClassName = "app-dropdown is-wide", overlayStyle, selected }: {
  /** Якорь можно передать, если триггер уже держит ref для измерения ширины. */
  anchorRef?: RefObject<HTMLElement | null>;
  children: ReactElement;
  disabled?: boolean;
  multiple?: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
  open: boolean;
  options: SelectOption[];
  overlayClassName?: string;
  overlayStyle?: CSSProperties;
  selected: string[];
}) {
  useMenuEscapeLayer(open);
  const ownAnchorRef = useRef<HTMLElement | null>(null);
  const menuAnchorRef = anchorRef ?? ownAnchorRef;
  const trigger = children as ReactElement<SelectTriggerProps>;
  const triggerRef = trigger.props.ref;
  const setTriggerRef = useCallback((node: HTMLElement | null) => {
    ownAnchorRef.current = node;
    assignRef(triggerRef, node);
    assignRef(anchorRef, node);
  }, [anchorRef, triggerRef]);

  const handleTriggerClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    trigger.props.onClick?.(event);
    if (disabled || event.defaultPrevented) return;
    onOpenChange(!open);
  }, [disabled, onOpenChange, open, trigger]);

  const items: SelectMenuItem[] = options.map((option) => {
    const isSelected = selected.includes(option.value);
    const check = multiple ? (
      <span className={`ui-filter-check ${isSelected ? "is-on" : ""}`}>
        {isSelected && <Icon name="check" size={12} />}
      </span>
    ) : null;
    const dot = option.dot ? <i className="ui-filter-dot" style={{ background: option.dot }} /> : null;
    return {
      ...option,
      key: option.value || option.label,
      selected: isSelected,
      checked: isSelected,
      leftSide: check || dot ? <>{check}{dot}</> : null,
    };
  });

  const hasOverlayWidth = overlayStyle?.width !== undefined;
  const menuStyle = hasOverlayWidth
    ? {
      ...overlayStyle,
      width: undefined,
      "--select-menu-overlay-width": typeof overlayStyle.width === "number" ? `${overlayStyle.width}px` : overlayStyle.width,
    } as CSSProperties
    : overlayStyle;
  const menuClassName = [
    overlayClassName,
    hasOverlayWidth ? "has-overlay-width" : "",
  ].filter(Boolean).join(" ");

  const triggerNode = cloneElement(trigger, {
    ref: setTriggerRef,
    onClick: handleTriggerClick,
    "aria-expanded": !disabled && open,
    "aria-haspopup": "menu",
  } as SelectTriggerProps);

  return (
    <>
      {triggerNode}
      <ContextMenu
        className={menuClassName}
        isOpen={!disabled && open}
        anchorRef={menuAnchorRef as unknown as { current: HTMLElement }}
        direction="downStartLeft"
        possibleDirections={["downStartLeft", "upStartLeft", "downStartRight", "upStartRight"]}
        offset={4}
        size="s"
        role="menu"
        items={items}
        getItemKey={(item) => item.key}
        getItemLabel={(item) => (
          <span className={["app-menu-item", item.selected ? "is-selected" : ""].filter(Boolean).join(" ")}>
            {item.label}
          </span>
        ) as unknown as string}
        getItemLeftSide={(item) => item.leftSide}
        getItemAs={() => "button" as const}
        getItemAttributes={(item) => ({
          type: "button",
          role: "menuitem",
          className: ["app-menu-item", item.selected ? "is-selected" : ""].filter(Boolean).join(" "),
          "aria-checked": multiple ? item.selected : undefined,
          "aria-pressed": !multiple ? item.selected : undefined,
        })}
        onKeyDownCapture={handleMenuNavigation}
        onClickOutside={() => onOpenChange(false)}
        onEsc={() => onOpenChange(false)}
        onItemClick={(item) => {
          onSelect(item.value);
          if (!multiple) onOpenChange(false);
        }}
        style={menuStyle}
      />
    </>
  );
}

/** Фильтр-селект списка: кнопка с текущим значением и шевроном. `multiple`
 * включает галочки и счётчик выбранных (кадры K1 «Контакты», E1 «Сотрудники»). */
export function FilterDropdown({ caption, className = "", icon, label, options, selected, multiple = false, open, onOpenChange, onSelect }: {
  /** Приглушённая подпись перед значением: «Статус: Все» (кадры PT1/PT3). */
  caption?: string;
  className?: string;
  icon?: Parameters<typeof Icon>[0]["name"];
  label: string;
  options: SelectOption[];
  selected: string[];
  multiple?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
}) {
  const active = selected.length > 0;
  return (
    <SelectMenu multiple={multiple} onOpenChange={onOpenChange} onSelect={onSelect} open={open} options={options} selected={selected}>
      <button className={`ui-filter-button ${active ? "is-active" : ""} ${className}`.trim()} type="button">
        {icon && <Icon name={icon} size={14} strokeWidth={2} />}
        {caption && <i className="ui-filter-caption">{caption}</i>}
        {label}
        {multiple && selected.length > 0 && <span>{selected.length}</span>}
        <Icon name="chevron" size={13} strokeWidth={2.2} />
      </button>
    </SelectMenu>
  );
}
