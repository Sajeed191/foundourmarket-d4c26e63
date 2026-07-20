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
      account_locks: {
        Row: {
          created_at: string
          id: string
          locked: boolean
          locked_by: string | null
          reason: string | null
          severity: string
          unlocked_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          locked?: boolean
          locked_by?: string | null
          reason?: string | null
          severity?: string
          unlocked_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          locked?: boolean
          locked_by?: string | null
          reason?: string | null
          severity?: string
          unlocked_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      admin_notification_prefs: {
        Row: {
          categories: Json
          created_at: string
          email_critical: boolean
          mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          categories?: Json
          created_at?: string
          email_critical?: boolean
          mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          categories?: Json
          created_at?: string
          email_critical?: boolean
          mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_recommendation_feedback: {
        Row: {
          created_at: string
          id: string
          rec_key: string
          user_id: string
          vote: string
        }
        Insert: {
          created_at?: string
          id?: string
          rec_key: string
          user_id: string
          vote: string
        }
        Update: {
          created_at?: string
          id?: string
          rec_key?: string
          user_id?: string
          vote?: string
        }
        Relationships: []
      }
      ai_recommendations: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          action_kind: string | null
          affected_systems: string[]
          assigned_to: string | null
          category: string
          confidence: number
          conversion_impact: number | null
          created_at: string
          created_by: string | null
          customer_impact: number | null
          deep_link: string | null
          executed_at: string | null
          id: string
          impact: number
          inventory_impact: number | null
          outcome: string | null
          outcome_value: number | null
          payload: Json
          priority: string
          profit_impact: number | null
          reasoning: string | null
          rec_key: string
          revenue_impact: number | null
          snooze_until: string | null
          source_timestamp: string | null
          status: string
          success_score: number | null
          title: string
          updated_at: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          action_kind?: string | null
          affected_systems?: string[]
          assigned_to?: string | null
          category?: string
          confidence?: number
          conversion_impact?: number | null
          created_at?: string
          created_by?: string | null
          customer_impact?: number | null
          deep_link?: string | null
          executed_at?: string | null
          id?: string
          impact?: number
          inventory_impact?: number | null
          outcome?: string | null
          outcome_value?: number | null
          payload?: Json
          priority?: string
          profit_impact?: number | null
          reasoning?: string | null
          rec_key: string
          revenue_impact?: number | null
          snooze_until?: string | null
          source_timestamp?: string | null
          status?: string
          success_score?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          action_kind?: string | null
          affected_systems?: string[]
          assigned_to?: string | null
          category?: string
          confidence?: number
          conversion_impact?: number | null
          created_at?: string
          created_by?: string | null
          customer_impact?: number | null
          deep_link?: string | null
          executed_at?: string | null
          id?: string
          impact?: number
          inventory_impact?: number | null
          outcome?: string | null
          outcome_value?: number | null
          payload?: Json
          priority?: string
          profit_impact?: number | null
          reasoning?: string | null
          rec_key?: string
          revenue_impact?: number | null
          snooze_until?: string | null
          source_timestamp?: string | null
          status?: string
          success_score?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          event: string
          id: number
          is_seeded: boolean
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
          is_seeded?: boolean
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
          is_seeded?: boolean
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
      announcements: {
        Row: {
          active: boolean
          countdown_to: string | null
          created_at: string
          cta_text: string | null
          ends_at: string | null
          icon: string
          id: string
          link: string | null
          message: string
          pages: string[]
          region: string
          sort_order: number
          starts_at: string | null
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          countdown_to?: string | null
          created_at?: string
          cta_text?: string | null
          ends_at?: string | null
          icon?: string
          id?: string
          link?: string | null
          message: string
          pages?: string[]
          region?: string
          sort_order?: number
          starts_at?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          countdown_to?: string | null
          created_at?: string
          cta_text?: string | null
          ends_at?: string | null
          icon?: string
          id?: string
          link?: string | null
          message?: string
          pages?: string[]
          region?: string
          sort_order?: number
          starts_at?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      attribution_touches: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: number
          landing_path: string | null
          referrer: string | null
          session_id: string
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: never
          landing_path?: string | null
          referrer?: string | null
          session_id: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: never
          landing_path?: string | null
          referrer?: string | null
          session_id?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attribution_touches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_executions: {
        Row: {
          action_taken: string | null
          actor_id: string | null
          automation_id: string | null
          blocked: boolean
          campaign_id: string | null
          created_at: string
          details: Json
          duration_ms: number
          error: string | null
          failed_permanently: boolean
          id: string
          matched_count: number
          retry_count: number
          run_id: string
          status: string
          summary: string | null
          trigger_key: string
          triggered_by: string
        }
        Insert: {
          action_taken?: string | null
          actor_id?: string | null
          automation_id?: string | null
          blocked?: boolean
          campaign_id?: string | null
          created_at?: string
          details?: Json
          duration_ms?: number
          error?: string | null
          failed_permanently?: boolean
          id?: string
          matched_count?: number
          retry_count?: number
          run_id: string
          status?: string
          summary?: string | null
          trigger_key: string
          triggered_by?: string
        }
        Update: {
          action_taken?: string | null
          actor_id?: string | null
          automation_id?: string | null
          blocked?: boolean
          campaign_id?: string | null
          created_at?: string
          details?: Json
          duration_ms?: number
          error?: string | null
          failed_permanently?: boolean
          id?: string
          matched_count?: number
          retry_count?: number
          run_id?: string
          status?: string
          summary?: string | null
          trigger_key?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_executions_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "marketing_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_settings: {
        Row: {
          emergency_stop: boolean
          global_pause: boolean
          id: boolean
          maintenance_mode: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          emergency_stop?: boolean
          global_pause?: boolean
          id?: boolean
          maintenance_mode?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          emergency_stop?: boolean
          global_pause?: boolean
          id?: boolean
          maintenance_mode?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      badge_events: {
        Row: {
          badge_type_id: string
          created_at: string
          event_type: string
          id: string
          product_slug: string
        }
        Insert: {
          badge_type_id: string
          created_at?: string
          event_type?: string
          id?: string
          product_slug: string
        }
        Update: {
          badge_type_id?: string
          created_at?: string
          event_type?: string
          id?: string
          product_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "badge_events_badge_type_id_fkey"
            columns: ["badge_type_id"]
            isOneToOne: false
            referencedRelation: "badge_types"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_settings: {
        Row: {
          bestseller_enabled: boolean
          bestseller_sales_min: number
          fast_selling_enabled: boolean
          fast_selling_per_day_min: number
          hot_deal_discount_min: number
          hot_deal_enabled: boolean
          id: boolean
          limited_stock_enabled: boolean
          limited_stock_max: number
          max_badges: number
          new_arrival_days: number
          new_arrival_enabled: boolean
          trending_enabled: boolean
          trending_views_min: number
          trending_wishlist_min: number
          updated_at: string
        }
        Insert: {
          bestseller_enabled?: boolean
          bestseller_sales_min?: number
          fast_selling_enabled?: boolean
          fast_selling_per_day_min?: number
          hot_deal_discount_min?: number
          hot_deal_enabled?: boolean
          id?: boolean
          limited_stock_enabled?: boolean
          limited_stock_max?: number
          max_badges?: number
          new_arrival_days?: number
          new_arrival_enabled?: boolean
          trending_enabled?: boolean
          trending_views_min?: number
          trending_wishlist_min?: number
          updated_at?: string
        }
        Update: {
          bestseller_enabled?: boolean
          bestseller_sales_min?: number
          fast_selling_enabled?: boolean
          fast_selling_per_day_min?: number
          hot_deal_discount_min?: number
          hot_deal_enabled?: boolean
          id?: boolean
          limited_stock_enabled?: boolean
          limited_stock_max?: number
          max_badges?: number
          new_arrival_days?: number
          new_arrival_enabled?: boolean
          trending_enabled?: boolean
          trending_views_min?: number
          trending_wishlist_min?: number
          updated_at?: string
        }
        Relationships: []
      }
      badge_types: {
        Row: {
          animation: string
          archived: boolean
          auto_rule: Json | null
          background_color: string
          badge_key: string
          border_color: string
          category: string
          color: string
          created_at: string
          description: string
          emoji: string
          enabled: boolean
          end_at: string | null
          font_size: number
          font_weight: number
          glow_color: string
          icon_color: string
          id: string
          is_discount: boolean
          label: string
          priority: number
          radius: number
          shadow_strength: number
          start_at: string | null
          subtitle: string | null
          text_color: string
          updated_at: string
        }
        Insert: {
          animation?: string
          archived?: boolean
          auto_rule?: Json | null
          background_color?: string
          badge_key: string
          border_color?: string
          category?: string
          color?: string
          created_at?: string
          description?: string
          emoji?: string
          enabled?: boolean
          end_at?: string | null
          font_size?: number
          font_weight?: number
          glow_color?: string
          icon_color?: string
          id?: string
          is_discount?: boolean
          label: string
          priority?: number
          radius?: number
          shadow_strength?: number
          start_at?: string | null
          subtitle?: string | null
          text_color?: string
          updated_at?: string
        }
        Update: {
          animation?: string
          archived?: boolean
          auto_rule?: Json | null
          background_color?: string
          badge_key?: string
          border_color?: string
          category?: string
          color?: string
          created_at?: string
          description?: string
          emoji?: string
          enabled?: boolean
          end_at?: string | null
          font_size?: number
          font_weight?: number
          glow_color?: string
          icon_color?: string
          id?: string
          is_discount?: boolean
          label?: string
          priority?: number
          radius?: number
          shadow_strength?: number
          start_at?: string | null
          subtitle?: string | null
          text_color?: string
          updated_at?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          active: boolean
          clicks: number
          countdown_to: string | null
          created_at: string
          cta_text: string | null
          draft_data: Json | null
          ends_at: string | null
          has_draft: boolean
          height_px: number | null
          id: string
          image: string | null
          impressions: number
          last_published_at: string | null
          link: string | null
          mobile_image: string | null
          overlay_opacity: number
          pages: string[]
          region: string
          sort_order: number
          starts_at: string | null
          status: string
          subtitle: string | null
          text_align: string
          title: string
          type: string
          updated_at: string
          video_url: string | null
          width_px: number | null
        }
        Insert: {
          active?: boolean
          clicks?: number
          countdown_to?: string | null
          created_at?: string
          cta_text?: string | null
          draft_data?: Json | null
          ends_at?: string | null
          has_draft?: boolean
          height_px?: number | null
          id?: string
          image?: string | null
          impressions?: number
          last_published_at?: string | null
          link?: string | null
          mobile_image?: string | null
          overlay_opacity?: number
          pages?: string[]
          region?: string
          sort_order?: number
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          text_align?: string
          title: string
          type?: string
          updated_at?: string
          video_url?: string | null
          width_px?: number | null
        }
        Update: {
          active?: boolean
          clicks?: number
          countdown_to?: string | null
          created_at?: string
          cta_text?: string | null
          draft_data?: Json | null
          ends_at?: string | null
          has_draft?: boolean
          height_px?: number | null
          id?: string
          image?: string | null
          impressions?: number
          last_published_at?: string | null
          link?: string | null
          mobile_image?: string | null
          overlay_opacity?: number
          pages?: string[]
          region?: string
          sort_order?: number
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          text_align?: string
          title?: string
          type?: string
          updated_at?: string
          video_url?: string | null
          width_px?: number | null
        }
        Relationships: []
      }
      campaign_events: {
        Row: {
          campaign_id: string | null
          created_at: string
          event_type: string
          id: number
          ip_hash: string | null
          link_id: string | null
          message_id: string | null
          recipient_email: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
          utm: Json
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          event_type: string
          id?: never
          ip_hash?: string | null
          link_id?: string | null
          message_id?: string | null
          recipient_email?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm?: Json
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          event_type?: string
          id?: never
          ip_hash?: string | null
          link_id?: string | null
          message_id?: string | null
          recipient_email?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm?: Json
        }
        Relationships: [
          {
            foreignKeyName: "campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "campaign_links"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_links: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          label: string | null
          target_url: string
          token: string
          utm: Json
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          label?: string | null
          target_url: string
          token: string
          utm?: Json
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          label?: string | null
          target_url?: string
          token?: string
          utm?: Json
        }
        Relationships: [
          {
            foreignKeyName: "campaign_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants_public"
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
          banner_image: string | null
          clicks: number
          created_at: string
          description: string | null
          featured: boolean
          free_shipping: boolean
          homepage_visible: boolean
          icon: string | null
          id: string
          image: string | null
          mobile_image: string | null
          name: string
          parent_id: string | null
          region: string
          seo_description: string | null
          seo_title: string | null
          shipping_fee_inr: number | null
          shipping_fee_usd: number | null
          slug: string
          sort_order: number
          status: string
          trending: boolean
          updated_at: string
          views: number
        }
        Insert: {
          banner_image?: string | null
          clicks?: number
          created_at?: string
          description?: string | null
          featured?: boolean
          free_shipping?: boolean
          homepage_visible?: boolean
          icon?: string | null
          id?: string
          image?: string | null
          mobile_image?: string | null
          name: string
          parent_id?: string | null
          region?: string
          seo_description?: string | null
          seo_title?: string | null
          shipping_fee_inr?: number | null
          shipping_fee_usd?: number | null
          slug: string
          sort_order?: number
          status?: string
          trending?: boolean
          updated_at?: string
          views?: number
        }
        Update: {
          banner_image?: string | null
          clicks?: number
          created_at?: string
          description?: string | null
          featured?: boolean
          free_shipping?: boolean
          homepage_visible?: boolean
          icon?: string | null
          id?: string
          image?: string | null
          mobile_image?: string | null
          name?: string
          parent_id?: string | null
          region?: string
          seo_description?: string | null
          seo_title?: string | null
          shipping_fee_inr?: number | null
          shipping_fee_usd?: number | null
          slug?: string
          sort_order?: number
          status?: string
          trending?: boolean
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
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
      courier_webhook_events: {
        Row: {
          courier: string
          error: string | null
          external_event_id: string | null
          id: string
          payload: Json | null
          processed_at: string | null
          received_at: string
          shipment_id: string | null
          signature_valid: boolean
          status: string
          tracking_number: string | null
        }
        Insert: {
          courier: string
          error?: string | null
          external_event_id?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          shipment_id?: string | null
          signature_valid?: boolean
          status?: string
          tracking_number?: string | null
        }
        Update: {
          courier?: string
          error?: string | null
          external_event_id?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          shipment_id?: string | null
          signature_valid?: boolean
          status?: string
          tracking_number?: string | null
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
      duplicate_detection_events: {
        Row: {
          action: string
          admin_id: string | null
          candidate_brand: string | null
          candidate_category: string | null
          candidate_name: string | null
          candidate_slug: string | null
          created_at: string
          draft_brand: string | null
          draft_category: string | null
          draft_name: string | null
          draft_signature: string
          id: string
          score: number
          signals: Json
          verdict: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          candidate_brand?: string | null
          candidate_category?: string | null
          candidate_name?: string | null
          candidate_slug?: string | null
          created_at?: string
          draft_brand?: string | null
          draft_category?: string | null
          draft_name?: string | null
          draft_signature: string
          id?: string
          score?: number
          signals?: Json
          verdict?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          candidate_brand?: string | null
          candidate_category?: string | null
          candidate_name?: string | null
          candidate_slug?: string | null
          created_at?: string
          draft_brand?: string | null
          draft_category?: string | null
          draft_name?: string | null
          draft_signature?: string
          id?: string
          score?: number
          signals?: Json
          verdict?: string | null
        }
        Relationships: []
      }
      editor_drafts: {
        Row: {
          base_snapshot: Json | null
          created_at: string
          data: Json
          device_label: string | null
          entity_id: string
          entity_type: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_snapshot?: Json | null
          created_at?: string
          data?: Json
          device_label?: string | null
          entity_id?: string
          entity_type: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_snapshot?: Json | null
          created_at?: string
          data?: Json
          device_label?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          error: string | null
          id: string
          message_id: string | null
          payload: Json | null
          provider: string
          provider_message_id: string | null
          recipient: string
          related_order_id: string | null
          sent_at: string | null
          status: string
          subject: string | null
          template: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          message_id?: string | null
          payload?: Json | null
          provider?: string
          provider_message_id?: string | null
          recipient: string
          related_order_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          message_id?: string | null
          payload?: Json | null
          provider?: string
          provider_message_id?: string | null
          recipient?: string
          related_order_id?: string | null
          sent_at?: string | null
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
      entity_versions: {
        Row: {
          changed_fields: string[]
          created_at: string
          edited_by: string | null
          entity_id: string
          entity_type: string
          id: string
          snapshot: Json
          summary: string | null
        }
        Insert: {
          changed_fields?: string[]
          created_at?: string
          edited_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          snapshot: Json
          summary?: string | null
        }
        Update: {
          changed_fields?: string[]
          created_at?: string
          edited_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          snapshot?: Json
          summary?: string | null
        }
        Relationships: []
      }
      experiment_assignments: {
        Row: {
          assigned_at: string
          experiment_key: string
          id: string
          user_id: string | null
          variant: string
          visitor_id: string
        }
        Insert: {
          assigned_at?: string
          experiment_key: string
          id?: string
          user_id?: string | null
          variant: string
          visitor_id: string
        }
        Update: {
          assigned_at?: string
          experiment_key?: string
          id?: string
          user_id?: string | null
          variant?: string
          visitor_id?: string
        }
        Relationships: []
      }
      flash_deal_audit_log: {
        Row: {
          details: Json
          duplicates_found: number
          expired_deactivated: number
          id: string
          invalid_product_deactivated: number
          out_of_stock_deactivated: number
          ran_at: string
        }
        Insert: {
          details?: Json
          duplicates_found?: number
          expired_deactivated?: number
          id?: string
          invalid_product_deactivated?: number
          out_of_stock_deactivated?: number
          ran_at?: string
        }
        Update: {
          details?: Json
          duplicates_found?: number
          expired_deactivated?: number
          id?: string
          invalid_product_deactivated?: number
          out_of_stock_deactivated?: number
          ran_at?: string
        }
        Relationships: []
      }
      flash_deal_events: {
        Row: {
          created_at: string
          deal_id: string | null
          event_type: string
          id: string
          product_id: string | null
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          event_type: string
          id?: string
          product_id?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          event_type?: string
          id?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flash_deal_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "flash_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_deals: {
        Row: {
          active: boolean
          created_at: string
          end_at: string
          flash_price: number
          id: string
          priority: number
          product_id: string
          start_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          end_at: string
          flash_price: number
          id?: string
          priority?: number
          product_id: string
          start_at?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          end_at?: string
          flash_price?: number
          id?: string
          priority?: number
          product_id?: string
          start_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flash_deals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flash_deals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
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
      fraud_actions: {
        Row: {
          action: string
          actor_id: string
          alert_id: string | null
          created_at: string
          fraud_type: string | null
          id: string
          metadata: Json
          severity: string | null
          subject_id: string | null
          subject_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string
          alert_id?: string | null
          created_at?: string
          fraud_type?: string | null
          id?: string
          metadata?: Json
          severity?: string | null
          subject_id?: string | null
          subject_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          alert_id?: string | null
          created_at?: string
          fraud_type?: string | null
          id?: string
          metadata?: Json
          severity?: string | null
          subject_id?: string | null
          subject_type?: string | null
        }
        Relationships: []
      }
      fraud_alerts: {
        Row: {
          created_at: string
          detail: string | null
          evidence: Json
          fraud_type: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          score: number
          severity: string
          signal_key: string
          status: string
          subject_id: string | null
          subject_label: string | null
          subject_type: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          evidence?: Json
          fraud_type: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          score?: number
          severity?: string
          signal_key: string
          status?: string
          subject_id?: string | null
          subject_label?: string | null
          subject_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          evidence?: Json
          fraud_type?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          score?: number
          severity?: string
          signal_key?: string
          status?: string
          subject_id?: string | null
          subject_label?: string | null
          subject_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      homepage_sections: {
        Row: {
          active: boolean
          created_at: string
          eyebrow: string
          id: string
          key: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          eyebrow?: string
          id?: string
          key: string
          title?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          eyebrow?: string
          id?: string
          key?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      image_intelligence_jobs: {
        Row: {
          actions_json: Json
          analysis: Json
          category_rules_version: string | null
          category_slug: string | null
          created_at: string
          duration_ms: number | null
          engine_version: string | null
          error_message: string | null
          health_score: number | null
          id: string
          image_id: string | null
          image_url: string
          job_type: string
          mode: string
          optimized_url: string | null
          photon_version: string | null
          product_slug: string | null
          quality_gate_version: string | null
          recommendation: Json | null
          rejection_reason: string | null
          requested_by: string | null
          status: string
        }
        Insert: {
          actions_json?: Json
          analysis?: Json
          category_rules_version?: string | null
          category_slug?: string | null
          created_at?: string
          duration_ms?: number | null
          engine_version?: string | null
          error_message?: string | null
          health_score?: number | null
          id?: string
          image_id?: string | null
          image_url: string
          job_type?: string
          mode: string
          optimized_url?: string | null
          photon_version?: string | null
          product_slug?: string | null
          quality_gate_version?: string | null
          recommendation?: Json | null
          rejection_reason?: string | null
          requested_by?: string | null
          status?: string
        }
        Update: {
          actions_json?: Json
          analysis?: Json
          category_rules_version?: string | null
          category_slug?: string | null
          created_at?: string
          duration_ms?: number | null
          engine_version?: string | null
          error_message?: string | null
          health_score?: number | null
          id?: string
          image_id?: string | null
          image_url?: string
          job_type?: string
          mode?: string
          optimized_url?: string | null
          photon_version?: string | null
          product_slug?: string | null
          quality_gate_version?: string | null
          recommendation?: Json | null
          rejection_reason?: string | null
          requested_by?: string | null
          status?: string
        }
        Relationships: []
      }
      image_intelligence_settings: {
        Row: {
          allow_background_expansion: boolean
          auto_apply_safe: boolean
          block_publish_on_low_quality: boolean
          created_at: string
          id: string
          min_resolution: number
          mode: string
          scope_key: string | null
          scope_kind: string
          target_occupancy_max: number
          target_occupancy_min: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_background_expansion?: boolean
          auto_apply_safe?: boolean
          block_publish_on_low_quality?: boolean
          created_at?: string
          id: string
          min_resolution?: number
          mode?: string
          scope_key?: string | null
          scope_kind?: string
          target_occupancy_max?: number
          target_occupancy_min?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_background_expansion?: boolean
          auto_apply_safe?: boolean
          block_publish_on_low_quality?: boolean
          created_at?: string
          id?: string
          min_resolution?: number
          mode?: string
          scope_key?: string | null
          scope_kind?: string
          target_occupancy_max?: number
          target_occupancy_min?: number
          updated_at?: string
          updated_by?: string | null
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
      international_waitlist: {
        Row: {
          country: string | null
          created_at: string
          email: string
          id: string
          name: string
          product_slug: string | null
          user_id: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          product_slug?: string | null
          user_id?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          product_slug?: string | null
          user_id?: string | null
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
      marketing_automations: {
        Row: {
          action_config: Json
          automation_type: string
          channel: string
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          last_run_at: string | null
          name: string
          priority: number
          region: string
          schedule: Json
          status: string
          trigger_key: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          automation_type?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name: string
          priority?: number
          region?: string
          schedule?: Json
          status?: string
          trigger_key: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          automation_type?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name?: string
          priority?: number
          region?: string
          schedule?: Json
          status?: string
          trigger_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_campaign_alerts: {
        Row: {
          alert_key: string
          campaign_id: string
          created_at: string
          id: string
        }
        Insert: {
          alert_key: string
          campaign_id: string
          created_at?: string
          id?: string
        }
        Update: {
          alert_key?: string
          campaign_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_alerts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          audience_size: number
          automation_id: string | null
          campaign_type: string
          completed_at: string | null
          config: Json
          created_at: string
          created_by: string | null
          id: string
          launched_at: string | null
          metrics: Json
          name: string
          region: string
          scheduled_at: string | null
          segment: string | null
          spend: number
          status: string
          updated_at: string
        }
        Insert: {
          audience_size?: number
          automation_id?: string | null
          campaign_type?: string
          completed_at?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          launched_at?: string | null
          metrics?: Json
          name: string
          region?: string
          scheduled_at?: string | null
          segment?: string | null
          spend?: number
          status?: string
          updated_at?: string
        }
        Update: {
          audience_size?: number
          automation_id?: string | null
          campaign_type?: string
          completed_at?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          launched_at?: string | null
          metrics?: Json
          name?: string
          region?: string
          scheduled_at?: string | null
          segment?: string | null
          spend?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "marketing_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_settings: {
        Row: {
          auto_approve_vendors: boolean
          created_at: string
          default_commission_rate: number
          enabled: boolean
          id: string
          min_payout_amount: number
          notes: string | null
          payout_currency: string
          updated_at: string
        }
        Insert: {
          auto_approve_vendors?: boolean
          created_at?: string
          default_commission_rate?: number
          enabled?: boolean
          id?: string
          min_payout_amount?: number
          notes?: string | null
          payout_currency?: string
          updated_at?: string
        }
        Update: {
          auto_approve_vendors?: boolean
          created_at?: string
          default_commission_rate?: number
          enabled?: boolean
          id?: string
          min_payout_amount?: number
          notes?: string | null
          payout_currency?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          alt: string | null
          analysis: Json | null
          bucket: string
          created_at: string
          entity_ref: string | null
          entity_type: string
          height: number | null
          id: string
          large_url: string | null
          medium_url: string | null
          mime: string | null
          normalized_url: string | null
          original_name: string | null
          path: string
          size_bytes: number | null
          tags: string[]
          thumb_url: string | null
          updated_at: string
          uploaded_by: string | null
          url: string
          usage_count: number
          width: number | null
        }
        Insert: {
          alt?: string | null
          analysis?: Json | null
          bucket?: string
          created_at?: string
          entity_ref?: string | null
          entity_type?: string
          height?: number | null
          id?: string
          large_url?: string | null
          medium_url?: string | null
          mime?: string | null
          normalized_url?: string | null
          original_name?: string | null
          path: string
          size_bytes?: number | null
          tags?: string[]
          thumb_url?: string | null
          updated_at?: string
          uploaded_by?: string | null
          url: string
          usage_count?: number
          width?: number | null
        }
        Update: {
          alt?: string | null
          analysis?: Json | null
          bucket?: string
          created_at?: string
          entity_ref?: string | null
          entity_type?: string
          height?: number | null
          id?: string
          large_url?: string | null
          medium_url?: string | null
          mime?: string | null
          normalized_url?: string | null
          original_name?: string | null
          path?: string
          size_bytes?: number | null
          tags?: string[]
          thumb_url?: string | null
          updated_at?: string
          uploaded_by?: string | null
          url?: string
          usage_count?: number
          width?: number | null
        }
        Relationships: []
      }
      media_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          asset_id: string | null
          created_at: string
          entity_ref: string | null
          entity_type: string | null
          id: string
          meta: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          asset_id?: string | null
          created_at?: string
          entity_ref?: string | null
          entity_type?: string | null
          id?: string
          meta?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          asset_id?: string | null
          created_at?: string
          entity_ref?: string | null
          entity_type?: string | null
          id?: string
          meta?: Json
        }
        Relationships: []
      }
      newsletter_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: string
          ip_hash: string | null
          metadata: Json
          reason: string | null
          target_email: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          reason?: string | null
          target_email?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          reason?: string | null
          target_email?: string | null
          target_id?: string | null
        }
        Relationships: []
      }
      newsletter_ip_blocks: {
        Row: {
          cleared_at: string | null
          created_at: string
          expires_at: string
          id: string
          ip_hash: string
          reason: string
          score: number
        }
        Insert: {
          cleared_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          ip_hash: string
          reason: string
          score?: number
        }
        Update: {
          cleared_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip_hash?: string
          reason?: string
          score?: number
        }
        Relationships: []
      }
      newsletter_security_settings: {
        Row: {
          abuse_threshold: number
          auto_block_enabled: boolean
          block_minutes: number
          burst_limit: number
          burst_seconds: number
          day_limit: number
          disposable_check_enabled: boolean
          double_opt_in_enabled: boolean
          fingerprint_enabled: boolean
          honeypot_enabled: boolean
          hour_limit: number
          id: number
          min_submit_ms: number
          rate_limit_enabled: boolean
          timing_floor_enabled: boolean
          updated_at: string
          updated_by: string | null
          verification_ttl_hours: number
        }
        Insert: {
          abuse_threshold?: number
          auto_block_enabled?: boolean
          block_minutes?: number
          burst_limit?: number
          burst_seconds?: number
          day_limit?: number
          disposable_check_enabled?: boolean
          double_opt_in_enabled?: boolean
          fingerprint_enabled?: boolean
          honeypot_enabled?: boolean
          hour_limit?: number
          id?: number
          min_submit_ms?: number
          rate_limit_enabled?: boolean
          timing_floor_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          verification_ttl_hours?: number
        }
        Update: {
          abuse_threshold?: number
          auto_block_enabled?: boolean
          block_minutes?: number
          burst_limit?: number
          burst_seconds?: number
          day_limit?: number
          disposable_check_enabled?: boolean
          double_opt_in_enabled?: boolean
          fingerprint_enabled?: boolean
          honeypot_enabled?: boolean
          hour_limit?: number
          id?: number
          min_submit_ms?: number
          rate_limit_enabled?: boolean
          timing_floor_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          verification_ttl_hours?: number
        }
        Relationships: []
      }
      newsletter_submission_attempts: {
        Row: {
          abuse_score: number
          accept_language: string | null
          created_at: string
          email_hash: string | null
          id: string
          ip_hash: string
          outcome: string
          reason: string | null
          timezone: string | null
        }
        Insert: {
          abuse_score?: number
          accept_language?: string | null
          created_at?: string
          email_hash?: string | null
          id?: string
          ip_hash: string
          outcome: string
          reason?: string | null
          timezone?: string | null
        }
        Update: {
          abuse_score?: number
          accept_language?: string | null
          created_at?: string
          email_hash?: string | null
          id?: string
          ip_hash?: string
          outcome?: string
          reason?: string | null
          timezone?: string | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          abuse_score: number
          abuse_status: string
          accept_language: string | null
          browser: string | null
          country: string | null
          created_at: string
          device: string | null
          email: string
          flag_reason: string | null
          id: string
          ip_hash: string | null
          landing_page: string | null
          referrer: string | null
          source: string | null
          source_page: string | null
          status: string
          subscribed_at: string | null
          timezone: string | null
          ua_hash: string | null
          unsubscribed_at: string | null
          updated_at: string
          verification_expires_at: string | null
          verification_sent_at: string | null
          verification_token: string | null
          verified_at: string | null
        }
        Insert: {
          abuse_score?: number
          abuse_status?: string
          accept_language?: string | null
          browser?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          email: string
          flag_reason?: string | null
          id?: string
          ip_hash?: string | null
          landing_page?: string | null
          referrer?: string | null
          source?: string | null
          source_page?: string | null
          status?: string
          subscribed_at?: string | null
          timezone?: string | null
          ua_hash?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          verification_expires_at?: string | null
          verification_sent_at?: string | null
          verification_token?: string | null
          verified_at?: string | null
        }
        Update: {
          abuse_score?: number
          abuse_status?: string
          accept_language?: string | null
          browser?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          email?: string
          flag_reason?: string | null
          id?: string
          ip_hash?: string | null
          landing_page?: string | null
          referrer?: string | null
          source?: string | null
          source_page?: string | null
          status?: string
          subscribed_at?: string | null
          timezone?: string | null
          ua_hash?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          verification_expires_at?: string | null
          verification_sent_at?: string | null
          verification_token?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          archived_at: string | null
          body: string | null
          created_at: string
          data: Json | null
          id: string
          link: string | null
          priority: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          link?: string | null
          priority?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          link?: string | null
          priority?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_attributions: {
        Row: {
          attributed_at: string
          currency: string | null
          first_touch_at: string | null
          first_touch_campaign_id: string | null
          last_touch_at: string | null
          last_touch_campaign_id: string | null
          order_created_at: string | null
          order_id: string
          revenue: number
          session_id: string | null
          user_id: string | null
          utm: Json
        }
        Insert: {
          attributed_at?: string
          currency?: string | null
          first_touch_at?: string | null
          first_touch_campaign_id?: string | null
          last_touch_at?: string | null
          last_touch_campaign_id?: string | null
          order_created_at?: string | null
          order_id: string
          revenue?: number
          session_id?: string | null
          user_id?: string | null
          utm?: Json
        }
        Update: {
          attributed_at?: string
          currency?: string | null
          first_touch_at?: string | null
          first_touch_campaign_id?: string | null
          last_touch_at?: string | null
          last_touch_campaign_id?: string | null
          order_created_at?: string | null
          order_id?: string
          revenue?: number
          session_id?: string | null
          user_id?: string | null
          utm?: Json
        }
        Relationships: [
          {
            foreignKeyName: "order_attributions_first_touch_campaign_id_fkey"
            columns: ["first_touch_campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_attributions_last_touch_campaign_id_fkey"
            columns: ["last_touch_campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_attributions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          image: string | null
          is_seeded: boolean
          line_total: number
          name: string
          order_id: string
          product_slug: string
          quantity: number
          unit_price: number
          variant_color: string | null
          variant_id: string | null
          variant_image: string | null
          variant_name: string | null
          variant_size: string | null
          variant_sku: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image?: string | null
          is_seeded?: boolean
          line_total: number
          name: string
          order_id: string
          product_slug: string
          quantity: number
          unit_price: number
          variant_color?: string | null
          variant_id?: string | null
          variant_image?: string | null
          variant_name?: string | null
          variant_size?: string | null
          variant_sku?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image?: string | null
          is_seeded?: boolean
          line_total?: number
          name?: string
          order_id?: string
          product_slug?: string
          quantity?: number
          unit_price?: number
          variant_color?: string | null
          variant_id?: string | null
          variant_image?: string | null
          variant_name?: string | null
          variant_size?: string | null
          variant_sku?: string | null
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
          attribution_session_id: string | null
          attribution_utm: Json | null
          cancel_window_expires_at: string | null
          cancelled_at: string | null
          carrier: string | null
          contact_email: string | null
          created_at: string
          currency: string
          discount: number
          expires_at: string | null
          fulfilled_at: string | null
          fulfillment_status: string
          id: string
          is_seeded: boolean
          market_region: string | null
          paid_at: string | null
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
          attribution_session_id?: string | null
          attribution_utm?: Json | null
          cancel_window_expires_at?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          contact_email?: string | null
          created_at?: string
          currency?: string
          discount?: number
          expires_at?: string | null
          fulfilled_at?: string | null
          fulfillment_status?: string
          id?: string
          is_seeded?: boolean
          market_region?: string | null
          paid_at?: string | null
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
          attribution_session_id?: string | null
          attribution_utm?: Json | null
          cancel_window_expires_at?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          contact_email?: string | null
          created_at?: string
          currency?: string
          discount?: number
          expires_at?: string | null
          fulfilled_at?: string | null
          fulfillment_status?: string
          id?: string
          is_seeded?: boolean
          market_region?: string | null
          paid_at?: string | null
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
          is_seeded: boolean
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
          is_seeded?: boolean
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
          is_seeded?: boolean
          path?: string
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_gateways: {
        Row: {
          configured: boolean | null
          created_at: string
          display_name: string
          enabled: boolean
          last_checked_at: string | null
          mode: string
          provider: string
          publishable_key_present: boolean
          secret_key_present: boolean
          supports_region: string
          updated_at: string
          webhook_configured: boolean
        }
        Insert: {
          configured?: boolean | null
          created_at?: string
          display_name: string
          enabled?: boolean
          last_checked_at?: string | null
          mode?: string
          provider: string
          publishable_key_present?: boolean
          secret_key_present?: boolean
          supports_region?: string
          updated_at?: string
          webhook_configured?: boolean
        }
        Update: {
          configured?: boolean | null
          created_at?: string
          display_name?: string
          enabled?: boolean
          last_checked_at?: string | null
          mode?: string
          provider?: string
          publishable_key_present?: boolean
          secret_key_present?: boolean
          supports_region?: string
          updated_at?: string
          webhook_configured?: boolean
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
          is_seeded: boolean
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
          is_seeded?: boolean
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
          is_seeded?: boolean
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
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
      product_badges: {
        Row: {
          archived: boolean
          badge_type_id: string
          created_at: string
          end_at: string | null
          id: string
          notes: string
          product_slug: string
          sort_order: number
          start_at: string | null
        }
        Insert: {
          archived?: boolean
          badge_type_id: string
          created_at?: string
          end_at?: string | null
          id?: string
          notes?: string
          product_slug: string
          sort_order?: number
          start_at?: string | null
        }
        Update: {
          archived?: boolean
          badge_type_id?: string
          created_at?: string
          end_at?: string | null
          id?: string
          notes?: string
          product_slug?: string
          sort_order?: number
          start_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_badges_badge_type_id_fkey"
            columns: ["badge_type_id"]
            isOneToOne: false
            referencedRelation: "badge_types"
            referencedColumns: ["id"]
          },
        ]
      }
      product_faqs: {
        Row: {
          answer: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          product_slug: string
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          product_slug: string
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          product_slug?: string
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_faqs_product_slug_fkey"
            columns: ["product_slug"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "product_faqs_product_slug_fkey"
            columns: ["product_slug"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["slug"]
          },
        ]
      }
      product_graph_edges: {
        Row: {
          edge_type: string
          from_slug: string
          to_slug: string
          updated_at: string
          weight: number
        }
        Insert: {
          edge_type: string
          from_slug: string
          to_slug: string
          updated_at?: string
          weight?: number
        }
        Update: {
          edge_type?: string
          from_slug?: string
          to_slug?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      product_images: {
        Row: {
          alt: string | null
          analysis_json: Json | null
          analyzed_at: string | null
          category_rules_version: string | null
          created_at: string
          engine_version: string | null
          id: string
          optimization_actions: Json | null
          optimization_applied_at: string | null
          optimized_meta: Json | null
          optimized_url: string | null
          original_url: string | null
          photon_version: string | null
          product_slug: string
          quality_gate_version: string | null
          sort_order: number
          url: string
        }
        Insert: {
          alt?: string | null
          analysis_json?: Json | null
          analyzed_at?: string | null
          category_rules_version?: string | null
          created_at?: string
          engine_version?: string | null
          id?: string
          optimization_actions?: Json | null
          optimization_applied_at?: string | null
          optimized_meta?: Json | null
          optimized_url?: string | null
          original_url?: string | null
          photon_version?: string | null
          product_slug: string
          quality_gate_version?: string | null
          sort_order?: number
          url: string
        }
        Update: {
          alt?: string | null
          analysis_json?: Json | null
          analyzed_at?: string | null
          category_rules_version?: string | null
          created_at?: string
          engine_version?: string | null
          id?: string
          optimization_actions?: Json | null
          optimization_applied_at?: string | null
          optimized_meta?: Json | null
          optimized_url?: string | null
          original_url?: string | null
          photon_version?: string | null
          product_slug?: string
          quality_gate_version?: string | null
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
          deleted_at: string | null
          id: string
          is_seeded: boolean
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
          deleted_at?: string | null
          id?: string
          is_seeded?: boolean
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
          deleted_at?: string | null
          id?: string
          is_seeded?: boolean
          product_slug?: string
          question?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_rating_audit: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          final_rating: number | null
          id: string
          initial_rating: number | null
          initial_review_count: number | null
          metadata: Json
          product_slug: string
          rating_source: string | null
          total_reviews: number | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          final_rating?: number | null
          id?: string
          initial_rating?: number | null
          initial_review_count?: number | null
          metadata?: Json
          product_slug: string
          rating_source?: string | null
          total_reviews?: number | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          final_rating?: number | null
          id?: string
          initial_rating?: number | null
          initial_review_count?: number | null
          metadata?: Json
          product_slug?: string
          rating_source?: string | null
          total_reviews?: number | null
        }
        Relationships: []
      }
      product_reviews: {
        Row: {
          admin_reply: string | null
          admin_reply_at: string | null
          admin_reply_by: string | null
          body: string | null
          created_at: string
          deleted_at: string | null
          fake_reasons: string | null
          fake_score: number | null
          featured: boolean
          helpful_count: number
          id: string
          is_flagged: boolean
          is_seeded: boolean
          media: Json
          moderation_analyzed_at: string | null
          not_helpful_count: number
          pinned: boolean
          product_slug: string
          rating: number
          report_count: number
          sentiment: string | null
          sentiment_analyzed_at: string | null
          sentiment_score: number | null
          sentiment_summary: string | null
          status: string
          title: string | null
          updated_at: string
          user_id: string
          verified_purchase: boolean
        }
        Insert: {
          admin_reply?: string | null
          admin_reply_at?: string | null
          admin_reply_by?: string | null
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          fake_reasons?: string | null
          fake_score?: number | null
          featured?: boolean
          helpful_count?: number
          id?: string
          is_flagged?: boolean
          is_seeded?: boolean
          media?: Json
          moderation_analyzed_at?: string | null
          not_helpful_count?: number
          pinned?: boolean
          product_slug: string
          rating: number
          report_count?: number
          sentiment?: string | null
          sentiment_analyzed_at?: string | null
          sentiment_score?: number | null
          sentiment_summary?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
          verified_purchase?: boolean
        }
        Update: {
          admin_reply?: string | null
          admin_reply_at?: string | null
          admin_reply_by?: string | null
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          fake_reasons?: string | null
          fake_score?: number | null
          featured?: boolean
          helpful_count?: number
          id?: string
          is_flagged?: boolean
          is_seeded?: boolean
          media?: Json
          moderation_analyzed_at?: string | null
          not_helpful_count?: number
          pinned?: boolean
          product_slug?: string
          rating?: number
          report_count?: number
          sentiment?: string | null
          sentiment_analyzed_at?: string | null
          sentiment_score?: number | null
          sentiment_summary?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          verified_purchase?: boolean
        }
        Relationships: []
      }
      product_scores: {
        Row: {
          aggregates: Json
          conversion: number
          fbt_strength: number
          popularity: number
          product_slug: string
          trending: number
          updated_at: string
        }
        Insert: {
          aggregates?: Json
          conversion?: number
          fbt_strength?: number
          popularity?: number
          product_slug: string
          trending?: number
          updated_at?: string
        }
        Update: {
          aggregates?: Json
          conversion?: number
          fbt_strength?: number
          popularity?: number
          product_slug?: string
          trending?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_variant_images: {
        Row: {
          color: string
          created_at: string
          id: string
          image_url: string
          media_type: string
          medium_url: string | null
          poster_url: string | null
          product_slug: string
          sort_order: number
          thumb_url: string | null
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          image_url: string
          media_type?: string
          medium_url?: string | null
          poster_url?: string | null
          product_slug: string
          sort_order?: number
          thumb_url?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          image_url?: string
          media_type?: string
          medium_url?: string | null
          poster_url?: string | null
          product_slug?: string
          sort_order?: number
          thumb_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_images_product_slug_fkey"
            columns: ["product_slug"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "product_variant_images_product_slug_fkey"
            columns: ["product_slug"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["slug"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          barcode: string | null
          color: string | null
          color_hex: string | null
          compare_price: number | null
          created_at: string
          id: string
          image_url: string | null
          low_stock_threshold: number
          name: string
          price_adjustment: number
          price_override: number | null
          product_slug: string
          reserved_quantity: number
          size: string | null
          sku: string | null
          sort_order: number
          stock_quantity: number
          updated_at: string
          version: number
          weight: number | null
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          color?: string | null
          color_hex?: string | null
          compare_price?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          name: string
          price_adjustment?: number
          price_override?: number | null
          product_slug: string
          reserved_quantity?: number
          size?: string | null
          sku?: string | null
          sort_order?: number
          stock_quantity?: number
          updated_at?: string
          version?: number
          weight?: number | null
        }
        Update: {
          active?: boolean
          barcode?: string | null
          color?: string | null
          color_hex?: string | null
          compare_price?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          name?: string
          price_adjustment?: number
          price_override?: number | null
          product_slug?: string
          reserved_quantity?: number
          size?: string | null
          sku?: string | null
          sort_order?: number
          stock_quantity?: number
          updated_at?: string
          version?: number
          weight?: number | null
        }
        Relationships: []
      }
      product_versions: {
        Row: {
          created_at: string
          edited_by: string | null
          id: string
          product_slug: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          edited_by?: string | null
          id?: string
          product_slug: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          edited_by?: string | null
          id?: string
          product_slug?: string
          snapshot?: Json
        }
        Relationships: []
      }
      products: {
        Row: {
          admin_notes: string | null
          attributes: Json
          barcode: string | null
          base_image: string | null
          bestseller: boolean
          brand: string | null
          categories: string[]
          category: string
          category_position: number | null
          cod_enabled: boolean
          collection: string | null
          collections: string[]
          compare_price_inr: number | null
          compare_price_usd: number | null
          cost: number
          cost_price_inr: number | null
          cost_price_usd: number | null
          created_at: string
          cross_sell_products: string[]
          customs_info: string | null
          default_variant_color: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivery_estimate: string | null
          demo_url: string | null
          description: string | null
          discount: number | null
          editors_choice: boolean
          fast_selling: boolean
          featured: boolean
          featured_until: string | null
          features: string[]
          flash_deal: boolean
          fragile: boolean
          gift_idea: boolean
          has_variants: boolean
          height: number | null
          hide_from_recommendations: boolean
          hide_from_search: boolean
          homepage_hero: boolean
          homepage_position: number | null
          homepage_section: string | null
          hot_deal: boolean
          id: string
          image: string | null
          image_phash: string | null
          in_stock: boolean
          india_visible: boolean
          initial_rating: number
          initial_review_count: number
          international_shipping: boolean
          international_visible: boolean
          inventory_tracking: boolean
          is_category_banner: boolean
          length: number | null
          low_stock_threshold: number
          meta_keywords: string[]
          name: string
          new_arrival: boolean
          orders_count: number
          paypal_enabled: boolean
          pickup_supported: boolean
          premium: boolean
          preorder: boolean
          price: number
          price_inr: number | null
          price_usd: number | null
          priority_score: number | null
          product_type: string | null
          rating: number
          rating_source: string
          razorpay_enabled: boolean
          recommended: boolean
          related_products: string[]
          replacement_eligible: boolean
          reserved_quantity: number
          restock_eta: string | null
          return_eligible: boolean
          return_window_days: number
          revenue: number
          reviews: number
          scheduled_expiry_at: string | null
          scheduled_publish_at: string | null
          search_text: string | null
          search_vector: unknown
          seo_description: string | null
          seo_title: string | null
          shipping_class: string | null
          shipping_fee_inr: number
          shipping_fee_usd: number
          sku: string | null
          slug: string
          sold_count: number
          sort_order: number
          specifications: Json
          staff_pick: boolean
          status: string
          stock_quantity: number
          stripe_enabled: boolean
          tagline: string | null
          tags: string[]
          trending: boolean
          updated_at: string
          upsell_products: string[]
          variant_image_max: number | null
          video_url: string | null
          views_count: number
          warehouse_location: string | null
          warranty: string
          weight: number | null
          width: number | null
          wishlist_count: number
        }
        Insert: {
          admin_notes?: string | null
          attributes?: Json
          barcode?: string | null
          base_image?: string | null
          bestseller?: boolean
          brand?: string | null
          categories?: string[]
          category: string
          category_position?: number | null
          cod_enabled?: boolean
          collection?: string | null
          collections?: string[]
          compare_price_inr?: number | null
          compare_price_usd?: number | null
          cost?: number
          cost_price_inr?: number | null
          cost_price_usd?: number | null
          created_at?: string
          cross_sell_products?: string[]
          customs_info?: string | null
          default_variant_color?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_estimate?: string | null
          demo_url?: string | null
          description?: string | null
          discount?: number | null
          editors_choice?: boolean
          fast_selling?: boolean
          featured?: boolean
          featured_until?: string | null
          features?: string[]
          flash_deal?: boolean
          fragile?: boolean
          gift_idea?: boolean
          has_variants?: boolean
          height?: number | null
          hide_from_recommendations?: boolean
          hide_from_search?: boolean
          homepage_hero?: boolean
          homepage_position?: number | null
          homepage_section?: string | null
          hot_deal?: boolean
          id?: string
          image?: string | null
          image_phash?: string | null
          in_stock?: boolean
          india_visible?: boolean
          initial_rating?: number
          initial_review_count?: number
          international_shipping?: boolean
          international_visible?: boolean
          inventory_tracking?: boolean
          is_category_banner?: boolean
          length?: number | null
          low_stock_threshold?: number
          meta_keywords?: string[]
          name: string
          new_arrival?: boolean
          orders_count?: number
          paypal_enabled?: boolean
          pickup_supported?: boolean
          premium?: boolean
          preorder?: boolean
          price?: number
          price_inr?: number | null
          price_usd?: number | null
          priority_score?: number | null
          product_type?: string | null
          rating?: number
          rating_source?: string
          razorpay_enabled?: boolean
          recommended?: boolean
          related_products?: string[]
          replacement_eligible?: boolean
          reserved_quantity?: number
          restock_eta?: string | null
          return_eligible?: boolean
          return_window_days?: number
          revenue?: number
          reviews?: number
          scheduled_expiry_at?: string | null
          scheduled_publish_at?: string | null
          search_text?: string | null
          search_vector?: unknown
          seo_description?: string | null
          seo_title?: string | null
          shipping_class?: string | null
          shipping_fee_inr?: number
          shipping_fee_usd?: number
          sku?: string | null
          slug: string
          sold_count?: number
          sort_order?: number
          specifications?: Json
          staff_pick?: boolean
          status?: string
          stock_quantity?: number
          stripe_enabled?: boolean
          tagline?: string | null
          tags?: string[]
          trending?: boolean
          updated_at?: string
          upsell_products?: string[]
          variant_image_max?: number | null
          video_url?: string | null
          views_count?: number
          warehouse_location?: string | null
          warranty?: string
          weight?: number | null
          width?: number | null
          wishlist_count?: number
        }
        Update: {
          admin_notes?: string | null
          attributes?: Json
          barcode?: string | null
          base_image?: string | null
          bestseller?: boolean
          brand?: string | null
          categories?: string[]
          category?: string
          category_position?: number | null
          cod_enabled?: boolean
          collection?: string | null
          collections?: string[]
          compare_price_inr?: number | null
          compare_price_usd?: number | null
          cost?: number
          cost_price_inr?: number | null
          cost_price_usd?: number | null
          created_at?: string
          cross_sell_products?: string[]
          customs_info?: string | null
          default_variant_color?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_estimate?: string | null
          demo_url?: string | null
          description?: string | null
          discount?: number | null
          editors_choice?: boolean
          fast_selling?: boolean
          featured?: boolean
          featured_until?: string | null
          features?: string[]
          flash_deal?: boolean
          fragile?: boolean
          gift_idea?: boolean
          has_variants?: boolean
          height?: number | null
          hide_from_recommendations?: boolean
          hide_from_search?: boolean
          homepage_hero?: boolean
          homepage_position?: number | null
          homepage_section?: string | null
          hot_deal?: boolean
          id?: string
          image?: string | null
          image_phash?: string | null
          in_stock?: boolean
          india_visible?: boolean
          initial_rating?: number
          initial_review_count?: number
          international_shipping?: boolean
          international_visible?: boolean
          inventory_tracking?: boolean
          is_category_banner?: boolean
          length?: number | null
          low_stock_threshold?: number
          meta_keywords?: string[]
          name?: string
          new_arrival?: boolean
          orders_count?: number
          paypal_enabled?: boolean
          pickup_supported?: boolean
          premium?: boolean
          preorder?: boolean
          price?: number
          price_inr?: number | null
          price_usd?: number | null
          priority_score?: number | null
          product_type?: string | null
          rating?: number
          rating_source?: string
          razorpay_enabled?: boolean
          recommended?: boolean
          related_products?: string[]
          replacement_eligible?: boolean
          reserved_quantity?: number
          restock_eta?: string | null
          return_eligible?: boolean
          return_window_days?: number
          revenue?: number
          reviews?: number
          scheduled_expiry_at?: string | null
          scheduled_publish_at?: string | null
          search_text?: string | null
          search_vector?: unknown
          seo_description?: string | null
          seo_title?: string | null
          shipping_class?: string | null
          shipping_fee_inr?: number
          shipping_fee_usd?: number
          sku?: string | null
          slug?: string
          sold_count?: number
          sort_order?: number
          specifications?: Json
          staff_pick?: boolean
          status?: string
          stock_quantity?: number
          stripe_enabled?: boolean
          tagline?: string | null
          tags?: string[]
          trending?: boolean
          updated_at?: string
          upsell_products?: string[]
          variant_image_max?: number | null
          video_url?: string | null
          views_count?: number
          warehouse_location?: string | null
          warranty?: string
          weight?: number | null
          width?: number | null
          wishlist_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          alt_phone: string | null
          avatar_url: string | null
          ban_reason: string | null
          banned_at: string | null
          banned_by: string | null
          birth_date: string | null
          country: string | null
          country_code: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          full_name: string | null
          gender: string | null
          id: string
          is_seeded: boolean
          language: string | null
          market_region: string | null
          ordering_blocked: boolean
          phone: string | null
          region_locked_at: string | null
          reviews_disabled: boolean
          suspended_at: string | null
          suspended_by: string | null
          tier_override: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          account_status?: string
          alt_phone?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: string | null
          birth_date?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          is_seeded?: boolean
          language?: string | null
          market_region?: string | null
          ordering_blocked?: boolean
          phone?: string | null
          region_locked_at?: string | null
          reviews_disabled?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          tier_override?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: string
          alt_phone?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: string | null
          birth_date?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          is_seeded?: boolean
          language?: string | null
          market_region?: string | null
          ordering_blocked?: boolean
          phone?: string | null
          region_locked_at?: string | null
          reviews_disabled?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          tier_override?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          active: boolean
          automation_id: string | null
          campaign_id: string | null
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          kind: string
          max_uses: number | null
          min_subtotal: number
          segment: string | null
          source: string | null
          updated_at: string
          uses: number
          value: number
        }
        Insert: {
          active?: boolean
          automation_id?: string | null
          campaign_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          max_uses?: number | null
          min_subtotal?: number
          segment?: string | null
          source?: string | null
          updated_at?: string
          uses?: number
          value: number
        }
        Update: {
          active?: boolean
          automation_id?: string | null
          campaign_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          max_uses?: number | null
          min_subtotal?: number
          segment?: string | null
          source?: string | null
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
      recommendation_experiments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          metrics: Json
          status: string
          traffic_split: Json
          updated_at: string
          variants: Json
          winner: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          metrics?: Json
          status?: string
          traffic_split?: Json
          updated_at?: string
          variants?: Json
          winner?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          metrics?: Json
          status?: string
          traffic_split?: Json
          updated_at?: string
          variants?: Json
          winner?: string | null
        }
        Relationships: []
      }
      recommendation_rules: {
        Row: {
          created_at: string
          enabled: boolean
          ends_at: string | null
          id: string
          priority: number
          rule_kind: string
          starts_at: string | null
          target_type: string
          target_value: string | null
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          ends_at?: string | null
          id?: string
          priority?: number
          rule_kind: string
          starts_at?: string | null
          target_type: string
          target_value?: string | null
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          ends_at?: string | null
          id?: string
          priority?: number
          rule_kind?: string
          starts_at?: string | null
          target_type?: string
          target_value?: string | null
          updated_at?: string
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
      region_assignment_history: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          method: string
          previous_region: string | null
          reason: string | null
          region: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          method?: string
          previous_region?: string | null
          reason?: string | null
          region: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          method?: string
          previous_region?: string | null
          reason?: string | null
          region?: string
          user_id?: string
        }
        Relationships: []
      }
      region_change_requests: {
        Row: {
          created_at: string
          current_region: string | null
          id: string
          reason: string
          requested_region: string
          resolved_at: string | null
          review_note: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_region?: string | null
          id?: string
          reason: string
          requested_region: string
          resolved_at?: string | null
          review_note?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_region?: string | null
          id?: string
          reason?: string
          requested_region?: string
          resolved_at?: string | null
          review_note?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      return_items: {
        Row: {
          created_at: string
          id: string
          is_seeded: boolean
          order_item_id: string
          product_slug: string
          quantity: number
          reason: string | null
          return_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_seeded?: boolean
          order_item_id: string
          product_slug: string
          quantity: number
          reason?: string | null
          return_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_seeded?: boolean
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
          is_seeded: boolean
          notes: string | null
          order_id: string
          photo_urls: string[]
          reason: string
          refund_amount: number
          refund_status: string
          replacement_order_id: string | null
          replacement_status: string
          resolution_type: string
          resolved_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_seeded?: boolean
          notes?: string | null
          order_id: string
          photo_urls?: string[]
          reason: string
          refund_amount?: number
          refund_status?: string
          replacement_order_id?: string | null
          replacement_status?: string
          resolution_type?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_seeded?: boolean
          notes?: string | null
          order_id?: string
          photo_urls?: string[]
          reason?: string
          refund_amount?: number
          refund_status?: string
          replacement_order_id?: string | null
          replacement_status?: string
          resolution_type?: string
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
      review_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          review_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          review_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          review_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "product_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "product_reviews_public"
            referencedColumns: ["id"]
          },
        ]
      }
      review_votes: {
        Row: {
          created_at: string
          id: string
          review_id: string
          user_id: string
          vote: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          user_id: string
          vote: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          user_id?: string
          vote?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "product_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "product_reviews_public"
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
      rotation_state: {
        Row: {
          id: boolean
          nonce: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          nonce?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          nonce?: number
          updated_at?: string
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
          is_seeded: boolean
          query: string
          results_count: number
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          clicked_product_slug?: string | null
          created_at?: string
          id?: number
          is_seeded?: boolean
          query: string
          results_count?: number
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          clicked_product_slug?: string | null
          created_at?: string
          id?: number
          is_seeded?: boolean
          query?: string
          results_count?: number
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          detail: Json
          id: string
          source_ip: string | null
          success: boolean
          target: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          detail?: Json
          id?: string
          source_ip?: string | null
          success: boolean
          target?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          detail?: Json
          id?: string
          source_ip?: string | null
          success?: boolean
          target?: string | null
        }
        Relationships: []
      }
      seed_runs: {
        Row: {
          counts: Json
          created_at: string
          id: string
          kind: string
        }
        Insert: {
          counts?: Json
          created_at?: string
          id?: string
          kind: string
        }
        Update: {
          counts?: Json
          created_at?: string
          id?: string
          kind?: string
        }
        Relationships: []
      }
      seo_search_console: {
        Row: {
          clicks: number
          country: string | null
          created_at: string
          ctr: number
          dimension: string
          id: string
          impressions: number
          keyword: string | null
          page: string | null
          position: number
          snapshot_date: string
        }
        Insert: {
          clicks?: number
          country?: string | null
          created_at?: string
          ctr?: number
          dimension: string
          id?: string
          impressions?: number
          keyword?: string | null
          page?: string | null
          position?: number
          snapshot_date?: string
        }
        Update: {
          clicks?: number
          country?: string | null
          created_at?: string
          ctr?: number
          dimension?: string
          id?: string
          impressions?: number
          keyword?: string | null
          page?: string | null
          position?: number
          snapshot_date?: string
        }
        Relationships: []
      }
      seo_settings: {
        Row: {
          created_at: string
          id: string
          last_sync_at: string | null
          last_sync_status: string | null
          site_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          site_url?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          site_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipment_events: {
        Row: {
          courier: string | null
          created_at: string
          description: string | null
          external_event_id: string | null
          id: string
          is_seeded: boolean
          location: string | null
          occurred_at: string
          raw: Json | null
          shipment_id: string
          source: string
          status: string
        }
        Insert: {
          courier?: string | null
          created_at?: string
          description?: string | null
          external_event_id?: string | null
          id?: string
          is_seeded?: boolean
          location?: string | null
          occurred_at?: string
          raw?: Json | null
          shipment_id: string
          source?: string
          status: string
        }
        Update: {
          courier?: string | null
          created_at?: string
          description?: string | null
          external_event_id?: string | null
          id?: string
          is_seeded?: boolean
          location?: string | null
          occurred_at?: string
          raw?: Json | null
          shipment_id?: string
          source?: string
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
          actual_delivery: string | null
          cancelled_at: string | null
          carrier: string | null
          created_at: string
          delivered_at: string | null
          estimated_delivery: string | null
          eta_source: string | null
          id: string
          is_seeded: boolean
          last_courier_sync: string | null
          notes: string | null
          order_id: string
          packed_at: string | null
          returned_at: string | null
          shipped_at: string | null
          status: string
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_delivery?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          estimated_delivery?: string | null
          eta_source?: string | null
          id?: string
          is_seeded?: boolean
          last_courier_sync?: string | null
          notes?: string | null
          order_id: string
          packed_at?: string | null
          returned_at?: string | null
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_delivery?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          estimated_delivery?: string | null
          eta_source?: string | null
          id?: string
          is_seeded?: boolean
          last_courier_sync?: string | null
          notes?: string | null
          order_id?: string
          packed_at?: string | null
          returned_at?: string | null
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
      shipping_state: {
        Row: {
          id: boolean
          updated_at: string
          version: number
        }
        Insert: {
          id?: boolean
          updated_at?: string
          version?: number
        }
        Update: {
          id?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: []
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
      site_rules: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          cod_enabled: boolean
          flat_shipping_inr: number
          flat_shipping_usd: number
          free_shipping_enabled: boolean
          free_shipping_threshold_inr: number | null
          free_shipping_threshold_usd: number | null
          id: boolean
          include_seed_in_analytics: boolean
          prepaid_discount_percent: number
          shipping_mode: string
          support_response_minutes: number
          support_status: string
          support_whatsapp_numbers: string[]
          updated_at: string
        }
        Insert: {
          cod_enabled?: boolean
          flat_shipping_inr?: number
          flat_shipping_usd?: number
          free_shipping_enabled?: boolean
          free_shipping_threshold_inr?: number | null
          free_shipping_threshold_usd?: number | null
          id?: boolean
          include_seed_in_analytics?: boolean
          prepaid_discount_percent?: number
          shipping_mode?: string
          support_response_minutes?: number
          support_status?: string
          support_whatsapp_numbers?: string[]
          updated_at?: string
        }
        Update: {
          cod_enabled?: boolean
          flat_shipping_inr?: number
          flat_shipping_usd?: number
          free_shipping_enabled?: boolean
          free_shipping_threshold_inr?: number | null
          free_shipping_threshold_usd?: number | null
          id?: boolean
          include_seed_in_analytics?: boolean
          prepaid_discount_percent?: number
          shipping_mode?: string
          support_response_minutes?: number
          support_status?: string
          support_whatsapp_numbers?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      storefront_blocks: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          created_by: string | null
          id: string
          publish_at: string | null
          region: string
          sort_order: number
          status: string
          subtitle: string
          title: string
          type: string
          unpublish_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          publish_at?: string | null
          region?: string
          sort_order?: number
          status?: string
          subtitle?: string
          title?: string
          type: string
          unpublish_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          publish_at?: string | null
          region?: string
          sort_order?: number
          status?: string
          subtitle?: string
          title?: string
          type?: string
          unpublish_at?: string | null
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
      support_agent_presence: {
        Row: {
          created_at: string
          last_action: string | null
          last_active_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_action?: string | null
          last_active_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_action?: string | null
          last_active_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          id: string
          storage_path: string
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size: number
          file_type: string
          id?: string
          storage_path: string
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          storage_path?: string
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
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
      support_email_events: {
        Row: {
          created_at: string
          direction: string
          from_email: string | null
          id: string
          message_id: string | null
          provider_message_id: string | null
          raw: Json | null
          rejection_reason: string | null
          reply_to_id: string | null
          status: string
          subject: string | null
          thread_id: string | null
          ticket_id: string | null
          to_email: string | null
        }
        Insert: {
          created_at?: string
          direction?: string
          from_email?: string | null
          id?: string
          message_id?: string | null
          provider_message_id?: string | null
          raw?: Json | null
          rejection_reason?: string | null
          reply_to_id?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          ticket_id?: string | null
          to_email?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          from_email?: string | null
          id?: string
          message_id?: string | null
          provider_message_id?: string | null
          raw?: Json | null
          rejection_reason?: string | null
          reply_to_id?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          ticket_id?: string | null
          to_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_email_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_email_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
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
          channel: string
          created_at: string
          delivered_at: string
          delivery_status: string | null
          id: string
          inbound_email_id: string | null
          is_seeded: boolean
          processing_status: string | null
          read_at: string | null
          received_at: string | null
          reply_to_id: string | null
          sender_email: string | null
          sender_id: string | null
          sender_role: string
          source: string | null
          thread_id: string | null
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          channel?: string
          created_at?: string
          delivered_at?: string
          delivery_status?: string | null
          id?: string
          inbound_email_id?: string | null
          is_seeded?: boolean
          processing_status?: string | null
          read_at?: string | null
          received_at?: string | null
          reply_to_id?: string | null
          sender_email?: string | null
          sender_id?: string | null
          sender_role?: string
          source?: string | null
          thread_id?: string | null
          ticket_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          channel?: string
          created_at?: string
          delivered_at?: string
          delivery_status?: string | null
          id?: string
          inbound_email_id?: string | null
          is_seeded?: boolean
          processing_status?: string | null
          read_at?: string | null
          received_at?: string | null
          reply_to_id?: string | null
          sender_email?: string | null
          sender_id?: string | null
          sender_role?: string
          source?: string | null
          thread_id?: string | null
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
      support_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          message_id: string | null
          notification_type: string
          read: boolean
          ticket_id: string
          title: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          notification_type?: string
          read?: boolean
          ticket_id: string
          title?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          notification_type?: string
          read?: boolean
          ticket_id?: string
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          meta: Json
          ticket_id: string
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          meta?: Json
          ticket_id: string
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          meta?: Json
          ticket_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_ratings: {
        Row: {
          assigned_agent: string | null
          category: string | null
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          priority: string | null
          rated_at: string
          rating: number
          resolution_time_ms: number | null
          reviewed: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          ticket_id: string
          updated_at: string
        }
        Insert: {
          assigned_agent?: string | null
          category?: string | null
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          priority?: string | null
          rated_at?: string
          rating: number
          resolution_time_ms?: number | null
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          ticket_id: string
          updated_at?: string
        }
        Update: {
          assigned_agent?: string | null
          category?: string | null
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          priority?: string | null
          rated_at?: string
          rating?: number
          resolution_time_ms?: number | null
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_ratings_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
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
          channel: string
          closed_at: string | null
          context: Json
          created_at: string
          dispute_id: string | null
          first_response_at: string | null
          guest_email: string | null
          guest_name: string | null
          id: string
          is_seeded: boolean
          last_message_at: string
          market_region: string | null
          order_id: string | null
          priority: string
          refund_id: string | null
          resolved_at: string | null
          return_id: string | null
          seller_id: string | null
          shipment_id: string | null
          source: string | null
          status: string
          subject: string
          tags: string[]
          ticket_number: string
          unread_admin_count: number
          unread_customer_count: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          channel?: string
          closed_at?: string | null
          context?: Json
          created_at?: string
          dispute_id?: string | null
          first_response_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          is_seeded?: boolean
          last_message_at?: string
          market_region?: string | null
          order_id?: string | null
          priority?: string
          refund_id?: string | null
          resolved_at?: string | null
          return_id?: string | null
          seller_id?: string | null
          shipment_id?: string | null
          source?: string | null
          status?: string
          subject: string
          tags?: string[]
          ticket_number?: string
          unread_admin_count?: number
          unread_customer_count?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string
          channel?: string
          closed_at?: string | null
          context?: Json
          created_at?: string
          dispute_id?: string | null
          first_response_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          is_seeded?: boolean
          last_message_at?: string
          market_region?: string | null
          order_id?: string | null
          priority?: string
          refund_id?: string | null
          resolved_at?: string | null
          return_id?: string | null
          seller_id?: string | null
          shipment_id?: string | null
          source?: string | null
          status?: string
          subject?: string
          tags?: string[]
          ticket_number?: string
          unread_admin_count?: number
          unread_customer_count?: number
          updated_at?: string
          user_id?: string | null
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
      testimonials: {
        Row: {
          active: boolean
          country: string | null
          created_at: string
          flag: string | null
          id: string
          name: string
          quote: string
          rating: number
          role: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          country?: string | null
          created_at?: string
          flag?: string | null
          id?: string
          name: string
          quote: string
          rating?: number
          role?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          country?: string | null
          created_at?: string
          flag?: string | null
          id?: string
          name?: string
          quote?: string
          rating?: number
          role?: string | null
          sort_order?: number
          updated_at?: string
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
      vendor_analytics: {
        Row: {
          commission: number
          created_at: string
          day: string
          id: string
          metadata: Json
          orders: number
          revenue: number
          units: number
          vendor_id: string
        }
        Insert: {
          commission?: number
          created_at?: string
          day: string
          id?: string
          metadata?: Json
          orders?: number
          revenue?: number
          units?: number
          vendor_id: string
        }
        Update: {
          commission?: number
          created_at?: string
          day?: string
          id?: string
          metadata?: Json
          orders?: number
          revenue?: number
          units?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_analytics_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_commissions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          order_id: string | null
          payout_id: string | null
          rate: number | null
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          order_id?: string | null
          payout_id?: string | null
          rate?: number | null
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          order_id?: string | null
          payout_id?: string | null
          rate?: number | null
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_commissions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payouts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          method: string | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          processed_at: string | null
          reference: string | null
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          method?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          method?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payouts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_products: {
        Row: {
          active: boolean
          created_at: string
          id: string
          product_slug: string
          updated_at: string
          vendor_id: string
          vendor_price: number | null
          vendor_sku: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          product_slug: string
          updated_at?: string
          vendor_id: string
          vendor_price?: number | null
          vendor_sku?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          product_slug?: string
          updated_at?: string
          vendor_id?: string
          vendor_price?: number | null
          vendor_sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_support_tickets: {
        Row: {
          assigned_to: string | null
          body: string | null
          created_at: string
          id: string
          priority: string
          status: string
          subject: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          assigned_to?: string | null
          body?: string | null
          created_at?: string
          id?: string
          priority?: string
          status?: string
          subject: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          assigned_to?: string | null
          body?: string | null
          created_at?: string
          id?: string
          priority?: string
          status?: string
          subject?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_support_tickets_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          business_name: string
          commission_rate: number | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          metadata: Json
          owner_user_id: string | null
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          business_name: string
          commission_rate?: number | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          metadata?: Json
          owner_user_id?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_name?: string
          commission_rate?: number | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          metadata?: Json
          owner_user_id?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
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
          is_seeded: boolean
          product_slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_seeded?: boolean
          product_slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_seeded?: boolean
          product_slug?: string
          user_id?: string
        }
        Relationships: []
      }
      wishlist_activity_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          product_slug: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          product_slug?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          product_slug?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wishlist_notification_preferences: {
        Row: {
          back_in_stock: boolean
          collection_updates: boolean
          created_at: string
          email_enabled: boolean
          flash_sale: boolean
          low_stock: boolean
          new_arrival: boolean
          price_drop: boolean
          push_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          back_in_stock?: boolean
          collection_updates?: boolean
          created_at?: string
          email_enabled?: boolean
          flash_sale?: boolean
          low_stock?: boolean
          new_arrival?: boolean
          price_drop?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          back_in_stock?: boolean
          collection_updates?: boolean
          created_at?: string
          email_enabled?: boolean
          flash_sale?: boolean
          low_stock?: boolean
          new_arrival?: boolean
          price_drop?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wishlist_price_alerts: {
        Row: {
          created_at: string
          currency: string
          id: string
          last_price: number | null
          product_slug: string
          status: string
          target_price: number
          triggered_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          last_price?: number | null
          product_slug: string
          status?: string
          target_price: number
          triggered_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          last_price?: number | null
          product_slug?: string
          status?: string
          target_price?: number
          triggered_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wishlist_restock_alerts: {
        Row: {
          created_at: string
          id: string
          notified_at: string | null
          product_slug: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notified_at?: string | null
          product_slug: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notified_at?: string | null
          product_slug?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      banners_public: {
        Row: {
          active: boolean | null
          countdown_to: string | null
          created_at: string | null
          cta_text: string | null
          ends_at: string | null
          height_px: number | null
          id: string | null
          image: string | null
          link: string | null
          mobile_image: string | null
          overlay_opacity: number | null
          pages: string[] | null
          region: string | null
          sort_order: number | null
          starts_at: string | null
          subtitle: string | null
          text_align: string | null
          title: string | null
          type: string | null
          updated_at: string | null
          video_url: string | null
          width_px: number | null
        }
        Insert: {
          active?: boolean | null
          countdown_to?: string | null
          created_at?: string | null
          cta_text?: string | null
          ends_at?: string | null
          height_px?: number | null
          id?: string | null
          image?: string | null
          link?: string | null
          mobile_image?: string | null
          overlay_opacity?: number | null
          pages?: string[] | null
          region?: string | null
          sort_order?: number | null
          starts_at?: string | null
          subtitle?: string | null
          text_align?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          video_url?: string | null
          width_px?: number | null
        }
        Update: {
          active?: boolean | null
          countdown_to?: string | null
          created_at?: string | null
          cta_text?: string | null
          ends_at?: string | null
          height_px?: number | null
          id?: string | null
          image?: string | null
          link?: string | null
          mobile_image?: string | null
          overlay_opacity?: number | null
          pages?: string[] | null
          region?: string | null
          sort_order?: number | null
          starts_at?: string | null
          subtitle?: string | null
          text_align?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          video_url?: string | null
          width_px?: number | null
        }
        Relationships: []
      }
      cms_pages_public: {
        Row: {
          body: string | null
          created_at: string | null
          id: string | null
          last_published_at: string | null
          meta_description: string | null
          meta_title: string | null
          slug: string | null
          sort_order: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string | null
          last_published_at?: string | null
          meta_description?: string | null
          meta_title?: string | null
          slug?: string | null
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string | null
          last_published_at?: string | null
          meta_description?: string | null
          meta_title?: string | null
          slug?: string | null
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cms_posts_public: {
        Row: {
          author: string | null
          body: string | null
          cover_image: string | null
          created_at: string | null
          excerpt: string | null
          id: string | null
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          slug: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          author?: string | null
          body?: string | null
          cover_image?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          author?: string | null
          body?: string | null
          cover_image?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      frequently_bought_together: {
        Row: {
          co_count: number | null
          slug_a: string | null
          slug_b: string | null
        }
        Relationships: []
      }
      payment_gateways_public: {
        Row: {
          configured: boolean | null
          display_name: string | null
          enabled: boolean | null
          last_checked_at: string | null
          mode: string | null
          provider: string | null
          supports_region: string | null
          updated_at: string | null
        }
        Insert: {
          configured?: boolean | null
          display_name?: string | null
          enabled?: boolean | null
          last_checked_at?: string | null
          mode?: string | null
          provider?: string | null
          supports_region?: string | null
          updated_at?: string | null
        }
        Update: {
          configured?: boolean | null
          display_name?: string | null
          enabled?: boolean | null
          last_checked_at?: string | null
          mode?: string | null
          provider?: string | null
          supports_region?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      product_reviews_public: {
        Row: {
          admin_reply: string | null
          admin_reply_at: string | null
          author_avatar_url: string | null
          author_name: string | null
          body: string | null
          created_at: string | null
          featured: boolean | null
          helpful_count: number | null
          id: string | null
          media: Json | null
          not_helpful_count: number | null
          pinned: boolean | null
          product_slug: string | null
          rating: number | null
          status: string | null
          title: string | null
          updated_at: string | null
          verified_purchase: boolean | null
        }
        Relationships: []
      }
      product_variant_images_public: {
        Row: {
          color: string | null
          id: string | null
          image_url: string | null
          media_type: string | null
          medium_url: string | null
          poster_url: string | null
          product_slug: string | null
          sort_order: number | null
          thumb_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_images_product_slug_fkey"
            columns: ["product_slug"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "product_variant_images_product_slug_fkey"
            columns: ["product_slug"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["slug"]
          },
        ]
      }
      product_variants_public: {
        Row: {
          barcode: string | null
          color: string | null
          color_hex: string | null
          compare_price: number | null
          id: string | null
          image_url: string | null
          low_stock_threshold: number | null
          name: string | null
          price_adjustment: number | null
          price_override: number | null
          product_slug: string | null
          size: string | null
          sku: string | null
          sort_order: number | null
          stock_quantity: number | null
          weight: number | null
        }
        Relationships: []
      }
      products_public: {
        Row: {
          attributes: Json | null
          bestseller: boolean | null
          brand: string | null
          categories: string[] | null
          category: string | null
          category_position: number | null
          cod_enabled: boolean | null
          collection: string | null
          collections: string[] | null
          compare_price_inr: number | null
          compare_price_usd: number | null
          created_at: string | null
          cross_sell_products: string[] | null
          customs_info: string | null
          default_variant_color: string | null
          delivery_estimate: string | null
          description: string | null
          discount: number | null
          editors_choice: boolean | null
          fast_selling: boolean | null
          featured: boolean | null
          featured_until: string | null
          features: string[] | null
          flash_deal: boolean | null
          fragile: boolean | null
          gift_idea: boolean | null
          hide_from_recommendations: boolean | null
          hide_from_search: boolean | null
          homepage_hero: boolean | null
          homepage_position: number | null
          homepage_section: string | null
          hot_deal: boolean | null
          id: string | null
          image: string | null
          in_stock: boolean | null
          india_visible: boolean | null
          international_shipping: boolean | null
          international_visible: boolean | null
          inventory_tracking: boolean | null
          is_category_banner: boolean | null
          low_stock_threshold: number | null
          meta_keywords: string[] | null
          name: string | null
          new_arrival: boolean | null
          paypal_enabled: boolean | null
          pickup_supported: boolean | null
          premium: boolean | null
          preorder: boolean | null
          price: number | null
          price_inr: number | null
          price_usd: number | null
          priority_score: number | null
          product_type: string | null
          rating: number | null
          rating_source: string | null
          razorpay_enabled: boolean | null
          recommended: boolean | null
          related_products: string[] | null
          replacement_eligible: boolean | null
          restock_eta: string | null
          return_eligible: boolean | null
          return_window_days: number | null
          reviews: number | null
          scheduled_expiry_at: string | null
          scheduled_publish_at: string | null
          seo_description: string | null
          seo_title: string | null
          shipping_class: string | null
          shipping_fee_inr: number | null
          shipping_fee_usd: number | null
          sku: string | null
          slug: string | null
          sold_count: number | null
          sort_order: number | null
          specifications: Json | null
          staff_pick: boolean | null
          status: string | null
          stock_quantity: number | null
          stripe_enabled: boolean | null
          tagline: string | null
          tags: string[] | null
          trending: boolean | null
          updated_at: string | null
          upsell_products: string[] | null
          video_url: string | null
          views_count: number | null
          warranty: string | null
          wishlist_count: number | null
        }
        Insert: {
          attributes?: Json | null
          bestseller?: boolean | null
          brand?: string | null
          categories?: string[] | null
          category?: string | null
          category_position?: number | null
          cod_enabled?: boolean | null
          collection?: string | null
          collections?: string[] | null
          compare_price_inr?: number | null
          compare_price_usd?: number | null
          created_at?: string | null
          cross_sell_products?: string[] | null
          customs_info?: string | null
          default_variant_color?: string | null
          delivery_estimate?: string | null
          description?: string | null
          discount?: number | null
          editors_choice?: boolean | null
          fast_selling?: boolean | null
          featured?: boolean | null
          featured_until?: string | null
          features?: string[] | null
          flash_deal?: boolean | null
          fragile?: boolean | null
          gift_idea?: boolean | null
          hide_from_recommendations?: boolean | null
          hide_from_search?: boolean | null
          homepage_hero?: boolean | null
          homepage_position?: number | null
          homepage_section?: string | null
          hot_deal?: boolean | null
          id?: string | null
          image?: string | null
          in_stock?: boolean | null
          india_visible?: boolean | null
          international_shipping?: boolean | null
          international_visible?: boolean | null
          inventory_tracking?: boolean | null
          is_category_banner?: boolean | null
          low_stock_threshold?: number | null
          meta_keywords?: string[] | null
          name?: string | null
          new_arrival?: boolean | null
          paypal_enabled?: boolean | null
          pickup_supported?: boolean | null
          premium?: boolean | null
          preorder?: boolean | null
          price?: number | null
          price_inr?: number | null
          price_usd?: number | null
          priority_score?: number | null
          product_type?: string | null
          rating?: number | null
          rating_source?: string | null
          razorpay_enabled?: boolean | null
          recommended?: boolean | null
          related_products?: string[] | null
          replacement_eligible?: boolean | null
          restock_eta?: string | null
          return_eligible?: boolean | null
          return_window_days?: number | null
          reviews?: number | null
          scheduled_expiry_at?: string | null
          scheduled_publish_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          shipping_class?: string | null
          shipping_fee_inr?: number | null
          shipping_fee_usd?: number | null
          sku?: string | null
          slug?: string | null
          sold_count?: number | null
          sort_order?: number | null
          specifications?: Json | null
          staff_pick?: boolean | null
          status?: string | null
          stock_quantity?: number | null
          stripe_enabled?: boolean | null
          tagline?: string | null
          tags?: string[] | null
          trending?: boolean | null
          updated_at?: string | null
          upsell_products?: string[] | null
          video_url?: string | null
          views_count?: number | null
          warranty?: string | null
          wishlist_count?: number | null
        }
        Update: {
          attributes?: Json | null
          bestseller?: boolean | null
          brand?: string | null
          categories?: string[] | null
          category?: string | null
          category_position?: number | null
          cod_enabled?: boolean | null
          collection?: string | null
          collections?: string[] | null
          compare_price_inr?: number | null
          compare_price_usd?: number | null
          created_at?: string | null
          cross_sell_products?: string[] | null
          customs_info?: string | null
          default_variant_color?: string | null
          delivery_estimate?: string | null
          description?: string | null
          discount?: number | null
          editors_choice?: boolean | null
          fast_selling?: boolean | null
          featured?: boolean | null
          featured_until?: string | null
          features?: string[] | null
          flash_deal?: boolean | null
          fragile?: boolean | null
          gift_idea?: boolean | null
          hide_from_recommendations?: boolean | null
          hide_from_search?: boolean | null
          homepage_hero?: boolean | null
          homepage_position?: number | null
          homepage_section?: string | null
          hot_deal?: boolean | null
          id?: string | null
          image?: string | null
          in_stock?: boolean | null
          india_visible?: boolean | null
          international_shipping?: boolean | null
          international_visible?: boolean | null
          inventory_tracking?: boolean | null
          is_category_banner?: boolean | null
          low_stock_threshold?: number | null
          meta_keywords?: string[] | null
          name?: string | null
          new_arrival?: boolean | null
          paypal_enabled?: boolean | null
          pickup_supported?: boolean | null
          premium?: boolean | null
          preorder?: boolean | null
          price?: number | null
          price_inr?: number | null
          price_usd?: number | null
          priority_score?: number | null
          product_type?: string | null
          rating?: number | null
          rating_source?: string | null
          razorpay_enabled?: boolean | null
          recommended?: boolean | null
          related_products?: string[] | null
          replacement_eligible?: boolean | null
          restock_eta?: string | null
          return_eligible?: boolean | null
          return_window_days?: number | null
          reviews?: number | null
          scheduled_expiry_at?: string | null
          scheduled_publish_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          shipping_class?: string | null
          shipping_fee_inr?: number | null
          shipping_fee_usd?: number | null
          sku?: string | null
          slug?: string | null
          sold_count?: number | null
          sort_order?: number | null
          specifications?: Json | null
          staff_pick?: boolean | null
          status?: string | null
          stock_quantity?: number | null
          stripe_enabled?: boolean | null
          tagline?: string | null
          tags?: string[] | null
          trending?: boolean | null
          updated_at?: string | null
          upsell_products?: string[] | null
          video_url?: string | null
          views_count?: number | null
          warranty?: string | null
          wishlist_count?: number | null
        }
        Relationships: []
      }
      store_settings_public: {
        Row: {
          cod_enabled: boolean | null
          flat_shipping_inr: number | null
          flat_shipping_usd: number | null
          free_shipping_enabled: boolean | null
          free_shipping_threshold_inr: number | null
          free_shipping_threshold_usd: number | null
          id: boolean | null
          include_seed_in_analytics: boolean | null
          prepaid_discount_percent: number | null
          shipping_mode: string | null
          support_response_minutes: number | null
          support_status: string | null
          support_whatsapp_numbers: string[] | null
          updated_at: string | null
        }
        Insert: {
          cod_enabled?: boolean | null
          flat_shipping_inr?: number | null
          flat_shipping_usd?: number | null
          free_shipping_enabled?: boolean | null
          free_shipping_threshold_inr?: number | null
          free_shipping_threshold_usd?: number | null
          id?: boolean | null
          include_seed_in_analytics?: boolean | null
          prepaid_discount_percent?: number | null
          shipping_mode?: string | null
          support_response_minutes?: number | null
          support_status?: string | null
          support_whatsapp_numbers?: string[] | null
          updated_at?: string | null
        }
        Update: {
          cod_enabled?: boolean | null
          flat_shipping_inr?: number | null
          flat_shipping_usd?: number | null
          free_shipping_enabled?: boolean | null
          free_shipping_threshold_inr?: number | null
          free_shipping_threshold_usd?: number | null
          id?: boolean | null
          include_seed_in_analytics?: boolean | null
          prepaid_discount_percent?: number | null
          shipping_mode?: string | null
          support_response_minutes?: number | null
          support_status?: string | null
          support_whatsapp_numbers?: string[] | null
          updated_at?: string | null
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
      admin_bulk_products: {
        Args: { _action: string; _ids: string[]; _params?: Json }
        Returns: Json
      }
      admin_change_region: {
        Args: {
          _actor: string
          _method?: string
          _reason?: string
          _region: string
          _target: string
        }
        Returns: string
      }
      admin_order_detail: { Args: { _order_id: string }; Returns: Json }
      admin_order_operations: { Args: { _limit?: number }; Returns: Json }
      admin_staff_performance: { Args: never; Returns: Json }
      admin_user_directory: { Args: never; Returns: Json }
      audit_flash_deals: {
        Args: never
        Returns: {
          details: Json
          duplicates_found: number
          expired_deactivated: number
          id: string
          invalid_product_deactivated: number
          out_of_stock_deactivated: number
          ran_at: string
        }
        SetofOptions: {
          from: "*"
          to: "flash_deal_audit_log"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      backfill_order_lifecycle: { Args: never; Returns: Json }
      can_access_support_thread: { Args: { _topic: string }; Returns: boolean }
      can_review_product: { Args: { _slug: string }; Returns: boolean }
      check_order_integrity: { Args: never; Returns: Json }
      commit_order_stock: { Args: { _order_id: string }; Returns: undefined }
      customer_cancel_order: {
        Args: { _order_id: string; _user_id: string }
        Returns: Json
      }
      customer_product_state: { Args: { _slug: string }; Returns: Json }
      customer_restriction_message: {
        Args: { _operation: string; _user_id: string }
        Returns: string
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      discard_editor_draft: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: undefined
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      email_queue_status: { Args: never; Returns: Json }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_flash_deals: { Args: never; Returns: number }
      expire_stale_orders: { Args: never; Returns: number }
      fom_seo_description: {
        Args: { p_category: string; p_name: string; p_tagline: string }
        Returns: string
      }
      fom_seo_keywords: {
        Args: { p_category: string; p_name: string; p_tags: string[] }
        Returns: string[]
      }
      fom_seo_title: { Args: { p_name: string }; Returns: string }
      fom_slugify: { Args: { p_text: string }; Returns: string }
      get_fbt: {
        Args: { _limit?: number; _slug: string }
        Returns: {
          co_count: number
          product_slug: string
        }[]
      }
      get_product_questions: {
        Args: { _slug: string }
        Returns: {
          answer: string
          answered_at: string
          author_avatar: string
          author_name: string
          created_at: string
          id: string
          is_mine: boolean
          product_slug: string
          question: string
        }[]
      }
      get_public_profiles: {
        Args: { _ids: string[] }
        Returns: {
          avatar_url: string
          full_name: string
          id: string
        }[]
      }
      get_seed_status: { Args: never; Returns: Json }
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
      is_product_published: { Args: { _slug: string }; Returns: boolean }
      is_security_admin: { Args: { _user_id?: string }; Returns: boolean }
      is_security_staff: { Args: { _user_id?: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id?: string }; Returns: boolean }
      log_admin_activity: {
        Args: {
          _action: string
          _entity_id?: string
          _entity_type?: string
          _metadata?: Json
        }
        Returns: number
      }
      log_media_event: {
        Args: {
          _action: string
          _asset_id?: string
          _entity_ref?: string
          _entity_type?: string
          _meta?: Json
        }
        Returns: string
      }
      manage_user_role: {
        Args: {
          _grant: boolean
          _reason?: string
          _role: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
        }
        Returns: undefined
      }
      media_library_search: {
        Args: {
          _entity_type?: string
          _limit?: number
          _offset?: number
          _q?: string
        }
        Returns: {
          alt: string | null
          analysis: Json | null
          bucket: string
          created_at: string
          entity_ref: string | null
          entity_type: string
          height: number | null
          id: string
          large_url: string | null
          medium_url: string | null
          mime: string | null
          normalized_url: string | null
          original_name: string | null
          path: string
          size_bytes: number | null
          tags: string[]
          thumb_url: string | null
          updated_at: string
          uploaded_by: string | null
          url: string
          usage_count: number
          width: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "media_assets"
          isOneToOne: false
          isSetofReturn: true
        }
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
          _priority?: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _title: string
          _type: string
        }
        Returns: undefined
      }
      notify_staff: {
        Args: {
          p_body: string
          p_data: Json
          p_link: string
          p_priority: string
          p_title: string
          p_type: string
        }
        Returns: number
      }
      order_lifecycle_step: { Args: { _status: string }; Returns: number }
      payment_allows_fulfillment: {
        Args: { _payment_method: string; _payment_status: string }
        Returns: boolean
      }
      product_trust_score: { Args: { _slug: string }; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalculate_product_rating: {
        Args: { _slug: string }
        Returns: undefined
      }
      refresh_product_rating: { Args: { _slug: string }; Returns: undefined }
      refresh_review_vote_counts: {
        Args: { _review_id: string }
        Returns: undefined
      }
      release_expired_order_reservations: { Args: never; Returns: number }
      release_order_stock: {
        Args: { _order_id: string; _reason?: string }
        Returns: undefined
      }
      remove_seed_data: { Args: never; Returns: Json }
      reorder_banner: {
        Args: { _direction: string; _id: string }
        Returns: undefined
      }
      reorder_category: {
        Args: { _direction: string; _id: string }
        Returns: undefined
      }
      reserve_order_stock: {
        Args: { _order_id: string; _ttl_minutes?: number }
        Returns: undefined
      }
      retry_all_failed_executions: { Args: never; Returns: Json }
      retry_failed_execution: {
        Args: { p_execution_id: string }
        Returns: Json
      }
      review_dashboard: { Args: never; Returns: Json }
      run_marketing_automations:
        | {
            Args: { p_force?: boolean; p_triggered_by?: string }
            Returns: Json
          }
        | {
            Args: {
              p_force?: boolean
              p_only_automation?: string
              p_triggered_by?: string
            }
            Returns: Json
          }
      save_entity_version: {
        Args: {
          _changed_fields?: string[]
          _entity_id: string
          _entity_type: string
          _snapshot: Json
          _summary?: string
        }
        Returns: string
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
          admin_notes: string | null
          attributes: Json
          barcode: string | null
          base_image: string | null
          bestseller: boolean
          brand: string | null
          categories: string[]
          category: string
          category_position: number | null
          cod_enabled: boolean
          collection: string | null
          collections: string[]
          compare_price_inr: number | null
          compare_price_usd: number | null
          cost: number
          cost_price_inr: number | null
          cost_price_usd: number | null
          created_at: string
          cross_sell_products: string[]
          customs_info: string | null
          default_variant_color: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivery_estimate: string | null
          demo_url: string | null
          description: string | null
          discount: number | null
          editors_choice: boolean
          fast_selling: boolean
          featured: boolean
          featured_until: string | null
          features: string[]
          flash_deal: boolean
          fragile: boolean
          gift_idea: boolean
          has_variants: boolean
          height: number | null
          hide_from_recommendations: boolean
          hide_from_search: boolean
          homepage_hero: boolean
          homepage_position: number | null
          homepage_section: string | null
          hot_deal: boolean
          id: string
          image: string | null
          image_phash: string | null
          in_stock: boolean
          india_visible: boolean
          initial_rating: number
          initial_review_count: number
          international_shipping: boolean
          international_visible: boolean
          inventory_tracking: boolean
          is_category_banner: boolean
          length: number | null
          low_stock_threshold: number
          meta_keywords: string[]
          name: string
          new_arrival: boolean
          orders_count: number
          paypal_enabled: boolean
          pickup_supported: boolean
          premium: boolean
          preorder: boolean
          price: number
          price_inr: number | null
          price_usd: number | null
          priority_score: number | null
          product_type: string | null
          rating: number
          rating_source: string
          razorpay_enabled: boolean
          recommended: boolean
          related_products: string[]
          replacement_eligible: boolean
          reserved_quantity: number
          restock_eta: string | null
          return_eligible: boolean
          return_window_days: number
          revenue: number
          reviews: number
          scheduled_expiry_at: string | null
          scheduled_publish_at: string | null
          search_text: string | null
          search_vector: unknown
          seo_description: string | null
          seo_title: string | null
          shipping_class: string | null
          shipping_fee_inr: number
          shipping_fee_usd: number
          sku: string | null
          slug: string
          sold_count: number
          sort_order: number
          specifications: Json
          staff_pick: boolean
          status: string
          stock_quantity: number
          stripe_enabled: boolean
          tagline: string | null
          tags: string[]
          trending: boolean
          updated_at: string
          upsell_products: string[]
          variant_image_max: number | null
          video_url: string | null
          views_count: number
          warehouse_location: string | null
          warranty: string
          weight: number | null
          width: number | null
          wishlist_count: number
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      seed_all: { Args: { _scale?: number }; Returns: Json }
      seed_analytics: { Args: { _days?: number }; Returns: number }
      seed_customers: { Args: { _count?: number }; Returns: number }
      seed_orders: { Args: { _count?: number }; Returns: number }
      seed_questions: { Args: { _count?: number }; Returns: number }
      seed_returns: { Args: { _count?: number }; Returns: number }
      seed_reviews: { Args: { _count?: number }; Returns: number }
      seed_shipments: { Args: never; Returns: number }
      seed_support: { Args: { _count?: number }; Returns: number }
      self_lock_region: {
        Args: { _country?: string; _method?: string; _region: string }
        Returns: string
      }
      set_automation_settings: {
        Args: {
          p_emergency: boolean
          p_global: boolean
          p_maintenance: boolean
        }
        Returns: {
          emergency_stop: boolean
          global_pause: boolean
          id: boolean
          maintenance_mode: boolean
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "automation_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_own_question: { Args: { p_id: string }; Returns: undefined }
      soft_delete_own_review: { Args: { p_id: string }; Returns: undefined }
      storage_object_is_published_product_image: {
        Args: { _object_name: string }
        Returns: boolean
      }
      submit_review: {
        Args: {
          p_body?: string
          p_media?: Json
          p_product_slug: string
          p_rating: number
          p_title?: string
        }
        Returns: string
      }
      suggest_search_term: { Args: { q: string }; Returns: string }
      support_admin_unread_count: { Args: never; Returns: number }
      support_availability: { Args: never; Returns: Json }
      support_unread_count: { Args: never; Returns: number }
      svc_acquisition_metrics: {
        Args: { p_since: string; p_window_days: number }
        Returns: Json
      }
      svc_activate_segment: {
        Args: {
          _actor: string
          p_action: string
          p_kind?: string
          p_label?: string
          p_link?: string
          p_message?: string
          p_segment: string
          p_value?: number
        }
        Returns: Json
      }
      svc_admin_order_detail: {
        Args: { _actor: string; _order_id: string }
        Returns: Json
      }
      svc_admin_order_operations: {
        Args: { _actor: string; _limit?: number }
        Returns: Json
      }
      svc_admin_staff_performance: { Args: { _actor: string }; Returns: Json }
      svc_admin_user_directory: { Args: { _actor: string }; Returns: Json }
      svc_campaign_metrics: {
        Args: { p_since: string; p_window_days: number }
        Returns: Json
      }
      svc_campaign_timeline: {
        Args: { p_campaign: string; p_since: string }
        Returns: Json
      }
      svc_customer_center: {
        Args: {
          _actor: string
          _limit?: number
          _offset?: number
          _search?: string
        }
        Returns: Json
      }
      svc_customer_profile: {
        Args: { _actor: string; _customer: string }
        Returns: Json
      }
      svc_database_health: { Args: never; Returns: Json }
      svc_executive_analytics: { Args: { _actor: string }; Returns: Json }
      svc_marketing_intelligence: { Args: { _actor?: string }; Returns: Json }
      svc_order_integrity: { Args: { _actor: string }; Returns: Json }
      svc_payment_center: {
        Args: {
          _actor: string
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
        }
        Returns: Json
      }
      svc_retry_all_failed_executions: {
        Args: { _actor: string }
        Returns: Json
      }
      svc_retry_failed_execution: {
        Args: { _actor: string; p_execution_id: string }
        Returns: Json
      }
      svc_revenue_attribution: { Args: { _actor: string }; Returns: Json }
      svc_run_marketing_automations: {
        Args: {
          _actor: string
          p_force?: boolean
          p_only_automation?: string
          p_triggered_by?: string
        }
        Returns: Json
      }
      svc_seo_intelligence: { Args: { p_since?: string }; Returns: Json }
      svc_set_automation_settings: {
        Args: {
          _actor: string
          p_emergency: boolean
          p_global: boolean
          p_maintenance: boolean
        }
        Returns: {
          emergency_stop: boolean
          global_pause: boolean
          id: boolean
          maintenance_mode: boolean
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "automation_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      track_banner_event: {
        Args: { _banner_id: string; _event: string }
        Returns: undefined
      }
      track_category_event: {
        Args: { _event: string; _id: string }
        Returns: undefined
      }
      track_visit: {
        Args: {
          _country?: string
          _device?: string
          _is_new_session?: boolean
          _path: string
          _referrer?: string
          _session_id: string
          _user_agent?: string
        }
        Returns: undefined
      }
      trending_products: {
        Args: { page_limit?: number }
        Returns: {
          admin_notes: string | null
          attributes: Json
          barcode: string | null
          base_image: string | null
          bestseller: boolean
          brand: string | null
          categories: string[]
          category: string
          category_position: number | null
          cod_enabled: boolean
          collection: string | null
          collections: string[]
          compare_price_inr: number | null
          compare_price_usd: number | null
          cost: number
          cost_price_inr: number | null
          cost_price_usd: number | null
          created_at: string
          cross_sell_products: string[]
          customs_info: string | null
          default_variant_color: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivery_estimate: string | null
          demo_url: string | null
          description: string | null
          discount: number | null
          editors_choice: boolean
          fast_selling: boolean
          featured: boolean
          featured_until: string | null
          features: string[]
          flash_deal: boolean
          fragile: boolean
          gift_idea: boolean
          has_variants: boolean
          height: number | null
          hide_from_recommendations: boolean
          hide_from_search: boolean
          homepage_hero: boolean
          homepage_position: number | null
          homepage_section: string | null
          hot_deal: boolean
          id: string
          image: string | null
          image_phash: string | null
          in_stock: boolean
          india_visible: boolean
          initial_rating: number
          initial_review_count: number
          international_shipping: boolean
          international_visible: boolean
          inventory_tracking: boolean
          is_category_banner: boolean
          length: number | null
          low_stock_threshold: number
          meta_keywords: string[]
          name: string
          new_arrival: boolean
          orders_count: number
          paypal_enabled: boolean
          pickup_supported: boolean
          premium: boolean
          preorder: boolean
          price: number
          price_inr: number | null
          price_usd: number | null
          priority_score: number | null
          product_type: string | null
          rating: number
          rating_source: string
          razorpay_enabled: boolean
          recommended: boolean
          related_products: string[]
          replacement_eligible: boolean
          reserved_quantity: number
          restock_eta: string | null
          return_eligible: boolean
          return_window_days: number
          revenue: number
          reviews: number
          scheduled_expiry_at: string | null
          scheduled_publish_at: string | null
          search_text: string | null
          search_vector: unknown
          seo_description: string | null
          seo_title: string | null
          shipping_class: string | null
          shipping_fee_inr: number
          shipping_fee_usd: number
          sku: string | null
          slug: string
          sold_count: number
          sort_order: number
          specifications: Json
          staff_pick: boolean
          status: string
          stock_quantity: number
          stripe_enabled: boolean
          tagline: string | null
          tags: string[]
          trending: boolean
          updated_at: string
          upsell_products: string[]
          variant_image_max: number | null
          video_url: string | null
          views_count: number
          warehouse_location: string | null
          warranty: string
          weight: number | null
          width: number | null
          wishlist_count: number
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      try_fire_campaign_alert: {
        Args: { _alert_key: string; _campaign_id: string }
        Returns: boolean
      }
      update_own_review: {
        Args: {
          p_body?: string
          p_id: string
          p_media?: Json
          p_rating: number
          p_title?: string
        }
        Returns: undefined
      }
      upsert_editor_draft: {
        Args: {
          _base_snapshot?: Json
          _data: Json
          _device_label?: string
          _entity_id: string
          _entity_type: string
          _status?: string
        }
        Returns: string
      }
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
