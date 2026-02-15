import type {
  Ticket,
  Message,
  TelemetryData,
  EscalationReason,
  KnowledgeArticle,
  Client,
} from "@/types";

export const tickets: Ticket[] = [
  {
    id: "t1",
    title: "Billing Issue",
    priority: "P1",
    channel: "Email",
    status: "open",
    customer: "ACME Corp",
    plan: "Enterprise",
    sla: "4 hours",
  },
  {
    id: "t2",
    title: "Report Request",
    priority: "P2",
    channel: "API",
    status: "open",
    customer: "Globex Inc",
    plan: "Pro",
    sla: "8 hours",
  },
  {
    id: "t3",
    title: "Password Reset",
    priority: "P3",
    channel: "Email",
    status: "open",
    customer: "Initech",
    plan: "Starter",
    sla: "24 hours",
  },
  {
    id: "t4",
    title: "API Error",
    priority: "P2",
    channel: "API",
    status: "open",
    customer: "Umbrella Co",
    plan: "Enterprise",
    sla: "4 hours",
  },
  {
    id: "t5",
    title: "Major Outage",
    priority: "P1",
    channel: "Outage",
    status: "open",
    customer: "Stark Industries",
    plan: "Enterprise",
    sla: "1 hour",
  },
];

export const conversationsByTicket: Record<string, Message[]> = {
  t1: [
    {
      sender: "customer",
      content:
        "Our automation stopped working yesterday. We're getting 'Error 500' repeatedly.",
      timestamp: "2 hours ago",
    },
    {
      sender: "agent",
      content: "I'll look into this for you.",
      timestamp: "1 hour ago",
    },
  ],
  t2: [
    {
      sender: "customer",
      content:
        "We need a custom report for Q4 metrics. Can you help set this up?",
      timestamp: "3 hours ago",
    },
    {
      sender: "agent",
      content:
        "Sure! I can configure that report for you. Let me check the available fields.",
      timestamp: "2 hours ago",
    },
  ],
  t3: [
    {
      sender: "customer",
      content: "I forgot my password and the reset email never arrived.",
      timestamp: "5 hours ago",
    },
    {
      sender: "agent",
      content:
        "I've triggered a new password reset link. Please check your inbox.",
      timestamp: "4 hours ago",
    },
  ],
  t4: [
    {
      sender: "customer",
      content:
        "Our API calls are returning 429 errors since this morning. Rate limits seem wrong.",
      timestamp: "1 hour ago",
    },
    {
      sender: "agent",
      content: "Let me check your current rate limit configuration.",
      timestamp: "30 minutes ago",
    },
  ],
  t5: [
    {
      sender: "customer",
      content:
        "All our services are down. Dashboard shows a complete outage. This is critical!",
      timestamp: "30 minutes ago",
    },
    {
      sender: "agent",
      content:
        "We've identified the issue and our engineering team is working on it now.",
      timestamp: "15 minutes ago",
    },
  ],
};

export const telemetryByTicket: Record<string, TelemetryData> = {
  t1: {
    recentRuns: 14,
    failures: 14,
    lastError: "HTTP 500",
    lastRunStatus: "Failed",
    lastRunTime: "1 hour ago",
  },
  t2: {
    recentRuns: 20,
    failures: 0,
    lastError: "None",
    lastRunStatus: "Success",
    lastRunTime: "10 minutes ago",
  },
  t3: {
    recentRuns: 5,
    failures: 1,
    lastError: "SMTP Timeout",
    lastRunStatus: "Success",
    lastRunTime: "4 hours ago",
  },
  t4: {
    recentRuns: 50,
    failures: 23,
    lastError: "HTTP 429",
    lastRunStatus: "Failed",
    lastRunTime: "5 minutes ago",
  },
  t5: {
    recentRuns: 100,
    failures: 100,
    lastError: "Connection Refused",
    lastRunStatus: "Failed",
    lastRunTime: "2 minutes ago",
  },
};

export const escalationReasons: EscalationReason[] = [
  { icon: "⚠️", label: "Repeated Error 500", severity: "high" },
  { icon: "📚", label: "Similar past L2 case", severity: "medium" },
  { icon: "🏢", label: "Enterprise SLA Impact", severity: "high" },
];

export const knowledgeArticles: KnowledgeArticle[] = [
  { type: "guide", label: "Handling Error 500", link: "#" },
  { type: "incident", label: "Previous Case", link: "#" },
];

export const clients: Client[] = [
  {
    id: "c1",
    internalId: "CLI-001",
    legalId: "US-EIN-12-3456789",
    name: "ACME Corp",
    telephone: "+1 (555) 100-2000",
    authorizedEmails: ["admin@acme.com", "support@acme.com"],
    contactPersons: [
      { name: "John Smith", role: "CTO" },
      { name: "Jane Doe", role: "VP Engineering" },
    ],
    plan: "Enterprise",
    slaLevel: "Critical",
  },
  {
    id: "c2",
    internalId: "CLI-002",
    legalId: "US-EIN-98-7654321",
    name: "Globex Inc",
    telephone: "+1 (555) 200-3000",
    authorizedEmails: ["ops@globex.com"],
    contactPersons: [{ name: "Hank Scorpio", role: "CEO" }],
    plan: "Pro",
    slaLevel: "High",
  },
  {
    id: "c3",
    internalId: "CLI-003",
    legalId: "US-EIN-55-1234567",
    name: "Initech",
    telephone: "+1 (555) 300-4000",
    authorizedEmails: ["bill@initech.com", "peter@initech.com"],
    contactPersons: [
      { name: "Bill Lumbergh", role: "VP" },
      { name: "Peter Gibbons", role: "Engineer" },
    ],
    plan: "Starter",
    slaLevel: "Standard",
  },
  {
    id: "c4",
    internalId: "CLI-004",
    legalId: "US-EIN-77-9876543",
    name: "Umbrella Co",
    telephone: "+1 (555) 400-5000",
    authorizedEmails: ["security@umbrella.com", "admin@umbrella.com", "ops@umbrella.com"],
    contactPersons: [
      { name: "Albert Wesker", role: "Director of Operations" },
    ],
    plan: "Enterprise",
    slaLevel: "Critical",
  },
  {
    id: "c5",
    internalId: "CLI-005",
    legalId: "US-EIN-33-1112223",
    name: "Stark Industries",
    telephone: "+1 (555) 500-6000",
    authorizedEmails: ["tony@stark.com", "pepper@stark.com"],
    contactPersons: [
      { name: "Tony Stark", role: "CEO" },
      { name: "Pepper Potts", role: "COO" },
    ],
    plan: "Enterprise",
    slaLevel: "Critical",
  },
];
