import { useState } from "react";
import { Button } from "../../shared/ui-controls";
import { Icon } from "../../shared/icons";
import { fmt, t } from "../../i18n";
import { createTicketNote } from "./api";
import type { TicketNote } from "./types";

type TicketNotesTabProps = {
  ticketId: number;
  notes: TicketNote[];
  onNoteAdded: (note: TicketNote) => void;
  disabled?: boolean;
};

export function TicketNotesTab({
  ticketId,
  notes,
  onNoteAdded,
  disabled = false,
}: TicketNotesTabProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const note = await createTicketNote(ticketId, text.trim());
      setText("");
      onNoteAdded(note);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("common.request_failed");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ticket-notes-tab">
      <div className="ticket-internal-disclaimer">
        <Icon name="lock" size={16} />
        <span>{t("tickets.internal_notes_hint")}</span>
      </div>

      <div className="ticket-notes-list">
        {notes.length === 0 ? (
          <div className="ticket-empty-state">{t("tickets.no_notes")}</div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="ticket-note-card is-internal-note">
              <div className="ticket-note-header">
                <span className="ticket-note-author">
                  <span className="ticket-note-icon-wrap">
                    <Icon name="lock" size={14} />
                  </span>
                  {note.author_name}
                </span>
                <span className="ticket-note-date">{fmt.shortDateTime(note.created_at)}</span>
              </div>
              <div className="ticket-note-body">{note.text}</div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="ticket-note-form">
        {error && <div className="form-error mb-8">{error}</div>}
        <textarea
          className="textarea ticket-note-input"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("tickets.note_placeholder")}
          disabled={disabled || loading}
        />
        <div className="ticket-note-form-footer">
          <Button
            type="submit"
            variant="primary"
            disabled={disabled || loading || !text.trim()}
          >
            {loading ? t("common.saving") : t("tickets.add_note")}
          </Button>
        </div>
      </form>
    </div>
  );
}
