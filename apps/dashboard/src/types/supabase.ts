export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          company_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          company_name?: string | null;
        };
        Update: {
          name?: string | null;
          company_name?: string | null;
        };
        Relationships: [];
      };
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
          user_id: string;
          email: string;
          access_token?: string | null;
          refresh_token?: string | null;
          expires_at?: string | null;
        };
        Update: {
          access_token?: string | null;
          refresh_token?: string | null;
          expires_at?: string | null;
        };
        Relationships: [];
      };
      account_members: {
        Row: {
          id: string;
          account_id: string;
          user_id: string;
          role: string;
          status: string;
          invited_at: string | null;
          joined_at: string | null;
        };
        Insert: {
          id?: string;
          account_id: string;
          user_id: string;
          role: string;
          status?: string;
          invited_at?: string | null;
          joined_at?: string | null;
        };
        Update: {
          role?: string;
          status?: string;
          joined_at?: string | null;
        };
        Relationships: [];
      };
      draft_contact: {
        Row: {
          id: string;
          account_id: string;
          email: string | null;
          phone: string | null;
          display_name: string | null;
          organization: string | null;
          status: "proposed" | "confirmed" | "rejected" | "merged_into";
          origin: "kairo_created" | "external_synced";
          confidence: number;
          evidence_count: number;
          external_ref: string | null;
          external_source: string | null;
          source_tickets: string[];
          merged_into_id: string | null;
          first_seen_at: string;
          last_seen_at: string;
          confirmed_at: string | null;
          confirmed_by: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      draft_contact_audit_log: {
        Row: {
          id: string;
          draft_id: string;
          account_id: string;
          actor_user_id: string;
          action: "confirmed" | "rejected" | "edited" | "unrejected";
          diff: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      tickets: {
        Row: {
          id: string;
          account_id: string;
          originating_user_id: string | null;
          gmail_message_id: string;
          gmail_thread_id: string | null;
          subject: string;
          from_email: string;
          from_name: string | null;
          to_email: string | null;
          cc_emails: string[] | null;
          received_at: string;
          body_plain: string | null;
          body_html: string | null;
          snippet: string | null;
          ticket_type: string | null;
          priority: string | null;
          category: string | null;
          sentiment: string | null;
          status: string;
          assigned_to: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
          ai_reasoning: string | null;
          classified_at: string | null;
          classification_confidence: number | null;
        };
        Insert: {
          account_id: string;
          originating_user_id?: string | null;
          gmail_message_id: string;
          gmail_thread_id?: string | null;
          subject: string;
          from_email: string;
          from_name?: string | null;
          to_email?: string | null;
          cc_emails?: string[] | null;
          received_at: string;
          body_plain?: string | null;
          body_html?: string | null;
          snippet?: string | null;
          ticket_type?: string | null;
          priority?: string | null;
          category?: string | null;
          sentiment?: string | null;
          status?: string;
          assigned_to?: string | null;
          resolved_at?: string | null;
          ai_reasoning?: string | null;
          classified_at?: string | null;
          classification_confidence?: number | null;
        };
        Update: {
          ticket_type?: string | null;
          priority?: string | null;
          category?: string | null;
          sentiment?: string | null;
          status?: string;
          assigned_to?: string | null;
          resolved_at?: string | null;
          ai_reasoning?: string | null;
          classified_at?: string | null;
          classification_confidence?: number | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      confirm_draft_contact: {
        Args: { p_draft_id: string };
        Returns: Database["public"]["Tables"]["draft_contact"]["Row"];
      };
      reject_draft_contact: {
        Args: { p_draft_id: string };
        Returns: Database["public"]["Tables"]["draft_contact"]["Row"];
      };
      unreject_draft_contact: {
        Args: { p_draft_id: string };
        Returns: Database["public"]["Tables"]["draft_contact"]["Row"];
      };
      edit_draft_contact: {
        Args: { p_draft_id: string; p_patch: Record<string, unknown> };
        Returns: Database["public"]["Tables"]["draft_contact"]["Row"];
      };
      bulk_confirm_drafts_by_organization: {
        Args: { p_organization: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
