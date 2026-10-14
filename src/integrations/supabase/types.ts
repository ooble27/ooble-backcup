export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      blockchain_transactions: {
        Row: {
          confirmations: number
          confirmed: boolean
          created_at: string
          direction: string
          id: string
          network: Database["public"]["Enums"]["usdt_network"]
          order_id: string
          tx_hash: string
          updated_at: string
          usdt_amount: number
        }
        Insert: {
          confirmations?: number
          confirmed?: boolean
          created_at?: string
          direction: string
          id?: string
          network: Database["public"]["Enums"]["usdt_network"]
          order_id: string
          tx_hash: string
          updated_at?: string
          usdt_amount: number
        }
        Update: {
          confirmations?: number
          confirmed?: boolean
          created_at?: string
          direction?: string
          id?: string
          network?: Database["public"]["Enums"]["usdt_network"]
          order_id?: string
          tx_hash?: string
          updated_at?: string
          usdt_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "blockchain_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_flags: {
        Row: {
          created_at: string
          details: Json | null
          flag_type: string
          id: string
          order_id: string | null
          resolved: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          flag_type: string
          id?: string
          order_id?: string | null
          resolved?: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          flag_type?: string
          id?: string
          order_id?: string | null
          resolved?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_flags_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          buy_rate: number
          fetched_at: string
          id: number
          sell_rate: number
          source: string
        }
        Insert: {
          buy_rate: number
          fetched_at?: string
          id?: never
          sell_rate: number
          source: string
        }
        Update: {
          buy_rate?: number
          fetched_at?: string
          id?: never
          sell_rate?: number
          source?: string
        }
        Relationships: []
      }
      business_verifications: {
        Row: {
          activity: string
          address: string
          assigned_name: string | null
          assigned_to: string | null
          attestation: boolean
          business_number: string | null
          created_at: string
          documents: Json
          id: string
          jurisdiction: string | null
          legal_name: string
          owners: Json
          phone: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          status: Database["public"]["Enums"]["kyc_status"]
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          activity: string
          address: string
          assigned_name?: string | null
          assigned_to?: string | null
          attestation?: boolean
          business_number?: string | null
          created_at?: string
          documents?: Json
          id?: string
          jurisdiction?: string | null
          legal_name: string
          owners?: Json
          phone?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          activity?: string
          address?: string
          assigned_name?: string | null
          assigned_to?: string | null
          attestation?: boolean
          business_number?: string | null
          created_at?: string
          documents?: Json
          id?: string
          jurisdiction?: string | null
          legal_name?: string
          owners?: Json
          phone?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_verifications: {
        Row: {
          address_line: string | null
          assigned_name: string | null
          assigned_to: string | null
          birth_date: string | null
          city: string | null
          created_at: string
          doc_type: string | null
          document_paths: Json | null
          external_reference: string | null
          id: string
          occupation: string | null
          postal_code: string | null
          provider: string
          province: string | null
          result_payload: Json | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          status: Database["public"]["Enums"]["kyc_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line?: string | null
          assigned_name?: string | null
          assigned_to?: string | null
          birth_date?: string | null
          city?: string | null
          created_at?: string
          doc_type?: string | null
          document_paths?: Json | null
          external_reference?: string | null
          id?: string
          occupation?: string | null
          postal_code?: string | null
          provider?: string
          province?: string | null
          result_payload?: Json | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line?: string | null
          assigned_name?: string | null
          assigned_to?: string | null
          birth_date?: string | null
          city?: string | null
          created_at?: string
          doc_type?: string | null
          document_paths?: Json | null
          external_reference?: string | null
          id?: string
          occupation?: string | null
          postal_code?: string | null
          provider?: string
          province?: string | null
          result_payload?: Json | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor: string
          created_at: string
          id: number
          new_status: Database["public"]["Enums"]["order_status"]
          note: string | null
          order_id: string
          previous_status: Database["public"]["Enums"]["order_status"] | null
        }
        Insert: {
          actor: string
          created_at?: string
          id?: never
          new_status: Database["public"]["Enums"]["order_status"]
          note?: string | null
          order_id: string
          previous_status?: Database["public"]["Enums"]["order_status"] | null
        }
        Update: {
          actor?: string
          created_at?: string
          id?: never
          new_status?: Database["public"]["Enums"]["order_status"]
          note?: string | null
          order_id?: string
          previous_status?: Database["public"]["Enums"]["order_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          cad_amount: number
          created_at: string
          fee_cad: number
          id: string
          interac_email: string | null
          locked_rate: number
          network: Database["public"]["Enums"]["usdt_network"]
          rate_locked_until: string
          side: Database["public"]["Enums"]["order_side"]
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          usdt_amount: number
          user_id: string
          wallet_address: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          cad_amount: number
          created_at?: string
          fee_cad?: number
          id?: string
          interac_email?: string | null
          locked_rate: number
          network?: Database["public"]["Enums"]["usdt_network"]
          rate_locked_until: string
          side: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          usdt_amount: number
          user_id: string
          wallet_address: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          cad_amount?: number
          created_at?: string
          fee_cad?: number
          id?: string
          interac_email?: string | null
          locked_rate?: number
          network?: Database["public"]["Enums"]["usdt_network"]
          rate_locked_until?: string
          side?: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          usdt_amount?: number
          user_id?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_confirmations: {
        Row: {
          amount_cad: number
          confirmed_at: string
          confirmed_by: string | null
          direction: string
          id: string
          method: string
          order_id: string
          reference: string | null
        }
        Insert: {
          amount_cad: number
          confirmed_at?: string
          confirmed_by?: string | null
          direction: string
          id?: string
          method?: string
          order_id: string
          reference?: string | null
        }
        Update: {
          amount_cad?: number
          confirmed_at?: string
          confirmed_by?: string | null
          direction?: string
          id?: string
          method?: string
          order_id?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_confirmations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          business_address: string | null
          business_name: string | null
          business_status: Database["public"]["Enums"]["kyc_status"]
          business_number: string | null
          business_phone: string | null
          created_at: string
          daily_limit_cad: number
          email: string | null
          full_name: string | null
          id: string
          interac_answer: string | null
          interac_question: string | null
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          phone: string | null
          sell_ref: string | null
          updated_at: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          business_address?: string | null
          business_name?: string | null
          business_status?: Database["public"]["Enums"]["kyc_status"]
          business_number?: string | null
          business_phone?: string | null
          created_at?: string
          daily_limit_cad?: number
          email?: string | null
          full_name?: string | null
          id: string
          interac_answer?: string | null
          interac_question?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          phone?: string | null
          sell_ref?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          business_address?: string | null
          business_name?: string | null
          business_status?: Database["public"]["Enums"]["kyc_status"]
          business_number?: string | null
          business_phone?: string | null
          created_at?: string
          daily_limit_cad?: number
          email?: string | null
          full_name?: string | null
          id?: string
          interac_answer?: string | null
          interac_question?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          phone?: string | null
          sell_ref?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      saved_recipients: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["recipient_kind"]
          label: string
          last_used_at: string | null
          network: Database["public"]["Enums"]["usdt_network"] | null
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["recipient_kind"]
          label: string
          last_used_at?: string | null
          network?: Database["public"]["Enums"]["usdt_network"] | null
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["recipient_kind"]
          label?: string
          last_used_at?: string | null
          network?: Database["public"]["Enums"]["usdt_network"] | null
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      reset_business_verification: { Args: { _user_id: string }; Returns: number }
    }
    Enums: {
      account_type: "individual" | "business"
      app_role: "admin" | "operator" | "kyc_reviewer" | "support" | "marketing" | "compliance" | "accounting"
      kyc_status: "not_started" | "pending" | "approved" | "rejected"
      order_side: "buy" | "sell"
      order_status:
        | "created"
        | "awaiting_payment"
        | "payment_received"
        | "settling"
        | "completed"
        | "cancelled"
        | "expired"
        | "refunded"
      recipient_kind: "wallet" | "interac"
      usdt_network:
        | "trc20"
        | "bep20"
        | "erc20"
        | "polygon"
        | "spl"
        | "avalanche"
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

export const Constants = {
  public: {
    Enums: {
      account_type: ["individual", "business"],
      app_role: ["admin", "operator", "kyc_reviewer", "support", "marketing", "compliance", "accounting"],
      kyc_status: ["not_started", "pending", "approved", "rejected"],
      order_side: ["buy", "sell"],
      order_status: [
        "created",
        "awaiting_payment",
        "payment_received",
        "settling",
        "completed",
        "cancelled",
        "expired",
        "refunded",
      ],
      recipient_kind: ["wallet", "interac"],
      usdt_network: ["trc20", "bep20", "erc20", "polygon", "spl", "avalanche"],
    },
  },
} as const
