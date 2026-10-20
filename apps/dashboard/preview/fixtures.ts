// Invented data for rendering the dashboard without a backend.

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const ticket = (n: number, overrides: Record<string, unknown>) => ({
  id: `t-${n}`,
  ticket_number: n,
  account_id: "acct-1",
  subject: "Subject",
  status: "new",
  priority: "P2",
  ticket_type: "support",
  category: "technical",
  sentiment: "neutral",
  from_name: "Dana Reyes",
  from_email: "dana@acme.com",
  to_email: "support@acme.com",
  received_at: ago(30),
  created_at: ago(30),
  updated_at: ago(20),
  snippet: "Hello, we need some help with the export that keeps failing since this morning.",
  body_plain: "Hello, we need some help with the export that keeps failing since this morning.",
  first_response_at: null,
  sla_due_at: null,
  resolved_at: null,
  priority_score: 50,
  classification_confidence: 0.9,
  group_id: null,
  client_id: null,
  ...overrides,
});

export const tickets = [
  ticket(101, { subject: "Export fails with a timeout", priority: "P1", sentiment: "frustrated", received_at: ago(12), priority_score: 95 }),
  ticket(102, { subject: "Invoice shows the wrong tax", category: "billing", priority: "P2", received_at: ago(55), priority_score: 70 }),
  ticket(103, { subject: "How do I add a teammate?", ticket_type: "support", category: "account", priority: "P3", sentiment: "positive", received_at: ago(180), priority_score: 30 }),
  ticket(104, { subject: "Interested in the Enterprise plan", ticket_type: "prospect", category: "general", priority: "P3", received_at: ago(300), priority_score: 20 }),
  ticket(105, { subject: "Weekly newsletter offer", ticket_type: "spam", category: "not_applicable", priority: null, received_at: ago(600), priority_score: 5 }),
  ticket(106, { subject: "Escalated: data sync outage", status: "escalated", priority: "P1", sentiment: "aggressive", received_at: ago(90), priority_score: 99 }),
  ticket(107, { subject: "Waiting for your logs", status: "awaiting_customer", priority: "P2", received_at: ago(240) }),
  ticket(108, { subject: "Password reset worked", status: "resolved", priority: "P3", sentiment: "positive", resolved_at: ago(120), received_at: ago(500) }),
];

export const messages = [
  {
    id: "m-1",
    direction: "inbound",
    sender_external_id: "dana@acme.com",
    sender_display_name: "Dana Reyes",
    body_plain: "Hello, the export keeps failing with a timeout since this morning. We have a board meeting at 3pm.",
    body_html: null,
    snippet: "Hello, the export keeps failing",
    received_at: ago(12),
    is_origin: true,
  },
  {
    id: "m-2",
    direction: "outbound",
    sender_external_id: "support@acme.com",
    sender_display_name: "Support",
    body_plain: "Hi Dana, thanks for the report. We are looking into it right now and will update you in a few minutes.",
    body_html: null,
    snippet: "Hi Dana, thanks for the report",
    received_at: ago(8),
    is_origin: false,
  },
];

export const clients = [
  { id: "c-1", internal_id: "CLI-001", legal_id: "TAX-100", name: "Acme Corp", telephone: "+1 555 0100", authorized_emails: ["billing@acme.com", "support@acme.com"], contact_persons: [{ name: "Dana Reyes", role: "CTO" }], plan_type: "Enterprise", sla_level: "Critical", ticketCount: 14, csatAvg: 4.8, lastContactAt: ago(60) },
  { id: "c-2", internal_id: "CLI-002", legal_id: null, name: "Globex", telephone: null, authorized_emails: ["ops@globex.com"], contact_persons: [], plan_type: "Pro", sla_level: "High", ticketCount: 5, csatAvg: 4.1, lastContactAt: ago(900) },
  { id: "c-3", internal_id: "CLI-003", legal_id: null, name: "Initech", telephone: "+1 555 0102", authorized_emails: [], contact_persons: [], plan_type: "Starter", sla_level: "Standard", ticketCount: 1, csatAvg: 3.2, lastContactAt: ago(4000) },
];

export const drafts = [
  { id: "d-1", account_id: "acct-1", email: "pat@initrode.com", phone: null, display_name: "Pat Lee", organization: "Initrode", status: "proposed", origin: "kairo_created", confidence: 0.8, evidence_count: 4, external_ref: null, external_source: null, source_tickets: [], merged_into_id: null, first_seen_at: ago(5000), last_seen_at: ago(200), confirmed_at: null, confirmed_by: null, metadata: {}, created_at: ago(5000), updated_at: ago(200) },
];

export const notifications = [
  { id: "n-1", kind: "sla_escalation", ticket_id: "t-106", title: "SLA at risk", body: "Ticket 106 is close to its response limit", created_at: ago(15), read_at: null },
];

export const profile = { id: "u-1", email: "agent@acme.com", name: "Sam Agent", company_name: "Acme" };

export const sidebarCounts = { new: 5, in_progress: 1, escalated: 1, awaiting_customer: 1, resolved: 1 };
