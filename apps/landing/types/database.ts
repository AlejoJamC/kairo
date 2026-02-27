// =============================================================================
// database.ts — Kairo domain types
// Clean interfaces and type aliases for use in components and API routes.
// Source of truth for the DB schema: types/supabase.ts + migration 003.
// =============================================================================

import type { Database, Json } from "./supabase";

// -----------------------------------------------------------------------------
// Raw row/insert/update aliases — mirror the Supabase generated pattern
// -----------------------------------------------------------------------------

export type ChannelIntegrationRow    = Database["public"]["Tables"]["channel_integrations"]["Row"];
export type ChannelIntegrationInsert = Database["public"]["Tables"]["channel_integrations"]["Insert"];
export type ChannelIntegrationUpdate = Database["public"]["Tables"]["channel_integrations"]["Update"];

export type ConversationRow    = Database["public"]["Tables"]["conversations"]["Row"];
export type ConversationInsert = Database["public"]["Tables"]["conversations"]["Insert"];
export type ConversationUpdate = Database["public"]["Tables"]["conversations"]["Update"];

export type MessageRow    = Database["public"]["Tables"]["messages"]["Row"];
export type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];
export type MessageUpdate = Database["public"]["Tables"]["messages"]["Update"];

export type TicketRow    = Database["public"]["Tables"]["tickets"]["Row"];
export type TicketInsert = Database["public"]["Tables"]["tickets"]["Insert"];
export type TicketUpdate = Database["public"]["Tables"]["tickets"]["Update"];

export type TicketMessageRow    = Database["public"]["Tables"]["ticket_messages"]["Row"];
export type TicketMessageInsert = Database["public"]["Tables"]["ticket_messages"]["Insert"];

export type TicketEventRow    = Database["public"]["Tables"]["ticket_events"]["Row"];
export type TicketEventInsert = Database["public"]["Tables"]["ticket_events"]["Insert"];

export type TicketFollowerRow    = Database["public"]["Tables"]["ticket_followers"]["Row"];
export type TicketFollowerInsert = Database["public"]["Tables"]["ticket_followers"]["Insert"];

export type TicketTagRow    = Database["public"]["Tables"]["ticket_tags"]["Row"];
export type TicketTagInsert = Database["public"]["Tables"]["ticket_tags"]["Insert"];

export type TicketProposalRow    = Database["public"]["Tables"]["ticket_proposals"]["Row"];
export type TicketProposalInsert = Database["public"]["Tables"]["ticket_proposals"]["Insert"];
export type TicketProposalUpdate = Database["public"]["Tables"]["ticket_proposals"]["Update"];

export type CategorizationFeedbackRow    = Database["public"]["Tables"]["categorization_feedback"]["Row"];
export type CategorizationFeedbackInsert = Database["public"]["Tables"]["categorization_feedback"]["Insert"];

export type CategoryConfidenceThresholdRow    = Database["public"]["Tables"]["category_confidence_thresholds"]["Row"];
export type CategoryConfidenceThresholdUpdate = Database["public"]["Tables"]["category_confidence_thresholds"]["Update"];

// -----------------------------------------------------------------------------
// Union types
// -----------------------------------------------------------------------------

export type ChannelProvider =
  | "gmail"
  | "instagram"
  | "whatsapp"
  | "slack";

export type TicketEventType =
  | "reply"
  | "internal_note"
  | "status_change"
  | "assignment"
  | "merge"
  | "ai_proposal"
  | "ai_confirmed"
  | "ai_rejected"
  | "sla_breach";

export type ProposalStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "auto_approved";

export type FeedbackOutcome =
  | "confirmed"
  | "rejected"
  | "auto";

export type MessageDirection = "inbound" | "outbound";

export type ConversationStatus = "active" | "archived";

export type TicketStatus = "open" | "resolved" | "archived";

// -----------------------------------------------------------------------------
// Clean domain interfaces used in components and API routes
// Deprecated Gmail columns are excluded; they still exist in the DB but
// should be accessed only via the raw Row type or the messages table.
// -----------------------------------------------------------------------------

