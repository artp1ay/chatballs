import { useState } from "react";
import { Checkbox } from "@consta/uikit/Checkbox";
import { Button } from "../../shared/ui-controls";
import { fmt, t } from "../../i18n";
import { createTicketComment } from "./api";
import type { TicketComment } from "./types";

type TicketCommentsTabProps = {
  ticketId: number;
  comments: TicketComment[];
  onCommentAdded: (comment: TicketComment) => void;
  disabled?: boolean;
};

export function TicketCommentsTab({
  ticketId,
  comments,
  onCommentAdded,
  disabled = false,
}: TicketCommentsTabProps) {
  const [text, setText] = useState("");
  const [doNotNotify, setDoNotNotify] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const isPublic = !doNotNotify;
      const comment = await createTicketComment(ticketId, text.trim(), isPublic);
      setText("");
      onCommentAdded(comment);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("common.request_failed");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ticket-comments-tab">
      <div className="ticket-comments-list">
        {comments.length === 0 ? (
          <div className="ticket-empty-state">{t("tickets.no_comments")}</div>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className={`ticket-comment-card ${!comment.is_public ? "is-private" : ""}`}
            >
              <div className="ticket-comment-header">
                <span className="ticket-comment-author">{comment.author_name}</span>
                <span className="ticket-comment-date">{fmt.shortDateTime(comment.created_at)}</span>
                {!comment.is_public && (
                  <span className="ticket-private-badge">{t("tickets.private_comment_badge")}</span>
                )}
              </div>
              <div className="ticket-comment-body">{comment.text}</div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="ticket-comment-form">
        {error && <div className="form-error mb-8">{error}</div>}
        <textarea
          className="textarea ticket-comment-input"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("tickets.comment_placeholder")}
          disabled={disabled || loading}
        />
        <div className="ticket-comment-form-footer">
          <div className="ticket-comment-checkbox-wrapper" title={t("tickets.do_not_notify_hint")}>
            <Checkbox
              size="m"
              checked={doNotNotify}
              label={t("tickets.do_not_notify_customer")}
              onChange={(e) => setDoNotNotify(e.target.checked)}
              disabled={disabled || loading}
            />
            <span className="ticket-checkbox-hint">{t("tickets.do_not_notify_hint")}</span>
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={disabled || loading || !text.trim()}
          >
            {loading ? t("common.saving") : t("tickets.send_comment")}
          </Button>
        </div>
      </form>
    </div>
  );
}
