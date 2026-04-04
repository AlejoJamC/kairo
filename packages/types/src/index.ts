// =====================================================
// Kairo — Shared TypeScript Types
// packages/types/src/index.ts
//
// Reflects Supabase schema after migrations 001–007.
// Keep in sync with supabase/migrations/.
// =====================================================

// =====================================================
// PRIMITIVES
// =====================================================

export type TicketType = "support" | "lead" | "spam";
export type Priority = "P1" | "P2" | "P3";
export type TicketCategory = "technical" | "billing" | "sales" | "other";
export type Sentiment = "urgente" | "neutral" | "casual";
export type TicketStatus = "open" | "resolved" | "archived";

export type PlanType = "Enterprise" | "Pro" | "Starter";
export type SlaLevel = "Critical" | "High" | "Standard";

export type ClassificationStatus = "pending" | "classified" | "skipped" | "failed";

// =====================================================
// PROFILES (migration 001)
// =====================================================

export interface Profile {
    id: string;                      // UUID — references auth.users
    email: string;
    name: string | null;
    company_name: string | null;
    gmail_connected: boolean;
    created_at: string;              // ISO timestamp
    updated_at: string;
}

// =====================================================
// GMAIL ACCOUNTS (migration 001)
// =====================================================

export interface GmailAccount {
    id: string;
    user_id: string;
    email: string;
    access_token: string | null;
    refresh_token: string | null;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
}

// =====================================================
// CLIENTS (migration 004)
// =====================================================

export interface ContactPerson {
    name: string;
    role: string;
}

export interface Client {
    id: string;
    user_id: string;
    internal_id: string;
    legal_id: string | null;
    name: string;
    telephone: string | null;
    authorized_emails: string[];
    contact_persons: ContactPerson[];
    plan_type: PlanType | null;
    sla_level: SlaLevel | null;
    created_at: string;
    updated_at: string;
}

// =====================================================
// TICKETS (migrations 002, 004, 005, 006)
// =====================================================

export interface Ticket {
    id: string;
    user_id: string;

    // Gmail identifiers
    gmail_message_id: string;
    gmail_thread_id: string | null;

    // Email metadata
    subject: string;
    from_email: string;
    from_name: string | null;
    to_email: string | null;
    cc_emails: string[] | null;
    received_at: string;

    // Email content
    body_plain: string | null;
    body_html: string | null;
    snippet: string | null;

    // AI Classification (migration 002 + 005)
    ticket_type: TicketType | null;
    priority: Priority | null;
    category: TicketCategory | null;
    sentiment: Sentiment | null;

    // AI metadata (migration 005)
    ai_reasoning: string | null;
    classified_at: string | null;
    classification_confidence: number | null;   // DECIMAL(3,2) → 0.00–1.00

    // Pipeline tracking (migration 006)
    classification_tier: number | null;         // 1 = Tier 1, 2 = Tier 2, 3 = Tier 3

    // Client link (migration 004)
    client_id: string | null;

    // Status management
    status: TicketStatus;
    assigned_to: string | null;
    resolved_at: string | null;

    created_at: string;
    updated_at: string;
}

// =====================================================
// MESSAGES (migration 003 + 007)
// =====================================================

export interface Message {
    id: string;
    user_id: string;
    conversation_id: string | null;   // nullable after migration 007
    raw_payload: unknown | null;      // nullable after migration 007

    // Pipeline classification tracking (migration 007)
    classification_status: ClassificationStatus | null;
    skip_reason: string | null;
    processing_tier: number | null;   // INT — 0, 1, 2, 3
    classified_at: string | null;

    created_at: string;
    updated_at: string;
}

// =====================================================
// PIPELINE (apps/api — not persisted, runtime only)
// =====================================================

export interface PipelineJobStatus {
    job_id: string;
    status: "queued" | "processing" | "completed" | "failed";
    result?: unknown;
}

export interface ClassificationResult {
    tipo: TicketType;
    prioridad: Priority;
    categoria: TicketCategory;
    sentimiento: Sentiment;
    razonamiento: string;
    confianza: number;               // 0.00–1.00
}

// =====================================================
// APP NAVIGATION
// =====================================================

export type AppView = "inbox" | "clients";

// =====================================================
// API UTILITIES
// =====================================================

export interface ApiResponse<T = unknown> {
    data: T;
    status: number;
    message?: string;
}