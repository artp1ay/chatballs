import { useState } from "react";
import { ConstaModal } from "../../shared/ConstaModal";
import { Button } from "../../shared/ui-controls";
import { FormField, SelectField, TextAreaField } from "../../shared/form-controls";
import { createTicket, createTicketFromConversation } from "./api";
import type { EmployeeGroupRef } from "../../types";
import type { Ticket, TicketPriority } from "./types";
import { t } from "../../i18n";

type CreateTicketModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (ticket: Ticket) => void;
  groups?: EmployeeGroupRef[];
  initialSubject?: string;
  initialDescription?: string;
  requesterContactId?: number | null;
  conversationId?: number | null;
};

export function CreateTicketModal({
  open,
  onClose,
  onCreated,
  groups = [],
  initialSubject = "",
  initialDescription = "",
  requesterContactId = null,
  conversationId = null,
}: CreateTicketModalProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [description, setDescription] = useState(initialDescription);
  const [priority, setPriority] = useState<TicketPriority>("NORMAL");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!subject.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const ticket = conversationId != null
        ? await createTicketFromConversation(conversationId, {
            subject: subject.trim(),
            description: description.trim(),
            priority,
            group_id: groupId,
          })
        : await createTicket({
            subject: subject.trim(),
            description: description.trim(),
            priority,
            group_id: groupId,
            requester_contact_id: requesterContactId,
          });
      onCreated(ticket);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("common.could_not_save");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const priorityOptions: Array<[string, string]> = [
    ["LOW", t("tickets.priority_low")],
    ["NORMAL", t("tickets.priority_normal")],
    ["HIGH", t("tickets.priority_high")],
    ["URGENT", t("tickets.priority_urgent")],
  ];

  const groupOptions: Array<[string, string]> = [
    ["", t("common.no_group")],
    ...groups.map((g) => [String(g.id), g.name] as [string, string]),
  ];

  return (
    <ConstaModal
      isOpen={open}
      onClose={onClose}
      title={t("tickets.create_ticket")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSubmit()}
            disabled={!subject.trim() || loading}
          >
            {loading ? t("common.saving") : t("common.create")}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {error && <div className="ticket-conflict-banner">{error}</div>}
        <FormField
          label={t("tickets.subject")}
          value={subject}
          onChange={setSubject}
          placeholder={t("tickets.subject_placeholder")}
          disabled={loading}
        />
        <SelectField
          label={t("tickets.priority")}
          value={priority}
          onChange={(val) => setPriority(val as TicketPriority)}
          options={priorityOptions}
          disabled={loading}
        />
        {groups.length > 0 && (
          <SelectField
            label={t("tickets.group")}
            value={groupId !== null ? String(groupId) : ""}
            onChange={(val) => setGroupId(val ? Number(val) : null)}
            options={groupOptions}
            disabled={loading}
          />
        )}
        <TextAreaField
          label={t("common.description")}
          value={description}
          onChange={setDescription}
          disabled={loading}
        />
      </form>
    </ConstaModal>
  );
}
