import { Card } from "@consta/uikit/Card";
import { Modal } from "@consta/uikit/Modal";
import { useId, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

import { t } from "../i18n";
import { Button } from "./ui-controls";
import { Icon } from "./icons";

type ModalButtonProps = {
  className?: string;
  danger?: boolean;
  disabled?: boolean;
};

type NativeModalProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "className" | "style" | "title"
>;

/**
 * Общий слой диалогов приложения поверх Consta UI Modal.
 *
 * Специализированные окна по-прежнему описывают только содержимое формы, а
 * открытие, фокус, Esc, портал и базовую карточку сосредоточены здесь. Это не
 * второй стандарт меню или модалки: ниже используется именно `Modal` из
 * `@consta/uikit`, а классы внутри карточки совместимы с уже утверждёнными
 * стилями разделов.
 */
export type ConstaModalProps = NativeModalProps & {
  open?: boolean;
  isOpen?: boolean;
  title?: ReactNode;
  footer?: ReactNode;
  onCancel?: () => void;
  onClose?: () => void;
  onOk?: () => void;
  okText?: ReactNode;
  cancelText?: ReactNode;
  okButtonProps?: ModalButtonProps;
  width?: number | "auto";
  className?: string;
  rootClassName?: string;
  style?: CSSProperties;
  centered?: boolean;
  closable?: boolean;
  maskClosable?: boolean;
  keyboard?: boolean;
  destroyOnClose?: boolean;
  destroyOnHidden?: boolean;
  children?: ReactNode;
};

export function ConstaModal({
  open,
  isOpen,
  title,
  footer,
  onCancel,
  onClose,
  onOk,
  okText,
  cancelText,
  okButtonProps,
  width = 520,
  className,
  rootClassName,
  style,
  centered = false,
  closable = true,
  maskClosable = true,
  keyboard = true,
  destroyOnClose: _destroyOnClose,
  destroyOnHidden: _destroyOnHidden,
  children,
  ...rest
}: ConstaModalProps) {
  const titleId = useId();
  const visible = open ?? isOpen ?? false;
  const close = onCancel ?? onClose;
  const hasTitle = title !== undefined && title !== null;
  const hasDefaultFooter = Boolean(onOk && (okText || okText === ""));
  const modalStyle: CSSProperties = {
    ...style,
    ...(typeof width === "number" ? { width } : {}),
  };

  return (
    <Modal
      {...rest}
      className={`app-modal-window ${className ?? ""}`.trim()}
      rootClassName={rootClassName}
      isOpen={visible}
      onClose={close}
      onClickOutside={maskClosable ? close : undefined}
      onEsc={keyboard ? close : undefined}
      role={rest.role ?? "dialog"}
      aria-modal={rest["aria-modal"] ?? true}
      aria-labelledby={rest["aria-labelledby"] ?? (hasTitle ? titleId : undefined)}
      position={centered ? "center" : "top"}
      width="auto"
      style={modalStyle}
    >
      <Card className="app-modal-card" shadow={false}>
        {hasTitle && (
          <header className="app-modal-header">
            <div className="app-modal-title" id={titleId}>
              {title}
            </div>
            {closable && close && (
              <button
                aria-label={t("common.close")}
                className="app-modal-close"
                title={t("common.close")}
                type="button"
                onClick={close}
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </header>
        )}
        <div className="app-modal-body">{children}</div>
        {(footer !== null && (footer !== undefined || hasDefaultFooter)) && (
          <div className="app-modal-footer">
            {footer ?? (
              <>
                {close && cancelText && (
                  <Button variant="secondary" onClick={close}>{cancelText}</Button>
                )}
                {onOk && (
                  <Button
                    variant={okButtonProps?.danger ? "danger-outline" : "primary"}
                    className={okButtonProps?.className}
                    disabled={okButtonProps?.disabled}
                    onClick={onOk}
                  >
                    {okText}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </Card>
    </Modal>
  );
}
