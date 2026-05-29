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
          address_type: string
          alternate_phone: string | null
          city: string
          country: string
          created_at: string
          delivery_notes: string | null
          full_name: string
          id: string
          is_default_billing: boolean
          is_default_shipping: boolean
          label: string | null
          landmark: string | null
          last_used_at: string | null
          latitude: number | null
          line1: string
          line2: string | null
          longitude: number | null
          nickname: string | null
          phone: string | null
          postal: string
          state: string | null
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          address_type?: string
          alternate_phone?: string | null
          city: string
          country: string
          created_at?: string
          delivery_notes?: string | null
          full_name: string
          id?: string
          is_default_billing?: boolean
          is_default_shipping?: boolean
          label?: string | null
          landmark?: string | null
          last_used_at?: string | null
          latitude?: number | null
          line1: string
          line2?: string | null
          longitude?: number | null
          nickname?: string | null
          phone?: string | null
          postal: string
          state?: string | null
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          address_type?: string
          alternate_phone?: string | null
          city?: string
          country?: string
          created_at?: string
          delivery_notes?: string | null
          full_name?: string
          id?: string
          is_default_billing?: boolean
          is_default_shipping?: boolean
          label?: string | null
          landmark?: string | null
          last_used_at?: string | null
          latitude?: number | null
          line1?: string
          line2?: string | null
          longitude?: number | null
          nickname?: string | null
          phone?: string | null
          postal?: string
          state?: string | null
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      admin_activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          metadata?: Json
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          event: string
          id: number
          metadata: Json | null
          path: string | null
          product_slug: string | null
          referrer: string | null
          session_id: string | null
          user_id: string | null
          value: number | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: number
          metadata?: Json | null
          path?: string | null
          product_slug?: string | null
          referrer?: string | null
          session_id?: string | null
          user_id?: string | null
          value?: number | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: number
          metadata?: Json | null
          path?: string | null
          product_slug?: string | null
          referrer?: string | null
          session_id?: string | null
          user_id?: string | null
          value?: number | null
        }
        Relationships: []
      }
      banners: {
        Row: {
          active: boolean
          created_at: string
          cta_text: string | null
          draft_data: Json | null
          ends_at: string | null
          has_draft: boolean
          height_px: number | null
          id: string
          image: string | null
          last_published_at: string | null
          link: string | null
          sort_order: number
          starts_at: string | null
          subtitle: string | null
          title: string
          type: string
          updated_at: string
          width_px: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          cta_text?: string | null
          draft_data?: Json | null
          ends_at?: string | null
          has_draft?: boolean
          height_px?: number | null
          id?: string
          image?: string | null
          last_published_at?: string | null
          link?: string | null
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title: string
          type?: string
          updated_at?: string
          width_px?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          cta_text?: string | null
          draft_data?: Json | null
          ends_at?: string | null
          has_draft?: boolean
          height_px?: number | null
          id?: string
          image?: string | null
          last_published_at?: string | null
          link?: string | null
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title?: string
          type?: string
          updated_at?: string
          width_px?: number | null
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
          abandoned_cart_sent_at: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          abandoned_cart_sent_at?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          abandoned_cart_sent_at?: string | null
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
      cms_pages: {
        Row: {
          body: string
          created_at: string
          draft_data: Json | null
          has_draft: boolean
          id: string
          last_published_at: string | null
          meta_description: string | null
          meta_title: string | null
          published: boolean
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          draft_data?: Json | null
          has_draft?: boolean
          id?: string
          last_published_at?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published?: boolean
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          draft_data?: Json | null
          has_draft?: boolean
          id?: string
          last_published_at?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published?: boolean
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cms_posts: {
        Row: {
          author: string | null
          body: string
          cover_image: string | null
          created_at: string
          draft_data: Json | null
          excerpt: string | null
          has_draft: boolean
          id: string
          last_published_at: string | null
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          body?: string
          cover_image?: string | null
          created_at?: string
          draft_data?: Json | null
          excerpt?: string | null
          has_draft?: boolean
          id?: string
          last_published_at?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          body?: string
          cover_image?: string | null
          created_at?: string
          draft_data?: Json | null
          excerpt?: string | null
          has_draft?: boolean
          id?: string
          last_published_at?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_notes: {
        Row: {
          author_id: string | null
          created_at: string
          customer_id: string
          id: string
          note: string
          pinned: boolean
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          note: string
          pinned?: boolean
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          note?: string
          pinned?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      customer_tags: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          tag: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          tag: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          tag?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          payload: Json | null
          provider: string
          provider_message_id: string | null
          recipient: string
          related_order_id: string | null
          status: string
          subject: string | null
          template: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          provider?: string
          provider_message_id?: string | null
          recipient: string
          related_order_id?: string | null
          status?: string
          subject?: string | null
          template: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          provider?: string
          provider_message_id?: string | null
          recipient?: string
          related_order_id?: string | null
          status?: string
          subject?: string | null
          template?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_preferences: {
        Row: {
          abandoned_cart: boolean
          created_at: string
          marketing: boolean
          order_updates: boolean
          payment_updates: boolean
          product_news: boolean
          push_order_updates: boolean
          push_payment_updates: boolean
          push_security_updates: boolean
          return_updates: boolean
          security_updates: boolean
          shipping_updates: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          abandoned_cart?: boolean
          created_at?: string
          marketing?: boolean
          order_updates?: boolean
          payment_updates?: boolean
          product_news?: boolean
          push_order_updates?: boolean
          push_payment_updates?: boolean
          push_security_updates?: boolean
          return_updates?: boolean
          security_updates?: boolean
          shipping_updates?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          abandoned_cart?: boolean
          created_at?: string
          marketing?: boolean
          order_updates?: boolean
          payment_updates?: boolean
          product_news?: boolean
          push_order_updates?: boolean
          push_payment_updates?: boolean
          push_security_updates?: boolean
          return_updates?: boolean
          security_updates?: boolean
          shipping_updates?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      flash_sales: {
        Row: {
          active: boolean
          created_at: string
          discount_percent: number
          ends_at: string | null
          id: string
          name: string
          product_slugs: string[]
          starts_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          discount_percent?: number
          ends_at?: string | null
          id?: string
          name: string
          product_slugs?: string[]
          starts_at?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          discount_percent?: number
          ends_at?: string | null
          id?: string
          name?: string
          product_slugs?: string[]
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbox_placement_tests: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          gmail_address: string | null
          gmail_checked_at: string | null
          gmail_message_id: string | null
          gmail_placement: string | null
          id: string
          outlook_address: string | null
          outlook_checked_at: string | null
          outlook_message_id: string | null
          outlook_placement: string | null
          status: string
          subject: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          gmail_address?: string | null
          gmail_checked_at?: string | null
          gmail_message_id?: string | null
          gmail_placement?: string | null
          id?: string
          outlook_address?: string | null
          outlook_checked_at?: string | null
          outlook_message_id?: string | null
          outlook_placement?: string | null
          status?: string
          subject: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          gmail_address?: string | null
          gmail_checked_at?: string | null
          gmail_message_id?: string | null
          gmail_placement?: string | null
          id?: string
          outlook_address?: string | null
          outlook_checked_at?: string | null
          outlook_message_id?: string | null
          outlook_placement?: string | null
          status?: string
          subject?: string
          token?: string
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
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
          expires_at: string | null
          fulfillment_status: string
          id: string
          market_region: string | null
          payment_method: string | null
          payment_provider: string | null
          payment_status: string
          promo_code: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          shipping: number
          shipping_address: Json | null
          status: string
          stock_state: string
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
          expires_at?: string | null
          fulfillment_status?: string
          id?: string
          market_region?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          payment_status?: string
          promo_code?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          shipping?: number
          shipping_address?: Json | null
          status?: string
          stock_state?: string
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
          expires_at?: string | null
          fulfillment_status?: string
          id?: string
          market_region?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          payment_status?: string
          promo_code?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          shipping?: number
          shipping_address?: Json | null
          status?: string
          stock_state?: string
          subtotal?: number
          tax?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      page_views: {
        Row: {
          country: string | null
          created_at: string
          device: string | null
          id: number
          path: string
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          device?: string | null
          id?: number
          path: string
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          device?: string | null
          id?: number
          path?: string
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          demo: boolean
          fee: number
          gateway_tax: number
          id: string
          meta: Json | null
          method: string
          order_id: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          signature: string | null
          status: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          demo?: boolean
          fee?: number
          gateway_tax?: number
          id?: string
          meta?: Json | null
          method: string
          order_id: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          signature?: string | null
          status: string
          transaction_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          demo?: boolean
          fee?: number
          gateway_tax?: number
          id?: string
          meta?: Json | null
          method?: string
          order_id?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          signature?: string | null
          status?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: []
      }
      personalized_feed_cache: {
        Row: {
          payload: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          payload?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          payload?: Json
          updated_at?: string
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
          compare_price_inr: number | null
          compare_price_usd: number | null
          cost: number
          created_at: string
          description: string | null
          discount: number | null
          featured: boolean
          id: string
          image: string | null
          in_stock: boolean
          india_visible: boolean
          international_visible: boolean
          low_stock_threshold: number
          name: string
          price: number
          price_inr: number | null
          price_usd: number | null
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
          views_count: number
        }
        Insert: {
          category: string
          compare_price_inr?: number | null
          compare_price_usd?: number | null
          cost?: number
          created_at?: string
          description?: string | null
          discount?: number | null
          featured?: boolean
          id?: string
          image?: string | null
          in_stock?: boolean
          india_visible?: boolean
          international_visible?: boolean
          low_stock_threshold?: number
          name: string
          price?: number
          price_inr?: number | null
          price_usd?: number | null
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
          views_count?: number
        }
        Update: {
          category?: string
          compare_price_inr?: number | null
          compare_price_usd?: number | null
          cost?: number
          created_at?: string
          description?: string | null
          discount?: number | null
          featured?: boolean
          id?: string
          image?: string | null
          in_stock?: boolean
          india_visible?: boolean
          international_visible?: boolean
          low_stock_threshold?: number
          name?: string
          price?: number
          price_inr?: number | null
          price_usd?: number | null
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
          views_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          alt_phone: string | null
          avatar_url: string | null
          birth_date: string | null
          country: string | null
          country_code: string | null
          created_at: string
          full_name: string | null
          gender: string | null
          id: string
          language: string | null
          market_region: string | null
          phone: string | null
          region_locked_at: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          alt_phone?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          full_name?: string | null
          gender?: string | null
          id: string
          language?: string | null
          market_region?: string | null
          phone?: string | null
          region_locked_at?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          alt_phone?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          full_name?: string | null
          gender?: string | null
          id?: string
          language?: string | null
          market_region?: string | null
          phone?: string | null
          region_locked_at?: string | null
          timezone?: string | null
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
      razorpay_customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          phone: string | null
          razorpay_customer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          razorpay_customer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          razorpay_customer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recommendation_events: {
        Row: {
          category: string | null
          created_at: string
          event_type: string
          id: number
          product_slug: string | null
          query: string | null
          session_id: string | null
          user_id: string | null
          weight: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          event_type: string
          id?: number
          product_slug?: string | null
          query?: string | null
          session_id?: string | null
          user_id?: string | null
          weight?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          event_type?: string
          id?: number
          product_slug?: string | null
          query?: string | null
          session_id?: string | null
          user_id?: string | null
          weight?: number
        }
        Relationships: []
      }
      recommendation_scores: {
        Row: {
          product_slug: string
          reason: string | null
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          product_slug: string
          reason?: string | null
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          product_slug?: string
          reason?: string | null
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          notes: Json | null
          order_id: string
          payment_id: string | null
          razorpay_payment_id: string | null
          razorpay_refund_id: string | null
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: Json | null
          order_id: string
          payment_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: Json | null
          order_id?: string
          payment_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
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
      role_change_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          reason: string | null
          role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: number
          reason?: string | null
          role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: number
          reason?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          target_user_id?: string
        }
        Relationships: []
      }
      saved_payment_methods: {
        Row: {
          brand: string | null
          created_at: string
          expiry_month: number | null
          expiry_year: number | null
          id: string
          is_default: boolean
          last4: string | null
          payment_type: string
          provider: string
          razorpay_customer_id: string
          razorpay_token_id: string
          updated_at: string
          upi_vpa: string | null
          user_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          expiry_month?: number | null
          expiry_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          payment_type?: string
          provider?: string
          razorpay_customer_id: string
          razorpay_token_id: string
          updated_at?: string
          upi_vpa?: string | null
          user_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          expiry_month?: number | null
          expiry_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          payment_type?: string
          provider?: string
          razorpay_customer_id?: string
          razorpay_token_id?: string
          updated_at?: string
          upi_vpa?: string | null
          user_id?: string
        }
        Relationships: []
      }
      search_logs: {
        Row: {
          clicked_product_slug: string | null
          created_at: string
          id: number
          query: string
          results_count: number
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          clicked_product_slug?: string | null
          created_at?: string
          id?: number
          query: string
          results_count?: number
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          clicked_product_slug?: string | null
          created_at?: string
          id?: number
          query?: string
          results_count?: number
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
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
      store_settings: {
        Row: {
          cod_enabled: boolean
          id: boolean
          prepaid_discount_percent: number
          updated_at: string
        }
        Insert: {
          cod_enabled?: boolean
          id?: boolean
          prepaid_discount_percent?: number
          updated_at?: string
        }
        Update: {
          cod_enabled?: boolean
          id?: boolean
          prepaid_discount_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      super_admin_bootstrap: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      support_canned_replies: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_internal_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_internal_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          id: string
          sender_id: string
          sender_role: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          created_at?: string
          id?: string
          sender_id: string
          sender_role?: string
          ticket_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          sender_role?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_reads: {
        Row: {
          id: string
          last_read_at: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_reads_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          id: string
          last_message_at: string
          market_region: string | null
          order_id: string | null
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          id?: string
          last_message_at?: string
          market_region?: string | null
          order_id?: string | null
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          id?: string
          last_message_at?: string
          market_region?: string | null
          order_id?: string | null
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tokenization_logs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          metadata: Json
          payment_type: string | null
          razorpay_customer_id: string | null
          razorpay_token_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json
          payment_type?: string | null
          razorpay_customer_id?: string | null
          razorpay_token_id?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json
          payment_type?: string | null
          razorpay_customer_id?: string | null
          razorpay_token_id?: string | null
          status?: string
          user_id?: string | null
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
      visitor_sessions: {
        Row: {
          country: string | null
          device: string | null
          landing_path: string | null
          last_seen: string
          page_views: number
          referrer: string | null
          session_id: string
          started_at: string
          user_id: string | null
        }
        Insert: {
          country?: string | null
          device?: string | null
          landing_path?: string | null
          last_seen?: string
          page_views?: number
          referrer?: string | null
          session_id: string
          started_at?: string
          user_id?: string | null
        }
        Update: {
          country?: string | null
          device?: string | null
          landing_path?: string | null
          last_seen?: string
          page_views?: number
          referrer?: string | null
          session_id?: string
          started_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          error: string | null
          event: string
          id: string
          payload: Json | null
          processed_at: string | null
          provider: string
          signature_valid: boolean
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          provider?: string
          signature_valid?: boolean
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event?: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          provider?: string
          signature_valid?: boolean
          status?: string
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
      frequently_bought_together: {
        Row: {
          co_count: number | null
          slug_a: string | null
          slug_b: string | null
        }
        Relationships: []
      }
      trending_products: {
        Row: {
          atc_7d: number | null
          product_slug: string | null
          purchases_7d: number | null
          trend_score: number | null
          views_7d: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      commit_order_stock: { Args: { _order_id: string }; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_status: { Args: never; Returns: Json }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_stale_orders: { Args: never; Returns: number }
      get_fbt: {
        Args: { _limit?: number; _slug: string }
        Returns: {
          co_count: number
          product_slug: string
        }[]
      }
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
      is_super_admin: { Args: { _user_id?: string }; Returns: boolean }
      manage_user_role: {
        Args: {
          _grant: boolean
          _reason?: string
          _role: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
        }
        Returns: undefined
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      notify_roles: {
        Args: {
          _body: string
          _data: Json
          _link: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _title: string
          _type: string
        }
        Returns: undefined
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      refresh_product_rating: { Args: { _slug: string }; Returns: undefined }
      release_order_stock: {
        Args: { _order_id: string; _reason?: string }
        Returns: undefined
      }
      reserve_order_stock: {
        Args: { _order_id: string; _ttl_minutes?: number }
        Returns: undefined
      }
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
          compare_price_inr: number | null
          compare_price_usd: number | null
          cost: number
          created_at: string
          description: string | null
          discount: number | null
          featured: boolean
          id: string
          image: string | null
          in_stock: boolean
          india_visible: boolean
          international_visible: boolean
          low_stock_threshold: number
          name: string
          price: number
          price_inr: number | null
          price_usd: number | null
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
          views_count: number
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      support_admin_unread_count: { Args: never; Returns: number }
      support_unread_count: { Args: never; Returns: number }
    }
    Enums: {
      app_role:
        | "admin"
        | "customer"
        | "manager"
        | "support"
        | "fulfillment"
        | "super_admin"
        | "warehouse_staff"
        | "editor"
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
      app_role: [
        "admin",
        "customer",
        "manager",
        "support",
        "fulfillment",
        "super_admin",
        "warehouse_staff",
        "editor",
      ],
    },
  },
} as const
