import { useState } from "react";
import { SearchInput, FilterDropdown, type SelectOption } from "../../shared/ui-controls";
import type { EmployeeGroupRef } from "../../types";
import { getPriorityMeta, getStatusMeta } from "./model";
import type { TicketPriority, TicketStatus } from "./types";
import { t } from "../../i18n";

type TicketFiltersBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: TicketStatus | "ALL";
  onStatusChange: (status: TicketStatus | "ALL") => void;
  priority: TicketPriority | "ALL";
  onPriorityChange: (priority: TicketPriority | "ALL") => void;
  groupId: number | null;
  onGroupChange: (groupId: number | null) => void;
  groups: EmployeeGroupRef[];
  onReset: () => void;
};

export function TicketFiltersBar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  priority,
  onPriorityChange,
  groupId,
  onGroupChange,
  groups,
  onReset,
}: TicketFiltersBarProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const statusOptions: SelectOption[] = [
    { value: "ALL", label: t("common.all") },
    { value: "NEW", label: t("tickets.status_new") },
    { value: "IN_PROGRESS", label: t("tickets.status_in_progress") },
    { value: "WAITING_CUSTOMER", label: t("tickets.status_waiting_customer") },
    { value: "RESOLVED", label: t("tickets.status_resolved") },
    { value: "CLOSED", label: t("tickets.status_closed") },
    { value: "CANCELLED", label: t("tickets.status_cancelled") },
    { value: "DUPLICATE", label: t("tickets.status_duplicate") },
  ];

  const priorityOptions: SelectOption[] = [
    { value: "ALL", label: t("common.all") },
    { value: "LOW", label: t("tickets.priority_low") },
    { value: "NORMAL", label: t("tickets.priority_normal") },
    { value: "HIGH", label: t("tickets.priority_high") },
    { value: "URGENT", label: t("tickets.priority_urgent") },
  ];

  const groupOptions: SelectOption[] = [
    { value: "ALL", label: t("common.all") },
    ...groups.map((g) => ({ value: String(g.id), label: g.name })),
  ];

  const hasActiveFilters = search || status !== "ALL" || priority !== "ALL" || groupId !== null;

  const currentStatusLabel =
    status === "ALL"
      ? t("tickets.status")
      : getStatusMeta(status).label;

  const currentPriorityLabel =
    priority === "ALL"
      ? t("tickets.priority")
      : getPriorityMeta(priority).label;

  const currentGroupLabel =
    groupId === null
      ? t("tickets.group")
      : groups.find((g) => g.id === groupId)?.name || t("tickets.group");

  return (
    <div className="tickets-filters-bar">
      <SearchInput
        className="tickets-search-input"
        placeholder={t("tickets.search_placeholder")}
        value={search}
        onChange={onSearchChange}
      />
      <FilterDropdown
        label={currentStatusLabel}
        options={statusOptions}
        selected={status !== "ALL" ? [status] : []}
        open={openDropdown === "status"}
        onOpenChange={(open) => setOpenDropdown(open ? "status" : null)}
        onSelect={(val) => {
          onStatusChange(val as TicketStatus | "ALL");
          setOpenDropdown(null);
        }}
      />
      <FilterDropdown
        label={currentPriorityLabel}
        options={priorityOptions}
        selected={priority !== "ALL" ? [priority] : []}
        open={openDropdown === "priority"}
        onOpenChange={(open) => setOpenDropdown(open ? "priority" : null)}
        onSelect={(val) => {
          onPriorityChange(val as TicketPriority | "ALL");
          setOpenDropdown(null);
        }}
      />
      {groups.length > 0 && (
        <FilterDropdown
          label={currentGroupLabel}
          options={groupOptions}
          selected={groupId !== null ? [String(groupId)] : []}
          open={openDropdown === "group"}
          onOpenChange={(open) => setOpenDropdown(open ? "group" : null)}
          onSelect={(val) => {
            onGroupChange(val === "ALL" ? null : Number(val));
            setOpenDropdown(null);
          }}
        />
      )}
      {hasActiveFilters && (
        <button type="button" className="link is-muted" onClick={onReset}>
          {t("common.reset")}
        </button>
      )}
    </div>
  );
}
