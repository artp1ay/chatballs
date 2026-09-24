import type {
  Key,
  MouseEvent as ReactMouseEvent,
  ReactElement,
  ReactNode,
  Ref,
} from "react";

export type LegacyMenuItem = {
  key?: Key;
  type?: "item" | "group" | "divider" | string;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
  children?: LegacyMenuItem[];
  onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
};

export type NormalizedMenuItem = LegacyMenuItem & {
  key: string;
  kind: "item" | "group" | "divider";
  label: ReactNode;
  className: string;
  custom: boolean;
  disabled: boolean;
  subMenu?: NormalizedMenuItem[];
};

export type MenuTriggerProps = {
  disabled?: boolean;
  onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
  ref?: Ref<HTMLElement>;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: "menu" | "listbox" | "dialog";
};

export type MenuConfig = { items?: LegacyMenuItem[] } | LegacyMenuItem[];

export type MenuPlacement =
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight"
  | "leftTop"
  | "leftBottom"
  | "rightTop"
  | "rightBottom";

export type ConstaMenuProps = {
  children: ReactElement;
  menu?: MenuConfig;
  items?: LegacyMenuItem[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  placement?: MenuPlacement;
  overlayClassName?: string;
  trigger?: Array<"click" | "contextMenu" | "hover">;
  popupRender?: () => ReactNode;
};
