import { api } from "../../api/client";
import type {
  CreateConversationTicketPayload,
  CreateTicketPayload,
  Ticket,
  TicketComment,
  TicketEvent,
  TicketListParams,
  TicketListPayload,
  TicketNote,
  TransitionTicketPayload,
  UpdateTicketPayload,
} from "./types";

export function buildTicketsQuery(params: TicketListParams): string {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.priority) searchParams.set("priority", params.priority);
  if (params.assignee_id != null) searchParams.set("assignee_id", String(params.assignee_id));
  if (params.requester_id != null) searchParams.set("requester_id", String(params.requester_id));
  if (params.group_id != null) searchParams.set("group_id", String(params.group_id));
  if (params.search) searchParams.set("search", params.search);
  if (params.after != null) searchParams.set("after", String(params.after));
  if (params.window_size != null) searchParams.set("window_size", String(params.window_size));
  if (params.sort) searchParams.set("sort", params.sort);
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchTickets(params: TicketListParams = {}): Promise<TicketListPayload> {
  return api<TicketListPayload>(`/api/v1/tickets/${buildTicketsQuery(params)}`);
}

export async function fetchTicket(ticketId: number): Promise<Ticket> {
  return api<Ticket>(`/api/v1/tickets/${ticketId}/`);
}

export async function createTicket(payload: CreateTicketPayload): Promise<Ticket> {
  return api<Ticket>("/api/v1/tickets/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createTicketFromConversation(
  conversationId: number,
  payload: CreateConversationTicketPayload,
): Promise<Ticket> {
  return api<Ticket>(`/api/v1/conversations/${conversationId}/ticket/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTicket(
  ticketId: number,
  payload: UpdateTicketPayload,
): Promise<Ticket> {
  return api<Ticket>(`/api/v1/tickets/${ticketId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function transitionTicket(
  ticketId: number,
  payload: TransitionTicketPayload,
): Promise<Ticket> {
  return api<Ticket>(`/api/v1/tickets/${ticketId}/transitions/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchTicketNotes(ticketId: number): Promise<TicketNote[]> {
  return api<TicketNote[]>(`/api/v1/tickets/${ticketId}/notes/`);
}

export async function createTicketNote(ticketId: number, text: string): Promise<TicketNote> {
  return api<TicketNote>(`/api/v1/tickets/${ticketId}/notes/`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function fetchTicketComments(ticketId: number): Promise<TicketComment[]> {
  return api<TicketComment[]>(`/api/v1/tickets/${ticketId}/comments/`);
}

export async function createTicketComment(
  ticketId: number,
  text: string,
  isPublic = true,
): Promise<TicketComment> {
  return api<TicketComment>(`/api/v1/tickets/${ticketId}/comments/`, {
    method: "POST",
    body: JSON.stringify({ text, is_public: isPublic }),
  });
}

export async function fetchTicketEvents(ticketId: number): Promise<TicketEvent[]> {
  return api<TicketEvent[]>(`/api/v1/tickets/${ticketId}/events/`);
}
