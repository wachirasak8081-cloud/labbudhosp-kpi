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
      audit_logs: {
        Row: {
          action: string
          id: string
          new_data: Json | null
          old_data: Json | null
          performed_at: string
          performed_by: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          performed_at?: string
          performed_by?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          performed_at?: string
          performed_by?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      corrective_actions: {
        Row: {
          action_plan: string
          created_at: string
          created_by: string | null
          due_date: string | null
          fiscal_year: number
          id: string
          indicator_id: string
          period_month: number | null
          problem_description: string
          responsible_person: string | null
          result_description: string | null
          root_cause: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action_plan: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          fiscal_year: number
          id?: string
          indicator_id: string
          period_month?: number | null
          problem_description: string
          responsible_person?: string | null
          result_description?: string | null
          root_cause?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_plan?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          fiscal_year?: number
          id?: string
          indicator_id?: string
          period_month?: number | null
          problem_description?: string
          responsible_person?: string | null
          result_description?: string | null
          root_cause?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "corrective_actions_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_th: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_th: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_th?: string
        }
        Relationships: []
      }
      indicators: {
        Row: {
          assigned_user_id: string | null
          code: string
          created_at: string
          denominator_description: string | null
          department_id: string | null
          formula_description: string | null
          formula_link: string | null
          frequency: string | null
          id: string
          is_active: boolean
          is_inverted: boolean
          is_leaf: boolean
          level: string
          name_th: string
          numerator_description: string | null
          parent_id: string | null
          sort_order: number
          target_condition: string | null
          target_value: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          code: string
          created_at?: string
          denominator_description?: string | null
          department_id?: string | null
          formula_description?: string | null
          formula_link?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean
          is_inverted?: boolean
          is_leaf?: boolean
          level: string
          name_th: string
          numerator_description?: string | null
          parent_id?: string | null
          sort_order?: number
          target_condition?: string | null
          target_value?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          code?: string
          created_at?: string
          denominator_description?: string | null
          department_id?: string | null
          formula_description?: string | null
          formula_link?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean
          is_inverted?: boolean
          is_leaf?: boolean
          level?: string
          name_th?: string
          numerator_description?: string | null
          parent_id?: string | null
          sort_order?: number
          target_condition?: string | null
          target_value?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicators_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicators_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      measurements: {
        Row: {
          approved_by: string | null
          calculated_value: number | null
          denominator: number | null
          entered_at: string
          entered_by: string | null
          fiscal_year: number
          id: string
          indicator_id: string
          note: string | null
          numerator: number | null
          period_month: number | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          calculated_value?: number | null
          denominator?: number | null
          entered_at?: string
          entered_by?: string | null
          fiscal_year: number
          id?: string
          indicator_id: string
          note?: string | null
          numerator?: number | null
          period_month?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          calculated_value?: number | null
          denominator?: number | null
          entered_at?: string
          entered_by?: string | null
          fiscal_year?: number
          id?: string
          indicator_id?: string
          note?: string | null
          numerator?: number | null
          period_month?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurements_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          department_id: string | null
          full_name: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      target_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          fiscal_year: number
          id: string
          indicator_id: string
          new_target: number
          old_target: number | null
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          fiscal_year: number
          id?: string
          indicator_id: string
          new_target: number
          old_target?: number | null
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          fiscal_year?: number
          id?: string
          indicator_id?: string
          new_target?: number
          old_target?: number | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "target_history_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicators"
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
      cascade_recompute_ancestors: {
        Args: {
          _child_indicator_id: string
          _fiscal_year: number
          _period_month: number
        }
        Returns: undefined
      }
      recompute_parent_measurement: {
        Args: {
          _fiscal_year: number
          _parent_id: string
          _period_month: number
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff" | "auditor"
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
      app_role: ["admin", "manager", "staff", "auditor"],
    },
  },
} as const
