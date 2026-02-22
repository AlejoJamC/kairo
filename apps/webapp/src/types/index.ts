export type Priority = "P1" | "P2" | "P3";
export type Channel = "Email" | "API" | "Outage";

export interface Ticket {
  id: string;
  title: string;
  priority: Priority;
  channel: Channel;
  status: "open" | "pending" | "resolved";
  customer: string;
  plan: string;
  sla: string;
}

export interface Message {
  sender: "customer" | "agent";
  content: string;
  timestamp: string;
}

export interface TelemetryData {
  recentRuns: number;
  failures: number;
  lastError: string;
  lastRunStatus: "Failed" | "Success";
  lastRunTime: string;
}

export interface EscalationReason {
  icon: string;
  label: string;
  severity: "high" | "medium" | "low";
}

export interface KnowledgeArticle {
  type: "guide" | "incident";
  label: string;
  link: string;
}

// --- Gmail Tickets (real data from DB) ---

export interface GmailTicket {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  subject: string;
  from_email: string;
  from_name: string | null;
  to_email: string | null;
  received_at: string;
  snippet: string | null;
  body_plain: string | null;
  body_html: string | null;
  status: string;
  ticket_type: string | null;
  priority: string | null;
  category: string | null;
  sentiment: string | null;
}

// --- Client Directory ---

export type AppView = "inbox" | "clients" | "settings";

export type PlanType = "Enterprise" | "Pro" | "Starter";
export type SlaLevel = "Critical" | "High" | "Standard";

export interface ContactPerson {
  name: string;
  role: string;
}

export interface Client {
  id: string;
  internalId: string;
  legalId: string;
  name: string;
  telephone: string;
  authorizedEmails: string[];
  contactPersons: ContactPerson[];
  plan: PlanType;
  slaLevel: SlaLevel;
}
