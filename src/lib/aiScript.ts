// AI \u53f0\u672c\u751f\u6210 \u2014 Edge Function fb-ai-script-generate \u3092\u547c\u3076\u30e9\u30c3\u30d1\u30fc\u3002
import { supabase } from './supabase'

export type Tone = 'friendly' | 'professional' | 'passionate'

export interface GenerateScriptInput {
  theme: string
  durationMinutes: number
  tone: Tone
}

export interface GenerateScriptResult {
  /** \u751f\u6210\u3055\u308c\u305f\u53f0\u672c\u3002fallback=true \u6642\u306f null */
  script: string | null
  /** true \u306e\u5834\u5408 AI \u8a2d\u5b9a\u672a\u5b8c\u4e86 (site_settings.openai_api_key \u672a\u767b\u9332\u7b49) */
  fallback: boolean
}

export async function generateScript(input: GenerateScriptInput): Promise<GenerateScriptResult> {
  if (!supabase) throw new Error('Supabase client \u672a\u521d\u671f\u5316')
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
