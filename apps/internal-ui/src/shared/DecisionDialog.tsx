import { Card } from "@consta/uikit/Card";
import type { ReactNode } from "react";

import { ConstaModal } from "./ConstaModal";
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
  return (
    <ConstaModal
      className={`decision-dialog is-${tone} ${className}`.trim()}
      open={open}
      onCancel={onClose}
      title={null}
      ariaLabel={title}
      footer={null}
      closable={false}
      centered
      width={width}
      bodyClassName="app-modal-body-flush"
      destroyOnHidden
    >
      <Card className="decision-dialog-card" status={tone === "danger" ? "alert" : "warning"} shadow={false}>
        <header className="decision-dialog-header">
          <span className="decision-dialog-icon"><Icon name={icon} size={22} /></span>
          <div><h3>{title}</h3><p>{description}</p></div>
        </header>
        {children && <div className="decision-dialog-body">{children}</div>}
        <footer className="decision-dialog-footer">{actions}</footer>
      </Card>
    </ConstaModal>
  );
}
