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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_closures: {
        Row: {
          account_type: string | null
          closed_at: string
          email: string | null
          full_name: string | null
          mode: string
          retain_until: string | null
          user_id: string
        }
        Insert: {
          account_type?: string | null
          closed_at?: string
          email?: string | null
          full_name?: string | null
          mode: string
          retain_until?: string | null
          user_id: string
        }
        Update: {
          account_type?: string | null
          closed_at?: string
          email?: string | null
          full_name?: string | null
          mode?: string
          retain_until?: string | null
          user_id?: string
        }
        Relationships: []
      }
      accounting_closures: {
        Row: {
          action: string
          at: string
          by_id: string
          by_name: string | null
          id: string
          month: string
          note: string | null
          totals: Json | null
        }
        Insert: {
          action: string
          at?: string
          by_id: string
          by_name?: string | null
          id?: string
          month: string
          note?: string | null
          totals?: Json | null
        }
        Update: {
          action?: string
          at?: string
          by_id?: string
          by_name?: string | null
          id?: string
          month?: string
          note?: string | null
          totals?: Json | null
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_kind: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_kind?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_kind?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      ai_alerts: {
        Row: {
          created_at: string
          detail: string
          entity_id: string | null
          entity_kind: string | null
          evidence: Json
          id: string
          kind: string
          resolution_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          status: string
          suggestion: string | null
          title: string
        }
        Insert: {
          created_at?: string
          detail: string
          entity_id?: string | null
          entity_kind?: string | null
          evidence?: Json
          id?: string
          kind: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity: string
          status?: string
          suggestion?: string | null
          title: string
        }
        Update: {
          created_at?: string
          detail?: string
          entity_id?: string | null
          entity_kind?: string | null
          evidence?: Json
          id?: string
          kind?: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          status?: string
          suggestion?: string | null
          title?: string
        }
        Relationships: []
      }
      ai_calls: {
        Row: {
          agent: string
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          input_hash: string | null
          input_preview: string | null
          input_tokens: number | null
          model: string
          output_preview: string | null
          output_tokens: number | null
          staff_id: string | null
          status: string
        }
        Insert: {
          agent: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_hash?: string | null
          input_preview?: string | null
          input_tokens?: number | null
          model?: string
          output_preview?: string | null
          output_tokens?: number | null
          staff_id?: string | null
          status: string
        }
        Update: {
          agent?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_hash?: string | null
          input_preview?: string | null
          input_tokens?: number | null
          model?: string
          output_preview?: string | null
          output_tokens?: number | null
          staff_id?: string | null
          status?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          active: boolean
          body_en: string
          body_fr: string
          created_at: string
          created_by: string | null
          dismissible: boolean
          id: string
          kind: Database["public"]["Enums"]["announcement_kind"]
          title_en: string
          title_fr: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body_en?: string
          body_fr?: string
          created_at?: string
          created_by?: string | null
          dismissible?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["announcement_kind"]
          title_en: string
          title_fr: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body_en?: string
          body_fr?: string
          created_at?: string
          created_by?: string | null
          dismissible?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["announcement_kind"]
          title_en?: string
          title_fr?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_private_settings: {
        Row: {
          id: number
          staff_alert_emails: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          staff_alert_emails?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          staff_alert_emails?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_message_events: {
        Row: {
          message_id: string
          user_id: string
          kind: string
          at: string
        }
        Insert: {
          message_id: string
          user_id: string
          kind: string
          at?: string
        }
        Update: {
          message_id?: string
          user_id?: string
          kind?: string
          at?: string
        }
        Relationships: []
      }
      app_messages: {
        Row: {
          id: string
          title_fr: string
          body_fr: string | null
          cta_fr: string | null
          title_en: string | null
          body_en: string | null
          cta_en: string | null
          url: string | null
          audience: string
          active: boolean
          starts_at: string
          ends_at: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
        }
        Insert: {
          id?: string
          title_fr: string
          body_fr?: string | null
          cta_fr?: string | null
          title_en?: string | null
          body_en?: string | null
          cta_en?: string | null
          url?: string | null
          audience: string
          active?: boolean
          starts_at?: string
          ends_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
        }
        Update: {
          id?: string
          title_fr?: string
          body_fr?: string | null
          cta_fr?: string | null
          title_en?: string | null
          body_en?: string | null
          cta_en?: string | null
          url?: string | null
          audience?: string
          active?: boolean
          starts_at?: string
          ends_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          buy_margin_pct: number
          id: number
          interac_email: string
          manual_market_rate: number | null
          networks: Json
          otc_email: string
          otc_enabled: boolean
          rate_lock_minutes: number
          sell_expiry_hours: number
          buy_expiry_minutes: number
          sell_margin_pct: number
          signups_business: boolean
          signups_individual: boolean
          support_email: string
          trade_daily_max_cad: number
          trade_min_cad: number
          trading_enabled: boolean
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
          verification_enabled: boolean
        }
        Insert: {
          buy_margin_pct?: number
          id?: number
          interac_email?: string
          manual_market_rate?: number | null
          networks?: Json
          otc_email?: string
          otc_enabled?: boolean
          rate_lock_minutes?: number
          sell_expiry_hours?: number
          buy_expiry_minutes?: number
          sell_margin_pct?: number
          signups_business?: boolean
          signups_individual?: boolean
          support_email?: string
          trade_daily_max_cad?: number
          trade_min_cad?: number
          trading_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
          verification_enabled?: boolean
        }
        Update: {
          buy_margin_pct?: number
          id?: number
          interac_email?: string
          manual_market_rate?: number | null
          networks?: Json
          otc_email?: string
          otc_enabled?: boolean
          rate_lock_minutes?: number
          sell_expiry_hours?: number
          buy_expiry_minutes?: number
          sell_margin_pct?: number
          signups_business?: boolean
          signups_individual?: boolean
          support_email?: string
          trade_daily_max_cad?: number
          trade_min_cad?: number
          trading_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
          verification_enabled?: boolean
        }
        Relationships: []
      }
      backup_runs: {
        Row: {
          archive_bytes: number | null
          db_bytes: number | null
          error: string | null
          files_bytes: number | null
          files_count: number | null
          finished_at: string | null
          id: number
          location: string | null
          restore_detail: string | null
          restore_ok: boolean | null
          run_url: string | null
          started_at: string
          status: string
          tables: Json | null
        }
        Insert: {
          archive_bytes?: number | null
          db_bytes?: number | null
          error?: string | null
          files_bytes?: number | null
          files_count?: number | null
          finished_at?: string | null
          id?: never
          location?: string | null
          restore_detail?: string | null
          restore_ok?: boolean | null
          run_url?: string | null
          started_at?: string
          status?: string
          tables?: Json | null
        }
        Update: {
          archive_bytes?: number | null
          db_bytes?: number | null
          error?: string | null
          files_bytes?: number | null
          files_count?: number | null
          finished_at?: string | null
          id?: never
          location?: string | null
          restore_detail?: string | null
          restore_ok?: boolean | null
          run_url?: string | null
          started_at?: string
          status?: string
          tables?: Json | null
        }
        Relationships: []
      }
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
      blocked_email_domains: {
        Row: {
          added_at: string
          domain: string
        }
        Insert: {
          added_at?: string
          domain: string
        }
        Update: {
          added_at?: string
          domain?: string
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
      campaign_events: {
        Row: {
          id: number
          send_id: string
          type: string
          url: string | null
          at: string
        }
        Insert: {
          id?: number
          send_id: string
          type: string
          url?: string | null
          at?: string
        }
        Update: {
          id?: number
          send_id?: string
          type?: string
          url?: string | null
          at?: string
        }
        Relationships: []
      }
      campaign_sends: {
        Row: {
          id: string
          campaign_id: string
          email: string
          user_id: string | null
          lang: string
          subject: string
          html: string
          text_body: string | null
          unsubscribe_url: string | null
          status: string
          error: string | null
          resend_id: string | null
          sent_at: string | null
          delivered_at: string | null
          opened_at: string | null
          clicked_at: string | null
          bounced_at: string | null
          complained_at: string | null
          opens: number
          clicks: number
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          email: string
          user_id?: string | null
          lang?: string
          subject: string
          html: string
          text_body?: string | null
          unsubscribe_url?: string | null
          status?: string
          error?: string | null
          resend_id?: string | null
          sent_at?: string | null
          delivered_at?: string | null
          opened_at?: string | null
          clicked_at?: string | null
          bounced_at?: string | null
          complained_at?: string | null
          opens?: number
          clicks?: number
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          email?: string
          user_id?: string | null
          lang?: string
          subject?: string
          html?: string
          text_body?: string | null
          unsubscribe_url?: string | null
          status?: string
          error?: string | null
          resend_id?: string | null
          sent_at?: string | null
          delivered_at?: string | null
          opened_at?: string | null
          clicked_at?: string | null
          bounced_at?: string | null
          complained_at?: string | null
          opens?: number
          clicks?: number
          created_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          id: string
          name: string
          template_id: string | null
          values_by_lang: Json | null
          subject: string | null
          audience: string | null
          status: string
          scheduled_at: string
          is_test: boolean
          started_at: string | null
          finished_at: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          journey_id: string | null
        }
        Insert: {
          id?: string
          name: string
          template_id?: string | null
          values_by_lang?: Json | null
          subject?: string | null
          audience?: string | null
          status?: string
          scheduled_at?: string
          is_test?: boolean
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          journey_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          template_id?: string | null
          values_by_lang?: Json | null
          subject?: string | null
          audience?: string | null
          status?: string
          scheduled_at?: string
          is_test?: boolean
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          journey_id?: string | null
        }
        Relationships: []
      }
      chain_deposits: {
        Row: {
          block_time: string
          created_at: string
          from_address: string | null
          handled_by: string | null
          id: string
          log_index: number
          match_method: string | null
          network: Database["public"]["Enums"]["usdt_network"]
          order_id: string | null
          reason: string | null
          status: string
          to_address: string
          tx_hash: string
          updated_at: string
          usdt_amount: number
        }
        Insert: {
          block_time: string
          created_at?: string
          from_address?: string | null
          handled_by?: string | null
          id?: string
          log_index?: number
          match_method?: string | null
          network: Database["public"]["Enums"]["usdt_network"]
          order_id?: string | null
          reason?: string | null
          status?: string
          to_address: string
          tx_hash: string
          updated_at?: string
          usdt_amount: number
        }
        Update: {
          block_time?: string
          created_at?: string
          from_address?: string | null
          handled_by?: string | null
          id?: string
          log_index?: number
          match_method?: string | null
          network?: Database["public"]["Enums"]["usdt_network"]
          order_id?: string | null
          reason?: string | null
          status?: string
          to_address?: string
          tx_hash?: string
          updated_at?: string
          usdt_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "chain_deposits_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      chain_scan_state: {
        Row: {
          cursor: number
          network: Database["public"]["Enums"]["usdt_network"]
          updated_at: string
        }
        Insert: {
          cursor: number
          network: Database["public"]["Enums"]["usdt_network"]
          updated_at?: string
        }
        Update: {
          cursor?: number
          network?: Database["public"]["Enums"]["usdt_network"]
          updated_at?: string
        }
        Relationships: []
      }
      client_notes: {
        Row: {
          author_id: string
          author_name: string | null
          body: string
          client_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_id?: string
          author_name?: string | null
          body: string
          client_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          author_name?: string | null
          body?: string
          client_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_wallets: {
        Row: {
          address: string
          address_key: string | null
          declared_count: number
          deposit_count: number
          family: string
          first_seen: string
          id: number
          last_seen: string
          payout_count: number
          user_id: string
        }
        Insert: {
          address: string
          address_key?: string | null
          declared_count?: number
          deposit_count?: number
          family: string
          first_seen?: string
          id?: never
          last_seen?: string
          payout_count?: number
          user_id: string
        }
        Update: {
          address?: string
          address_key?: string | null
          declared_count?: number
          deposit_count?: number
          family?: string
          first_seen?: string
          id?: never
          last_seen?: string
          payout_count?: number
          user_id?: string
        }
        Relationships: []
      }
      compliance_alerts: {
        Row: {
          amount_cad: number
          assigned_name: string | null
          assigned_to: string | null
          classification: string | null
          closed_at: string | null
          closed_by: string | null
          closed_by_name: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          due_date: string | null
          id: string
          notes: string | null
          occurred_at: string
          order_id: string | null
          order_ids: string[]
          reason: string
          ref: string
          source: string
          status: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_cad?: number
          assigned_name?: string | null
          assigned_to?: string | null
          classification?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closed_by_name?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          occurred_at?: string
          order_id?: string | null
          order_ids?: string[]
          reason: string
          ref?: string
          source?: string
          status?: string
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_cad?: number
          assigned_name?: string | null
          assigned_to?: string | null
          classification?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closed_by_name?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          occurred_at?: string
          order_id?: string | null
          order_ids?: string[]
          reason?: string
          ref?: string
          source?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_alerts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_checklist: {
        Row: {
          category: string
          description: string
          done: boolean
          done_at: string | null
          done_by: string | null
          due_date: string | null
          evidence: string | null
          frequency: string | null
          id: string
          label: string
          position: number
          updated_at: string
        }
        Insert: {
          category: string
          description: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          evidence?: string | null
          frequency?: string | null
          id: string
          label: string
          position: number
          updated_at?: string
        }
        Update: {
          category?: string
          description?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          evidence?: string | null
          frequency?: string | null
          id?: string
          label?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      compliance_declarations: {
        Row: {
          alert_id: string | null
          amount_cad: number
          canafe_ref: string | null
          client_name: string
          created_at: string
          created_by: string | null
          due_date: string | null
          form_data: Json
          id: string
          ref: string
          status: string
          submitted_at: string | null
          type: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          alert_id?: string | null
          amount_cad?: number
          canafe_ref?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          form_data?: Json
          id?: string
          ref?: string
          status?: string
          submitted_at?: string | null
          type: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          alert_id?: string | null
          amount_cad?: number
          canafe_ref?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          form_data?: Json
          id?: string
          ref?: string
          status?: string
          submitted_at?: string | null
          type?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_declarations_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "compliance_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_declarations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      compliance_sanction_entries: {
        Row: {
          country: string | null
          id: number
          kind: string
          list_id: number
          listed_on: string | null
          name: string | null
          network: string | null
          ref: string | null
          source: string
          tokens: string[]
          wallet: string | null
        }
        Insert: {
          country?: string | null
          id?: number
          kind: string
          list_id: number
          listed_on?: string | null
          name?: string | null
          network?: string | null
          ref?: string | null
          source: string
          tokens?: string[]
          wallet?: string | null
        }
        Update: {
          country?: string | null
          id?: number
          kind?: string
          list_id?: number
          listed_on?: string | null
          name?: string | null
          network?: string | null
          ref?: string | null
          source?: string
          tokens?: string[]
          wallet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_sanction_entries_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "compliance_sanction_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_sanction_lists: {
        Row: {
          content_hash: string | null
          entries: number | null
          error: string | null
          fetched_at: string
          id: number
          loaded_at: string | null
          request_id: number | null
          source: string
          status: string
        }
        Insert: {
          content_hash?: string | null
          entries?: number | null
          error?: string | null
          fetched_at?: string
          id?: number
          loaded_at?: string | null
          request_id?: number | null
          source: string
          status?: string
        }
        Update: {
          content_hash?: string | null
          entries?: number | null
          error?: string | null
          fetched_at?: string
          id?: number
          loaded_at?: string | null
          request_id?: number | null
          source?: string
          status?: string
        }
        Relationships: []
      }
      deposit_addresses: {
        Row: {
          active: boolean
          added_at: string
          added_by: string | null
          added_by_name: string | null
          address: string
          family: string
          id: number
          retired_at: string | null
        }
        Insert: {
          active?: boolean
          added_at?: string
          added_by?: string | null
          added_by_name?: string | null
          address: string
          family: string
          id?: number
          retired_at?: string | null
        }
        Update: {
          active?: boolean
          added_at?: string
          added_by?: string | null
          added_by_name?: string | null
          address?: string
          family?: string
          id?: number
          retired_at?: string | null
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          buy_rate: number
          fetched_at: string
          id: number
          market_rate: number | null
          sell_rate: number
          source: string
        }
        Insert: {
          buy_rate: number
          fetched_at?: string
          id?: never
          market_rate?: number | null
          sell_rate: number
          source: string
        }
        Update: {
          buy_rate?: number
          fetched_at?: string
          id?: never
          market_rate?: number | null
          sell_rate?: number
          source?: string
        }
        Relationships: []
      }
      interac_receipts: {
        Row: {
          amount_cad: number | null
          authenticated: boolean
          body_text: string | null
          from_email: string | null
          id: string
          interac_ref: string | null
          order_id: string | null
          order_ref: string | null
          reason: string | null
          received_at: string
          resend_id: string | null
          sender_name: string | null
          status: string
          subject: string | null
        }
        Insert: {
          amount_cad?: number | null
          authenticated?: boolean
          body_text?: string | null
          from_email?: string | null
          id?: string
          interac_ref?: string | null
          order_id?: string | null
          order_ref?: string | null
          reason?: string | null
          received_at?: string
          resend_id?: string | null
          sender_name?: string | null
          status: string
          subject?: string | null
        }
        Update: {
          amount_cad?: number | null
          authenticated?: boolean
          body_text?: string | null
          from_email?: string | null
          id?: string
          interac_ref?: string | null
          order_id?: string | null
          order_ref?: string | null
          reason?: string | null
          received_at?: string
          resend_id?: string | null
          sender_name?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interac_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          archived: boolean
          audience: string
          body: string
          category: string
          created_at: string
          id: string
          position: number
          section: string
          slug: string
          summary: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived?: boolean
          audience?: string
          body?: string
          category?: string
          created_at?: string
          id?: string
          position?: number
          section: string
          slug: string
          summary?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived?: boolean
          audience?: string
          body?: string
          category?: string
          created_at?: string
          id?: string
          position?: number
          section?: string
          slug?: string
          summary?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      journeys: {
        Row: {
          id: string
          enabled: boolean
          style: string
          campaign_id: string | null
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          id: string
          enabled?: boolean
          style?: string
          campaign_id?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          id?: string
          enabled?: boolean
          style?: string
          campaign_id?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: []
      }
      journey_runs: {
        Row: {
          id: number
          journey_id: string
          kind: string
          user_id: string
          run_key: string
          send_id: string | null
          created_at: string
        }
        Insert: {
          id?: number
          journey_id: string
          kind: string
          user_id: string
          run_key: string
          send_id?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          journey_id?: string
          kind?: string
          user_id?: string
          run_key?: string
          send_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      journey_steps: {
        Row: {
          kind: string
          journey_id: string
          position: number
          delay_hours: number
        }
        Insert: {
          kind: string
          journey_id: string
          position?: number
          delay_hours: number
        }
        Update: {
          kind?: string
          journey_id?: string
          position?: number
          delay_hours?: number
        }
        Relationships: []
      }
      journey_texts: {
        Row: {
          kind: string
          lang: string
          subject: string | null
          heading: string | null
          lead: string | null
          button: string | null
          updated_at: string
          updated_by_name: string | null
        }
        Insert: {
          kind: string
          lang: string
          subject?: string | null
          heading?: string | null
          lead?: string | null
          button?: string | null
          updated_at?: string
          updated_by_name?: string | null
        }
        Update: {
          kind?: string
          lang?: string
          subject?: string | null
          heading?: string | null
          lead?: string | null
          button?: string | null
          updated_at?: string
          updated_by_name?: string | null
        }
        Relationships: []
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
      mail_designs: {
        Row: {
          kind: string
          style: string | null
          subject: string | null
          heading: string | null
          lead: string | null
          button: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          kind: string
          style?: string | null
          subject?: string | null
          heading?: string | null
          lead?: string | null
          button?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          kind?: string
          style?: string | null
          subject?: string | null
          heading?: string | null
          lead?: string | null
          button?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mail_messages: {
        Row: {
          body_html: string | null
          body_text: string | null
          created_at: string
          direction: string
          from_email: string
          from_name: string | null
          id: string
          resend_id: string | null
          staff_id: string | null
          subject: string | null
          thread_id: string
          to_email: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          direction: string
          from_email: string
          from_name?: string | null
          id?: string
          resend_id?: string | null
          staff_id?: string | null
          subject?: string | null
          thread_id: string
          to_email: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          direction?: string
          from_email?: string
          from_name?: string | null
          id?: string
          resend_id?: string | null
          staff_id?: string | null
          subject?: string | null
          thread_id?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "mail_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_texts: {
        Row: {
          kind: string
          lang: string
          subject: string | null
          heading: string | null
          lead: string | null
          button: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          kind: string
          lang: string
          subject?: string | null
          heading?: string | null
          lead?: string | null
          button?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          kind?: string
          lang?: string
          subject?: string | null
          heading?: string | null
          lead?: string | null
          button?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mail_threads: {
        Row: {
          assigned_name: string | null
          assigned_to: string | null
          client_email: string
          client_id: string | null
          client_name: string | null
          created_at: string
          has_unread: boolean
          id: string
          last_inbound_at: string | null
          last_message_at: string
          mailbox: string
          message_count: number
          origin: string
          removed_at: string | null
          removed_by: string | null
          status: string
          subject: string
          support_state: string
        }
        Insert: {
          assigned_name?: string | null
          assigned_to?: string | null
          client_email: string
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          has_unread?: boolean
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string
          mailbox?: string
          message_count?: number
          origin?: string
          removed_at?: string | null
          removed_by?: string | null
          status?: string
          subject: string
          support_state?: string
        }
        Update: {
          assigned_name?: string | null
          assigned_to?: string | null
          client_email?: string
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          has_unread?: boolean
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string
          mailbox?: string
          message_count?: number
          origin?: string
          removed_at?: string | null
          removed_by?: string | null
          status?: string
          subject?: string
          support_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_windows: {
        Row: {
          active: boolean
          body_en: string
          body_fr: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          starts_at: string | null
          title_en: string
          title_fr: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body_en?: string
          body_fr?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string | null
          title_en: string
          title_fr: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body_en?: string
          body_fr?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string | null
          title_en?: string
          title_fr?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_settings: {
        Row: {
          id: number
          client_sends: boolean
          automatic_sends: boolean
          daily_limit: number
          daily_reserve: number
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          id?: number
          client_sends?: boolean
          automatic_sends?: boolean
          daily_limit?: number
          daily_reserve?: number
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          id?: number
          client_sends?: boolean
          automatic_sends?: boolean
          daily_limit?: number
          daily_reserve?: number
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: []
      }
      marketing_optout: {
        Row: {
          created_at: string
          email: string
          token: string
          unsubscribed_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          token?: string
          unsubscribed_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          token?: string
          unsubscribed_at?: string | null
        }
        Relationships: []
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
          client_sent_at: string | null
          client_tx_hash: string | null
          created_at: string
          fee_cad: number
          id: string
          interac_email: string | null
          locked_rate: number
          network: Database["public"]["Enums"]["usdt_network"]
          rate_locked_until: string
          sender_address: string | null
          sender_platform: string | null
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
          client_sent_at?: string | null
          client_tx_hash?: string | null
          created_at?: string
          fee_cad?: number
          id?: string
          interac_email?: string | null
          locked_rate: number
          network?: Database["public"]["Enums"]["usdt_network"]
          rate_locked_until: string
          sender_address?: string | null
          sender_platform?: string | null
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
          client_sent_at?: string | null
          client_tx_hash?: string | null
          created_at?: string
          fee_cad?: number
          id?: string
          interac_email?: string | null
          locked_rate?: number
          network?: Database["public"]["Enums"]["usdt_network"]
          rate_locked_until?: string
          sender_address?: string | null
          sender_platform?: string | null
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
      payout_locks: {
        Row: {
          holder: string | null
          locked_until: string
          network: Database["public"]["Enums"]["usdt_network"]
        }
        Insert: {
          holder?: string | null
          locked_until?: string
          network: Database["public"]["Enums"]["usdt_network"]
        }
        Update: {
          holder?: string | null
          locked_until?: string
          network?: Database["public"]["Enums"]["usdt_network"]
        }
        Relationships: []
      }
      platform_state: {
        Row: {
          id: boolean
          last_reset_at: string | null
          last_reset_by: string | null
          launched_at: string | null
          launched_by: string | null
        }
        Insert: {
          id?: boolean
          last_reset_at?: string | null
          last_reset_by?: string | null
          launched_at?: string | null
          launched_by?: string | null
        }
        Update: {
          id?: boolean
          last_reset_at?: string | null
          last_reset_by?: string | null
          launched_at?: string | null
          launched_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          business_address: string | null
          business_name: string | null
          business_number: string | null
          business_phone: string | null
          business_status: Database["public"]["Enums"]["kyc_status"]
          closed_at: string | null
          created_at: string
          daily_limit_cad: number
          email: string | null
          full_name: string | null
          id: string
          interac_answer: string | null
          interac_question: string | null
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          phone: string | null
          preferred_lang: string | null
          sell_ref: string | null
          updated_at: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          business_address?: string | null
          business_name?: string | null
          business_number?: string | null
          business_phone?: string | null
          business_status?: Database["public"]["Enums"]["kyc_status"]
          closed_at?: string | null
          created_at?: string
          daily_limit_cad?: number
          email?: string | null
          full_name?: string | null
          id: string
          interac_answer?: string | null
          interac_question?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          phone?: string | null
          preferred_lang?: string | null
          sell_ref?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          business_address?: string | null
          business_name?: string | null
          business_number?: string | null
          business_phone?: string | null
          business_status?: Database["public"]["Enums"]["kyc_status"]
          closed_at?: string | null
          created_at?: string
          daily_limit_cad?: number
          email?: string | null
          full_name?: string | null
          id?: string
          interac_answer?: string | null
          interac_question?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          phone?: string | null
          preferred_lang?: string | null
          sell_ref?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_campaigns: {
        Row: {
          id: string
          title_fr: string
          body_fr: string
          title_en: string | null
          body_en: string | null
          url: string
          audience: string
          status: string
          scheduled_at: string
          is_test: boolean
          people: number
          devices: number
          sent: number
          failed: number
          blocked: number
          created_at: string
          created_by: string | null
          created_by_name: string | null
          finished_at: string | null
        }
        Insert: {
          id?: string
          title_fr: string
          body_fr: string
          title_en?: string | null
          body_en?: string | null
          url?: string
          audience: string
          status?: string
          scheduled_at?: string
          is_test?: boolean
          people?: number
          devices?: number
          sent?: number
          failed?: number
          blocked?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          finished_at?: string | null
        }
        Update: {
          id?: string
          title_fr?: string
          body_fr?: string
          title_en?: string | null
          body_en?: string | null
          url?: string
          audience?: string
          status?: string
          scheduled_at?: string
          is_test?: boolean
          people?: number
          devices?: number
          sent?: number
          failed?: number
          blocked?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          finished_at?: string | null
        }
        Relationships: []
      }
      push_clicks: {
        Row: {
          campaign_id: string
          user_id: string
          at: string
        }
        Insert: {
          campaign_id: string
          user_id: string
          at?: string
        }
        Update: {
          campaign_id?: string
          user_id?: string
          at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          lang: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          lang?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          lang?: string
          p256dh?: string
          user_id?: string
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
      settlement_settings: {
        Row: {
          auto_payout: boolean
          auto_payout_max_cad: number
          daily_payout_max_usdt: number
          id: number
          require_email_auth: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_payout?: boolean
          auto_payout_max_cad?: number
          daily_payout_max_usdt?: number
          id?: number
          require_email_auth?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_payout?: boolean
          auto_payout_max_cad?: number
          daily_payout_max_usdt?: number
          id?: number
          require_email_auth?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      signup_origin_backfill: {
        Row: {
          near_signup: boolean
          req_id: number
          user_id: string
        }
        Insert: {
          near_signup: boolean
          req_id: number
          user_id: string
        }
        Update: {
          near_signup?: boolean
          req_id?: number
          user_id?: string
        }
        Relationships: []
      }
      signup_origins: {
        Row: {
          campaign: string | null
          city: string | null
          country: string | null
          created_at: string
          landing: string | null
          late: boolean
          medium: string | null
          referrer: string | null
          region: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          campaign?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          landing?: string | null
          late?: boolean
          medium?: string | null
          referrer?: string | null
          region?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          campaign?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          landing?: string | null
          late?: boolean
          medium?: string | null
          referrer?: string | null
          region?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      treasury_addresses: {
        Row: {
          active: boolean
          address: string
          created_at: string
          id: string
          label: string
          network: Database["public"]["Enums"]["usdt_network"]
          purpose: Database["public"]["Enums"]["treasury_address_purpose"]
        }
        Insert: {
          active?: boolean
          address: string
          created_at?: string
          id?: string
          label: string
          network: Database["public"]["Enums"]["usdt_network"]
          purpose?: Database["public"]["Enums"]["treasury_address_purpose"]
        }
        Update: {
          active?: boolean
          address?: string
          created_at?: string
          id?: string
          label?: string
          network?: Database["public"]["Enums"]["usdt_network"]
          purpose?: Database["public"]["Enums"]["treasury_address_purpose"]
        }
        Relationships: []
      }
      treasury_alert_config: {
        Row: {
          alert_enabled: boolean
          low_balance_threshold_usdt: number
          network: Database["public"]["Enums"]["usdt_network"]
          updated_at: string
        }
        Insert: {
          alert_enabled?: boolean
          low_balance_threshold_usdt?: number
          network: Database["public"]["Enums"]["usdt_network"]
          updated_at?: string
        }
        Update: {
          alert_enabled?: boolean
          low_balance_threshold_usdt?: number
          network?: Database["public"]["Enums"]["usdt_network"]
          updated_at?: string
        }
        Relationships: []
      }
      treasury_balance_snapshots: {
        Row: {
          address_id: string
          balance_usdt: number
          id: string
          recorded_at: string
          recorded_by: string | null
          source: string
        }
        Insert: {
          address_id: string
          balance_usdt: number
          id?: string
          recorded_at?: string
          recorded_by?: string | null
          source?: string
        }
        Update: {
          address_id?: string
          balance_usdt?: number
          id?: string
          recorded_at?: string
          recorded_by?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "treasury_balance_snapshots_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "treasury_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury_movements: {
        Row: {
          amount_usdt: number
          created_at: string
          from_address_id: string | null
          id: string
          notes: string | null
          reason: string
          recorded_by: string | null
          to_address_id: string | null
          tx_hash: string | null
        }
        Insert: {
          amount_usdt: number
          created_at?: string
          from_address_id?: string | null
          id?: string
          notes?: string | null
          reason?: string
          recorded_by?: string | null
          to_address_id?: string | null
          tx_hash?: string | null
        }
        Update: {
          amount_usdt?: number
          created_at?: string
          from_address_id?: string | null
          id?: string
          notes?: string | null
          reason?: string
          recorded_by?: string | null
          to_address_id?: string | null
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treasury_movements_from_address_id_fkey"
            columns: ["from_address_id"]
            isOneToOne: false
            referencedRelation: "treasury_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_movements_to_address_id_fkey"
            columns: ["to_address_id"]
            isOneToOne: false
            referencedRelation: "treasury_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      usdt_payouts: {
        Row: {
          created_at: string
          error: string | null
          from_address: string | null
          id: string
          network: Database["public"]["Enums"]["usdt_network"]
          order_id: string
          requested_by: string | null
          status: string
          to_address: string
          trigger: string
          tx_hash: string | null
          updated_at: string
          usdt_amount: number
        }
        Insert: {
          created_at?: string
          error?: string | null
          from_address?: string | null
          id?: string
          network: Database["public"]["Enums"]["usdt_network"]
          order_id: string
          requested_by?: string | null
          status: string
          to_address: string
          trigger: string
          tx_hash?: string | null
          updated_at?: string
          usdt_amount: number
        }
        Update: {
          created_at?: string
          error?: string | null
          from_address?: string | null
          id?: string
          network?: Database["public"]["Enums"]["usdt_network"]
          order_id?: string
          requested_by?: string | null
          status?: string
          to_address?: string
          trigger?: string
          tx_hash?: string | null
          updated_at?: string
          usdt_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "usdt_payouts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      compliance_sanctions_current: {
        Row: {
          country: string | null
          id: number | null
          kind: string | null
          list_id: number | null
          listed_on: string | null
          name: string | null
          network: string | null
          ref: string | null
          source: string | null
          tokens: string[] | null
          wallet: string | null
        }
        Insert: {
          country?: string | null
          id?: number | null
          kind?: string | null
          list_id?: number | null
          listed_on?: string | null
          name?: string | null
          network?: string | null
          ref?: string | null
          source?: string | null
          tokens?: string[] | null
          wallet?: string | null
        }
        Update: {
          country?: string | null
          id?: number | null
          kind?: string | null
          list_id?: number | null
          listed_on?: string | null
          name?: string | null
          network?: string | null
          ref?: string | null
          source?: string | null
          tokens?: string[] | null
          wallet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_sanction_entries_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "compliance_sanction_lists"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accounting_close_month: {
        Args: { _month: string; _note?: string }
        Returns: Json
      }
      accounting_recon: { Args: { _order_id: string }; Returns: Json }
      accounting_reopen_month: {
        Args: { _month: string; _note: string }
        Returns: undefined
      }
      add_business_days: { Args: { _d: string; _n: number }; Returns: string }
      admin_accounting_ledger: {
        Args: {
          _from: string
          _limit?: number
          _offset?: number
          _only_check?: boolean
          _to: string
        }
        Returns: Json
      }
      admin_accounting_orders: {
        Args: { _from: string; _limit?: number; _offset?: number; _to: string }
        Returns: Json
      }
      admin_accounting_summary: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      admin_clients: {
        Args: never
        Returns: {
          account_type: string
          business_name: string
          business_status: string
          city: string
          closed_at: string
          completed: number
          country: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_staff: boolean
          kyc_status: string
          last_order_at: string
          last_sign_in_at: string
          orders: number
          origin_late: boolean
          phone: string
          region: string
          source: string
          volume_cad: number
        }[]
      }
      admin_customer_funnel: { Args: { _active_since: string }; Returns: Json }
      admin_order_daily: {
        Args: { _since: string; _statuses: string[] }
        Returns: Json
      }
      admin_order_totals: {
        Args: { _since: string; _split: string; _statuses: string[] }
        Returns: Json
      }
      admin_platform_health: {
        Args: never
        Returns: {
          active: boolean
          failures_24h: number
          jobname: string
          last_end: string
          last_message: string
          last_start: string
          last_status: string
          runs_24h: number
          schedule: string
        }[]
      }
      attach_chain_deposit: {
        Args: { _deposit: string; _order: string }
        Returns: undefined
      }
      campaign_results: { Args: { _id: string }; Returns: Json }
      notif_audience_count: { Args: { _aud: string }; Returns: Json }
      notif_stats: { Args: never; Returns: Json }
      push_clicked: { Args: { _id: string }; Returns: undefined }
      my_app_message: { Args: never; Returns: { id: string; title: string; body: string | null; cta: string | null; url: string | null }[] }
      app_message_event: { Args: { _id: string; _kind: string }; Returns: undefined }
      journey_preview: { Args: never; Returns: { kind: string; people: number }[] }
      campaign_summaries: { Args: never; Returns: { campaign_id: string; total: number; queued: number; sent: number; delivered: number; opened: number; clicked: number; blocked: number; skipped: number; failed: number }[] }
      campaign_prepare: {
        Args: { p_emails: string[] }
        Returns: {
          email: string
          token: string
          unsubscribed: boolean
        }[]
      }
      cancel_unsent_sell: { Args: { _order: string }; Returns: undefined }
      claim_payout_lock: {
        Args: {
          _holder: string
          _net: Database["public"]["Enums"]["usdt_network"]
          _seconds?: number
        }
        Returns: boolean
      }
      close_account: { Args: { _uid: string }; Returns: string }
      compliance_ops: {
        Args: never
        Returns: {
          cad: number
          id: string
          received_at: string
          side: string
          user_id: string
        }[]
      }
      compliance_register: {
        Args: { _from?: string; _kind: string; _to?: string }
        Returns: Json[]
      }
      compliance_register_client: {
        Args: { _kind: string; _user: string }
        Returns: Json[]
      }
      compliance_register_stats: { Args: never; Returns: Json }
      compliance_sanctions_fetch: { Args: never; Returns: undefined }
      compliance_sanctions_load: { Args: never; Returns: number }
      compliance_sanctions_screen: { Args: never; Returns: number }
      compliance_scan: { Args: never; Returns: number }
      compliance_scan_all: { Args: never; Returns: number }
      compliance_scan_behavior: { Args: never; Returns: number }
      declare_sell_sent: {
        Args: { _order: string; _tx?: string }
        Returns: undefined
      }
      email_domain_allowed: { Args: { _email: string }; Returns: boolean }
      fr_money: { Args: { _v: number }; Returns: string }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ignore_chain_deposit: {
        Args: { _deposit: string; _reason: string }
        Returns: undefined
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_trusted_writer: { Args: never; Returns: boolean }
      marketing_unsubscribe: {
        Args: { p_subscribe?: boolean; p_token: string }
        Returns: string
      }
      marketing_overview: { Args: { _since: string }; Returns: Json }
      match_sell_deposits: {
        Args: never
        Returns: {
          deposit_id: string
          order_id: string
        }[]
      }
      name_tokens: { Args: { t: string }; Returns: string[] }
      note_client_wallet: {
        Args: {
          _address: string
          _at?: string
          _family: string
          _kind: string
          _user: string
        }
        Returns: undefined
      }
      platform_launched: { Args: never; Returns: boolean }
      record_signup_origin: {
        Args: {
          _campaign: string
          _city: string
          _country: string
          _landing: string
          _medium: string
          _referrer: string
          _region: string
          _source: string
        }
        Returns: undefined
      }
      release_payout_lock: {
        Args: {
          _holder: string
          _net: Database["public"]["Enums"]["usdt_network"]
        }
        Returns: undefined
      }
      save_push_subscription: {
        Args: {
          _auth: string
          _endpoint: string
          _lang?: string
          _p256dh: string
        }
        Returns: undefined
      }
      set_client_daily_limit: {
        Args: { _limit: number; _uid: string }
        Returns: number
      }
      set_deposit_address: {
        Args: { _address: string; _family: string }
        Returns: undefined
      }
      set_my_lang: { Args: { p_lang: string }; Returns: undefined }
      tx_key: { Args: { _tx: string }; Returns: string }
      wallet_family: {
        Args: { _net: Database["public"]["Enums"]["usdt_network"] }
        Returns: string
      }
      wallet_format_ok: {
        Args: { _address: string; _family: string }
        Returns: boolean
      }
      wallet_owner: { Args: { _address: string }; Returns: string }
      wallet_sanctioned: { Args: { _address: string }; Returns: boolean }
    }
    Enums: {
      account_type: "individual" | "business"
      announcement_kind: "info" | "warning" | "critical"
      app_role:
        | "admin"
        | "operator"
        | "kyc_reviewer"
        | "support"
        | "marketing"
        | "compliance"
        | "accounting"
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
      treasury_address_purpose: "deposit" | "hot" | "cold" | "settlement"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_type: ["individual", "business"],
      announcement_kind: ["info", "warning", "critical"],
      app_role: [
        "admin",
        "operator",
        "kyc_reviewer",
        "support",
        "marketing",
        "compliance",
        "accounting",
      ],
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
      treasury_address_purpose: ["deposit", "hot", "cold", "settlement"],
      usdt_network: ["trc20", "bep20", "erc20", "polygon", "spl", "avalanche"],
    },
  },
} as const
