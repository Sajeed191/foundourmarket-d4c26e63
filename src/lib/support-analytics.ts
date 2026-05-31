// Pure, deterministic customer-support analytics derived ONLY from real DB rows
// (support_tickets, support_messages, returns, refunds, orders, profiles,
// fraud_alerts). No mock data, no hard-coded metrics, no simulated tickets.

export type TicketRow = {
  id: string;
  user_id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  order_id: string | null;
  market_region: string | null;
  last_message_at: string;
  resolved_at: string | null;
  assigned_to: string | null;
  tags: string[] | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_role: string | null; // "customer" | "user" | "staff" | "admin" | ...
  created_at: string;
};

export type OrderLite = {
  id: string; user_id: string; total: number; currency: string | null;
  status: string; payment_status: string | null;
};
export type RefundRow = {
  id: string; order_id: string; amount: number; currency: string | null;
  status: string; reason: string | null; created_at: string;
};
export type ReturnRow = {
  id: string; order_id: string; user_id: string; status: string;
  reason: string | null; refund_amount: number | null; refund_status: string | null;
  resolved_at: string | null; created_at: string;
};

const HOUR = 3600_000;
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const STAFF_SENDERS = ["staff", "admin", "support", "agent", "super_admin", "manager"];
export const isStaffSender = (role: string | null | undefined) =>
  !!role && STAFF_SENDERS.includes(role.toLowerCase());

// ── Pipeline statuses ────────────────────────────────────────────────────────
export type TicketStage =
  | "new" | "open" | "pending_customer" | "pending_internal"
  | "escalated" | "resolved" | "closed" | "spam";

export const STAGE_LABEL: Record<TicketStage, string> = {
  new: "New", open: "Open", pending_customer: "Pending Customer",
  pending_internal: "Pending Internal Team", escalated: "Escalated",
  resolved: "Resolved", closed: "Closed", spam: "Spam",
};

export const STAGE_ORDER: TicketStage[] = [
  "new", "open", "pending_customer", "pending_internal", "escalated", "resolved", "closed", "spam",
];

/**
 * Derive a normalized pipeline stage from the raw DB status plus the direction
 * of the last message. The DB status is authoritative when it already maps to a
 * stage; otherwise we infer pending_customer / pending_internal from who spoke
 * last (real support_messages — never fabricated).
 */
export function deriveStage(t: TicketRow, lastSenderRole: string | null | undefined, hasMessages: boolean): TicketStage {
  const s = (t.status ?? "").toLowerCase();
  if (s === "spam") return "spam";
  if (s === "escalated") return "escalated";
  if (s === "closed") return "closed";
  if (s === "resolved") return "resolved";
  if (s === "new") return "new";
  if (s === "pending_internal" || s === "pending_team") return "pending_internal";
  if (s === "pending_customer") return "pending_customer";
  // status "open"/"pending"/unknown → infer from conversation
  if (!hasMessages) return "new";
  if (s === "pending") return isStaffSender(lastSenderRole) ? "pending_customer" : "pending_internal";
  return isStaffSender(lastSenderRole) ? "pending_customer" : "open";
}

// ── Priority + SLA engine ────────────────────────────────────────────────────
export type Priority = "low" | "medium" | "high" | "urgent";
export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low", medium: "Medium", high: "High", urgent: "Urgent",
};
// DB stores "normal"; treat it as "medium".
export function normPriority(p: string | null | undefined): Priority {
  const v = (p ?? "").toLowerCase();
  if (v === "urgent") return "urgent";
  if (v === "high") return "high";
  if (v === "low") return "low";
  return "medium";
}

// First-response and resolution SLA targets in hours, by priority.
export const SLA_RESPONSE_H: Record<Priority, number> = { urgent: 1, high: 4, medium: 24, low: 48 };
export const SLA_RESOLUTION_H: Record<Priority, number> = { urgent: 8, high: 24, medium: 72, low: 120 };

