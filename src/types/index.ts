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
  /** Phase V1/V2 \u30d1\u30a4\u30d7\u30e9\u30a4\u30f3\u304c\u4f7f\u7528\u3002record Phase 1 \u3067\u306f null \u306e\u307e\u307e */
  business_profile_id: string | null
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
  /** Phase V1/V2 \u306e R2 \u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u7528\u3002record Phase 1 \u3067\u306f null */
  r2_backup_path: string | null
  status: RecordingStatus
  error_message: string | null
  created_at: string
  updated_at: string
}

// fb_scripts.source_app CHECK 制約と同期:
// course / sales / webinar / thanks / line / email / standalone
export type AppId = 'course' | 'sales' | 'webinar' | 'thanks' | 'line' | 'email' | 'standalone'
