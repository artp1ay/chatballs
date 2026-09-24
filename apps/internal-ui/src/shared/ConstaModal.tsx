import { Card } from "@consta/uikit/Card";
import { Modal } from "@consta/uikit/Modal";
import { useCallback, useId, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

import { t } from "../i18n";
import { Button } from "./ui-controls";
import { Icon } from "./icons";
import { useModalLayer } from "./useModalLayer";

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
  ariaLabel?: string;
  bodyClassName?: string;
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
  afterClose?: () => void;
  children?: ReactNode;
};

export function ConstaModal({
  open,
  isOpen,
  title,
  ariaLabel,
  bodyClassName,
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
  destroyOnClose = false,
  destroyOnHidden = false,
  afterClose,
  children,
  ...rest
}: ConstaModalProps) {
  const titleId = useId();
  const layerId = `modal-${titleId}`;
  const visible = open ?? isOpen ?? false;
  const close = onCancel ?? onClose;
  const hasTitle = title !== undefined && title !== null;
  const hasDefaultFooter = Boolean(onOk && (okText || okText === ""));
  const shouldRenderContent = visible || !(destroyOnClose || destroyOnHidden);
  const { isTopmost, modalRef } = useModalLayer(visible, layerId);
  const requestClose = useCallback(() => {
    if (visible && isTopmost) close?.();
  }, [close, isTopmost, visible]);
  const modalStyle: CSSProperties = {
    ...style,
    ...(typeof width === "number" ? { width } : {}),
  };

  return (
    <Modal
      {...rest}
      ref={modalRef}
      className={`app-modal-window ${className ?? ""}`.trim()}
      rootClassName={rootClassName}
      isOpen={visible}
      hasOverlay
      afterClose={afterClose}
      onClickOutside={maskClosable && isTopmost ? requestClose : undefined}
      onEsc={keyboard && isTopmost ? requestClose : undefined}
      role={rest.role ?? "dialog"}
      tabIndex={rest.tabIndex ?? -1}
      aria-modal={rest["aria-modal"] ?? true}
      aria-label={rest["aria-label"] ?? ariaLabel}
      aria-labelledby={rest["aria-labelledby"] ?? (hasTitle ? titleId : undefined)}
      position={centered ? "center" : "top"}
      width="auto"
      style={modalStyle}
    >
      {shouldRenderContent && (
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
                  onClick={requestClose}
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </header>
          )}
          <div className={`app-modal-body ${bodyClassName ?? ""}`.trim()}>{children}</div>
          {(footer !== null && (footer !== undefined || hasDefaultFooter)) && (
            <div className="app-modal-footer">
              {footer ?? (
                <>
                  {close && cancelText && (
                    <Button variant="secondary" onClick={requestClose}>{cancelText}</Button>
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
      )}
    </Modal>
  );
}
