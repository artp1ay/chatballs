import { Card } from "@consta/uikit/Card";
import { Modal } from "@consta/uikit/Modal";
import { useId, type ReactNode } from "react";

import { Icon } from "./icons";

type IconName = Parameters<typeof Icon>[0]["name"];

export function DecisionDialog({
  open,
  onClose,
  tone,
  icon,
  title,
  description,
  children,
  actions,
  className = "",
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  tone: "warning" | "danger";
  icon: IconName;
  title: string;
  description: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
  className?: string;
  width?: number;
}) {
  const titleId = useId();

  return (
    <Modal
      className={`decision-dialog is-${tone} ${className}`.trim()}
      isOpen={open}
      onClose={onClose}
      onClickOutside={onClose}
      onEsc={onClose}
      width="auto"
      style={{ width }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {open && (
        <Card className="decision-dialog-card" status={tone === "danger" ? "alert" : "warning"} shadow={false}>
          <header className="decision-dialog-header">
            <span className="decision-dialog-icon"><Icon name={icon} size={22} /></span>
            <div><h3 id={titleId}>{title}</h3><p>{description}</p></div>
          </header>
          {children && <div className="decision-dialog-body">{children}</div>}
          <footer className="decision-dialog-footer">{actions}</footer>
        </Card>
      )}
    </Modal>
  );
}
