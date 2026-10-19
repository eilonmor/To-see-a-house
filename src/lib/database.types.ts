// Types for the Supabase schema in supabase/migrations, in the format the
// Supabase CLI generates. After changing the schema, regenerate with:
//
//   npx supabase gen types typescript --project-id <project-ref> > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Relationship<FK extends string, Column extends string, Target extends string> = {
  foreignKeyName: FK
  columns: [Column]
  isOneToOne: false
  referencedRelation: Target
  referencedColumns: ['id']
}

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          subscription_status: Database['public']['Enums']['subscription_status']
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          subscription_status?: Database['public']['Enums']['subscription_status']
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          role: Database['public']['Enums']['user_role']
          full_name: string
          phone: string
          org_id: string | null
          subscription_status: Database['public']['Enums']['subscription_status']
          last_property_created_at: string | null
          created_at: string
        }
        Insert: {
          id: string
          role?: Database['public']['Enums']['user_role']
          full_name?: string
          phone?: string
          org_id?: string | null
          subscription_status?: Database['public']['Enums']['subscription_status']
          last_property_created_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: [Relationship<'profiles_org_id_fkey', 'org_id', 'organizations'>]
      }
      properties: {
        Row: {
          id: string
          owner_user_id: string | null
          owner_org_id: string | null
          title: string
          address: string
          instructions: string
          public_slug: string
          created_at: string
        }
        Insert: {
          id?: string
          owner_user_id?: string | null
          owner_org_id?: string | null
          title: string
          address?: string
          instructions?: string
          public_slug?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['properties']['Insert']>
        Relationships: [
          Relationship<'properties_owner_user_id_fkey', 'owner_user_id', 'profiles'>,
          Relationship<'properties_owner_org_id_fkey', 'owner_org_id', 'organizations'>,
        ]
      }
      property_agents: {
        Row: {
          property_id: string
          agent_id: string
          created_at: string
        }
        Insert: {
          property_id: string
          agent_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['property_agents']['Insert']>
        Relationships: [
          Relationship<'property_agents_property_id_fkey', 'property_id', 'properties'>,
          Relationship<'property_agents_agent_id_fkey', 'agent_id', 'profiles'>,
        ]
      }
      visit_days: {
        Row: {
          id: string
          property_id: string
          date: string
          start_time: string
          end_time: string
          slot_minutes: number
          created_at: string
        }
        Insert: {
          id?: string
          property_id: string
          date: string
          start_time: string
          end_time: string
          slot_minutes: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['visit_days']['Insert']>
        Relationships: [Relationship<'visit_days_property_id_fkey', 'property_id', 'properties'>]
      }
      guests: {
        Row: {
          phone_key: string
          name: string
          verified_at: string | null
          created_at: string
        }
        Insert: {
          phone_key: string
          name?: string
          verified_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['guests']['Insert']>
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          visit_day_id: string
          slot: string
          guest_phone_key: string
          guest_name: string
          host_note: string
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          visit_day_id: string
          slot: string
          guest_phone_key: string
          guest_name: string
          host_note?: string
          created_at?: string
          updated_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>
        Relationships: [
          Relationship<'bookings_visit_day_id_fkey', 'visit_day_id', 'visit_days'>,
          {
            foreignKeyName: 'bookings_guest_phone_key_fkey'
            columns: ['guest_phone_key']
            isOneToOne: false
            referencedRelation: 'guests'
            referencedColumns: ['phone_key']
          },
        ]
      }
      agency_invites: {
        Row: {
          code: string
          org_id: string
          created_by: string
          expires_at: string
          used_by: string | null
          used_at: string | null
          created_at: string
        }
        Insert: {
          code: string
          org_id: string
          created_by: string
          expires_at?: string
          used_by?: string | null
          used_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['agency_invites']['Insert']>
        Relationships: [
          Relationship<'agency_invites_org_id_fkey', 'org_id', 'organizations'>,
          Relationship<'agency_invites_created_by_fkey', 'created_by', 'profiles'>,
          Relationship<'agency_invites_used_by_fkey', 'used_by', 'profiles'>,
        ]
      }
      otp_requests: {
        Row: {
          id: string
          phone_key: string
          code_hash: string
          expires_at: string
          attempts: number
          ip: unknown
          created_at: string
        }
        Insert: {
          id?: string
          phone_key: string
          code_hash: string
          expires_at: string
          attempts?: number
          ip?: unknown
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['otp_requests']['Insert']>
        Relationships: []
      }
      calendar_feeds: {
        Row: {
          user_id: string
          token: string
          created_at: string
        }
        Insert: {
          user_id: string
          token: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['calendar_feeds']['Insert']>
        Relationships: [Relationship<'calendar_feeds_user_id_fkey', 'user_id', 'profiles'>]
      }
      // plans, subscriptions and payments (…_payments.sql) were added by hand
      // in the generator's format; regenerating replaces them. The browser may
      // select only some columns of subscriptions and payments (column grants):
      // see src/lib/billingStore.ts.
      plans: {
        Row: {
          code: string
          audience: string
          period: string
          price: number
          list_price: number
          discount_percent: number
          agent_seats: number | null
          name_he: string
          name_en: string
          active: boolean
        }
        Insert: {
          code: string
          audience: string
          period: string
          price: number
          list_price: number
          discount_percent?: number
          agent_seats?: number | null
          name_he: string
          name_en: string
          active?: boolean
        }
        Update: Partial<Database['public']['Tables']['plans']['Insert']>
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string | null
          org_id: string | null
          plan_code: string
          price: number
          period: string
          status: Database['public']['Enums']['subscription_status']
          current_period_start: string
          current_period_end: string
          cancel_at_period_end: boolean
          failed_renewals: number
          next_plan_code: string | null
          ended_reason: string | null
          created_at: string
          canceled_at: string | null
          cardcom_token: string | null
          cardcom_token_card_year: number | null
          cardcom_token_card_month: number | null
          cardcom_token_approval_number: string | null
          cardcom_token_card_owner_identity_number: string | null
          cardcom_token_expires_on: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          org_id?: string | null
          plan_code: string
          price: number
          period: string
          status?: Database['public']['Enums']['subscription_status']
          current_period_start: string
          current_period_end: string
          cancel_at_period_end?: boolean
          failed_renewals?: number
          next_plan_code?: string | null
          ended_reason?: string | null
          created_at?: string
          canceled_at?: string | null
          cardcom_token?: string | null
          cardcom_token_card_year?: number | null
          cardcom_token_card_month?: number | null
          cardcom_token_approval_number?: string | null
          cardcom_token_card_owner_identity_number?: string | null
          cardcom_token_expires_on?: string | null
        }
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>
        Relationships: [
          Relationship<'subscriptions_user_id_fkey', 'user_id', 'profiles'>,
          Relationship<'subscriptions_org_id_fkey', 'org_id', 'organizations'>,
        ]
      }
      payments: {
        Row: {
          id: string
          subscription_id: string | null
          user_id: string | null
          org_id: string | null
          bought_by: string | null
          plan_code: string
          amount: number
          kind: string
          status: string
          created_at: string
          paid_at: string | null
          cardcom_low_profile_id: string | null
          cardcom_operation: string | null
          cardcom_tranzaction_id: number | null
          cardcom_response_code: number | null
          cardcom_description: string | null
          cardcom_document_type: string | null
          cardcom_document_number: number | null
          refund_reason: string | null
          refunded_at: string | null
        }
        Insert: {
          id?: string
          subscription_id?: string | null
          user_id?: string | null
          org_id?: string | null
          bought_by?: string | null
          plan_code: string
          amount: number
          kind: string
          status?: string
          created_at?: string
          paid_at?: string | null
          cardcom_low_profile_id?: string | null
          cardcom_operation?: string | null
          cardcom_tranzaction_id?: number | null
          cardcom_response_code?: number | null
          cardcom_description?: string | null
          cardcom_document_type?: string | null
          cardcom_document_number?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
        Relationships: [
          Relationship<'payments_subscription_id_fkey', 'subscription_id', 'subscriptions'>,
          Relationship<'payments_user_id_fkey', 'user_id', 'profiles'>,
          Relationship<'payments_org_id_fkey', 'org_id', 'organizations'>,
          Relationship<'payments_bought_by_fkey', 'bought_by', 'profiles'>,
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      get_public_property: { Args: { p_slug: string }; Returns: Json }
      find_guest_bookings: { Args: { p_slug: string; p_phone: string }; Returns: Json }
      book_guest_slot: {
        Args: { p_day_id: string; p_slot: string; p_name: string; p_phone: string }
        Returns: Json
      }
      cancel_guest_booking: { Args: { p_day_id: string; p_phone: string }; Returns: undefined }
      reschedule_guest_booking: {
        Args: { p_from_day_id: string; p_to_day_id: string; p_slot: string; p_name: string; p_phone: string }
        Returns: Json
      }
      create_agency_invite: { Args: Record<PropertyKey, never>; Returns: string }
      preview_agency_invite: { Args: { p_code: string }; Returns: string }
      accept_agency_invite: { Args: { p_code: string }; Returns: string }
      agency_members: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          role: Database['public']['Enums']['user_role']
          full_name: string
          phone: string
          email: string
        }[]
      }
      create_agency_property: { Args: { p_title: string; p_address: string }; Returns: string }
      transfer_property_to_agency: { Args: { p_property_id: string }; Returns: undefined }
      leave_agency: { Args: Record<PropertyKey, never>; Returns: undefined }
      remove_agent: { Args: { p_agent_id: string }; Returns: undefined }
      become_agent: { Args: Record<PropertyKey, never>; Returns: undefined }
      delete_account_data: { Args: { p_user_id: string }; Returns: undefined }
      create_calendar_feed: { Args: Record<PropertyKey, never>; Returns: string }
      calendar_feed_events: { Args: { p_token: string }; Returns: Json }
      plan_change_quote: {
        Args: { p_plan: string }
        Returns: { subscription_id: string; change: string; amount: number; new_org_id: string | null }[]
      }
      schedule_plan_change: { Args: { p_plan: string }; Returns: undefined }
      set_subscription_renewal: { Args: { p_subscription_id: string; p_renew: boolean }; Returns: undefined }
    }
    Enums: {
      user_role: 'personal' | 'agent' | 'agency_admin'
      subscription_status: 'none' | 'active' | 'past_due' | 'canceled'
    }
    CompositeTypes: { [_ in never]: never }
  }
}