const OPEN_STAGES: TicketStage[] = ["new", "open", "pending_customer", "pending_internal", "escalated"];
export const isOpenStage = (s: TicketStage) => OPEN_STAGES.includes(s);

export type SlaInfo = {
  priority: Priority;
  firstResponseH: number | null;   // measured hours to first staff reply (null if none yet)
  resolutionH: number | null;      // measured hours to resolved_at (null if unresolved)
  responseTarget: number;
  resolutionTarget: number;
  awaitingStaffH: number | null;   // hours customer has been waiting for staff (open + last msg customer)
  overdue: boolean;                // awaiting staff longer than response target
  breached: boolean;               // resolution missed, or open past resolution target
  critical: boolean;               // urgent/high AND (overdue or breached)
};

export function computeSla(
  t: TicketRow,
  stage: TicketStage,
  firstStaffReplyAt: number | null,
  lastSenderRole: string | null | undefined,
  now = Date.now(),
): SlaInfo {
  const priority = normPriority(t.priority);
  const created = new Date(t.created_at).getTime();
  const responseTarget = SLA_RESPONSE_H[priority];
  const resolutionTarget = SLA_RESOLUTION_H[priority];

  const firstResponseH = firstStaffReplyAt ? (firstStaffReplyAt - created) / HOUR : null;
  const resolvedAt = t.resolved_at ? new Date(t.resolved_at).getTime() : null;
  const resolutionH = resolvedAt ? (resolvedAt - created) / HOUR : null;

  const open = isOpenStage(stage);
  const awaitingStaff = open && !isStaffSender(lastSenderRole);
  const awaitingStaffH = awaitingStaff ? (now - new Date(t.last_message_at).getTime()) / HOUR : null;

  // Overdue: still waiting on staff beyond the response target, OR no first
  // response yet and creation is older than the response target.
  let overdue = false;
  if (open) {
    if (firstStaffReplyAt == null && (now - created) / HOUR > responseTarget) overdue = true;
    if (awaitingStaffH != null && awaitingStaffH > responseTarget) overdue = true;
  }

  // Breached: resolved slower than target, or open longer than resolution target.
  let breached = false;
  if (resolutionH != null && resolutionH > resolutionTarget) breached = true;
  if (open && (now - created) / HOUR > resolutionTarget) breached = true;

  const critical = (priority === "urgent" || priority === "high") && (overdue || breached);
  return {
    priority, firstResponseH: firstResponseH != null ? round1(firstResponseH) : null,
    resolutionH: resolutionH != null ? round1(resolutionH) : null,
    responseTarget, resolutionTarget,
    awaitingStaffH: awaitingStaffH != null ? round1(awaitingStaffH) : null,
    overdue, breached, critical,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ── Auto-escalation detection ────────────────────────────────────────────────
export type EscalationReason =
  | "refund_complaint" | "failed_delivery" | "repeated_contact"
  | "vip_customer" | "high_value_order" | "fraud_claim";

export const ESCALATION_LABEL: Record<EscalationReason, string> = {
  refund_complaint: "Refund complaint", failed_delivery: "Failed delivery",
  repeated_contact: "Repeated complaints", vip_customer: "VIP customer",
  high_value_order: "High-value order", fraud_claim: "Fraud claim",
};

export type EscalationContext = {
  ticketsByUser: Map<string, number>;
  ltvByUser: Map<string, number>;
  failedDeliveryOrderIds: Set<string>;
  fraudUserIds: Set<string>;
  orderById: Map<string, OrderLite>;
  vipThreshold: number;       // currency-agnostic LTV threshold
  highValueThreshold: number; // single-order threshold
};

export function detectEscalation(t: TicketRow, ctx: EscalationContext): EscalationReason[] {
  const reasons: EscalationReason[] = [];
  const text = `${t.subject} ${t.category} ${(t.tags ?? []).join(" ")}`.toLowerCase();
  if (/refund|chargeback|money\s*back|not\s*refund/.test(text)) reasons.push("refund_complaint");
  if (/fraud|scam|unauthor|stolen|hack/.test(text)) reasons.push("fraud_claim");
  if (t.order_id && ctx.failedDeliveryOrderIds.has(t.order_id)) reasons.push("failed_delivery");
  if (ctx.fraudUserIds.has(t.user_id)) {
    if (!reasons.includes("fraud_claim")) reasons.push("fraud_claim");
  }
  if ((ctx.ticketsByUser.get(t.user_id) ?? 0) >= 3) reasons.push("repeated_contact");
  if ((ctx.ltvByUser.get(t.user_id) ?? 0) >= ctx.vipThreshold) reasons.push("vip_customer");
  if (t.order_id) {
    const o = ctx.orderById.get(t.order_id);
    if (o && o.total >= ctx.highValueThreshold) reasons.push("high_value_order");
  }
  return reasons;
}

// ── Agent dashboard KPIs ─────────────────────────────────────────────────────
export type SupportKpis = {
  open: number; pendingCustomer: number; awaitingStaff: number; escalated: number;
  resolvedToday: number; avgResponseH: number | null; avgResolutionH: number | null;
  slaCompliance: number; csat: number | null; overdue: number; critical: number;
};

export function computeSupportKpis(
  rows: { ticket: TicketRow; stage: TicketStage; sla: SlaInfo; lastSenderRole: string | null | undefined }[],
  now = Date.now(),
): SupportKpis {
  const today = new Date(now);
  let open = 0, pendingCustomer = 0, awaitingStaff = 0, escalated = 0, resolvedToday = 0, overdue = 0, critical = 0;
  const responseTimes: number[] = [];
  const resolutionTimes: number[] = [];
  let handled = 0, slaMet = 0;

  for (const { ticket, stage, sla, lastSenderRole } of rows) {
    if (isOpenStage(stage)) open++;
    if (stage === "pending_customer") pendingCustomer++;
    if (stage === "escalated") escalated++;
    if (isOpenStage(stage) && !isStaffSender(lastSenderRole)) awaitingStaff++;
    if (sla.overdue) overdue++;
    if (sla.critical) critical++;
    if (ticket.resolved_at && isSameDay(new Date(ticket.resolved_at), today)) resolvedToday++;
    if (sla.firstResponseH != null) responseTimes.push(sla.firstResponseH);
    if (sla.resolutionH != null) {
      resolutionTimes.push(sla.resolutionH);
      handled++;
      if (!sla.breached) slaMet++;
    }
  }
  const avg = (a: number[]) => (a.length ? round1(a.reduce((x, y) => x + y, 0) / a.length) : null);
  // CSAT proxy: share of handled tickets resolved within SLA (no survey table
  // exists, so this is the only real-data-backed satisfaction signal).
  const csat = handled ? Math.round((slaMet / handled) * 100) : null;
  return {
    open, pendingCustomer, awaitingStaff, escalated, resolvedToday,
    avgResponseH: avg(responseTimes), avgResolutionH: avg(resolutionTimes),
    slaCompliance: handled ? Math.round((slaMet / handled) * 100) : 100,
    csat, overdue, critical,
  };
}

// ── Refund / Return command centers ──────────────────────────────────────────
export function groupByStatus<T extends { status: string }>(rows: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) {
    const k = (r.status ?? "unknown").toLowerCase();
    (out[k] ??= []).push(r);
  }
  return out;
}

// Refund risk: high amount, repeated refunds for same order, or "fraud"/"chargeback" reason.
export function refundRisk(r: RefundRow, refundsByOrder: Map<string, number>, highValue: number): { score: number; tier: "low" | "medium" | "high" } {
  let score = 0;
  if (r.amount >= highValue) score += 40;
  else if (r.amount >= highValue / 2) score += 20;
  if ((refundsByOrder.get(r.order_id) ?? 0) > 1) score += 30;
  if (/fraud|chargeback|unauthor/i.test(r.reason ?? "")) score += 40;
  score = Math.min(100, score);
  return { score, tier: score >= 60 ? "high" : score >= 30 ? "medium" : "low" };
}
