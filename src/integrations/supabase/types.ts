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
      daily_sales: {
        Row: {
          created_at: string
          date: string
          id: string
          orders: number
          platform: Database["public"]["Enums"]["platform"]
          sales_jod: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          orders: number
          platform: Database["public"]["Enums"]["platform"]
          sales_jod: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          orders?: number
          platform?: Database["public"]["Enums"]["platform"]
          sales_jod?: number
          updated_at?: string
        }
        Relationships: []
      }
      import_log: {
        Row: {
          error_message: string | null
          file_name: string
          id: string
          imported_at: string
          platform: string
          report_type: string
          rows_imported: number
          status: string
        }
        Insert: {
          error_message?: string | null
          file_name: string
          id?: string
          imported_at?: string
          platform: string
          report_type: string
          rows_imported?: number
          status?: string
        }
        Update: {
          error_message?: string | null
          file_name?: string
          id?: string
          imported_at?: string
          platform?: string
          report_type?: string
          rows_imported?: number
          status?: string
        }
        Relationships: []
      }
      item_costs: {
        Row: {
          cost_exvat: number
          created_at: string
          effective_from: string
          id: string
          item_name: string
        }
        Insert: {
          cost_exvat: number
          created_at?: string
          effective_from: string
          id?: string
          item_name: string
        }
        Update: {
          cost_exvat?: number
          created_at?: string
          effective_from?: string
          id?: string
          item_name?: string
        }
        Relationships: []
      }
      monthly_financials: {
        Row: {
          actual_payout: number
          cogs: number
          created_at: string
          gross_sales: number
          id: string
          month: string
          platform: Database["public"]["Enums"]["platform"]
          updated_at: string
        }
        Insert: {
          actual_payout: number
          cogs: number
          created_at?: string
          gross_sales: number
          id?: string
          month: string
          platform: Database["public"]["Enums"]["platform"]
          updated_at?: string
        }
        Update: {
          actual_payout?: number
          cogs?: number
          created_at?: string
          gross_sales?: number
          id?: string
          month?: string
          platform?: Database["public"]["Enums"]["platform"]
          updated_at?: string
        }
        Relationships: []
      }
      monthly_item_sales: {
        Row: {
          created_at: string
          id: string
          item_name: string
          month: string
          platform: Database["public"]["Enums"]["platform"]
          units: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          month: string
          platform: Database["public"]["Enums"]["platform"]
          units: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          month?: string
          platform?: Database["public"]["Enums"]["platform"]
          units?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      targets: {
        Row: {
          created_at: string
          id: string
          month: string
          orders_target: number
          platform: Database["public"]["Enums"]["platform"]
          sales_target_jod: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          month: string
          orders_target: number
          platform: Database["public"]["Enums"]["platform"]
          sales_target_jod: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          month?: string
          orders_target?: number
          platform?: Database["public"]["Enums"]["platform"]
          sales_target_jod?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      platform: "Talabat" | "Careem"
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
      platform: ["Talabat", "Careem"],
    },
  },
} as const
