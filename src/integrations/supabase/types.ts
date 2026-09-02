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
      grn_approval_log: {
        Row: {
          action: string
          created_at: string | null
          grn_id: string | null
          id: string
          notes: string | null
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          grn_id?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          grn_id?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_approval_log_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      import_mapping_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mapping: Json
          name: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mapping: Json
          name: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mapping?: Json
          name?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_number: string
          cost_price: number
          created_at: string
          expiry_date: string
          id: string
          landed_cost: number | null
          mfg_date: string | null
          notes: string | null
          purchase_invoice_id: string | null
          product_id: string
          received_at: string
          received_by: string | null
          received_qty: number
          remaining_qty: number
          updated_at: string
        }
        Insert: {
          batch_number: string
          cost_price?: number
          created_at?: string
          expiry_date: string
          id?: string
          landed_cost?: number | null
          mfg_date?: string | null
          notes?: string | null
          purchase_invoice_id?: string | null
          product_id: string
          received_at?: string
          received_by?: string | null
          received_qty: number
          remaining_qty: number
          updated_at?: string
        }
        Update: {
          batch_number?: string
          cost_price?: number
          created_at?: string
          expiry_date?: string
          id?: string
          landed_cost?: number | null
          mfg_date?: string | null
          notes?: string | null
          purchase_invoice_id?: string | null
          product_id?: string
          received_at?: string
          received_by?: string | null
          received_qty?: number
          remaining_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          created_at: string
          id: string
          invoice_date: string
          invoice_number: string
          status: string | null
          supplier_name: string | null
          total_amount: number
          total_freight: number | null
          total_handling: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_number: string
          status?: string | null
          supplier_name?: string | null
          total_amount?: number
          total_freight?: number | null
          total_handling?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          status?: string | null
          supplier_name?: string | null
          total_amount?: number
          total_freight?: number | null
          total_handling?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          gst_total: number
          id: string
          invoice_number: string
          order_id: string
          shop_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          subtotal: number
          total: number
          type: Database["public"]["Enums"]["invoice_type"]
          is_void: boolean
          sub_total?: number
          tax_amount?: number
          discount_amount?: number
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          gst_total: number
          id?: string
          invoice_number: string
          order_id: string
          shop_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          subtotal: number
          total: number
          type: Database["public"]["Enums"]["invoice_type"]
          is_void?: boolean
          sub_total?: number
          tax_amount?: number
          discount_amount?: number
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          gst_total?: number
          id?: string
          invoice_number?: string
          order_id?: string
          shop_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          subtotal?: number
          total?: number
          type?: Database["public"]["Enums"]["invoice_type"]
          is_void?: boolean
          sub_total?: number
          tax_amount?: number
          discount_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string | null
          read: boolean
          related_invoice_id: string | null
          related_order_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          related_invoice_id?: string | null
          related_order_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          related_invoice_id?: string | null
          related_order_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_batch_deductions: {
        Row: {
          batch_id: string
          created_at: string | null
          id: string
          order_id: string
          order_item_id: string
          qty_base_units: number
        }
        Insert: {
          batch_id: string
          created_at?: string | null
          id?: string
          order_id: string
          order_item_id: string
          qty_base_units: number
        }
        Update: {
          batch_id?: string
          created_at?: string | null
          id?: string
          order_id?: string
          order_item_id?: string
          qty_base_units?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_batch_deductions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_batch_deductions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_batch_deductions_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          gst_rate: number
          id: string
          line_total: number
          order_id: string
          pack_type: Database["public"]["Enums"]["pack_type"]
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          gst_rate?: number
          id?: string
          line_total: number
          order_id: string
          pack_type: Database["public"]["Enums"]["pack_type"]
          product_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          gst_rate?: number
          id?: string
          line_total?: number
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          delivered_at: string | null
          delivery_note: string | null
          dispatched_at: string | null
          gst_total: number
          id: string
          notes: string | null
          order_number: string
          salesperson_id: string
          shop_id: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          cancel_reason: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_note?: string | null
          dispatched_at?: string | null
          gst_total?: number
          id?: string
          notes?: string | null
          order_number: string
          salesperson_id: string
          shop_id: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          cancel_reason?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_note?: string | null
          dispatched_at?: string | null
          gst_total?: number
          id?: string
          notes?: string | null
          order_number?: string
          salesperson_id?: string
          shop_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          cancel_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_at: string
          received_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          received_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          received_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          base_unit: string | null
          base_weight_unit: string | null
          brand: string | null
          case_qty_unit: string | null
          case_qty_value: number | null
          case_type: string | null
          cgst_rate: number | null
          chain_mrp_label: string | null
          company_id: string | null
          cost_price: number | null
          created_at: string
          display_weight_unit: string | null
          division: string | null
          division_category: string | null
          external_item_code: string | null
          gst_rate: number | null
          hsn: string | null
          id: string
          igst_rate: number | null
          is_active: boolean
          is_chain_item: boolean | null
          is_mrp_priced: boolean | null
          item_pack_type: string | null
          min_stock: number
          mrp: number
          name: string
          pack_size_unit: string | null
          pack_size_value: number | null
          packets_per_case: number
          preferred_sell_unit: string | null
          selling_price: number | null
          sgst_rate: number | null
          sku: string
          sub_category: string | null
          target_margin_basic: number | null
          target_margin_special: number | null
          target_margin_wholesale: number | null
          unit: string
          unit_type: string | null
          units_per_case: number
          units_per_packet: number
          updated_at: string
          weight_per_unit_grams: number | null
        }
        Insert: {
          barcode?: string | null
          base_unit?: string | null
          base_weight_unit?: string | null
          brand?: string | null
          case_qty_unit?: string | null
          case_qty_value?: number | null
          case_type?: string | null
          cgst_rate?: number | null
          chain_mrp_label?: string | null
          company_id?: string | null
          cost_price?: number | null
          created_at?: string
          display_weight_unit?: string | null
          division?: string | null
          division_category?: string | null
          external_item_code?: string | null
          gst_rate?: number | null
          hsn?: string | null
          id?: string
          igst_rate?: number | null
          is_active?: boolean
          is_chain_item?: boolean | null
          is_mrp_priced?: boolean | null
          item_pack_type?: string | null
          min_stock?: number
          mrp?: number
          name: string
          pack_size_unit?: string | null
          pack_size_value?: number | null
          packets_per_case?: number
          preferred_sell_unit?: string | null
          selling_price?: number | null
          sgst_rate?: number | null
          sku: string
          sub_category?: string | null
          target_margin_basic?: number | null
          target_margin_special?: number | null
          target_margin_wholesale?: number | null
          unit?: string
          unit_type?: string | null
          units_per_case?: number
          units_per_packet?: number
          updated_at?: string
          weight_per_unit_grams?: number | null
        }
        Update: {
          barcode?: string | null
          base_unit?: string | null
          base_weight_unit?: string | null
          brand?: string | null
          case_qty_unit?: string | null
          case_qty_value?: number | null
          case_type?: string | null
          cgst_rate?: number | null
          chain_mrp_label?: string | null
          company_id?: string | null
          cost_price?: number | null
          created_at?: string
          display_weight_unit?: string | null
          division?: string | null
          division_category?: string | null
          external_item_code?: string | null
          gst_rate?: number | null
          hsn?: string | null
          id?: string
          igst_rate?: number | null
          is_active?: boolean
          is_chain_item?: boolean | null
          is_mrp_priced?: boolean | null
          item_pack_type?: string | null
          min_stock?: number
          mrp?: number
          name?: string
          pack_size_unit?: string | null
          pack_size_value?: number | null
          packets_per_case?: number
          preferred_sell_unit?: string | null
          selling_price?: number | null
          sgst_rate?: number | null
          sku?: string
          sub_category?: string | null
          target_margin_basic?: number | null
          target_margin_special?: number | null
          target_margin_wholesale?: number | null
          unit?: string
          unit_type?: string | null
          units_per_case?: number
          units_per_packet?: number
          updated_at?: string
          weight_per_unit_grams?: number | null
        }
        Relationships: []
      }
      product_price_tiers: {
        Row: {
          created_at: string
          id: string
          pack_type: Database["public"]["Enums"]["pack_type"]
          price: number
          product_id: string
          shop_type: Database["public"]["Enums"]["shop_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          pack_type?: Database["public"]["Enums"]["pack_type"]
          price?: number
          product_id: string
          shop_type?: Database["public"]["Enums"]["shop_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          pack_type?: Database["public"]["Enums"]["pack_type"]
          price?: number
          product_id?: string
          shop_type?: Database["public"]["Enums"]["shop_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_price_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      shops: {
        Row: {
          address: string | null
          beat_route_id: string | null
          created_at: string
          created_by: string | null
          credit_limit: number
          discount_pct: number
          gstin: string | null
          id: string
          is_active: boolean
          name: string
          owner_name: string | null
          phone: string | null
          shop_type: Database["public"]["Enums"]["shop_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          beat_route_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          discount_pct?: number
          gstin?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_name?: string | null
          phone?: string | null
          shop_type?: Database["public"]["Enums"]["shop_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          beat_route_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          discount_pct?: number
          gstin?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_name?: string | null
          phone?: string | null
          shop_type?: Database["public"]["Enums"]["shop_type"]
          updated_at?: string
        }
        Relationships: []
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
      purchase_invoice_items: {
        Row: {
          created_at: string
          expiry_date: string | null
          id: string
          mfg_date: string | null
          pack_type: string | null
          packets_per_case: number | null
          product_id: string
          purchase_invoice_id: string
          quantity: number
          unit_cost: number
          units_per_packet: number | null
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          mfg_date?: string | null
          pack_type?: string | null
          packets_per_case?: number | null
          product_id: string
          purchase_invoice_id: string
          quantity: number
          unit_cost: number
          units_per_packet?: number | null
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          mfg_date?: string | null
          pack_type?: string | null
          packets_per_case?: number | null
          product_id?: string
          purchase_invoice_id?: string
          quantity?: number
          unit_cost?: number
          units_per_packet?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_product_price_overrides: {
        Row: {
          created_at: string
          id: string
          pack_type: Database["public"]["Enums"]["pack_type"]
          price: number
          product_id: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          pack_type: Database["public"]["Enums"]["pack_type"]
          price: number
          product_id: string
          shop_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          pack_type?: Database["public"]["Enums"]["pack_type"]
          price?: number
          product_id?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_product_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_product_price_overrides_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          field_changed: string
          id: string
          new_value: number | null
          old_value: number | null
          product_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          field_changed: string
          id?: string
          new_value?: number | null
          old_value?: number | null
          product_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          field_changed?: string
          id?: string
          new_value?: number | null
          old_value?: number | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
      import_inventory_batches: {
        Args: { _purchase_invoice_id?: string | null; _rows: Json }
        Returns: number
      }
      is_admin_or_owner: { Args: { _user_id: string }; Returns: boolean }
      notify_admins: {
        Args: {
          _invoice_id: string
          _link: string
          _message: string
          _order_id: string
          _title: string
          _type: string
        }
        Returns: undefined
      }
      recompute_inventory: { Args: { _product_id: string }; Returns: undefined }
      recompute_invoice_payment: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "salesperson"
      invoice_type: "gst" | "cash"
      order_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "rejected"
        | "dispatched"
        | "delivered"
        | "cancelled"
      pack_type:
        | "unit"
        | "packet"
        | "case"
        | "pouch"
        | "box"
        | "jar"
        | "bottle"
        | "tin"
        | "can"
        | "acb"
        | "sachet"
        | "kg"
      shop_type:
        | "premium"
        | "gold"
        | "silver"
        | "bronze"
        | "basic"
      payment_method:
        | "cash"
        | "upi"
        | "cheque"
        | "bank_transfer"
        | "card"
        | "other"
      payment_status: "unpaid" | "partial" | "paid"
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
      app_role: ["owner", "admin", "salesperson"],
      invoice_type: ["gst", "cash"],
      order_status: [
        "draft",
        "pending_approval",
        "approved",
        "rejected",
        "dispatched",
        "delivered",
        "cancelled",
      ],
      payment_method: [
        "cash",
        "upi",
        "cheque",
        "bank_transfer",
        "card",
        "other",
      ],
      payment_status: ["unpaid", "partial", "paid"],
      shop_type: ["premium", "gold", "silver", "bronze", "basic"],
      pack_type: ["unit", "packet", "case", "kg"],
    },
  },
} as const
