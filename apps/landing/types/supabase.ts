export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_invitations: {
        Row: {
          account_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          token: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          role: string
          token?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_invitations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_members: {
        Row: {
          account_id: string
          id: string
          invited_at: string | null
          joined_at: string | null
          role: string
          status: string
          user_id: string
        }
        Insert: {
          account_id: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          role: string
          status?: string
          user_id: string
        }
        Update: {
          account_id?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          id: string
          name: string
          plan_id: string
          seat_limit: number | null
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan_id: string
          seat_limit?: number | null
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan_id?: string
          seat_limit?: number | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          changes: Json | null
          created_at: string
          id: string
          target_id: string | null
          target_table: string
        }
        Insert: {
          action: string
          admin_user_id: string
          changes?: Json | null
          created_at?: string
          id?: string
          target_id?: string | null
          target_table: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          changes?: Json | null
          created_at?: string
          id?: string
          target_id?: string | null
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          auth_uid: string
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
          last_login_at: string | null
          role: string
          updated_at: string
        }
        Insert: {
          auth_uid: string
          avatar_url?: string | null
          created_at?: string
          display_name: string
          email: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          auth_uid?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      categorization_feedback: {
        Row: {
          confidence_score: number
          created_at: string
          final_category: string | null
          final_priority: string | null
          final_sentiment: string | null
          id: string
          is_correction: boolean
          model_version: string
          outcome: string
          predicted_category: string | null
          predicted_priority: string | null
          predicted_sentiment: string | null
          proposal_id: string
          ticket_id: string | null
        }
        Insert: {
          confidence_score: number
          created_at?: string
          final_category?: string | null
          final_priority?: string | null
          final_sentiment?: string | null
          id?: string
          is_correction?: boolean
          model_version: string
          outcome: string
          predicted_category?: string | null
          predicted_priority?: string | null
          predicted_sentiment?: string | null
          proposal_id: string
          ticket_id?: string | null
        }
        Update: {
          confidence_score?: number
          created_at?: string
          final_category?: string | null
          final_priority?: string | null
          final_sentiment?: string | null
          id?: string
          is_correction?: boolean
          model_version?: string
          outcome?: string
          predicted_category?: string | null
          predicted_priority?: string | null
          predicted_sentiment?: string | null
          proposal_id?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categorization_feedback_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "ticket_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorization_feedback_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      category_confidence_thresholds: {
        Row: {
          auto_approval_enabled: boolean
          category: string
          created_at: string
          current_accuracy: number | null
          current_sample_count: number
          id: string
          last_evaluated_at: string | null
          min_confidence: number
          min_sample_size: number
          updated_at: string
        }
        Insert: {
          auto_approval_enabled?: boolean
          category: string
          created_at?: string
          current_accuracy?: number | null
          current_sample_count?: number
          id?: string
          last_evaluated_at?: string | null
          min_confidence?: number
          min_sample_size?: number
          updated_at?: string
        }
        Update: {
          auto_approval_enabled?: boolean
          category?: string
          created_at?: string
          current_accuracy?: number | null
          current_sample_count?: number
          id?: string
          last_evaluated_at?: string | null
          min_confidence?: number
          min_sample_size?: number
          updated_at?: string
        }
        Relationships: []
      }
      channel_integrations: {
        Row: {
          account_id: string
          created_at: string
          display_name: string | null
          external_account_id: string
          gmail_history_id: string | null
          id: string
          is_active: boolean
          last_synced_at: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          display_name?: string | null
          external_account_id: string
          gmail_history_id?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          display_name?: string | null
          external_account_id?: string
          gmail_history_id?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_integrations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      classification_feedback: {
        Row: {
          account_id: string
          ai_category: string | null
          ai_confidence: number | null
          ai_model_version: string | null
          ai_priority: string | null
          ai_sentiment: string | null
          ai_ticket_type: string | null
          correct_category: string | null
          correct_priority: string | null
          correct_sentiment: string | null
          correct_ticket_type: string | null
          corrected_by: string
          created_at: string
          id: string
          notes: string | null
          submitted_by_user_id: string | null
          ticket_id: string
        }
        Insert: {
          account_id: string
          ai_category?: string | null
          ai_confidence?: number | null
          ai_model_version?: string | null
          ai_priority?: string | null
          ai_sentiment?: string | null
          ai_ticket_type?: string | null
          correct_category?: string | null
          correct_priority?: string | null
          correct_sentiment?: string | null
          correct_ticket_type?: string | null
          corrected_by: string
          created_at?: string
          id?: string
          notes?: string | null
          submitted_by_user_id?: string | null
          ticket_id: string
        }
        Update: {
          account_id?: string
          ai_category?: string | null
          ai_confidence?: number | null
          ai_model_version?: string | null
          ai_priority?: string | null
          ai_sentiment?: string | null
          ai_ticket_type?: string | null
          correct_category?: string | null
          correct_priority?: string | null
          correct_sentiment?: string | null
          correct_ticket_type?: string | null
          corrected_by?: string
          created_at?: string
          id?: string
          notes?: string | null
          submitted_by_user_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classification_feedback_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_feedback_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_id: string
          authorized_emails: string[] | null
          contact_persons: Json | null
          created_at: string | null
          id: string
          internal_id: string
          legal_id: string | null
          name: string
          plan_type: string | null
          sla_level: string | null
          telephone: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          authorized_emails?: string[] | null
          contact_persons?: Json | null
          created_at?: string | null
          id?: string
          internal_id: string
          legal_id?: string | null
          name: string
          plan_type?: string | null
          sla_level?: string | null
          telephone?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          authorized_emails?: string[] | null
          contact_persons?: Json | null
          created_at?: string | null
          id?: string
          internal_id?: string
          legal_id?: string | null
          name?: string
          plan_type?: string | null
          sla_level?: string | null
          telephone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          account_id: string
          channel_integration_id: string
          created_at: string
          customer_avatar_url: string | null
          customer_display_name: string | null
          customer_external_id: string
          external_thread_id: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          channel_integration_id: string
          created_at?: string
          customer_avatar_url?: string | null
          customer_display_name?: string | null
          customer_external_id: string
          external_thread_id?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          channel_integration_id?: string
          created_at?: string
          customer_avatar_url?: string | null
          customer_display_name?: string | null
          customer_external_id?: string
          external_thread_id?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_channel_integration_id_fkey"
            columns: ["channel_integration_id"]
            isOneToOne: false
            referencedRelation: "channel_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      csat_events: {
        Row: {
          comment: string | null
          id: string
          score: number | null
          submitted_at: string | null
          ticket_id: string
        }
        Insert: {
          comment?: string | null
          id?: string
          score?: number | null
          submitted_at?: string | null
          ticket_id: string
        }
        Update: {
          comment?: string | null
          id?: string
          score?: number | null
          submitted_at?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "csat_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_contact: {
        Row: {
          account_id: string
          confidence: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          display_name: string | null
          email: string | null
          evidence_count: number
          external_ref: string | null
          external_source: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          merged_into_id: string | null
          metadata: Json
          organization: string | null
          origin: Database["public"]["Enums"]["draft_contact_origin"]
          phone: string | null
          source_tickets: string[]
          status: Database["public"]["Enums"]["draft_contact_status"]
          updated_at: string
        }
        Insert: {
          account_id: string
          confidence?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          evidence_count?: number
          external_ref?: string | null
          external_source?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          merged_into_id?: string | null
          metadata?: Json
          organization?: string | null
          origin?: Database["public"]["Enums"]["draft_contact_origin"]
          phone?: string | null
          source_tickets?: string[]
          status?: Database["public"]["Enums"]["draft_contact_status"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          confidence?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          evidence_count?: number
          external_ref?: string | null
          external_source?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          merged_into_id?: string | null
          metadata?: Json
          organization?: string | null
          origin?: Database["public"]["Enums"]["draft_contact_origin"]
          phone?: string | null
          source_tickets?: string[]
          status?: Database["public"]["Enums"]["draft_contact_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_contact_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_contact_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "draft_contact"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_contacts: {
        Row: {
          account_id: string
          channel: string
          created_at: string | null
          escalation_level: number
          id: string
          is_active: boolean | null
          name: string
          phone_number: string
        }
        Insert: {
          account_id: string
          channel?: string
          created_at?: string | null
          escalation_level?: number
          id?: string
          is_active?: boolean | null
          name: string
          phone_number: string
        }
        Update: {
          account_id?: string
          channel?: string
          created_at?: string | null
          escalation_level?: number
          id?: string
          is_active?: boolean | null
          name?: string
          phone_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      escalations: {
        Row: {
          context: Json | null
          created_at: string | null
          escalated_by: string
          escalated_to_level: number
          id: string
          notification_channel: string | null
          notification_sent: boolean | null
          notification_sent_at: string | null
          reason: string | null
          ticket_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          escalated_by: string
          escalated_to_level: number
          id?: string
          notification_channel?: string | null
          notification_sent?: boolean | null
          notification_sent_at?: string | null
          reason?: string | null
          ticket_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          escalated_by?: string
          escalated_to_level?: number
          id?: string
          notification_channel?: string | null
          notification_sent?: boolean | null
          notification_sent_at?: string | null
          reason?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          account_id: string
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          is_published: boolean | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_published?: boolean | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_published?: boolean | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_articles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_calls: {
        Row: {
          account_id: string | null
          completion_tokens: number | null
          confidence_score: number | null
          created_at: string
          error_code: string | null
          error_detail: string | null
          feature: string
          id: string
          latency_ms: number | null
          model: string
          outcome: string | null
          outcome_recorded_at: string | null
          prompt_text: string
          prompt_tokens: number | null
          prompt_version: string | null
          provider: string
          response_text: string | null
          ticket_id: string | null
          triggered_by_user_id: string | null
        }
        Insert: {
          account_id?: string | null
          completion_tokens?: number | null
          confidence_score?: number | null
          created_at?: string
          error_code?: string | null
          error_detail?: string | null
          feature: string
          id?: string
          latency_ms?: number | null
          model: string
          outcome?: string | null
          outcome_recorded_at?: string | null
          prompt_text: string
          prompt_tokens?: number | null
          prompt_version?: string | null
          provider: string
          response_text?: string | null
          ticket_id?: string | null
          triggered_by_user_id?: string | null
        }
        Update: {
          account_id?: string | null
          completion_tokens?: number | null
          confidence_score?: number | null
          created_at?: string
          error_code?: string | null
          error_detail?: string | null
          feature?: string
          id?: string
          latency_ms?: number | null
          model?: string
          outcome?: string | null
          outcome_recorded_at?: string | null
          prompt_text?: string
          prompt_tokens?: number | null
          prompt_version?: string | null
          provider?: string
          response_text?: string | null
          ticket_id?: string | null
          triggered_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_calls_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_calls_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          account_id: string
          body_html: string | null
          body_plain: string | null
          channel_integration_id: string
          classification_status: string | null
          classified_at: string | null
          conversation_id: string | null
          created_at: string
          direction: string
          external_id: string
          id: string
          processing_batch: string | null
          processing_tier: number | null
          raw_payload: Json | null
          received_at: string
          sender_display_name: string | null
          sender_external_id: string | null
          skip_reason: string | null
          snippet: string | null
          thread_external_id: string | null
        }
        Insert: {
          account_id: string
          body_html?: string | null
          body_plain?: string | null
          channel_integration_id: string
          classification_status?: string | null
          classified_at?: string | null
          conversation_id?: string | null
          created_at?: string
          direction: string
          external_id: string
          id?: string
          processing_batch?: string | null
          processing_tier?: number | null
          raw_payload?: Json | null
          received_at: string
          sender_display_name?: string | null
          sender_external_id?: string | null
          skip_reason?: string | null
          snippet?: string | null
          thread_external_id?: string | null
        }
        Update: {
          account_id?: string
          body_html?: string | null
          body_plain?: string | null
          channel_integration_id?: string
          classification_status?: string | null
          classified_at?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          external_id?: string
          id?: string
          processing_batch?: string | null
          processing_tier?: number | null
          raw_payload?: Json | null
          received_at?: string
          sender_display_name?: string | null
          sender_external_id?: string | null
          skip_reason?: string | null
          snippet?: string | null
          thread_external_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_channel_integration_id_fkey"
            columns: ["channel_integration_id"]
            isOneToOne: false
            referencedRelation: "channel_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_credentials: {
        Row: {
          access_token_enc: string | null
          account_id: string
          created_at: string | null
          expires_at: string | null
          external_account_id: string
          granted_by_user_id: string | null
          id: string
          metadata: Json | null
          provider: string
          refresh_token_enc: string | null
          scope: string | null
          updated_at: string | null
        }
        Insert: {
          access_token_enc?: string | null
          account_id: string
          created_at?: string | null
          expires_at?: string | null
          external_account_id: string
          granted_by_user_id?: string | null
          id?: string
          metadata?: Json | null
          provider: string
          refresh_token_enc?: string | null
          scope?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token_enc?: string | null
          account_id?: string
          created_at?: string | null
          expires_at?: string | null
          external_account_id?: string
          granted_by_user_id?: string | null
          id?: string
          metadata?: Json | null
          provider?: string
          refresh_token_enc?: string | null
          scope?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oauth_credentials_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          id: string
          is_public: boolean
          name: string
          seat_limit_default: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_public?: boolean
          name: string
          seat_limit_default: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          seat_limit_default?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string | null
          email: string
          id: string
          name: string | null
          updated_at: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          email: string
          id: string
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      response_templates: {
        Row: {
          account_id: string
          category: string | null
          content: string
          created_at: string
          id: string
          is_active: boolean
          locale: string
          title: string
          updated_at: string
        }
        Insert: {
          account_id: string
          category?: string | null
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          locale?: string
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          locale?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "response_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      support_channels: {
        Row: {
          account_id: string
          channel_type: string
          connected_at: string | null
          connected_by_user_id: string | null
          created_at: string
          credential_id: string | null
          display_name: string | null
          email_address: string
          id: string
          is_active: boolean
          is_primary: boolean
        }
        Insert: {
          account_id: string
          channel_type: string
          connected_at?: string | null
          connected_by_user_id?: string | null
          created_at?: string
          credential_id?: string | null
          display_name?: string | null
          email_address: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
        }
        Update: {
          account_id?: string
          channel_type?: string
          connected_at?: string | null
          connected_by_user_id?: string | null
          created_at?: string
          credential_id?: string | null
          display_name?: string | null
          email_address?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "support_channels_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_channels_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "oauth_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      support_schedules: {
        Row: {
          account_id: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
          timezone: string
        }
        Insert: {
          account_id: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
          timezone?: string
        }
        Update: {
          account_id?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_schedules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_priority_config: {
        Row: {
          account_id: string
          id: string
          updated_at: string
          weight_age: number
          weight_emotion: number
          weight_plan: number
          weight_type: number
        }
        Insert: {
          account_id: string
          id?: string
          updated_at?: string
          weight_age?: number
          weight_emotion?: number
          weight_plan?: number
          weight_type?: number
        }
        Update: {
          account_id?: string
          id?: string
          updated_at?: string
          weight_age?: number
          weight_emotion?: number
          weight_plan?: number
          weight_type?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_priority_config_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_sla_rules: {
        Row: {
          account_id: string
          id: string
          plan_tier: string
          resolution_hours: number | null
          response_hours: number
          ticket_type: string
        }
        Insert: {
          account_id: string
          id?: string
          plan_tier: string
          resolution_hours?: number | null
          response_hours: number
          ticket_type: string
        }
        Update: {
          account_id?: string
          id?: string
          plan_tier?: string
          resolution_hours?: number | null
          response_hours?: number
          ticket_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_sla_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_events: {
        Row: {
          author_id: string | null
          body: string | null
          created_at: string
          event_type: string
          id: string
          is_internal: boolean
          metadata: Json | null
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          is_internal?: boolean
          metadata?: Json | null
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          is_internal?: boolean
          metadata?: Json | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_followers: {
        Row: {
          created_at: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_followers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_groups: {
        Row: {
          account_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_groups_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          created_at: string
          is_origin: boolean
          message_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          is_origin?: boolean
          message_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          is_origin?: boolean
          message_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_proposals: {
        Row: {
          confidence_score: number
          conversation_id: string | null
          created_at: string
          emotion_confidence: number | null
          escalation_reasons: Json
          id: string
          message_ids: string[]
          model_version: string
          proposed_category: string | null
          proposed_emotion: string | null
          proposed_priority: string | null
          proposed_reply: string | null
          proposed_sentiment: string | null
          proposed_type: string | null
          raw_llm_output: Json
          referenced_kb_articles: string[]
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          ticket_id: string | null
        }
        Insert: {
          confidence_score: number
          conversation_id?: string | null
          created_at?: string
          emotion_confidence?: number | null
          escalation_reasons?: Json
          id?: string
          message_ids: string[]
          model_version: string
          proposed_category?: string | null
          proposed_emotion?: string | null
          proposed_priority?: string | null
          proposed_reply?: string | null
          proposed_sentiment?: string | null
          proposed_type?: string | null
          raw_llm_output: Json
          referenced_kb_articles?: string[]
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          ticket_id?: string | null
        }
        Update: {
          confidence_score?: number
          conversation_id?: string | null
          created_at?: string
          emotion_confidence?: number | null
          escalation_reasons?: Json
          id?: string
          message_ids?: string[]
          model_version?: string
          proposed_category?: string | null
          proposed_emotion?: string | null
          proposed_priority?: string | null
          proposed_reply?: string | null
          proposed_sentiment?: string | null
          proposed_type?: string | null
          raw_llm_output?: Json
          referenced_kb_articles?: string[]
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_proposals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_proposals_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_tags: {
        Row: {
          created_at: string
          tag: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          tag: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          tag?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tags_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          account_id: string
          ai_reasoning: string | null
          archived_at: string | null
          assigned_to: string | null
          auto_replied_at: string | null
          auto_replied_out_of_hours: boolean
          body_html: string | null
          body_plain: string | null
          category: string | null
          cc_emails: string[] | null
          channel: string
          classification_confidence: number | null
          classification_tier: number | null
          classified_at: string | null
          client_id: string | null
          conversation_id: string | null
          created_at: string | null
          embedding: string | null
          embedding_updated_at: string | null
          emotion: string | null
          emotion_confidence: number | null
          first_response_at: string | null
          from_email: string | null
          from_name: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          group_id: string | null
          id: string
          last_response_at: string | null
          merged_into_ticket_id: string | null
          originating_user_id: string | null
          parent_ticket_id: string | null
          priority: string | null
          priority_score: number | null
          received_at: string | null
          resolution_summary: string | null
          resolved_at: string | null
          score_computed_at: string | null
          sentiment: string | null
          sla_breached: boolean
          sla_due_at: string | null
          snippet: string | null
          status: string | null
          subject: string
          ticket_number: number
          ticket_type: string | null
          to_email: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          ai_reasoning?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          auto_replied_at?: string | null
          auto_replied_out_of_hours?: boolean
          body_html?: string | null
          body_plain?: string | null
          category?: string | null
          cc_emails?: string[] | null
          channel?: string
          classification_confidence?: number | null
          classification_tier?: number | null
          classified_at?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          embedding?: string | null
          embedding_updated_at?: string | null
          emotion?: string | null
          emotion_confidence?: number | null
          first_response_at?: string | null
          from_email?: string | null
          from_name?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          group_id?: string | null
          id?: string
          last_response_at?: string | null
          merged_into_ticket_id?: string | null
          originating_user_id?: string | null
          parent_ticket_id?: string | null
          priority?: string | null
          priority_score?: number | null
          received_at?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          score_computed_at?: string | null
          sentiment?: string | null
          sla_breached?: boolean
          sla_due_at?: string | null
          snippet?: string | null
          status?: string | null
          subject: string
          ticket_number?: never
          ticket_type?: string | null
          to_email?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          ai_reasoning?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          auto_replied_at?: string | null
          auto_replied_out_of_hours?: boolean
          body_html?: string | null
          body_plain?: string | null
          category?: string | null
          cc_emails?: string[] | null
          channel?: string
          classification_confidence?: number | null
          classification_tier?: number | null
          classified_at?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          embedding?: string | null
          embedding_updated_at?: string | null
          emotion?: string | null
          emotion_confidence?: number | null
          first_response_at?: string | null
          from_email?: string | null
          from_name?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          group_id?: string | null
          id?: string
          last_response_at?: string | null
          merged_into_ticket_id?: string | null
          originating_user_id?: string | null
          parent_ticket_id?: string | null
          priority?: string | null
          priority_score?: number | null
          received_at?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          score_computed_at?: string | null
          sentiment?: string | null
          sla_breached?: boolean
          sla_due_at?: string | null
          snippet?: string | null
          status?: string | null
          subject?: string
          ticket_number?: never
          ticket_type?: string | null
          to_email?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "ticket_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_merged_into_ticket_id_fkey"
            columns: ["merged_into_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_parent_ticket_id_fkey"
            columns: ["parent_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_effective_seat_limit: {
        Args: { p_account_id: string }
        Returns: number
      }
      current_account_id: { Args: never; Returns: string }
      find_relevant_kb: {
        Args: {
          p_account_id: string
          p_limit?: number
          p_query_embedding: string
        }
        Returns: {
          article_id: string
          similarity: number
          title: string
        }[]
      }
      find_similar_tickets: {
        Args: {
          p_account_id: string
          p_limit?: number
          p_status_filter?: string
          p_threshold?: number
          p_ticket_id: string
        }
        Returns: {
          resolution_summary: string
          resolved_at: string
          similarity: number
          subject: string
          ticket_id: string
          ticket_number: number
        }[]
      }
      get_classification_accuracy: {
        Args: { p_account_id: string; p_window?: string }
        Returns: Json
      }
      get_invitation_by_token: {
        Args: { p_token: string }
        Returns: {
          account_id: string
          account_name: string
          email: string
          expires_at: string
          id: string
          role: string
        }[]
      }
      get_sidebar_counts: {
        Args: { p_account_id: string }
        Returns: {
          count: number
          status: string
        }[]
      }
      has_account_access: { Args: { p_account_id: string }; Returns: boolean }
      is_account_admin: { Args: { p_account_id: string }; Returns: boolean }
      is_active_admin: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      provision_account_for_user: {
        Args: {
          p_account_name?: string
          p_plan_code?: string
          p_seat_limit?: number
          p_user_id: string
        }
        Returns: string
      }
      recompute_category_confidence_thresholds: {
        Args: never
        Returns: undefined
      }
    }
    Enums: {
      draft_contact_origin: "kairo_created" | "external_synced"
      draft_contact_status:
        | "proposed"
        | "confirmed"
        | "rejected"
        | "merged_into"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      draft_contact_origin: ["kairo_created", "external_synced"],
      draft_contact_status: [
        "proposed",
        "confirmed",
        "rejected",
        "merged_into",
      ],
    },
  },
} as const
