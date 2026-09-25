import { useEffect, useState, useCallback } from "react";
import { Badge } from "@consta/uikit/Badge";
import { Icon } from "../../shared/icons";
import { t } from "../../i18n";
import { fetchTickets } from "./api";
import { getStatusMeta } from "./model";
import { CreateTicketModal } from "./CreateTicketModal";
import type { EmployeeGroupRef } from "../../types";
import type { Ticket } from "./types";

type RelatedTicketsSectionProps = {
  contactId: number | null;
  groups?: EmployeeGroupRef[];
  openTicket?: (ticketId: number) => void;
  onTicketCreated?: (ticket: Ticket) => void;
};

export function RelatedTicketsSection({
  contactId,
  groups = [],
  openTicket,
  onTicketCreated,
}: RelatedTicketsSectionProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const loadTickets = useCallback(async () => {
    if (!contactId) {
      setTickets([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchTickets({ requester_id: contactId, window_size: 10 });
      setTickets(res.items);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  if (!contactId) return null;

  return (
    <div className="related-tickets-section">
      <div className="related-tickets-head">
        <span className="related-tickets-title">
          {t("tickets.client_tickets")} ({tickets.length})
        </span>
        <button
          type="button"
          className="link is-muted has-icon"
          onClick={() => setModalOpen(true)}
          title={t("tickets.create_ticket")}
        >
          <Icon name="plus" size={13} />
          <span>{t("common.create")}</span>
        </button>
      </div>

      {loading ? (
        <div className="related-tickets-empty">{t("common.loading")}...</div>
      ) : tickets.length === 0 ? (
        <div className="related-tickets-empty">{t("tickets.no_client_tickets")}</div>
      ) : (
        tickets.map((tItem) => {
          const statusMeta = getStatusMeta(tItem.status);
          return (
            <div
              key={tItem.id}
              className="related-ticket-item"
              role="button"
              tabIndex={0}
              onClick={() => openTicket?.(tItem.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openTicket?.(tItem.id);
                }
              }}
            >
              <span className="related-ticket-num">{tItem.number}</span>
              <span className="related-ticket-subject" title={tItem.subject}>
                {tItem.subject}
              </span>
              <Badge size="s" status={statusMeta.badgeStatus} label={statusMeta.label} />
            </div>
          );
        })
      )}

      {modalOpen && (
        <CreateTicketModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          requesterContactId={contactId}
          groups={groups}
          onCreated={(newTicket) => {
            setTickets((prev) => [newTicket, ...prev]);
            onTicketCreated?.(newTicket);
          }}
        />
      )}
    </div>
  );
}
