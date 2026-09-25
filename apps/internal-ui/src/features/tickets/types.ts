export type TicketStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "WAITING_CUSTOMER"
  | "RESOLVED"
  | "CLOSED"
  | "CANCELLED"
  | "DUPLICATE";

export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type TicketRequester = {
  id: number;
  name: string;
};

export type TicketAssignee = {
  id: number;
  user_id: number;
  name: string;
  email: string;
};

export type TicketGroup = {
  id: number;
  name: string;
};

export type Ticket = {
  id: number;
  organization_id: number;
  number: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  requester_contact_id: number | null;
  requester_contact: TicketRequester | null;
  assignee_membership_id: number | null;
  assignee: TicketAssignee | null;
  group_id: number | null;
  group: TicketGroup | null;
  origin_conversation_id: number | null;
  version: number;
  resolution_reason: string;
  cancellation_reason: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
};

export type TicketNote = {
  id: number;
  ticket_id: number;
  author_membership_id: number;
  author_name: string;
  text: string;
  created_at: string;
};

export type TicketComment = {
  id: number;
  ticket_id: number;
  author_membership_id: number | null;
  author_contact_id: number | null;
  author_name: string;
  text: string;
  is_public: boolean;
  created_at: string;
};

export type TicketEvent = {
  id: number;
  ticket_id: number;
  event_type: string;
  actor_membership_id: number | null;
  actor_contact_id: number | null;
  actor_name: string;
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  notify_customer: boolean;
  created_at: string;
};

export type TicketListParams = {
  status?: string;
  priority?: string;
  assignee_id?: number | null;
  requester_id?: number | null;
  group_id?: number | null;
  search?: string;
  after?: number | null;
  window_size?: number;
  sort?: string;
};

export type TicketListPayload = {
  items: Ticket[];
  total: number;
  next_cursor: number | null;
  has_more: boolean;
};

export type CreateTicketPayload = {
  subject: string;
  description?: string;
  priority?: TicketPriority;
  category?: string;
  requester_contact_id?: number | null;
  assignee_membership_id?: number | null;
  group_id?: number | null;
};

export type CreateConversationTicketPayload = {
  subject: string;
  description?: string;
  priority?: TicketPriority;
  category?: string;
  assignee_membership_id?: number | null;
  group_id?: number | null;
};

export type TransitionTicketPayload = {
  target_status: TicketStatus;
  expected_version?: number;
  reason?: string;
  comment?: string;
};

export type UpdateTicketPayload = {
  subject?: string;
  description?: string;
  priority?: TicketPriority;
  category?: string;
  assignee_membership_id?: number | null;
  group_id?: number | null;
  expected_version?: number;
};
