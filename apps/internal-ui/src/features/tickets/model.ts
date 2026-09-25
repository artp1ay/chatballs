import type { BadgePropStatus } from "@consta/uikit/Badge";
import type { TicketPriority, TicketStatus } from "./types";
import { t } from "../../i18n";

export type StatusMeta = {
  status: TicketStatus;
  label: string;
  badgeStatus: BadgePropStatus;
};

export type PriorityMeta = {
  priority: TicketPriority;
  label: string;
  tone: "neutral" | "normal" | "warning" | "urgent";
  badgeStatus: BadgePropStatus;
};

export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["IN_PROGRESS", "CANCELLED", "DUPLICATE"],
  IN_PROGRESS: ["WAITING_CUSTOMER", "RESOLVED", "CANCELLED", "DUPLICATE"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "RESOLVED", "CANCELLED", "DUPLICATE"],
  RESOLVED: ["IN_PROGRESS", "CLOSED", "CANCELLED", "DUPLICATE"],
  CLOSED: [],
  CANCELLED: [],
  DUPLICATE: [],
};

export function getStatusMeta(status: TicketStatus): StatusMeta {
  switch (status) {
    case "NEW":
      return { status, label: t("tickets.status_new"), badgeStatus: "system" };
    case "IN_PROGRESS":
      return { status, label: t("tickets.status_in_progress"), badgeStatus: "normal" };
    case "WAITING_CUSTOMER":
      return { status, label: t("tickets.status_waiting_customer"), badgeStatus: "warning" };
    case "RESOLVED":
      return { status, label: t("tickets.status_resolved"), badgeStatus: "success" };
    case "CLOSED":
      return { status, label: t("tickets.status_closed"), badgeStatus: "normal" };
    case "CANCELLED":
      return { status, label: t("tickets.status_cancelled"), badgeStatus: "alert" };
    case "DUPLICATE":
      return { status, label: t("tickets.status_duplicate"), badgeStatus: "system" };
    default:
      return { status, label: status, badgeStatus: "system" };
  }
}

export function getPriorityMeta(priority: TicketPriority): PriorityMeta {
  switch (priority) {
    case "LOW":
      return { priority, label: t("tickets.priority_low"), tone: "neutral", badgeStatus: "system" };
    case "NORMAL":
      return { priority, label: t("tickets.priority_normal"), tone: "normal", badgeStatus: "normal" };
    case "HIGH":
      return { priority, label: t("tickets.priority_high"), tone: "warning", badgeStatus: "warning" };
    case "URGENT":
      return { priority, label: t("tickets.priority_urgent"), tone: "urgent", badgeStatus: "alert" };
    default:
      return { priority, label: priority, tone: "normal", badgeStatus: "normal" };
  }
}

export function requiresTransitionReason(targetStatus: TicketStatus): boolean {
  return targetStatus === "RESOLVED" || targetStatus === "CLOSED" || targetStatus === "CANCELLED" || targetStatus === "DUPLICATE";
}

export function formatTicketEventDescription(event: {
  event_type: string;
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
}): string {
  switch (event.event_type) {
    case "CREATED":
      return t("tickets.event_created");
    case "CREATED_FROM_CONVERSATION":
      return t("tickets.event_created_from_conversation");
    case "STATUS_CHANGED": {
      const oldSt = String(event.old_values.status || "");
      const newSt = String(event.new_values.status || "");
      const oldLabel = oldSt ? getStatusMeta(oldSt as TicketStatus).label : oldSt;
      const newLabel = newSt ? getStatusMeta(newSt as TicketStatus).label : newSt;
      return `${t("tickets.event_status_changed")}: ${oldLabel} → ${newLabel}`;
    }
    case "ASSIGNEE_CHANGED": {
      const newName = String(event.new_values.assignee_name || t("common.not_assigned"));
      return `${t("tickets.event_assignee_changed")}: ${newName}`;
    }
    case "PRIORITY_CHANGED": {
      const oldPr = String(event.old_values.priority || "");
      const newPr = String(event.new_values.priority || "");
      const oldLabel = oldPr ? getPriorityMeta(oldPr as TicketPriority).label : oldPr;
      const newLabel = newPr ? getPriorityMeta(newPr as TicketPriority).label : newPr;
      return `${t("tickets.event_priority_changed")}: ${oldLabel} → ${newLabel}`;
    }
    case "COMMENT_ADDED":
      return t("tickets.event_comment_added");
    case "NOTE_ADDED":
      return t("tickets.event_note_added");
    case "LINKED_TO_CONVERSATION":
      return t("tickets.event_linked_to_conversation");
    case "UPDATED":
      return t("tickets.event_updated");
    default:
      return event.event_type;
  }
}

