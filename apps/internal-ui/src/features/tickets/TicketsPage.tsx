import { useCallback, useEffect, useState } from "react";
import { PageHeader, ContentState, LoadingState } from "../../shared/ui";
import { Button } from "../../shared/ui-controls";
import { Pagination } from "../../shared/Pagination";
import { Icon } from "../../shared/icons";
import { fetchTickets } from "./api";
import { TicketsTable } from "./TicketsTable";
import { TicketFiltersBar } from "./TicketFiltersBar";
import { CreateTicketModal } from "./CreateTicketModal";
import type { EmployeeGroupRef, SessionUser } from "../../types";
import type { Ticket, TicketPriority, TicketStatus } from "./types";
import { t } from "../../i18n";
import "./tickets.css";

const PAGE_SIZE = 20;

type TicketsPageProps = {
  groups: EmployeeGroupRef[];
  openTicket: (ticketId: number) => void;
};

export function TicketsPage({ groups, openTicket }: TicketsPageProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TicketStatus | "ALL">("ALL");
  const [priority, setPriority] = useState<TicketPriority | "ALL">("ALL");
  const [groupId, setGroupId] = useState<number | null>(null);

  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<Array<number | null>>([null]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const loadTickets = useCallback(async (cursor: number | null = null) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchTickets({
        status: status === "ALL" ? undefined : status,
        priority: priority === "ALL" ? undefined : priority,
        group_id: groupId,
        search: search.trim() || undefined,
        window_size: PAGE_SIZE,
        after: cursor,
      });
      setTickets(payload.items);
      setTotal(payload.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("common.request_failed"));
    } finally {
      setLoading(false);
    }
  }, [groupId, priority, search, status]);

  useEffect(() => {
    setPage(1);
    setCursors([null]);
    void loadTickets(null);
  }, [loadTickets]);

  const handlePageChange = (nextPage: number) => {
    if (nextPage === page) return;
    setPage(nextPage);
    const cursor = cursors[nextPage - 1] ?? null;
    void loadTickets(cursor);
  };

  const handleResetFilters = () => {
    setSearch("");
    setStatus("ALL");
    setPriority("ALL");
    setGroupId(null);
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="tickets-page">
      <PageHeader
        title={t("tickets.title")}
        text={t("tickets.total_count", { count: total })}
        action={
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setIsCreateOpen(true)}
          >
            {t("tickets.create_ticket")}
          </Button>
        }
      />

      <TicketFiltersBar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        priority={priority}
        onPriorityChange={setPriority}
        groupId={groupId}
        onGroupChange={setGroupId}
        groups={groups}
        onReset={handleResetFilters}
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ContentState
          icon={<Icon name="alert" size={32} />}
          tone="warning"
          title={t("common.error")}
          text={error}
          action={
            <Button variant="secondary" onClick={() => void loadTickets(cursors[page - 1] ?? null)}>
              {t("common.try_again")}
            </Button>
          }
        />
      ) : tickets.length === 0 ? (
        <ContentState
          icon={<Icon name="ticket" size={32} />}
          title={t("tickets.no_tickets_found")}
          text={t("tickets.no_tickets_hint")}
          action={
            <Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
              {t("tickets.create_ticket")}
            </Button>
          }
        />
      ) : (
        <>
          <TicketsTable tickets={tickets} onOpenTicket={openTicket} />
          {pageCount > 1 && (
            <Pagination
              page={page}
              pageCount={pageCount}
              onPage={handlePageChange}
              note={t("common.range_of", {
                from: (page - 1) * PAGE_SIZE + 1,
                to: Math.min(page * PAGE_SIZE, total),
                total,
              })}
            />
          )}
        </>
      )}

      {isCreateOpen && (
        <CreateTicketModal
          open={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          groups={groups}
          onCreated={(newTicket) => {
            openTicket(newTicket.id);
          }}
        />
      )}
    </div>
  );
}
