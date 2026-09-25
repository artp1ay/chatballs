import { useEffect, useState, useCallback } from "react";
import { Badge } from "@consta/uikit/Badge";
import { Tag } from "@consta/uikit/Tag";
import { Button, UnderlineTabs } from "../../shared/ui-controls";
import { Icon } from "../../shared/icons";
import { LoadingState } from "../../shared/ui";
import { fmt, t } from "../../i18n";
import { fetchTicket, fetchTicketComments, fetchTicketEvents, fetchTicketNotes } from "./api";
import { getPriorityMeta, getStatusMeta } from "./model";
import { TicketCommentsTab } from "./TicketCommentsTab";
import { TicketNotesTab } from "./TicketNotesTab";
import { TicketStatusActions } from "./TicketStatusActions";
import { TicketTimelineTab } from "./TicketTimelineTab";
import type { Ticket, TicketComment, TicketEvent, TicketNote } from "./types";
import "./ticket-detail.css";
import "./ticket-tabs.css";

type DetailTabKey = "comments" | "notes" | "timeline";

type TicketDetailPageProps = {
  ticketId: number | null;
  onBack: () => void;
  openConversation?: (conversationId: number) => void;
  openClient?: (clientId: number) => void;
};

export function TicketDetailPage({
  ticketId,
  onBack,
  openConversation,
  openClient,
}: TicketDetailPageProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTabKey>("comments");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const loadTicketData = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    setConflict(false);
    try {
      const [ticketData, commentsData, notesData, eventsData] = await Promise.all([
        fetchTicket(ticketId),
        fetchTicketComments(ticketId),
        fetchTicketNotes(ticketId),
        fetchTicketEvents(ticketId),
      ]);
      setTicket(ticketData);
      setComments(commentsData);
      setNotes(notesData);
      setEvents(eventsData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("common.could_not_save");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void loadTicketData();
  }, [loadTicketData]);

  if (loading) {
    return <LoadingState />;
  }

  if (error || !ticket) {
    return (
      <div className="ticket-detail-page">
        <p>{error || t("tickets.no_tickets_found")}</p>
        <div>
          <Button variant="secondary" onClick={onBack}>
            {t("common.back")}
          </Button>
        </div>
      </div>
    );
  }

  const statusMeta = getStatusMeta(ticket.status);
  const priorityMeta = getPriorityMeta(ticket.priority);

  const tabItems = [
    { key: "comments" as const, label: t("tickets.public_comments"), count: comments.length },
    { key: "notes" as const, label: t("tickets.internal_notes"), count: notes.length },
    { key: "timeline" as const, label: t("tickets.timeline"), count: events.length },
  ];

  function handleStatusChanged(updated: Ticket) {
    setTicket(updated);
    if (ticketId) {
      void fetchTicketEvents(ticketId).then(setEvents);
    }
  }

  return (
    <div className="ticket-detail-page">
      <div className="ticket-detail-top-nav">
        <button type="button" className="link is-muted" onClick={onBack}>
          ← {t("tickets.back_to_list")}
        </button>
      </div>

      {conflict && (
        <div className="ticket-conflict-banner">
          <div className="ticket-conflict-content">
            <span className="ticket-conflict-title">{t("tickets.version_conflict_title")}</span>
            <span className="ticket-conflict-desc">{t("tickets.version_conflict_desc")}</span>
          </div>
          <Button variant="primary" onClick={() => void loadTicketData()}>
            {t("tickets.refresh_ticket")}
          </Button>
        </div>
      )}

      <div className="ticket-detail-card">
        <div className="ticket-detail-header">
          <div className="ticket-detail-title-row">
            <h1 className="ticket-detail-number">#{ticket.number}</h1>
            <Badge size="m" status={statusMeta.badgeStatus} label={statusMeta.label} />
            <Tag
              size="m"
              mode="info"
              label={priorityMeta.label}
              icon={priorityMeta.tone === "urgent" ? () => <Icon name="flame" size={14} /> : undefined}
            />
          </div>
          <div className="ticket-detail-subject">{ticket.subject}</div>
          {ticket.description && (
            <div className="ticket-detail-description">{ticket.description}</div>
          )}

          <div className="ticket-detail-meta-grid">
            <div className="ticket-meta-item">
              <span className="ticket-meta-label">{t("tickets.requester")}:</span>
              {ticket.requester_contact && openClient ? (
                <button
                  type="button"
                  className="link is-neutral"
                  onClick={() => openClient(ticket.requester_contact_id!)}
                >
                  {ticket.requester_contact.name}
                </button>
              ) : (
                <span className="ticket-meta-value">{ticket.requester_contact?.name || "—"}</span>
              )}
            </div>

            <div className="ticket-meta-item">
              <span className="ticket-meta-label">{t("tickets.assignee")}:</span>
              <span className="ticket-meta-value">{ticket.assignee?.name || "—"}</span>
            </div>

            <div className="ticket-meta-item">
              <span className="ticket-meta-label">{t("tickets.group")}:</span>
              <span className="ticket-meta-value">{ticket.group?.name || "—"}</span>
            </div>

            <div className="ticket-meta-item">
              <span className="ticket-meta-label">{t("tickets.created_at")}:</span>
              <span className="ticket-meta-value">{fmt.shortDateTime(ticket.created_at)}</span>
            </div>

            <div className="ticket-meta-item">
              <span className="ticket-meta-label">{t("tickets.updated_at")}:</span>
              <span className="ticket-meta-value">{fmt.shortDateTime(ticket.updated_at)}</span>
            </div>

            {ticket.origin_conversation_id != null && (
              <div className="ticket-meta-item">
                <span className="ticket-meta-label">{t("tickets.origin_conversation")}:</span>
                {openConversation ? (
                  <button
                    type="button"
                    className="link is-strong"
                    onClick={() => openConversation(ticket.origin_conversation_id!)}
                  >
                    #{ticket.origin_conversation_id}
                  </button>
                ) : (
                  <span className="ticket-meta-value">#{ticket.origin_conversation_id}</span>
                )}
              </div>
            )}
          </div>

          <div className="ticket-detail-actions-panel">
            <TicketStatusActions
              ticket={ticket}
              onStatusChanged={handleStatusChanged}
              onConflict={() => setConflict(true)}
              disabled={conflict}
            />
          </div>
        </div>

        <div className="ticket-detail-body">
          <UnderlineTabs
            className="ticket-detail-tabs"
            items={tabItems}
            value={activeTab}
            onChange={(val) => setActiveTab(val as DetailTabKey)}
          />

          <div className="ticket-tab-content">
            {activeTab === "comments" && (
              <TicketCommentsTab
                ticketId={ticket.id}
                comments={comments}
                onCommentAdded={(c) => {
                  setComments((prev) => [...prev, c]);
                  if (ticketId) void fetchTicketEvents(ticketId).then(setEvents);
                }}
                disabled={conflict}
              />
            )}
            {activeTab === "notes" && (
              <TicketNotesTab
                ticketId={ticket.id}
                notes={notes}
                onNoteAdded={(n) => {
                  setNotes((prev) => [...prev, n]);
                  if (ticketId) void fetchTicketEvents(ticketId).then(setEvents);
                }}
                disabled={conflict}
              />
            )}
            {activeTab === "timeline" && <TicketTimelineTab events={events} />}
          </div>
        </div>
      </div>
    </div>
  );
}
