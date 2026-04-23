// AI 台本生成 — Edge Function fb-ai-script-generate を呼ぶラッパー。
import { supabase } from './supabase'

export type Tone = 'friendly' | 'professional' | 'passionate'

export interface GenerateScriptInput {
  theme: string
  durationMinutes: number
  tone: Tone
}

export interface GenerateScriptResult {
  /** 生成された台本。fallback=true 時は null */
  script: string | null
  /** true の場合 AI 設定未完了 (site_settings.openai_api_key 未登録等) */
  fallback: boolean
}

export async function generateScript(input: GenerateScriptInput): Promise<GenerateScriptResult> {
  if (!supabase) throw new Error('Supabase client 未初期化')
  const { data, error } = await supabase.functions.invoke('fb-ai-script-generate', {
    body: {
      theme: input.theme,
      duration_seconds: Math.round(input.durationMinutes * 60),
      tone: input.tone,
    },
  })
  if (error) throw error
  const result = data as GenerateScriptResult
  return {
    script: result?.script ?? null,
    fallback: Boolean(result?.fallback),
  }
}
