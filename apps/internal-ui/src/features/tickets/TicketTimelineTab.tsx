import { Icon } from "../../shared/icons";
import { fmt, t } from "../../i18n";
import { formatTicketEventDescription } from "./model";
import type { TicketEvent } from "./types";

type TicketTimelineTabProps = {
  events: TicketEvent[];
};

export function TicketTimelineTab({ events }: TicketTimelineTabProps) {
  if (events.length === 0) {
    return (
      <div className="ticket-timeline-tab">
        <div className="ticket-empty-state">{t("tickets.no_events")}</div>
      </div>
    );
  }

  return (
    <div className="ticket-timeline-tab">
      <div className="ticket-timeline-list">
        {events.map((event) => (
          <div key={event.id} className="ticket-timeline-item">
            <div className="ticket-timeline-dot" />
            <div className="ticket-timeline-content">
              <div className="ticket-timeline-header">
                <span className="ticket-timeline-actor">{event.actor_name}</span>
                <span className="ticket-timeline-date">{fmt.shortDateTime(event.created_at)}</span>
                {event.notify_customer && (
                  <span className="ticket-notified-badge" title={t("tickets.customer_was_notified")}>
                    <Icon name="check" size={12} />
                    <span>{t("tickets.customer_notified")}</span>
                  </span>
                )}
              </div>
              <div className="ticket-timeline-desc">
                {formatTicketEventDescription(event)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
