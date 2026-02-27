// Auto-maintained Supabase Database type.
// Reflects the full schema including deprecated columns still present in the DB.
// For clean domain types used in components, see ./database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      // ------------------------------------------------------------------
      // profiles (001_initial_schema)
      // ------------------------------------------------------------------
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          company_name: string | null;
          gmail_connected: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          company_name?: string | null;
          gmail_connected?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          name?: string | null;
          company_name?: string | null;
          gmail_connected?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // gmail_accounts (001_initial_schema)
      // ------------------------------------------------------------------
      gmail_accounts: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          access_token: string | null;
          refresh_token: string | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          access_token?: string | null;
          refresh_token?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          access_token?: string | null;
          refresh_token?: string | null;
          expires_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // tickets (002_create_tickets_table + 003_kairo_core_schema)
      // DEPRECATED columns (data preserved, constraints relaxed in 003):
      //   gmail_message_id, gmail_thread_id, from_email, from_name,
      //   to_email, cc_emails, body_plain, body_html, snippet, received_at
      // ------------------------------------------------------------------
      tickets: {
        Row: {
          id: string;
          user_id: string;
          // — deprecated Gmail columns (nullable since migration 003) —
          /** @deprecated use messages table */
          gmail_message_id: string | null;
          /** @deprecated use messages table */
          gmail_thread_id: string | null;
          /** @deprecated use conversations.customer_external_id */
          from_email: string | null;
          /** @deprecated use messages.sender_display_name */
          from_name: string | null;
          /** @deprecated use channel_integrations.external_account_id */
          to_email: string | null;
          /** @deprecated use messages.raw_payload */
          cc_emails: string[] | null;
          /** @deprecated use messages.body_plain */
          body_plain: string | null;
          /** @deprecated use messages.body_html */
          body_html: string | null;
          /** @deprecated use messages.snippet */
          snippet: string | null;
          /** @deprecated use messages.received_at */
          received_at: string | null;
          // — retained columns —
          subject: string;
          ticket_type: string | null;
          priority: string | null;
          category: string | null;
          sentiment: string | null;
          status: string;
          assigned_to: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
          // — new omnichannel columns (003) —
          ticket_number: number;        // GENERATED ALWAYS AS IDENTITY
          conversation_id: string | null;
          parent_ticket_id: string | null;
          merged_into_ticket_id: string | null;
          channel: string;
          first_response_at: string | null;
          sla_due_at: string | null;
          sla_breached: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          // ticket_number is GENERATED ALWAYS — omit from Insert
          subject: string;
          ticket_type?: string | null;
          priority?: string | null;
          category?: string | null;
          sentiment?: string | null;
          status?: string;
          assigned_to?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
          // deprecated — optional for backwards compat with existing Gmail sync code
          gmail_message_id?: string | null;
          gmail_thread_id?: string | null;
          from_email?: string | null;
          from_name?: string | null;
          to_email?: string | null;
          cc_emails?: string[] | null;
          body_plain?: string | null;
          body_html?: string | null;
          snippet?: string | null;
          received_at?: string | null;
          // new omnichannel columns
          conversation_id?: string | null;
          parent_ticket_id?: string | null;
          merged_into_ticket_id?: string | null;
          channel?: string;
          first_response_at?: string | null;
          sla_due_at?: string | null;
          sla_breached?: boolean;
        };
        Update: {
          // ticket_number is GENERATED ALWAYS — omit from Update
          user_id?: string;
          subject?: string;
          ticket_type?: string | null;
          priority?: string | null;
          category?: string | null;
          sentiment?: string | null;
          status?: string;
          assigned_to?: string | null;
          resolved_at?: string | null;
          updated_at?: string;
          conversation_id?: string | null;
          parent_ticket_id?: string | null;
          merged_into_ticket_id?: string | null;
          channel?: string;
          first_response_at?: string | null;
          sla_due_at?: string | null;
          sla_breached?: boolean;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // channel_integrations (003_kairo_core_schema)
      // ------------------------------------------------------------------
      channel_integrations: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          external_account_id: string;
          display_name: string | null;
          credentials_encrypted: Json | null;
          is_active: boolean;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          external_account_id: string;
          display_name?: string | null;
          credentials_encrypted?: Json | null;
          is_active?: boolean;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          provider?: string;
          external_account_id?: string;
          display_name?: string | null;
          credentials_encrypted?: Json | null;
          is_active?: boolean;
          last_synced_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // conversations (003_kairo_core_schema)
      // ------------------------------------------------------------------
      conversations: {
        Row: {
          id: string;
          user_id: string;
          channel_integration_id: string;
          customer_external_id: string;
          customer_display_name: string | null;
          customer_avatar_url: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          channel_integration_id: string;
          customer_external_id: string;
          customer_display_name?: string | null;
          customer_avatar_url?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          channel_integration_id?: string;
          customer_external_id?: string;
          customer_display_name?: string | null;
          customer_avatar_url?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // messages (003_kairo_core_schema)
      // ------------------------------------------------------------------
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          channel_integration_id: string;
          external_id: string;
          thread_external_id: string | null;
          direction: string;
          sender_external_id: string | null;
          sender_display_name: string | null;
          body_plain: string | null;
          body_html: string | null;
          snippet: string | null;
          raw_payload: Json;
          received_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          channel_integration_id: string;
          external_id: string;
          thread_external_id?: string | null;
          direction: string;
          sender_external_id?: string | null;
          sender_display_name?: string | null;
          body_plain?: string | null;
          body_html?: string | null;
          snippet?: string | null;
          raw_payload: Json;
          received_at: string;
          created_at?: string;
        };
        Update: {
          thread_external_id?: string | null;
          sender_display_name?: string | null;
          body_plain?: string | null;
          body_html?: string | null;
          snippet?: string | null;
          raw_payload?: Json;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // ticket_messages (003_kairo_core_schema)
      // ------------------------------------------------------------------
      ticket_messages: {
        Row: {
          ticket_id: string;
          message_id: string;
          is_origin: boolean;
          created_at: string;
        };
        Insert: {
          ticket_id: string;
          message_id: string;
          is_origin?: boolean;
          created_at?: string;
        };
        Update: {
          is_origin?: boolean;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // ticket_events (003_kairo_core_schema)
      // ------------------------------------------------------------------
      ticket_events: {
        Row: {
          id: string;
          ticket_id: string;
          author_id: string | null;
          event_type: string;
          body: string | null;
          is_internal: boolean;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          author_id?: string | null;
          event_type: string;
          body?: string | null;
          is_internal?: boolean;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          // ticket_events is append-only; Update type included for completeness
          body?: string | null;
          is_internal?: boolean;
          metadata?: Json | null;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // ticket_followers (003_kairo_core_schema)
      // ------------------------------------------------------------------
      ticket_followers: {
        Row: {
          ticket_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          ticket_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: Record<never, never>;
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // ticket_tags (003_kairo_core_schema)
      // ------------------------------------------------------------------
      ticket_tags: {
        Row: {
          ticket_id: string;
          tag: string;
          created_at: string;
        };
        Insert: {
          ticket_id: string;
          tag: string;
          created_at?: string;
        };
        Update: Record<never, never>;
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // ticket_proposals (003_kairo_core_schema)
      // ------------------------------------------------------------------
      ticket_proposals: {
        Row: {
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
          status: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          rejection_reason: string | null;
          ticket_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          message_ids: string[];
          proposed_category?: string | null;
          proposed_priority?: string | null;
          proposed_type?: string | null;
          proposed_sentiment?: string | null;
          confidence_score: number;
          model_version: string;
          raw_llm_output: Json;
          status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          ticket_id?: string | null;
          created_at?: string;
        };
        Update: {
          proposed_category?: string | null;
          proposed_priority?: string | null;
          proposed_type?: string | null;
          proposed_sentiment?: string | null;
          status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          ticket_id?: string | null;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // categorization_feedback (003_kairo_core_schema)
      // Append-only. Never update rows.
      // ------------------------------------------------------------------
      categorization_feedback: {
        Row: {
          id: string;
          proposal_id: string;
          ticket_id: string | null;
          predicted_category: string | null;
          predicted_priority: string | null;
          predicted_sentiment: string | null;
          confidence_score: number;
          model_version: string;
          outcome: string;
          final_category: string | null;
          final_priority: string | null;
          final_sentiment: string | null;
          is_correction: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          ticket_id?: string | null;
          predicted_category?: string | null;
          predicted_priority?: string | null;
          predicted_sentiment?: string | null;
          confidence_score: number;
          model_version: string;
          outcome: string;
          final_category?: string | null;
          final_priority?: string | null;
          final_sentiment?: string | null;
          is_correction?: boolean;
          created_at?: string;
        };
        // categorization_feedback is append-only; Update included for type completeness
        Update: Record<never, never>;
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // category_confidence_thresholds (003_kairo_core_schema)
      // Written by service role / background job only.
      // ------------------------------------------------------------------
      category_confidence_thresholds: {
        Row: {
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
        };
        Insert: {
          id?: string;
          category: string;
          min_confidence?: number;
          min_sample_size?: number;
          current_accuracy?: number | null;
          current_sample_count?: number;
          auto_approval_enabled?: boolean;
          last_evaluated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          min_confidence?: number;
          min_sample_size?: number;
          current_accuracy?: number | null;
          current_sample_count?: number;
          auto_approval_enabled?: boolean;
          last_evaluated_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
