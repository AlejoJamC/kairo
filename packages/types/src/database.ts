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
          created_at: string
          credentials_encrypted: Json | null
          display_name: string | null
          external_account_id: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credentials_encrypted?: Json | null
          display_name?: string | null
          external_account_id: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credentials_encrypted?: Json | null
          display_name?: string | null
          external_account_id?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
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
          user_id: string
        }
        Insert: {
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
          user_id: string
        }
        Update: {
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
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          channel_integration_id: string
          created_at: string
          customer_avatar_url: string | null
          customer_display_name: string | null
          customer_external_id: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_integration_id: string
          created_at?: string
          customer_avatar_url?: string | null
          customer_display_name?: string | null
          customer_external_id: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_integration_id?: string
          created_at?: string
          customer_avatar_url?: string | null
          customer_display_name?: string | null
          customer_external_id?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_channel_integration_id_fkey"
            columns: ["channel_integration_id"]
            isOneToOne: false
            referencedRelation: "channel_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_accounts: {
        Row: {
          access_token: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          refresh_token: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
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
      profiles: {
        Row: {
          company_name: string | null
          created_at: string | null
          email: string
          gmail_connected: boolean | null
          id: string
          name: string | null
          updated_at: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          email: string
          gmail_connected?: boolean | null
          id: string
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          email?: string
          gmail_connected?: boolean | null
          id?: string
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
          conversation_id: string
          created_at: string
          id: string
          message_ids: string[]
          model_version: string
          proposed_category: string | null
          proposed_priority: string | null
          proposed_sentiment: string | null
          proposed_type: string | null
          raw_llm_output: Json
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          ticket_id: string | null
        }
        Insert: {
          confidence_score: number
          conversation_id: string
          created_at?: string
          id?: string
          message_ids: string[]
          model_version: string
          proposed_category?: string | null
          proposed_priority?: string | null
          proposed_sentiment?: string | null
          proposed_type?: string | null
          raw_llm_output: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          ticket_id?: string | null
        }
        Update: {
          confidence_score?: number
          conversation_id?: string
          created_at?: string
          id?: string
          message_ids?: string[]
          model_version?: string
          proposed_category?: string | null
          proposed_priority?: string | null
          proposed_sentiment?: string | null
          proposed_type?: string | null
          raw_llm_output?: Json
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
          ai_reasoning: string | null
          assigned_to: string | null
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
          first_response_at: string | null
          from_email: string | null
          from_name: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          merged_into_ticket_id: string | null
          parent_ticket_id: string | null
          priority: string | null
          received_at: string | null
          resolved_at: string | null
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
          user_id: string
        }
        Insert: {
          ai_reasoning?: string | null
          assigned_to?: string | null
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
          first_response_at?: string | null
          from_email?: string | null
          from_name?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          merged_into_ticket_id?: string | null
          parent_ticket_id?: string | null
          priority?: string | null
          received_at?: string | null
          resolved_at?: string | null
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
          user_id: string
        }
        Update: {
          ai_reasoning?: string | null
          assigned_to?: string | null
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
          first_response_at?: string | null
          from_email?: string | null
          from_name?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          merged_into_ticket_id?: string | null
          parent_ticket_id?: string | null
          priority?: string | null
          received_at?: string | null
          resolved_at?: string | null
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
          user_id?: string
        }
        Relationships: [
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
      recompute_category_confidence_thresholds: {
        Args: never
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
