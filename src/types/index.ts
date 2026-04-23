// 共通型定義 — DB スキーマと対応する。
// 実体は Phase B で supabase/migrations/20260424_recorder_phase1.sql にマイグレーションする。

export interface Script {
  id: string
  user_id: string
  title: string | null
  content: string
  source_app: string | null
  source_ref: string | null
  created_at: string
  updated_at: string
}

export type RecordingMode = 'selfie' | 'screen' | 'selfie_mobile'
export type RecordingStatus = 'uploading' | 'processing' | 'ready' | 'error'

export interface Recording {
  id: string
  user_id: string
  script_id: string | null
  title: string | null
  mode: RecordingMode
  bunny_video_id: string | null
  bunny_library_id: string | null
  public_url: string | null
  mp4_url: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  file_size_bytes: number | null
  source_app: string | null
  source_ref: string | null
  status: RecordingStatus
  error_message: string | null
  created_at: string
  updated_at: string
}

export type AppId = 'course' | 'sales' | 'webinar' | 'thanks' | 'line' | 'email'
