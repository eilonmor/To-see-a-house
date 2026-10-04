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
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          visit_day_id: string
          slot: string
          guest_phone_key: string
          guest_name: string
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
      create_agency: { Args: { p_name: string }; Returns: string }
      create_agency_invite: { Args: Record<PropertyKey, never>; Returns: string }
      accept_agency_invite: { Args: { p_code: string }; Returns: string }
      leave_agency: { Args: Record<PropertyKey, never>; Returns: undefined }
      remove_agent: { Args: { p_agent_id: string }; Returns: undefined }
    }
    Enums: {
      user_role: 'personal' | 'agent' | 'agency_admin'
      subscription_status: 'none' | 'active' | 'past_due' | 'canceled'
    }
    CompositeTypes: { [_ in never]: never }
  }
}
