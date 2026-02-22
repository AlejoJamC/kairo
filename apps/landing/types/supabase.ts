export type Database = {
  public: {
    Tables: {
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
        };
        Update: {
          name?: string | null;
          company_name?: string | null;
          gmail_connected?: boolean;
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
      tickets: {
        Row: {
          id: string;
          user_id: string;
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
        };
        Insert: {
          user_id: string;
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
        };
        Update: {
          ticket_type?: string | null;
          priority?: string | null;
          category?: string | null;
          sentiment?: string | null;
          status?: string;
          assigned_to?: string | null;
          resolved_at?: string | null;
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
