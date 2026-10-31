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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          role: string
          thread_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parts?: Json
          role: string
          thread_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          thread_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clinical_sync_receipts: {
        Row: {
          created_at: string
          op_id: string
          result: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          op_id: string
          result: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          op_id?: string
          result?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      medication_register: {
        Row: {
          changed_at: number
          created_at: string
          data: Json
          deleted_at: string | null
          id: string
          patient_id: string | null
          sync_seq: number | null
          updated_by: string | null
          version: number
        }
        Insert: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Update: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id?: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      patient_admissions: {
        Row: {
          changed_at: number
          created_at: string
          data: Json
          deleted_at: string | null
          id: string
          patient_id: string | null
          sync_seq: number | null
          updated_by: string | null
          version: number
        }
        Insert: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Update: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id?: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      patient_care_plans: {
        Row: {
          changed_at: number
          created_at: string
          data: Json
          deleted_at: string | null
          id: string
          patient_id: string | null
          sync_seq: number | null
          updated_by: string | null
          version: number
        }
        Insert: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Update: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id?: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      patient_documents: {
        Row: {
          back_path: string | null
          created_at: string
          file_no: string
          front_path: string | null
          updated_at: string
        }
        Insert: {
          back_path?: string | null
          created_at?: string
          file_no: string
          front_path?: string | null
          updated_at?: string
        }
        Update: {
          back_path?: string | null
          created_at?: string
          file_no?: string
          front_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      patient_nurse_notes: {
        Row: {
          changed_at: number
          created_at: string
          data: Json
          deleted_at: string | null
          id: string
          patient_id: string | null
          sync_seq: number | null
          updated_by: string | null
          version: number
        }
        Insert: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Update: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id?: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      patient_rounds: {
        Row: {
          changed_at: number
          created_at: string
          data: Json
          deleted_at: string | null
          id: string
          patient_id: string | null
          sync_seq: number | null
          updated_by: string | null
          version: number
        }
        Insert: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Update: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id?: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      patient_sbar: {
        Row: {
          changed_at: number
          created_at: string
          data: Json
          deleted_at: string | null
          id: string
          patient_id: string | null
          sync_seq: number | null
          updated_by: string | null
          version: number
        }
        Insert: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Update: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id?: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      patient_tranquilizer_events: {
        Row: {
          changed_at: number
          created_at: string
          data: Json
          deleted_at: string | null
          id: string
          patient_id: string | null
          sync_seq: number | null
          updated_by: string | null
          version: number
        }
        Insert: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Update: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id?: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      patient_vitals: {
        Row: {
          changed_at: number
          created_at: string
          data: Json
          deleted_at: string | null
          id: string
          patient_id: string | null
          sync_seq: number | null
          updated_by: string | null
          version: number
        }
        Insert: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Update: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id?: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      patients: {
        Row: {
          age: string
          bed: string
          changed_at: number
          cid: string
          created_at: number
          deleted_at: string | null
          diagnosis: string
          discharge_note: string | null
          discharged_at: string | null
          doa: string
          dob: string
          doctor: string
          file_no: string
          folder_no: string
          id: string
          marital_status: string
          name: string
          nationality: string
          notes: string
          room: string
          sex: string
          unit: string
          sync_seq: number | null
          updated_at: number
          updated_by: string | null
          version: number
        }
        Insert: {
          age?: string
          bed?: string
          changed_at?: number
          cid?: string
          created_at?: number
          deleted_at?: string | null
          diagnosis?: string
          discharge_note?: string | null
          discharged_at?: string | null
          doa?: string
          dob?: string
          doctor?: string
          file_no: string
          folder_no?: string
          id?: string
          marital_status?: string
          name?: string
          nationality?: string
          notes?: string
          room?: string
          sex?: string
          unit?: string
          sync_seq?: number | null
          updated_at?: number
          updated_by?: string | null
          version?: number
        }
        Update: {
          age?: string
          bed?: string
          changed_at?: number
          cid?: string
          created_at?: number
          deleted_at?: string | null
          diagnosis?: string
          discharge_note?: string | null
          discharged_at?: string | null
          doa?: string
          dob?: string
          doctor?: string
          file_no?: string
          folder_no?: string
          id?: string
          marital_status?: string
          name?: string
          nationality?: string
          notes?: string
          room?: string
          sex?: string
          unit?: string
          sync_seq?: number | null
          updated_at?: number
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved: boolean
          created_at: string
          display_name: string
          id: string
          login_name: string
          updated_at: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          display_name?: string
          id: string
          login_name: string
          updated_at?: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          display_name?: string
          id?: string
          login_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_assignments: {
        Row: {
          changed_at: number
          created_at: string
          data: Json
          deleted_at: string | null
          id: string
          patient_id: string | null
          sync_seq: number | null
          updated_by: string | null
          version: number
        }
        Insert: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Update: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id?: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      sync_history: {
        Row: {
          created_at: string
          discarded: Json | null
          field: string
          id: string
          kept: Json | null
          op_id: string | null
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          discarded?: Json | null
          field: string
          id?: string
          kept?: Json | null
          op_id?: string | null
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          discarded?: Json | null
          field?: string
          id?: string
          kept?: Json | null
          op_id?: string | null
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      ward_shift_settings: {
        Row: {
          changed_at: number
          created_at: string
          data: Json
          deleted_at: string | null
          id: string
          patient_id: string | null
          sync_seq: number | null
          updated_by: string | null
          version: number
        }
        Insert: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Update: {
          changed_at?: number
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id?: string
          patient_id?: string | null
          sync_seq?: number | null
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_clinical_edit: {
        Args: {
          p_base_version: number
          p_changed_at: number
          p_fields: Json
          p_id: string
          p_op: string
          p_op_id: string
          p_patient_id?: string
          p_table: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
