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
          cplus_aov: number
          cplus_customers: number | null
          cplus_orders: number
          cplus_sales_jod: number
          created_at: string
          date: string
          id: string
          non_cplus_customers: number | null
          orders: number
          platform: Database["public"]["Enums"]["platform"]
          pro_orders: number
          pro_sales_jod: number
          sales_jod: number
          updated_at: string
        }
        Insert: {
          cplus_aov?: number
          cplus_customers?: number | null
          cplus_orders?: number
          cplus_sales_jod?: number
          created_at?: string
          date: string
          id?: string
          non_cplus_customers?: number | null
          orders?: number
          platform: Database["public"]["Enums"]["platform"]
          pro_orders?: number
          pro_sales_jod?: number
          sales_jod?: number
          updated_at?: string
        }
        Update: {
          cplus_aov?: number
          cplus_customers?: number | null
          cplus_orders?: number
          cplus_sales_jod?: number
          created_at?: string
          date?: string
          id?: string
          non_cplus_customers?: number | null
          orders?: number
          platform?: Database["public"]["Enums"]["platform"]
          pro_orders?: number
          pro_sales_jod?: number
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
      item_aliases: {
        Row: {
          canonical_name: string
          created_at: string | null
          id: string
          raw_name: string
        }
        Insert: {
          canonical_name: string
          created_at?: string | null
          id?: string
          raw_name: string
        }
        Update: {
          canonical_name?: string
          created_at?: string | null
          id?: string
          raw_name?: string
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
          note: string | null
        }
        Insert: {
          cost_exvat: number
          created_at?: string
          effective_from: string
          id?: string
          item_name: string
          note?: string | null
        }
        Update: {
          cost_exvat?: number
          created_at?: string
          effective_from?: string
          id?: string
          item_name?: string
          note?: string | null
        }
        Relationships: []
      }
      item_prices: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          item_name: string
          platform: string
          price_incl_vat: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          id?: string
          item_name: string
          platform: string
          price_incl_vat: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          item_name?: string
          platform?: string
          price_incl_vat?: number
          updated_at?: string
        }
        Relationships: []
      }
      monthly_adjustments: {
        Row: {
          amount: number
          comments: string | null
          created_at: string
          date: string
          deduction_type: string
          id: string
          month: string
          order_id: string
          platform: Database["public"]["Enums"]["platform"]
        }
        Insert: {
          amount?: number
          comments?: string | null
          created_at?: string
          date: string
          deduction_type: string
          id?: string
          month: string
          order_id?: string
          platform: Database["public"]["Enums"]["platform"]
        }
        Update: {
          amount?: number
          comments?: string | null
          created_at?: string
          date?: string
          deduction_type?: string
          id?: string
          month?: string
          order_id?: string
          platform?: Database["public"]["Enums"]["platform"]
        }
        Relationships: []
      }
      monthly_customers: {
        Row: {
          basis: string
          created_at: string
          id: string
          month: string
          new: number
          overall: number
          platform: string
          reactivated: number
          returning: number
          updated_at: string
        }
        Insert: {
          basis: string
          created_at?: string
          id?: string
          month: string
          new?: number
          overall?: number
          platform: string
          reactivated?: number
          returning?: number
          updated_at?: string
        }
        Update: {
          basis?: string
          created_at?: string
          id?: string
          month?: string
          new?: number
          overall?: number
          platform?: string
          reactivated?: number
          returning?: number
          updated_at?: string
        }
        Relationships: []
      }
      monthly_financials: {
        Row: {
          actual_payout: number
          cogs: number
          commission: number
          created_at: string
          discount: number
          gross_sales: number
          id: string
          month: string
          orders: number
          platform: Database["public"]["Enums"]["platform"]
          updated_at: string
        }
        Insert: {
          actual_payout: number
          cogs?: number
          commission?: number
          created_at?: string
          discount?: number
          gross_sales: number
          id?: string
          month: string
          orders?: number
          platform: Database["public"]["Enums"]["platform"]
          updated_at?: string
        }
        Update: {
          actual_payout?: number
          cogs?: number
          commission?: number
          created_at?: string
          discount?: number
          gross_sales?: number
          id?: string
          month?: string
          orders?: number
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
          revenue_jod: number
          units: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          month: string
          platform: Database["public"]["Enums"]["platform"]
          revenue_jod?: number
          units: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          month?: string
          platform?: Database["public"]["Enums"]["platform"]
          revenue_jod?: number
          units?: number
          updated_at?: string
        }
        Relationships: []
      }
      pace_daily: {
        Row: {
          created_at: string
          date: string
          id: string
          orders: number | null
          platform: Database["public"]["Enums"]["platform"]
          sales_jod: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          orders?: number | null
          platform: Database["public"]["Enums"]["platform"]
          sales_jod?: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          orders?: number | null
          platform?: Database["public"]["Enums"]["platform"]
          sales_jod?: number
        }
        Relationships: []
      }
      platform_orders: {
        Row: {
          commission: number
          created_at: string
          date: string
          discount: number
          gross: number
          id: string
          is_loyalty: boolean | null
          net_payout: number
          order_id: string
          ordered_at: string | null
          payment_fee: number
          payment_mode: string | null
          platform: Database["public"]["Enums"]["platform"]
          platform_fee: number
          status: string | null
          updated_at: string
        }
        Insert: {
          commission?: number
          created_at?: string
          date: string
          discount?: number
          gross?: number
          id?: string
          is_loyalty?: boolean | null
          net_payout?: number
          order_id: string
          ordered_at?: string | null
          payment_fee?: number
          payment_mode?: string | null
          platform: Database["public"]["Enums"]["platform"]
          platform_fee?: number
          status?: string | null
          updated_at?: string
        }
        Update: {
          commission?: number
          created_at?: string
          date?: string
          discount?: number
          gross?: number
          id?: string
          is_loyalty?: boolean | null
          net_payout?: number
          order_id?: string
          ordered_at?: string | null
          payment_fee?: number
          payment_mode?: string | null
          platform?: Database["public"]["Enums"]["platform"]
          platform_fee?: number
          status?: string | null
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
          orders_target: number | null
          platform: Database["public"]["Enums"]["platform"]
          sales_target_jod: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          month: string
          orders_target?: number | null
          platform: Database["public"]["Enums"]["platform"]
          sales_target_jod: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          month?: string
          orders_target?: number | null
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
