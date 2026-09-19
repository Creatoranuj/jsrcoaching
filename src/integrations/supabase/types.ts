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
      app_config: {
        Row: {
          android_store_url: string | null
          id: number
          force_update: boolean
          ios_store_url: string | null
          latest_android_version: string
          latest_ios_version: string
          min_android_version: string
          min_ios_version: string
          update_message: string
          update_notes: string | null
          updated_at: string
        }
        Insert: {
          android_store_url?: string | null
          id?: number
          force_update?: boolean
          ios_store_url?: string | null
          latest_android_version?: string
          latest_ios_version?: string
          min_android_version?: string
          min_ios_version?: string
          update_message?: string
          update_notes?: string | null
          updated_at?: string
        }
        Update: {
          android_store_url?: string | null
          id?: number
          force_update?: boolean
          ios_store_url?: string | null
          latest_android_version?: string
          latest_ios_version?: string
          min_android_version?: string
          min_ios_version?: string
          update_message?: string
          update_notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_installs: {
        Row: {
          app_version: string | null
          device_id: string
          first_seen_at: string
          id: string
          last_seen_at: string
          os_version: string | null
          platform: string
          source: string
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          device_id: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          os_version?: string | null
          platform?: string
          source?: string
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          device_id?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          os_version?: string | null
          platform?: string
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      attendance: {
        Row: {
          created_at: string
          date: string
          id: number
          status: string
          student_id: number
        }
        Insert: {
          created_at?: string
          date?: string
          id?: number
          status: string
          student_id: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: number
          status?: string
          student_id?: number
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          record_count: number | null
          table_name: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          record_count?: number | null
          table_name: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          record_count?: number | null
          table_name?: string
          user_id?: string
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          action_config: Json | null
          action_type: string
          condition: Json | null
          created_at: string
          created_by: string | null
          execution_count: number | null
          id: string
          is_active: boolean
          last_executed_at: string | null
          name: string
          trigger_event: string
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          condition?: Json | null
          created_at?: string
          created_by?: string | null
          execution_count?: number | null
          id?: string
          is_active?: boolean
          last_executed_at?: string | null
          name: string
          trigger_event: string
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          condition?: Json | null
          created_at?: string
          created_by?: string | null
          execution_count?: number | null
          id?: string
          is_active?: boolean
          last_executed_at?: string | null
          name?: string
          trigger_event?: string
        }
        Relationships: []
      }
      books: {
        Row: {
          amazon_url: string
          author: string
          click_count: number | null
          cover_url: string
          created_at: string
          description: string
          genre: string | null
          id: string
          position: number | null
          title: string
          updated_at: string
        }
        Insert: {
          amazon_url: string
          author: string
          click_count?: number | null
          cover_url: string
          created_at?: string
          description: string
          genre?: string | null
          id?: string
          position?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          amazon_url?: string
          author?: string
          click_count?: number | null
          cover_url?: string
          created_at?: string
          description?: string
          genre?: string | null
          id?: string
          position?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      chapters: {
        Row: {
          code: string
          course_id: number
          created_at: string
          description: string | null
          id: string
          parent_id: string | null
          position: number
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          code: string
          course_id: number
          created_at?: string
          description?: string | null
          id?: string
          parent_id?: string | null
          position?: number
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          code?: string
          course_id?: number
          created_at?: string
          description?: string | null
          id?: string
          parent_id?: string | null
          position?: number
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_faq: {
        Row: {
          answer: string
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          question: string
          updated_at: string | null
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          question: string
          updated_at?: string | null
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          question?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      chatbot_feedback: {
        Row: {
          created_at: string
          id: string
          message_content: string | null
          rating: number | null
          response_content: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_content?: string | null
          rating?: number | null
          response_content?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_content?: string | null
          rating?: number | null
          response_content?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_logs: {
        Row: {
          created_at: string | null
          id: string
          message: string
          response: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          response: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          response?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      chatbot_settings: {
        Row: {
          enable_mock_help: boolean | null
          id: number
          max_tokens: number | null
          model: string | null
          provider: string | null
          system_prompt: string | null
          temperature: number | null
          updated_at: string | null
        }
        Insert: {
          enable_mock_help?: boolean | null
          id?: number
          max_tokens?: number | null
          model?: string | null
          provider?: string | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
        }
        Update: {
          enable_mock_help?: boolean | null
          id?: number
          max_tokens?: number | null
          model?: string | null
          provider?: string | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          created_at: string | null
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          image_url: string | null
          is_hidden: boolean
          lesson_id: string | null
          message: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          created_at?: string | null
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          image_url?: string | null
          is_hidden?: boolean
          lesson_id?: string | null
          message: string
          user_id?: string | null
          user_name: string
        }
        Update: {
          created_at?: string | null
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          image_url?: string | null
          is_hidden?: boolean
          lesson_id?: string | null
          message?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: []
      }
      community_comments: {
        Row: {
          body: string
          created_at: string
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          is_hidden: boolean
          post_id: string
          user_id: string
          user_name: string
        }
        Insert: {
          body: string
          created_at?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          post_id: string
          user_id: string
          user_name: string
        }
        Update: {
          body?: string
          created_at?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          post_id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string
          body: string | null
          created_at: string
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          is_hidden: boolean
          is_pinned: boolean
          notion_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          is_pinned?: boolean
          notion_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          is_pinned?: boolean
          notion_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      community_reactions: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          created_at: string | null
          description: string | null
          end_date: string | null
          grade: string | null
          id: number
          image_url: string | null
          is_active: boolean
          price: number | null
          start_date: string | null
          teacher_avatar_url: string | null
          teacher_bio: string | null
          teacher_name: string | null
          teacher_title: string | null
          teacher_verified: boolean
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          grade?: string | null
          id?: number
          image_url?: string | null
          is_active?: boolean
          price?: number | null
          start_date?: string | null
          teacher_avatar_url?: string | null
          teacher_bio?: string | null
          teacher_name?: string | null
          teacher_title?: string | null
          teacher_verified?: boolean
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          grade?: string | null
          id?: number
          image_url?: string | null
          is_active?: boolean
          price?: number | null
          start_date?: string | null
          teacher_avatar_url?: string | null
          teacher_bio?: string | null
          teacher_name?: string | null
          teacher_title?: string | null
          teacher_verified?: boolean
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: []
      }
      crawl_history: {
        Row: {
          content_preview: string | null
          crawled_at: string
          crawled_by: string | null
          error_message: string | null
          id: string
          knowledge_entries_created: number
          status: string
          title: string | null
          url: string
        }
        Insert: {
          content_preview?: string | null
          crawled_at?: string
          crawled_by?: string | null
          error_message?: string | null
          id?: string
          knowledge_entries_created?: number
          status?: string
          title?: string | null
          url: string
        }
        Update: {
          content_preview?: string | null
          crawled_at?: string
          crawled_by?: string | null
          error_message?: string | null
          id?: string
          knowledge_entries_created?: number
          status?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "crawl_history_crawled_by_fkey"
            columns: ["crawled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crawl_history_crawled_by_fkey"
            columns: ["crawled_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_requests: {
        Row: {
          email: string
          id: string
          notes: string | null
          processed_at: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          email: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          email?: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      dependency_scan_reports: {
        Row: {
          created_at: string
          findings: Json
          id: string
          package_count: number
          packages: Json
          scanned_by: string | null
          vulnerability_count: number
        }
        Insert: {
          created_at?: string
          findings?: Json
          id?: string
          package_count?: number
          packages?: Json
          scanned_by?: string | null
          vulnerability_count?: number
        }
        Update: {
          created_at?: string
          findings?: Json
          id?: string
          package_count?: number
          packages?: Json
          scanned_by?: string | null
          vulnerability_count?: number
        }
        Relationships: []
      }
      document_progress: {
        Row: {
          completion_percent: number
          created_at: string
          current_page: number
          document_key: string
          document_version: string | null
          id: string
          last_read_at: string
          source: string
          total_pages: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completion_percent?: number
          created_at?: string
          current_page?: number
          document_key: string
          document_version?: string | null
          id?: string
          last_read_at?: string
          source?: string
          total_pages?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completion_percent?: number
          created_at?: string
          current_page?: number
          document_key?: string
          document_version?: string | null
          id?: string
          last_read_at?: string
          source?: string
          total_pages?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      doubt_replies: {
        Row: {
          created_at: string | null
          doubt_session_id: string
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          is_ai: boolean | null
          is_hidden: boolean
          message: string
          parent_reply_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          doubt_session_id: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          is_ai?: boolean | null
          is_hidden?: boolean
          message: string
          parent_reply_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          doubt_session_id?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          is_ai?: boolean | null
          is_hidden?: boolean
          message?: string
          parent_reply_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doubt_replies_doubt_session_id_fkey"
            columns: ["doubt_session_id"]
            isOneToOne: false
            referencedRelation: "doubt_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doubt_replies_parent_reply_id_fkey"
            columns: ["parent_reply_id"]
            isOneToOne: false
            referencedRelation: "doubt_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      doubt_sessions: {
        Row: {
          course_id: number | null
          created_at: string
          description: string
          id: string
          scheduled_at: string | null
          status: string
          student_id: string
          subject: string | null
          teacher_id: string | null
          updated_at: string
          zoom_join_url: string | null
          zoom_meeting_id: string | null
          zoom_meeting_number: string | null
          zoom_password: string | null
        }
        Insert: {
          course_id?: number | null
          created_at?: string
          description: string
          id?: string
          scheduled_at?: string | null
          status?: string
          student_id: string
          subject?: string | null
          teacher_id?: string | null
          updated_at?: string
          zoom_join_url?: string | null
          zoom_meeting_id?: string | null
          zoom_meeting_number?: string | null
          zoom_password?: string | null
        }
        Update: {
          course_id?: number | null
          created_at?: string
          description?: string
          id?: string
          scheduled_at?: string | null
          status?: string
          student_id?: string
          subject?: string | null
          teacher_id?: string | null
          updated_at?: string
          zoom_join_url?: string | null
          zoom_meeting_id?: string | null
          zoom_meeting_number?: string | null
          zoom_password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doubt_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      doubts: {
        Row: {
          created_at: string | null
          id: string
          image_url: string | null
          lesson_id: string | null
          question: string
          resolved: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          lesson_id?: string | null
          question: string
          resolved?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          lesson_id?: string | null
          question?: string
          resolved?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doubts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_video_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doubts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      earning_links: {
        Row: {
          category: string
          created_at: string
          description: string | null
          embed_type: string | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          position: number | null
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          embed_type?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          position?: number | null
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          embed_type?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          position?: number | null
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          course_id: number
          id: number
          last_watched_lesson_id: string | null
          progress_percentage: number | null
          purchased_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          course_id: number
          id?: number
          last_watched_lesson_id?: string | null
          progress_percentage?: number | null
          purchased_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          course_id?: number
          id?: number
          last_watched_lesson_id?: string | null
          progress_percentage?: number | null
          purchased_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_last_watched_lesson_id_fkey"
            columns: ["last_watched_lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_video_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_last_watched_lesson_id_fkey"
            columns: ["last_watched_lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          created_at: string | null
          error_type: string
          id: string
          message: string
          metadata: Json | null
          resolution: string | null
          resolved: boolean | null
          stack_trace: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_type?: string
          id?: string
          message: string
          metadata?: Json | null
          resolution?: string | null
          resolved?: boolean | null
          stack_trace?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_type?: string
          id?: string
          message?: string
          metadata?: Json | null
          resolution?: string | null
          resolved?: boolean | null
          stack_trace?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      funnel_entries: {
        Row: {
          campaign_id: string | null
          created_at: string
          current_stage_id: string | null
          id: string
          lead_email: string | null
          lead_name: string
          lead_phone: string | null
          meta_data: Json | null
          notes: string | null
          score: number | null
          source: string | null
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          current_stage_id?: string | null
          id?: string
          lead_email?: string | null
          lead_name: string
          lead_phone?: string | null
          meta_data?: Json | null
          notes?: string | null
          score?: number | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          current_stage_id?: string | null
          id?: string
          lead_email?: string | null
          lead_name?: string
          lead_phone?: string | null
          meta_data?: Json | null
          notes?: string | null
          score?: number | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_entries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_entries_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_stages: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          position: number
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          position?: number
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          position?: number
        }
        Relationships: []
      }
      hero: {
        Row: {
          created_at: string
          cta_link: string | null
          cta_text: string
          id: string
          image_url: string | null
          is_active: boolean
          position: number
          subtitle: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_link?: string | null
          cta_text?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          position?: number
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_link?: string | null
          cta_text?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          position?: number
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      hero_banners: {
        Row: {
          badge_text: string | null
          bg_color: string
          created_at: string
          cta_link: string
          cta_text: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          position: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          badge_text?: string | null
          bg_color?: string
          created_at?: string
          cta_link?: string
          cta_text?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          position?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          badge_text?: string | null
          bg_color?: string
          created_at?: string
          cta_link?: string
          cta_text?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          position?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          category: string
          content: string
          created_at: string
          embedding: string | null
          id: string
          is_active: boolean | null
          keywords: string[] | null
          position: number | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          position?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          position?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      landing_content: {
        Row: {
          content: Json | null
          section_key: string
        }
        Insert: {
          content?: Json | null
          section_key: string
        }
        Update: {
          content?: Json | null
          section_key?: string
        }
        Relationships: []
      }
      landing_courses: {
        Row: {
          badge: string
          course_id: number | null
          created_at: string
          duration: string
          faculty: string
          id: string
          image_url: string | null
          is_active: boolean
          language: string
          position: number
          price_effective: number | null
          price_mrp: number | null
          route: string | null
          seats: string | null
          short: string
          slug: string
          start_date: string
          title: string
          updated_at: string
        }
        Insert: {
          badge?: string
          course_id?: number | null
          created_at?: string
          duration?: string
          faculty?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          language?: string
          position?: number
          price_effective?: number | null
          price_mrp?: number | null
          route?: string | null
          seats?: string | null
          short?: string
          slug: string
          start_date?: string
          title: string
          updated_at?: string
        }
        Update: {
          badge?: string
          course_id?: number | null
          created_at?: string
          duration?: string
          faculty?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          language?: string
          position?: number
          price_effective?: number | null
          price_mrp?: number | null
          route?: string | null
          seats?: string | null
          short?: string
          slug?: string
          start_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_testimonials: {
        Row: {
          avatar_url: string | null
          created_at: string
          exam_track: string | null
          id: string
          is_active: boolean
          position: number
          quote: string
          rating: number
          student_name: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          exam_track?: string | null
          id?: string
          is_active?: boolean
          position?: number
          quote: string
          rating?: number
          student_name: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          exam_track?: string | null
          id?: string
          is_active?: boolean
          position?: number
          quote?: string
          rating?: number
          student_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          created_at: string | null
          email: string | null
          grade: string
          id: number
          phone: string | null
          source: string | null
          student_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          grade: string
          id?: number
          phone?: string | null
          source?: string | null
          student_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          grade?: string
          id?: number
          phone?: string | null
          source?: string | null
          student_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      lecture_notes: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          markdown: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          markdown?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          markdown?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lecture_schedules: {
        Row: {
          chapter_id: string | null
          course_id: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          meeting_link: string | null
          scheduled_date: string
          scheduled_time: string
          title: string
          updated_at: string | null
        }
        Insert: {
          chapter_id?: string | null
          course_id?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          meeting_link?: string | null
          scheduled_date: string
          scheduled_time: string
          title: string
          updated_at?: string | null
        }
        Update: {
          chapter_id?: string | null
          course_id?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          meeting_link?: string | null
          scheduled_date?: string
          scheduled_time?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lecture_schedules_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecture_schedules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          kind: string
          lesson_id: string
          mime_type: string | null
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          kind?: string
          lesson_id: string
          mime_type?: string | null
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          kind?: string
          lesson_id?: string
          mime_type?: string | null
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_attachments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_video_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_attachments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_bookmarks: {
        Row: {
          at_seconds: number
          created_at: string
          id: string
          lesson_id: string
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          at_seconds?: number
          created_at?: string
          id?: string
          lesson_id: string
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          at_seconds?: number
          created_at?: string
          id?: string
          lesson_id?: string
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lesson_chapters: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          position: number
          start_seconds: number
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          position?: number
          start_seconds: number
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          position?: number
          start_seconds?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_chapters_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_video_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_chapters_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_likes: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: []
      }
      lesson_pdfs: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          lesson_id: string
          position: number | null
          skill_level: string
          subject: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          lesson_id: string
          position?: number | null
          skill_level?: string
          subject?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          lesson_id?: string
          position?: number | null
          skill_level?: string
          subject?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_pdfs_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_video_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_pdfs_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed: boolean
          id: string
          last_position_seconds: number
          lesson_id: string
          updated_at: string
          user_id: string
          watched_intervals: Json
          watched_seconds: number
        }
        Insert: {
          completed?: boolean
          id?: string
          last_position_seconds?: number
          lesson_id: string
          updated_at?: string
          user_id: string
          watched_intervals?: Json
          watched_seconds?: number
        }
        Update: {
          completed?: boolean
          id?: string
          last_position_seconds?: number
          lesson_id?: string
          updated_at?: string
          user_id?: string
          watched_intervals?: Json
          watched_seconds?: number
        }
        Relationships: []
      }
      lesson_quiz_markers: {
        Row: {
          at_seconds: number
          created_at: string
          id: string
          label: string | null
          lesson_id: string
          quiz_id: string | null
        }
        Insert: {
          at_seconds: number
          created_at?: string
          id?: string
          label?: string | null
          lesson_id: string
          quiz_id?: string | null
        }
        Update: {
          at_seconds?: number
          created_at?: string
          id?: string
          label?: string | null
          lesson_id?: string
          quiz_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_quiz_markers_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_video_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_quiz_markers_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          lesson_id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          lesson_id: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          lesson_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_ratings_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_video_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_ratings_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          auto_transcript: string | null
          auto_transcript_fetched_at: string | null
          auto_transcript_lang: string | null
          auto_transcript_status: string | null
          category: string | null
          chapter_id: string | null
          class_pdf_url: string | null
          course_id: number | null
          created_at: string | null
          description: string | null
          duration: number | null
          duration_seconds: number | null
          file_path: string | null
          id: string
          is_free: boolean
          is_locked: boolean | null
          is_preview: boolean
          lecture_type: string | null
          like_count: number | null
          notes_title: string | null
          overview: string | null
          position: number | null
          thumbnail_url: string | null
          title: string
          transcript_md: string | null
          video_url: string
          youtube_id: string | null
        }
        Insert: {
          auto_transcript?: string | null
          auto_transcript_fetched_at?: string | null
          auto_transcript_lang?: string | null
          auto_transcript_status?: string | null
          category?: string | null
          chapter_id?: string | null
          class_pdf_url?: string | null
          course_id?: number | null
          created_at?: string | null
          description?: string | null
          duration?: number | null
          duration_seconds?: number | null
          file_path?: string | null
          id?: string
          is_free?: boolean
          is_locked?: boolean | null
          is_preview?: boolean
          lecture_type?: string | null
          like_count?: number | null
          notes_title?: string | null
          overview?: string | null
          position?: number | null
          thumbnail_url?: string | null
          title: string
          transcript_md?: string | null
          video_url: string
          youtube_id?: string | null
        }
        Update: {
          auto_transcript?: string | null
          auto_transcript_fetched_at?: string | null
          auto_transcript_lang?: string | null
          auto_transcript_status?: string | null
          category?: string | null
          chapter_id?: string | null
          class_pdf_url?: string | null
          course_id?: number | null
          created_at?: string | null
          description?: string | null
          duration?: number | null
          duration_seconds?: number | null
          file_path?: string | null
          id?: string
          is_free?: boolean
          is_locked?: boolean | null
          is_preview?: boolean
          lecture_type?: string | null
          like_count?: number | null
          notes_title?: string | null
          overview?: string | null
          position?: number | null
          thumbnail_url?: string | null
          title?: string
          transcript_md?: string | null
          video_url?: string
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      live_messages: {
        Row: {
          answer: string | null
          created_at: string | null
          id: string
          is_answered: boolean | null
          message: string
          session_id: string
          type: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          answer?: string | null
          created_at?: string | null
          id?: string
          is_answered?: boolean | null
          message: string
          session_id: string
          type?: string | null
          user_id: string
          user_name: string
        }
        Update: {
          answer?: string | null
          created_at?: string | null
          id?: string
          is_answered?: boolean | null
          message?: string
          session_id?: string
          type?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_participants: {
        Row: {
          hand_raised: boolean
          id: string
          joined_at: string
          session_id: string
          user_id: string
          user_name: string
        }
        Insert: {
          hand_raised?: boolean
          id?: string
          joined_at?: string
          session_id: string
          user_id: string
          user_name: string
        }
        Update: {
          hand_raised?: boolean
          id?: string
          joined_at?: string
          session_id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_reminders: {
        Row: {
          created_at: string
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_reminders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          course_id: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          ended_at: string | null
          id: string
          is_active: boolean | null
          recording_url: string | null
          scheduled_at: string | null
          started_at: string | null
          title: string
          youtube_live_id: string
        }
        Insert: {
          course_id?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean | null
          recording_url?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          title: string
          youtube_live_id: string
        }
        Update: {
          course_id?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean | null
          recording_url?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          title?: string
          youtube_live_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          budget: number | null
          clicks: number | null
          conversions: number | null
          cpc: number | null
          created_at: string
          created_by: string | null
          ctr: number | null
          end_date: string | null
          id: string
          impressions: number | null
          leads_generated: number | null
          meta_campaign_id: string | null
          name: string
          platform: string
          spent: number | null
          start_date: string | null
          status: string
          target_audience: Json | null
          updated_at: string
        }
        Insert: {
          budget?: number | null
          clicks?: number | null
          conversions?: number | null
          cpc?: number | null
          created_at?: string
          created_by?: string | null
          ctr?: number | null
          end_date?: string | null
          id?: string
          impressions?: number | null
          leads_generated?: number | null
          meta_campaign_id?: string | null
          name: string
          platform?: string
          spent?: number | null
          start_date?: string | null
          status?: string
          target_audience?: Json | null
          updated_at?: string
        }
        Update: {
          budget?: number | null
          clicks?: number | null
          conversions?: number | null
          cpc?: number | null
          created_at?: string
          created_by?: string | null
          ctr?: number | null
          end_date?: string | null
          id?: string
          impressions?: number | null
          leads_generated?: number | null
          meta_campaign_id?: string | null
          name?: string
          platform?: string
          spent?: number | null
          start_date?: string | null
          status?: string
          target_audience?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          course_id: number | null
          created_at: string
          description: string | null
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          lesson_id: string | null
          title: string
          uploaded_by: string | null
        }
        Insert: {
          course_id?: number | null
          created_at?: string
          description?: string | null
          file_size?: number | null
          file_type: string
          file_url: string
          id?: string
          lesson_id?: string | null
          title: string
          uploaded_by?: string | null
        }
        Update: {
          course_id?: number | null
          created_at?: string
          description?: string | null
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          lesson_id?: string | null
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_video_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_type: string | null
          attachment_url: string | null
          content: string
          created_at: string
          id: string
          is_read: boolean | null
          recipient_id: string
          sender_id: string
          subject: string
        }
        Insert: {
          attachment_type?: string | null
          attachment_url?: string | null
          content: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          recipient_id: string
          sender_id: string
          subject: string
        }
        Update: {
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          recipient_id?: string
          sender_id?: string
          subject?: string
        }
        Relationships: []
      }
      meta_ad_config: {
        Row: {
          config_key: string
          config_value: string
          description: string | null
          id: string
          is_active: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config_key: string
          config_value?: string
          description?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config_key?: string
          config_value?: string
          description?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notes: {
        Row: {
          created_at: string | null
          id: string
          lesson_id: string | null
          pdf_url: string
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          pdf_url: string
          title: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          pdf_url?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_video_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          expires_at: string | null
          id: string
          is_pinned: boolean | null
          pdf_url: string | null
          target_role: Database["public"]["Enums"]["app_role"] | null
          title: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_pinned?: boolean | null
          pdf_url?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          title: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_pinned?: boolean | null
          pdf_url?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          title?: string
        }
        Relationships: []
      }
      notification_reads: {
        Row: {
          id: string
          notice_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notice_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notice_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          course_id: number | null
          created_at: string
          event_type: string
          id: string
          idempotency_key: string | null
          metadata: Json | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          user_id: string | null
        }
        Insert: {
          course_id?: number | null
          created_at?: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          user_id?: string | null
        }
        Update: {
          course_id?: number | null
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          amount: number | null
          approved_at: string | null
          approved_by: string | null
          course_id: number | null
          created_at: string | null
          id: number
          rejected_at: string | null
          rejected_by: string | null
          screenshot_url: string | null
          sender_name: string | null
          status: string | null
          transaction_id: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          course_id?: number | null
          created_at?: string | null
          id?: number
          rejected_at?: string | null
          rejected_by?: string | null
          screenshot_url?: string | null
          sender_name?: string | null
          status?: string | null
          transaction_id?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          course_id?: number | null
          created_at?: string | null
          id?: number
          rejected_at?: string | null
          rejected_by?: string | null
          screenshot_url?: string | null
          sender_name?: string | null
          status?: string | null
          transaction_id?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_proxy_metrics: {
        Row: {
          created_at: string
          drive_id: string | null
          event: string
          id: string
          last_content_type: string | null
          last_status: number | null
          tier: string | null
        }
        Insert: {
          created_at?: string
          drive_id?: string | null
          event: string
          id?: string
          last_content_type?: string | null
          last_status?: number | null
          tier?: string | null
        }
        Update: {
          created_at?: string
          drive_id?: string | null
          event?: string
          id?: string
          last_content_type?: string | null
          last_status?: number | null
          tier?: string | null
        }
        Relationships: []
      }
      phone_otps: {
        Row: {
          attempts: number
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          otp_hash: string
          phone: string
        }
        Insert: {
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          ip_address?: string | null
          otp_hash: string
          phone: string
        }
        Update: {
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          otp_hash?: string
          phone?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_blocked: boolean
          mobile: string | null
        }
        Insert: {
          avatar_url?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_blocked?: boolean
          mobile?: string | null
        }
        Update: {
          avatar_url?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_blocked?: boolean
          mobile?: string | null
        }
        Relationships: []
      }
      push_notifications_log: {
        Row: {
          body: string
          created_at: string
          failed_count: number
          id: string
          sent_by: string | null
          sent_count: number
          target_path: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          failed_count?: number
          id?: string
          sent_by?: string | null
          sent_count?: number
          target_path?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          failed_count?: number
          id?: string
          sent_by?: string | null
          sent_count?: number
          target_path?: string | null
          title?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          correct_answer: string
          created_at: string | null
          explanation: string | null
          id: string
          image_url: string | null
          marks: number | null
          negative_marks: number | null
          options: Json | null
          order_index: number | null
          question_text: string
          question_type: string | null
          quiz_id: string
        }
        Insert: {
          correct_answer: string
          created_at?: string | null
          explanation?: string | null
          id?: string
          image_url?: string | null
          marks?: number | null
          negative_marks?: number | null
          options?: Json | null
          order_index?: number | null
          question_text: string
          question_type?: string | null
          quiz_id: string
        }
        Update: {
          correct_answer?: string
          created_at?: string | null
          explanation?: string | null
          id?: string
          image_url?: string | null
          marks?: number | null
          negative_marks?: number | null
          options?: Json | null
          order_index?: number | null
          question_text?: string
          question_type?: string | null
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          answers: Json | null
          created_at: string | null
          id: string
          passed: boolean | null
          percentage: number | null
          quiz_id: string
          score: number | null
          started_at: string | null
          submitted_at: string | null
          time_taken_seconds: number | null
          user_id: string
        }
        Insert: {
          answers?: Json | null
          created_at?: string | null
          id?: string
          passed?: boolean | null
          percentage?: number | null
          quiz_id: string
          score?: number | null
          started_at?: string | null
          submitted_at?: string | null
          time_taken_seconds?: number | null
          user_id: string
        }
        Update: {
          answers?: Json | null
          created_at?: string | null
          id?: string
          passed?: boolean | null
          percentage?: number | null
          quiz_id?: string
          score?: number | null
          started_at?: string | null
          submitted_at?: string | null
          time_taken_seconds?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          chapter_id: string | null
          course_id: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_published: boolean | null
          lesson_id: string | null
          pass_percentage: number | null
          title: string
          total_marks: number | null
          type: string | null
        }
        Insert: {
          chapter_id?: string | null
          course_id?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_published?: boolean | null
          lesson_id?: string | null
          pass_percentage?: number | null
          title: string
          total_marks?: number | null
          type?: string | null
        }
        Update: {
          chapter_id?: string | null
          course_id?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_published?: boolean | null
          lesson_id?: string | null
          pass_percentage?: number | null
          title?: string
          total_marks?: number | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_video_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          user_id: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      razorpay_payments: {
        Row: {
          amount: number
          course_id: number
          created_at: string | null
          currency: string | null
          id: string
          idempotency_key: string | null
          razorpay_order_id: string
          razorpay_payment_id: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          course_id: number
          created_at?: string | null
          currency?: string | null
          id?: string
          idempotency_key?: string | null
          razorpay_order_id: string
          razorpay_payment_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          course_id?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          idempotency_key?: string | null
          razorpay_order_id?: string
          razorpay_payment_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "razorpay_payments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      security_alerts: {
        Row: {
          alert_type: string
          created_at: string
          details: Json
          id: string
          source_ip: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          details?: Json
          id?: string
          source_ip?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          details?: Json
          id?: string
          source_ip?: string | null
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          is_public: boolean
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          is_public?: boolean
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          is_public?: boolean
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      site_stats: {
        Row: {
          id: number
          stat_key: string
          stat_value: string
        }
        Insert: {
          id?: number
          stat_key: string
          stat_value: string
        }
        Update: {
          id?: number
          stat_key?: string
          stat_value?: string
        }
        Relationships: []
      }
      smart_notes: {
        Row: {
          content_md: string
          course_id: number | null
          created_at: string
          file_mime: string | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          lesson_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_md?: string
          course_id?: number | null
          created_at?: string
          file_mime?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          lesson_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_md?: string
          course_id?: number | null
          created_at?: string
          file_mime?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          lesson_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_notes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_video_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      social_links: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          platform: string
          position: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          platform: string
          position?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          platform?: string
          position?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      student_notes: {
        Row: {
          content: string | null
          created_at: string
          file_type: string | null
          file_url: string | null
          id: string
          lesson_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          file_type?: string | null
          file_url?: string | null
          id?: string
          lesson_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          file_type?: string | null
          file_url?: string | null
          id?: string
          lesson_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson_video_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          grade: number
          id: number
          name: string
          roll_number: string
          section: string
        }
        Insert: {
          created_at?: string
          grade: number
          id?: number
          name: string
          roll_number: string
          section: string
        }
        Update: {
          created_at?: string
          grade?: number
          id?: number
          name?: string
          roll_number?: string
          section?: string
        }
        Relationships: []
      }
      study_materials: {
        Row: {
          chapter_id: string | null
          course_id: number
          created_at: string
          created_by: string | null
          description: string | null
          external_url: string | null
          file_size: number | null
          file_url: string | null
          id: string
          kind: string
          mime_type: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          chapter_id?: string | null
          course_id: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          external_url?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          kind: string
          mime_type?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          chapter_id?: string | null
          course_id?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          external_url?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_materials_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_materials_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          amount_paise: number
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          period_days: number
          slug: string
          sort_order: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          period_days: number
          slug: string
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          period_days?: number
          slug?: string
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      syllabus: {
        Row: {
          course_id: number
          created_at: string
          description: string | null
          id: string
          title: string
          topics: string[] | null
          week_number: number | null
        }
        Insert: {
          course_id: number
          created_at?: string
          description?: string | null
          id?: string
          title: string
          topics?: string[] | null
          week_number?: number | null
        }
        Update: {
          course_id?: number
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          topics?: string[] | null
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "syllabus_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable: {
        Row: {
          course_id: number | null
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          room: string | null
          start_time: string
          teacher_id: string | null
        }
        Insert: {
          course_id?: number | null
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          room?: string | null
          start_time: string
          teacher_id?: string | null
        }
        Update: {
          course_id?: number | null
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          room?: string | null
          start_time?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      trusted_hosts: {
        Row: {
          category: Database["public"]["Enums"]["trusted_host_category"]
          created_at: string
          created_by: string | null
          enabled: boolean
          host: string
          id: string
          label: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["trusted_host_category"]
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          host: string
          id?: string
          label?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["trusted_host_category"]
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          host?: string
          id?: string
          label?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          email_notifications: boolean
          id: string
          push_notifications: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_notifications?: boolean
          id?: string
          push_notifications?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_notifications?: boolean
          id?: string
          push_notifications?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_progress: {
        Row: {
          completed: boolean | null
          course_id: number
          created_at: string | null
          id: string
          last_watched_at: string | null
          lesson_id: string
          user_id: string
          watched_seconds: number | null
        }
        Insert: {
          completed?: boolean | null
          course_id: number
          created_at?: string | null
          id?: string
          last_watched_at?: string | null
          lesson_id: string
          user_id: string
          watched_seconds?: number | null
        }
        Update: {
          completed?: boolean | null
          course_id?: number
          created_at?: string | null
          id?: string
          last_watched_at?: string | null
          lesson_id?: string
          user_id?: string
          watched_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
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
          role?: Database["public"]["Enums"]["app_role"]
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
      user_sessions: {
        Row: {
          device_type: string
          expires_at: string
          id: string
          is_active: boolean
          last_active_at: string
          logged_in_at: string
          session_token: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device_type?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          last_active_at?: string
          logged_in_at?: string
          session_token?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device_type?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          last_active_at?: string
          logged_in_at?: string
          session_token?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          amount_paid_paise: number | null
          cancelled_at: string | null
          created_at: string
          currency: string | null
          current_period_end: string | null
          id: string
          plan_slug: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paid_paise?: number | null
          cancelled_at?: string | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          id?: string
          plan_slug: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paid_paise?: number | null
          cancelled_at?: string | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          id?: string
          plan_slug?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_slug_fkey"
            columns: ["plan_slug"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["slug"]
          },
        ]
      }
      webhook_events: {
        Row: {
          event_id: string
          event_type: string | null
          id: string
          received_at: string
          source: string
        }
        Insert: {
          event_id: string
          event_type?: string | null
          id?: string
          received_at?: string
          source: string
        }
        Update: {
          event_id?: string
          event_type?: string | null
          id?: string
          received_at?: string
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      lesson_video_meta: {
        Row: {
          course_id: number | null
          duration_seconds: number | null
          id: string | null
          is_free: boolean | null
          is_preview: boolean | null
          title: string | null
          youtube_id: string | null
        }
        Insert: {
          course_id?: number | null
          duration_seconds?: number | null
          id?: string | null
          is_free?: boolean | null
          is_preview?: boolean | null
          title?: string | null
          youtube_id?: string | null
        }
        Update: {
          course_id?: number | null
          duration_seconds?: number | null
          id?: string | null
          is_free?: boolean | null
          is_preview?: boolean | null
          title?: string | null
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_get_batch_roster: {
        Args: { _course_id: number }
        Returns: {
          email: string
          enrollment_id: number
          full_name: string
          is_blocked: boolean
          mobile: string
          progress_percentage: number
          purchased_at: string
          status: string
          user_id: string
        }[]
      }
      admin_get_batch_summary: {
        Args: never
        Returns: {
          active_students: number
          avg_progress: number
          course_id: number
          students: number
          title: string
        }[]
      }
      admin_get_install_stats: {
        Args: { _from?: string; _to?: string }
        Returns: Json
      }
      admin_get_suspicious_enrollments: {
        Args: { _limit?: number }
        Returns: Json
      }
      admin_get_user_snapshot: { Args: { _user_id: string }; Returns: Json }
      admin_hide_content: {
        Args: {
          _content_id: string
          _content_type: string
          _hidden: boolean
          _reason?: string
        }
        Returns: undefined
      }
      admin_mark_enrollment_legit: {
        Args: { _enrollment_id: number; _note: string }
        Returns: undefined
      }
      admin_resolve_report: {
        Args: { _report_id: string; _status: string }
        Returns: undefined
      }
      admin_revoke_enrollment: {
        Args: { _enrollment_id: number; _reason: string }
        Returns: undefined
      }
      admin_set_user_block: {
        Args: { _blocked: boolean; _reason?: string; _user_id: string }
        Returns: undefined
      }
      anon_write_grants: {
        Args: never
        Returns: {
          privileges: string
          table_name: string
        }[]
      }
      audit_security_policies: {
        Args: never
        Returns: {
          detail: string
          issue: string
        }[]
      }
      check_rate_limit: {
        Args: {
          _bucket: string
          _max: number
          _user_id: string
          _window_seconds: number
        }
        Returns: boolean
      }
      check_rate_limit_text: {
        Args: {
          _bucket: string
          _identifier: string
          _max: number
          _window_seconds: number
        }
        Returns: boolean
      }
      complete_paid_enrollment: {
        Args: {
          _course_id: number
          _razorpay_order_id: string
          _razorpay_payment_id: string
          _user_id: string
        }
        Returns: number
      }
      get_course_bundle: { Args: { _course_id: number }; Returns: Json }
      get_course_lesson_stats: {
        Args: never
        Returns: {
          course_id: number
          lesson_count: number
          total_duration: number
        }[]
      }
      get_dashboard_snapshot: { Args: never; Returns: Json }
      get_platform_stats: { Args: never; Returns: Json }
      get_post_reactions: {
        Args: { _post_ids: string[] }
        Returns: {
          like_count: number
          liked_by_me: boolean
          post_id: string
        }[]
      }
      get_quiz_questions: {
        Args: { _quiz_id: string }
        Returns: {
          id: string
          image_url: string
          marks: number
          negative_marks: number
          options: Json
          order_index: number
          question_text: string
          question_type: string
          quiz_id: string
        }[]
      }
      get_quiz_review: {
        Args: { _attempt_id: string }
        Returns: {
          correct_answer: string
          explanation: string
          id: string
          image_url: string
          marks: number
          negative_marks: number
          options: Json
          order_index: number
          question_text: string
          question_type: string
          quiz_id: string
        }[]
      }
      get_user_profiles_admin: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          mobile: string
          role: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_book_clicks: { Args: { book_id: string }; Returns: undefined }
      is_user_blocked: { Args: { _user_id: string }; Returns: boolean }
      match_knowledge: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: string
          content: string
          id: string
          similarity: number
          title: string
        }[]
      }
      n: {
        Args: {
          _bucket: string
          _max: number
          _user_id: string
          _window_seconds: number
        }
        Returns: boolean
      }
      n_text: {
        Args: {
          _bucket: string
          _identifier: string
          _max: number
          _window_seconds: number
        }
        Returns: boolean
      }
      process_refund: { Args: { _razorpay_order_id: string }; Returns: Json }
      purge_expired_phone_otps: { Args: never; Returns: undefined }
      record_app_install: {
        Args: {
          _app_version?: string
          _device_id: string
          _os_version?: string
          _platform?: string
          _source?: string
        }
        Returns: undefined
      }
      search_lectures: {
        Args: { _limit?: number; _query: string }
        Returns: {
          chapter_id: string
          course_id: number
          description: string
          id: string
          lecture_type: string
          rank: number
          thumbnail_url: string
          title: string
        }[]
      }
      user_can_access_live_session_topic: {
        Args: { _topic: string }
        Returns: boolean
      }
      verify_enrollment_for_attendance: {
        Args: { _lesson_id: string; _student_id: number }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "student"
      lecture_type: "VIDEO" | "PDF" | "DPP" | "NOTES"
      trusted_host_category:
        | "frame"
        | "image"
        | "media"
        | "website"
        | "script"
        | "connect"
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
      app_role: ["admin", "teacher", "student"],
      lecture_type: ["VIDEO", "PDF", "DPP", "NOTES"],
      trusted_host_category: [
        "frame",
        "image",
        "media",
        "website",
        "script",
        "connect",
      ],
    },
  },
} as const
