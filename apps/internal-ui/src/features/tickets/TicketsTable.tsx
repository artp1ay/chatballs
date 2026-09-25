import { Badge } from "@consta/uikit/Badge";
import { Tag } from "@consta/uikit/Tag";
import { Icon } from "../../shared/icons";
import { getPriorityMeta, getStatusMeta } from "./model";
import type { Ticket } from "./types";
import { fmt, t } from "../../i18n";

type TicketsTableProps = {
  tickets: Ticket[];
  onOpenTicket: (ticketId: number) => void;
};

export function TicketsTable({ tickets, onOpenTicket }: TicketsTableProps) {
  return (
    <div className="tickets-table-card">
      <div className="tickets-table-head" role="row">
        <span>{t("tickets.number")}</span>
        <span>{t("tickets.subject")}</span>
        <span>{t("tickets.requester")}</span>
        <span>{t("tickets.status")}</span>
        <span>{t("tickets.priority")}</span>
        <span>{t("tickets.assignee")}</span>
        <span>{t("tickets.updated_at")}</span>
      </div>
      <div role="rowgroup">
        {tickets.map((ticket) => {
          const statusMeta = getStatusMeta(ticket.status);
          const priorityMeta = getPriorityMeta(ticket.priority);
          const requesterName = ticket.requester_contact?.name || "—";
          const assigneeName = ticket.assignee?.name || ticket.group?.name || "—";
          const updatedAt = fmt.shortDateTime(ticket.updated_at);

          return (
            <div
              key={ticket.id}
              className="tickets-table-row"
              role="row"
              tabIndex={0}
              onClick={() => onOpenTicket(ticket.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenTicket(ticket.id);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <span className="tickets-col-number">{ticket.number}</span>
              <span className="tickets-col-subject" title={ticket.subject}>
                {ticket.subject}
              </span>
              <span className="tickets-col-meta" title={requesterName}>
                {requesterName}
              </span>
              <span>
                <Badge
                  size="s"
                  status={statusMeta.badgeStatus}
                  label={statusMeta.label}
                />
              </span>
              <span>
                <Tag
                  size="s"
                  mode="info"
                  label={priorityMeta.label}
                  icon={priorityMeta.tone === "urgent" ? () => <Icon name="flame" size={12} /> : undefined}
                />
              </span>
              <span className="tickets-col-meta" title={assigneeName}>
                {assigneeName}
              </span>
              <span className="tickets-col-meta">{updatedAt}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
