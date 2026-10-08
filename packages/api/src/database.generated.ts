import type { ReadingBook, UserBook, Shelf, ShelfBook, Highlight, ReadingNote } from '../../types/src/reading.ts'
// Checked-in schema types. Replace this file with `npm run db:types` after `supabase start`.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Table<
  Row extends Record<string, unknown>,
  Insert extends Record<string, unknown>,
  Update extends Record<string, unknown>,
> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      books: Table<ReadingBook, Omit<ReadingBook, 'id' | 'created_at'>, Partial<ReadingBook>>
      user_books: Table<UserBook, Partial<UserBook> & Pick<UserBook, 'user_id' | 'book_id'>, Partial<UserBook>>
      reading_shelves: Table<Shelf, Partial<Shelf> & Pick<Shelf, 'user_id' | 'name'>, Partial<Shelf>>
      reading_shelf_books: Table<ShelfBook, Omit<ShelfBook, 'created_at'>, Partial<ShelfBook>>
      reading_highlights: Table<Highlight, Partial<Highlight> & Pick<Highlight, 'user_id' | 'user_book_id' | 'content'>, Partial<Highlight>>
      reading_notes: Table<ReadingNote, Partial<ReadingNote> & Pick<ReadingNote, 'user_id' | 'user_book_id' | 'content'>, Partial<ReadingNote>>
      themes: Table<ThemeRow, ThemeInsert, Partial<ThemeInsert>>
      user_themes: Table<{user_id:string;theme_id:string;acquired_type:string;created_at:string},{user_id:string;theme_id:string;acquired_type?:string}, {acquired_type?:string}>
      user_theme_settings: Table<{user_id:string;active_theme_id:string|null;updated_at:string},{user_id:string;active_theme_id:string|null;updated_at?:string},{active_theme_id?:string|null;updated_at?:string}>
      theme_reviews: Table<{id:string;theme_id:string;user_id:string;rating:number;content:string;created_at:string},{theme_id:string;user_id:string;rating:number;content?:string},{rating?:number;content?:string}>

      calendars: Table<
        { id: string; owner_user_id: string; name: string; description: string; color: string; icon: string; type: string; is_default_personal: boolean; timezone: string; created_at: string; updated_at: string },
        { id?: string; owner_user_id: string; name?: string; description?: string; color?: string; icon?: string; type?: string; timezone?: string },
        { name?: string; description?: string; color?: string; icon?: string; timezone?: string }
      >
      categories: Table<
        {
          id: string
          user_id: string
          name: string
          color: string | null
          parent_id: string | null
          icon: string | null
          sort_order: number
          created_at: string
          updated_at: string
        },
        {
          id?: string
          user_id: string
          name: string
          color?: string | null
          parent_id?: string | null
          icon?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        },
        {
          name?: string
          color?: string | null
          parent_id?: string | null
          icon?: string | null
          sort_order?: number
          updated_at?: string
        }
      >
      schedules: Table<
        {
          id: string
          user_id: string
          calendar_id: string
          created_by_user_id: string | null
          kind?: string
          due_date?: string | null
          end_date?: string | null
          all_day?: boolean
          repeat_rule?: string
          change_source?: string
          title: string
          description: string
          date: string
          start_time: string | null
          end_time: string | null
          duration_minutes: number | null
          category_id: string | null
          priority: string
          status: string
          source_text: string | null
          ai_confidence: number | null
          ai_model: string | null
          ai_parsed_at: string | null
          reminder_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        },
        {
          id?: string
          user_id: string
          calendar_id?: string
          kind?: string
          due_date?: string | null
          end_date?: string | null
          all_day?: boolean
          repeat_rule?: string
          change_source?: string
          title: string
          description?: string
          date: string
          start_time?: string | null
          end_time?: string | null
          duration_minutes?: number | null
          category_id?: string | null
          priority?: string
          status?: string
          source_text?: string | null
          ai_confidence?: number | null
          ai_model?: string | null
          ai_parsed_at?: string | null
          reminder_at?: string | null
          completed_at?: string | null
        },
        {
          calendar_id?: string
          kind?: string
          due_date?: string | null
          end_date?: string | null
          all_day?: boolean
          repeat_rule?: string
          change_source?: string
          title?: string
          description?: string
          date?: string
          start_time?: string | null
          end_time?: string | null
          duration_minutes?: number | null
          category_id?: string | null
          priority?: string
          status?: string
          source_text?: string | null
          ai_confidence?: number | null
          ai_model?: string | null
          ai_parsed_at?: string | null
          reminder_at?: string | null
          completed_at?: string | null
          updated_at?: string
        }
      >
      schedule_changes: Table<
        {
          id: string
          schedule_id: string
          user_id: string
          entity_type?: string
          before_data?: Json | null
          after_data?: Json | null
          source?: string
          action: string
          created_at: string
        },
        {
          schedule_id: string
          user_id: string
          entity_type?: string
          before_data?: Json | null
          after_data?: Json | null
          source?: string
          action: string
        },
        {
          action?: string
        }
      >
      user_preferences: Table<
        {
          user_id: string
          timezone: string
          day_start_time: string
          day_end_time: string
          default_duration_minutes: number
          locale: string
          notifications_enabled: boolean
          theme: string
          accent: string
          schedule_default_view: string
          week_starts_on: number
          auto_classification: boolean
          auto_save_after_classification: boolean
          settings: Json
          updated_at: string
        },
        {
          user_id: string
          timezone?: string
          day_start_time?: string
          day_end_time?: string
          default_duration_minutes?: number
          locale?: string
          notifications_enabled?: boolean
          theme?: string
          accent?: string
          schedule_default_view?: string
          week_starts_on?: number
          auto_classification?: boolean
          auto_save_after_classification?: boolean
          settings?: Json
          updated_at?: string
        },
        {
          timezone?: string
          day_start_time?: string
          day_end_time?: string
          default_duration_minutes?: number
          locale?: string
          notifications_enabled?: boolean
          theme?: string
          accent?: string
          schedule_default_view?: string
          week_starts_on?: number
          auto_classification?: boolean
          auto_save_after_classification?: boolean
          settings?: Json
          updated_at?: string
        }
      >
      device_push_tokens: Table<
        {
          id: string
          user_id: string
          platform: string
          token: string
          created_at: string
        },
        {
          user_id: string
          platform: string
          token: string
        },
        {
          token?: string
        }
      >
      custom_record_types: Table<
        {
          id: string
          user_id: string
          name: string
          icon: string
          color: string
          description: string
          schema_version: number
          version: number
          schema: Json
          created_at: string
          updated_at: string
        },
        {
          id?: string
          user_id: string
          name: string
          icon?: string
          color: string
          description?: string
          schema_version?: number
          version?: number
          schema: Json
          created_at?: string
          updated_at?: string
        },
        {
          name?: string
          icon?: string
          color?: string
          description?: string
          schema_version?: number
          version?: number
          schema?: Json
          updated_at?: string
        }
      >
      custom_records: Table<
        {
          id: string
          user_id: string
          record_type_id: string
          title: string
          template_version: number
          values: Json
          created_at: string
          updated_at: string
        },
        {
          id?: string
          user_id: string
          record_type_id: string
          title?: string
          template_version?: number
          values?: Json
          created_at?: string
          updated_at?: string
        },
        {
          title?: string
          template_version?: number
          values?: Json
          updated_at?: string
        }
      >
      classification_feedback: Table<
        {
          id: string
          user_id: string
          input_text: string
          predicted_type: string | null
          corrected_type: string | null
          predicted_category_id: string | null
          corrected_category_id: string | null
          field_corrections: Json
          created_at: string
        },
        {
          id?: string
          user_id: string
          input_text: string
          predicted_type?: string | null
          corrected_type?: string | null
          predicted_category_id?: string | null
          corrected_category_id?: string | null
          field_corrections?: Json
        },
        {
          corrected_type?: string | null
        }
      >
      user_classification_rules: Table<
        {
          id: string
          user_id: string
          pattern: string
          target_type: string | null
          category_id: string | null
          weight: number
          created_at: string
          updated_at: string
        },
        {
          id?: string
          user_id: string
          pattern: string
          target_type?: string | null
          category_id?: string | null
          weight?: number
          updated_at?: string
        },
        {
          target_type?: string | null
          category_id?: string | null
          weight?: number
          updated_at?: string
        }
      >
    }
    Views: Record<string, never>
    Functions: { reorder_reading_shelves: { Args: { p_ids: string[] }; Returns: undefined }; add_reading_book: { Args: { p_book: Json; p_status: string; p_shelves: string[] }; Returns: string }; install_theme: { Args: { p_theme_id: string }; Returns: undefined } }
  }
}

export type CategoryRow = Database['public']['Tables']['categories']['Row']
export type ScheduleRow = Database['public']['Tables']['schedules']['Row']
export type PreferenceRow = Database['public']['Tables']['user_preferences']['Row']
export type CustomRecordTypeRow = Database['public']['Tables']['custom_record_types']['Row']
export type CustomRecordRow = Database['public']['Tables']['custom_records']['Row']
export type FeedbackRow = Database['public']['Tables']['classification_feedback']['Row']

export type ThemeInsert = {id?:string;creator_id?:string|null;creator_name?:string;name:string;description?:string;thumbnail_url?:string;category?:string;tags?:string[];visibility?:string;pricing_type?:string;price?:number;theme_config:Json;theme_type?:string;format_version?:number;package_version?:string;manifest?:Json|null;custom_css?:string;theme_package?:Json|null;package_url?:string;preview_images?:string[]}
export type ThemeRow = Required<ThemeInsert> & {id:string;download_count:number;rating_average:number;rating_count:number;created_at:string;updated_at:string}
