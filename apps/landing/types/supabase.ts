export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          company_name: string | null;
          account_type: "support" | "sales" | "both" | null;
          gmail_connected: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          company_name?: string | null;
          account_type?: "support" | "sales" | "both" | null;
          gmail_connected?: boolean;
        };
        Update: {
          name?: string | null;
          company_name?: string | null;
          account_type?: "support" | "sales" | "both" | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
