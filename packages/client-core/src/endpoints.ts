/**
 * Kairo HTTP endpoints. Views and hooks call these functions instead of
 * spelling out paths, methods and bodies, so every client shares one
 * description of the API surface. Each function returns the raw Response,
 * exactly like apiCall.
 */
import { apiCall, getLandingUrl } from "./api-client";
import { getPlatform } from "./config";

const json = (value: unknown) => JSON.stringify(value);
const post = (body?: unknown): RequestInit =>
  body === undefined ? { method: "POST" } : { method: "POST", body: json(body) };
const patch = (body?: unknown): RequestInit =>
  body === undefined ? { method: "PATCH" } : { method: "PATCH", body: json(body) };

// ── Tickets ────────────────────────────────────────────────────────────────
export const replyToTicket = (ticketId: string, body: string, intent: "reply" | "resolve") =>
  apiCall(`/api/v1/tickets/${ticketId}/reply`, post({ body, intent }));
export const addTicketNote = (ticketId: string, body: string) =>
  apiCall(`/api/v1/tickets/${ticketId}/notes`, post({ body }));
export const setTicketStatus = (ticketId: string, status: string) =>
  apiCall(`/api/v1/tickets/${ticketId}/status`, patch({ status }));
export const escalateTicket = (ticketId: string, reason?: string) =>
  apiCall(`/api/v1/tickets/${ticketId}/escalate`, post({ reason }));
export const assignTicket = (ticketId: string) =>
  apiCall(`/api/v1/tickets/${ticketId}/assign`, { method: "PATCH" });
export const correctClassification = (ticketId: string, body: unknown) =>
  apiCall(`/api/v1/tickets/${ticketId}/correct-classification`, post(body));
export const approveClassification = (ticketId: string, body: unknown) =>
  apiCall(`/api/v1/tickets/${ticketId}/classify-approve`, post(body));
export const classifyBatch = (ticketIds: string[]) =>
  apiCall("/api/v1/tickets/classify-batch", post({ ticket_ids: ticketIds, force_reclassify: false }));
export const getTicketMessages = (ticketId: string) =>
  apiCall(`/api/v1/tickets/${ticketId}/messages`);
export const getSimilarTickets = (ticketId: string) =>
  apiCall(`/api/v1/tickets/${ticketId}/similar`);
export const getRelatedHistory = (ticketId: string) =>
  apiCall(`/api/v1/tickets/${ticketId}/related-history`);
export const getKnowledgeContext = (ticketId: string) =>
  apiCall(`/api/v1/tickets/${ticketId}/knowledge-context`);
export const requestEscalationReasons = (ticketId: string) =>
  apiCall(`/api/v1/tickets/${ticketId}/escalation-reasons`, { method: "POST" });
export const getClientProfile = (ticketId: string) =>
  apiCall(`/api/v1/tickets/${ticketId}/client-profile`);
export const askAssistant = (ticketId: string, messages: unknown[], signal?: AbortSignal) =>
  apiCall(`/api/v1/tickets/${ticketId}/assistant`, { ...post({ messages }), signal });

// ── Ticket groups ──────────────────────────────────────────────────────────
export const createTicketGroup = (name: string) =>
  apiCall("/api/v1/ticket-groups", post({ name }));
export const assignTicketsToGroup = (groupId: string, ticketIds: string[]) =>
  apiCall(`/api/v1/ticket-groups/${groupId}/tickets`, post({ ticket_ids: ticketIds }));

// ── Decisions and knowledge workflow ───────────────────────────────────────
export const getTicketDecisions = (ticketId: string) =>
  apiCall(`/api/v1/workflow/tickets/${ticketId}`);
export const markTicketViewed = (ticketId: string) =>
  apiCall(`/api/v1/workflow/tickets/${ticketId}/viewed`, { method: "POST" });
export const reviewDecision = (ticketId: string, decisionId: string, accept: boolean) =>
  apiCall(`/api/v1/workflow/tickets/${ticketId}/decisions/${decisionId}/review`, post({ accept }));
export const getKnowledgeDrafts = () => apiCall("/api/v1/workflow/knowledge");
export const reviewKnowledge = (articleId: string, body: unknown) =>
  apiCall(`/api/v1/workflow/knowledge/${articleId}/review`, post(body));
export const getKbEvidence = (articleId: string) =>
  apiCall(`/api/v1/kb-articles/${articleId}/evidence`);

// ── Notes and notifications ────────────────────────────────────────────────
export const getNoteCounts = () => apiCall("/api/v1/notes/counts");
export const markMentionsRead = (ticketEventIds: string[]) =>
  apiCall("/api/v1/notes/mentions/read", patch({ ticket_event_ids: ticketEventIds }));
export const getNotifications = () => apiCall("/api/v1/notifications");
export const markNotificationRead = (id: string) =>
  apiCall(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
export const markAllNotificationsRead = () =>
  apiCall("/api/v1/notifications/read-all", { method: "PATCH" });
export const getSidebarCounts = () => apiCall("/api/v1/sidebar/counts");

// ── Templates, tenant settings, channels ───────────────────────────────────
export const listTemplates = (language: string) =>
  apiCall("/api/v1/templates", { headers: { "Accept-Language": language } });
export const getOperationalSlaConfig = () =>
  apiCall("/api/v1/tenants/operational-sla-config");
export const saveOperationalSlaConfig = (config: unknown) =>
  apiCall("/api/v1/tenants/operational-sla-config", { method: "PUT", body: json({ config }) });
export const listChannels = (accountId: string) =>
  apiCall(`/api/v1/accounts/${accountId}/channels`, { headers: { "x-account-id": accountId } });
export const deleteChannel = (accountId: string, channelId: string) =>
  apiCall(`/api/v1/accounts/${accountId}/channels/${channelId}`, {
    method: "DELETE",
    headers: { "x-account-id": accountId },
  });

// ── Clients and Gmail (BFF) ────────────────────────────────────────────────
export const listClients = () => apiCall("/bff/clients");
export const saveClient = (clientId: string | null, payload: unknown) =>
  apiCall(clientId ? `/bff/clients/${clientId}` : "/bff/clients", {
    method: clientId ? "PATCH" : "POST",
    body: json(payload),
  });
export const deleteClient = (clientId: string) =>
  apiCall(`/bff/clients/${clientId}`, { method: "DELETE" });
export const syncGmail = () => apiCall("/bff/gmail/sync", { method: "POST" });

/** Sends the user through the Gmail consent flow (system browser on desktop). */
export function startGmailConnect(): void {
  getPlatform().navigation.navigate(getLandingUrl("/bff/auth/google"));
}