export interface ChannelIntegration {
  id: string;
  user_id: string;
  provider: ChannelProvider;
  external_account_id: string;
  display_name: string | null;
  credentials_encrypted: Json | null;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelIntegrationCreate {
  user_id: string;
  provider: ChannelProvider;
  external_account_id: string;
  display_name?: string | null;
  credentials_encrypted?: Json | null;
  is_active?: boolean;
}

export interface ChannelIntegrationPatch {
  display_name?: string | null;
  credentials_encrypted?: Json | null;
  is_active?: boolean;
  last_synced_at?: string | null;
}

export interface Conversation {
  id: string;
  user_id: string;
  channel_integration_id: string;
  customer_external_id: string;
  customer_display_name: string | null;
  customer_avatar_url: string | null;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
}

export interface ConversationCreate {
  user_id: string;
  channel_integration_id: string;
  customer_external_id: string;
  customer_display_name?: string | null;
  customer_avatar_url?: string | null;
  status?: ConversationStatus;
}

export interface ConversationPatch {
  customer_display_name?: string | null;
  customer_avatar_url?: string | null;
  status?: ConversationStatus;
}

export interface Message {
  id: string;
  conversation_id: string;
  channel_integration_id: string;
  external_id: string;
  thread_external_id: string | null;
  direction: MessageDirection;
  sender_external_id: string | null;
  sender_display_name: string | null;
  body_plain: string | null;
  body_html: string | null;
  snippet: string | null;
  raw_payload: Json;
  received_at: string;
  created_at: string;
}

export interface MessageCreate {
  conversation_id: string;
  channel_integration_id: string;
  external_id: string;
  thread_external_id?: string | null;
  direction: MessageDirection;
  sender_external_id?: string | null;
  sender_display_name?: string | null;
  body_plain?: string | null;
  body_html?: string | null;
  snippet?: string | null;
  raw_payload: Json;
  received_at: string;
}

/**
 * Ticket as used by the application.
 * Deprecated Gmail columns (gmail_message_id, from_email, etc.) are excluded.
 * For historical Gmail data, use the raw TicketRow type or query the messages table.
 */
export interface Ticket {
  id: string;
  user_id: string;
  ticket_number: number;
  subject: string;
  channel: string;
  conversation_id: string | null;
  parent_ticket_id: string | null;
  merged_into_ticket_id: string | null;
  ticket_type: string | null;
  priority: string | null;
  category: string | null;
  sentiment: string | null;
  status: TicketStatus;
  assigned_to: string | null;
  first_response_at: string | null;
  sla_due_at: string | null;
  sla_breached: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketCreate {
  user_id: string;
  subject: string;
  channel?: string;
  conversation_id?: string | null;
  parent_ticket_id?: string | null;
  ticket_type?: string | null;
  priority?: string | null;
  category?: string | null;
  sentiment?: string | null;
  status?: TicketStatus;
  assigned_to?: string | null;
  sla_due_at?: string | null;
}

export interface TicketPatch {
  subject?: string;
  channel?: string;
  conversation_id?: string | null;
  parent_ticket_id?: string | null;
  merged_into_ticket_id?: string | null;
  ticket_type?: string | null;
  priority?: string | null;
  category?: string | null;
  sentiment?: string | null;
  status?: TicketStatus;
  assigned_to?: string | null;
  first_response_at?: string | null;
  sla_due_at?: string | null;
  sla_breached?: boolean;
  resolved_at?: string | null;
}

export interface TicketMessage {
  ticket_id: string;
  message_id: string;
  is_origin: boolean;
  created_at: string;
}

export interface TicketMessageCreate {
  ticket_id: string;
  message_id: string;
  is_origin?: boolean;
}

export interface TicketEvent {
  id: string;
  ticket_id: string;
  author_id: string | null;
  event_type: TicketEventType;
  body: string | null;
  is_internal: boolean;
  metadata: Json | null;
  created_at: string;
}

export interface TicketEventCreate {
  ticket_id: string;
  author_id?: string | null;
  event_type: TicketEventType;
  body?: string | null;
  is_internal?: boolean;
  metadata?: Json | null;
}

export interface TicketFollower {
  ticket_id: string;
  user_id: string;
  created_at: string;
}

export interface TicketFollowerCreate {
  ticket_id: string;
  user_id: string;
}

export interface TicketTag {
  ticket_id: string;
  tag: string;
  created_at: string;
}

export interface TicketTagCreate {
  ticket_id: string;
  tag: string;
}

export interface TicketProposal {
  id: string;
  conversation_id: string;
  message_ids: string[];
  proposed_category: string | null;
  proposed_priority: string | null;
  proposed_type: string | null;
  proposed_sentiment: string | null;
  confidence_score: number;
  model_version: string;
  raw_llm_output: Json;
  status: ProposalStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  ticket_id: string | null;
  created_at: string;
}

export interface TicketProposalCreate {
  conversation_id: string;
  message_ids: string[];
  proposed_category?: string | null;
  proposed_priority?: string | null;
  proposed_type?: string | null;
  proposed_sentiment?: string | null;
  confidence_score: number;
  model_version: string;
  raw_llm_output: Json;
  status?: ProposalStatus;
}

export interface TicketProposalReview {
  status: ProposalStatus;
  reviewed_by: string;
  reviewed_at: string;
  rejection_reason?: string | null;
  ticket_id?: string | null;
}

export interface CategorizationFeedback {
  id: string;
  proposal_id: string;
  ticket_id: string | null;
  predicted_category: string | null;
  predicted_priority: string | null;
  predicted_sentiment: string | null;
  confidence_score: number;
  model_version: string;
  outcome: FeedbackOutcome;
  final_category: string | null;
  final_priority: string | null;
  final_sentiment: string | null;
  is_correction: boolean;
  created_at: string;
}

export interface CategorizationFeedbackCreate {
  proposal_id: string;
  ticket_id?: string | null;
  predicted_category?: string | null;
  predicted_priority?: string | null;
  predicted_sentiment?: string | null;
  confidence_score: number;
  model_version: string;
  outcome: FeedbackOutcome;
  final_category?: string | null;
  final_priority?: string | null;
  final_sentiment?: string | null;
  is_correction?: boolean;
}

export interface CategoryConfidenceThreshold {
  id: string;
  category: string;
  min_confidence: number;
  min_sample_size: number;
  current_accuracy: number | null;
  current_sample_count: number;
  auto_approval_enabled: boolean;
  last_evaluated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryConfidenceThresholdPatch {
  min_confidence?: number;
  min_sample_size?: number;
}
