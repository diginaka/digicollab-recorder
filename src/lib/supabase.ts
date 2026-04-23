// Supabase client for record.digicollabo.com (子アプリ・boundモード)
//
// - storageKey: 'sb-digicollab-record' — 他の子アプリ (line / mail / course / cart) と衝突しない固有キー
// - detectSessionInUrl: false — SSO は digicollabSso.ts で手動処理するため自動パースを無効化
// - .env 未設定時は null を返し、standalone フォールバック可能
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const RECORD_STORAGE_KEY = 'sb-digicollab-record'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseMode: boolean = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseMode
  ? createClient(url, anonKey, {
      auth: {
        storageKey: RECORD_STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null
