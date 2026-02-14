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
