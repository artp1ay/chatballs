import { useState } from "react";
import { Button } from "../../shared/ui-controls";
import { ConstaModal } from "../../shared/ConstaModal";
import { FormField, TextAreaField } from "../../shared/form-controls";
import { ApiError } from "../../api/client";
import { t } from "../../i18n";
import { transitionTicket } from "./api";
import { ALLOWED_TRANSITIONS, getStatusMeta, requiresTransitionReason } from "./model";
import type { Ticket, TicketStatus } from "./types";

type TicketStatusActionsProps = {
  ticket: Ticket;
  onStatusChanged: (updatedTicket: Ticket) => void;
  onConflict?: () => void;
  disabled?: boolean;
};

export function TicketStatusActions({
  ticket,
  onStatusChanged,
  onConflict,
  disabled = false,
}: TicketStatusActionsProps) {
  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedTargets = ALLOWED_TRANSITIONS[ticket.status] || [];

  if (allowedTargets.length === 0) {
    return null;
  }

  function handleActionClick(target: TicketStatus) {
    if (requiresTransitionReason(target)) {
      setPendingStatus(target);
      setReason("");
      setComment("");
      setError(null);
    } else {
      void executeTransition(target);
    }
  }

  async function executeTransition(target: TicketStatus, transitionReason?: string, transitionComment?: string) {
    setLoading(true);
    setError(null);
    try {
      const updated = await transitionTicket(ticket.id, {
        target_status: target,
        expected_version: ticket.version,
        reason: transitionReason,
        comment: transitionComment,
      });
      setPendingStatus(null);
      onStatusChanged(updated);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setPendingStatus(null);
        if (onConflict) {
          onConflict();
        } else {
          setError(t("tickets.version_conflict_desc"));
        }
      } else {
        const msg = err instanceof Error ? err.message : t("common.request_failed");
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleModalSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!pendingStatus) return;
    if (!reason.trim()) {
      setError(t("tickets.reason_required"));
      return;
    }
    void executeTransition(pendingStatus, reason.trim(), comment.trim() || undefined);
  }

  return (
    <div className="ticket-status-actions">
      <div className="ticket-status-buttons">
        {allowedTargets.map((target) => {
          const meta = getStatusMeta(target);
          return (
            <Button
              key={target}
              variant={target === "RESOLVED" ? "primary" : "secondary"}
              disabled={disabled || loading}
              onClick={() => handleActionClick(target)}
            >
              {meta.label}
            </Button>
          );
        })}
      </div>

      {pendingStatus && (
        <ConstaModal
          isOpen={Boolean(pendingStatus)}
          onClose={() => !loading && setPendingStatus(null)}
          title={`${t("tickets.status_transition")}: ${getStatusMeta(pendingStatus).label}`}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setPendingStatus(null)}
                disabled={loading}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={() => handleModalSubmit()}
                disabled={loading || !reason.trim()}
              >
                {loading ? t("common.saving") : t("common.confirm")}
              </Button>
            </>
          }
        >
          <form onSubmit={handleModalSubmit} className="ticket-transition-form">
            {error && <div className="form-error mb-12">{error}</div>}
            <FormField
              label={t("tickets.reason_required")}
              value={reason}
              onChange={setReason}
              placeholder={t("tickets.transition_reason_placeholder")}
              disabled={loading}
            />
            <TextAreaField
              label={t("tickets.transition_comment")}
              value={comment}
              onChange={setComment}
              disabled={loading}
            />
          </form>
        </ConstaModal>
      )}
    </div>
  );
}
