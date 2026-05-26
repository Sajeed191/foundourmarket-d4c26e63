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
      addresses: {
        Row: {
          city: string
          country: string
          created_at: string
          full_name: string
          id: string
          is_default_billing: boolean
          is_default_shipping: boolean
          label: string | null
          line1: string
          line2: string | null
          phone: string | null
          postal: string
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          country: string
          created_at?: string
          full_name: string
          id?: string
          is_default_billing?: boolean
          is_default_shipping?: boolean
          label?: string | null
          line1: string
          line2?: string | null
          phone?: string | null
          postal: string
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          full_name?: string
          id?: string
          is_default_billing?: boolean
          is_default_shipping?: boolean
          label?: string | null
          line1?: string
          line2?: string | null
          phone?: string | null
          postal?: string
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          product_slug: string
          quantity: number
          saved_for_later: boolean
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          product_slug: string
          quantity?: number
          saved_for_later?: boolean
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          product_slug?: string
          quantity?: number
          saved_for_later?: boolean
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image: string | null
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_logs: {
        Row: {
          actor_id: string | null
          change: number
          created_at: string
          id: string
          notes: string | null
          product_slug: string
          reason: string
          reference_id: string | null
          reference_type: string | null
          variant_id: string | null
        }
        Insert: {
          actor_id?: string | null
          change: number
          created_at?: string
          id?: string
          notes?: string | null
          product_slug: string
          reason: string
          reference_id?: string | null
          reference_type?: string | null
          variant_id?: string | null
        }
        Update: {
          actor_id?: string | null
          change?: number
          created_at?: string
          id?: string
          notes?: string | null
          product_slug?: string
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
          variant_id?: string | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          image: string | null
          line_total: number
          name: string
          order_id: string
          product_slug: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          image?: string | null
          line_total: number
          name: string
          order_id: string
          product_slug: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          image?: string | null
          line_total?: number
          name?: string
          order_id?: string
          product_slug?: string
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
        ]
      }
      orders: {
        Row: {
          carrier: string | null
          contact_email: string | null
          created_at: string
          currency: string
          discount: number
          fulfillment_status: string
          id: string
          payment_method: string | null
          payment_status: string
          promo_code: string | null
          shipping: number
          shipping_address: Json | null
          status: string
          subtotal: number
          tax: number
          total: number
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          carrier?: string | null
          contact_email?: string | null
          created_at?: string
          currency?: string
          discount?: number
          fulfillment_status?: string
          id?: string
          payment_method?: string | null
          payment_status?: string
          promo_code?: string | null
          shipping?: number
          shipping_address?: Json | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          carrier?: string | null
          contact_email?: string | null
          created_at?: string
          currency?: string
          discount?: number
          fulfillment_status?: string
          id?: string
          payment_method?: string | null
          payment_status?: string
          promo_code?: string | null
          shipping?: number
          shipping_address?: Json | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          demo: boolean
          id: string
          meta: Json | null
          method: string
          order_id: string
          status: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          demo?: boolean
          id?: string
          meta?: Json | null
          method: string
          order_id: string
          status: string
          transaction_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          demo?: boolean
          id?: string
          meta?: Json | null
          method?: string
          order_id?: string
          status?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          alt: string | null
          created_at: string
          id: string
          product_slug: string
          sort_order: number
          url: string
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          product_slug: string
          sort_order?: number
          url: string
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          product_slug?: string
          sort_order?: number
          url?: string
        }
        Relationships: []
      }
      product_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          created_at: string
          id: string
          product_slug: string
          question: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          id?: string
          product_slug: string
          question: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          id?: string
          product_slug?: string
          question?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_reviews: {
        Row: {
          body: string | null
          created_at: string
          id: string
          product_slug: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          product_slug: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          product_slug?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          name: string
          price_override: number | null
          product_slug: string
          sku: string | null
          sort_order: number
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          price_override?: number | null
          product_slug: string
          sku?: string | null
          sort_order?: number
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          price_override?: number | null
          product_slug?: string
          sku?: string | null
          sort_order?: number
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string
          created_at: string
          description: string | null
          discount: number | null
          featured: boolean
          id: string
          image: string | null
          in_stock: boolean
          low_stock_threshold: number
          name: string
          price: number
          rating: number
          reserved_quantity: number
          reviews: number
          search_vector: unknown
          sku: string | null
          slug: string
          sort_order: number
          stock_quantity: number
          tagline: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          discount?: number | null
          featured?: boolean
          id?: string
          image?: string | null
          in_stock?: boolean
          low_stock_threshold?: number
          name: string
          price?: number
          rating?: number
          reserved_quantity?: number
          reviews?: number
          search_vector?: unknown
          sku?: string | null
          slug: string
          sort_order?: number
          stock_quantity?: number
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          discount?: number | null
          featured?: boolean
          id?: string
          image?: string | null
          in_stock?: boolean
          low_stock_threshold?: number
          name?: string
          price?: number
          rating?: number
          reserved_quantity?: number
          reviews?: number
          search_vector?: unknown
          sku?: string | null
          slug?: string
          sort_order?: number
          stock_quantity?: number
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          max_uses: number | null
          min_subtotal: number
          updated_at: string
          uses: number
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          max_uses?: number | null
          min_subtotal?: number
          updated_at?: string
          uses?: number
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          max_uses?: number | null
          min_subtotal?: number
          updated_at?: string
          uses?: number
          value?: number
        }
        Relationships: []
      }
      return_items: {
        Row: {
          created_at: string
          id: string
          order_item_id: string
          product_slug: string
          quantity: number
          reason: string | null
          return_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_item_id: string
          product_slug: string
          quantity: number
          reason?: string | null
          return_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_item_id?: string
          product_slug?: string
          quantity?: number
          reason?: string | null
          return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string
          reason: string
          refund_amount: number
          refund_status: string
          resolved_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          reason: string
          refund_amount?: number
          refund_status?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          reason?: string
          refund_amount?: number
          refund_status?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_events: {
        Row: {
          created_at: string
          description: string | null
          id: string
          location: string | null
          occurred_at: string
          shipment_id: string
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          occurred_at?: string
          shipment_id: string
          status: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          occurred_at?: string
          shipment_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string | null
          created_at: string
          delivered_at: string | null
          id: string
          notes: string | null
          order_id: string
          shipped_at: string | null
          status: string
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_zones: {
        Row: {
          active: boolean
          base_rate: number
          countries: string[]
          created_at: string
          estimated_days_max: number
          estimated_days_min: number
          free_threshold: number | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_rate?: number
          countries?: string[]
          created_at?: string
          estimated_days_max?: number
          estimated_days_min?: number
          free_threshold?: number | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_rate?: number
          countries?: string[]
          created_at?: string
          estimated_days_max?: number
          estimated_days_min?: number
          free_threshold?: number | null
          id?: string
          name?: string
          sort_order?: number
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
      wishlist: {
        Row: {
          created_at: string
          id: string
          product_slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_slug?: string
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
      refresh_product_rating: { Args: { _slug: string }; Returns: undefined }
      search_products: {
        Args: {
          category_filter?: string
          max_price?: number
          min_price?: number
          min_rating?: number
          page_limit?: number
          page_offset?: number
          q?: string
          sort_by?: string
        }
        Returns: {
          category: string
          created_at: string
          description: string | null
          discount: number | null
          featured: boolean
          id: string
          image: string | null
          in_stock: boolean
          low_stock_threshold: number
          name: string
          price: number
          rating: number
          reserved_quantity: number
          reviews: number
          search_vector: unknown
          sku: string | null
          slug: string
          sort_order: number
          stock_quantity: number
          tagline: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      app_role: "admin" | "customer"
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
      app_role: ["admin", "customer"],
    },
  },
} as const
