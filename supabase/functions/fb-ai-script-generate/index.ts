// fb-ai-script-generate — record.digicollabo.com 用 AI 台本生成。
//
// 認証: verify_jwt: true (認証ユーザーのみ利用可)
//
// リクエスト:
//   POST /functions/v1/fb-ai-script-generate
//   Headers: Authorization: Bearer <user-jwt>
//   Body: { theme: string, duration_seconds: number, tone: 'friendly'|'professional'|'passionate' }
//
// レスポンス:
//   { script: string|null, fallback: boolean }
//   fallback=true の場合は site_settings.openai_api_key 未設定 (管理者設定待ち)
//
// 設計: 既存 generate-script (Course 用 / 60 秒固定 / bonus|idea 2 モード) とは
//   パラメータが異なるため別関数として実装。OpenAI API キーは site_settings の
//   共通キー (openai_api_key) を流用する。

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

type Tone = 'friendly' | 'professional' | 'passionate'

const TONE_DESC: Record<Tone, string> = {
  friendly:
    '親しみやすく明るいトーン。視聴者に話しかけるように、友達と会話するような自然な日本語。',
  professional:
    '落ち着いたプロフェッショナルなトーン。信頼感のある丁寧な日本語で、要点を整理して伝える。',
  passionate:
    '情熱的で熱意のあるトーン。視聴者の心を動かす力強い言葉を使い、ストーリーで引き込む。',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return json({ error: 'server misconfigured' }, 500)

    // site_settings から OpenAI API key を取得 (service role で読む)
    const admin = createClient(supabaseUrl, serviceKey)
    const { data: setting } = await admin
      .from('site_settings')
      .select('value')
      .eq('key', 'openai_api_key')
      .maybeSingle()

    const apiKey = typeof setting?.value === 'string' ? setting.value.trim() : ''
    if (!apiKey) {
      // キー未設定は 200 + fallback=true で返す (UI が案内メッセージに切替)
      return json({ script: null, fallback: true })
    }

    // 入力
    const body = (await req.json().catch(() => ({}))) as {
      theme?: unknown
      duration_seconds?: unknown
      tone?: unknown
    }
    const theme = typeof body.theme === 'string' ? body.theme.trim() : ''
    const durationSec =
      typeof body.duration_seconds === 'number' && body.duration_seconds > 0
        ? Math.min(Math.floor(body.duration_seconds), 1800)
        : 120
    const tone: Tone =
      body.tone === 'professional' || body.tone === 'passionate' ? body.tone : 'friendly'

    if (!theme) return json({ error: 'theme required' }, 400)

    // 日本語話速の目安: 約 300 文字 / 分
    const minutes = Math.max(1, Math.round(durationSec / 60))
    const targetChars = Math.round((durationSec / 60) * 300)

    const systemPrompt = `あなたは日本語の動画台本ライターです。話し言葉で読み上げやすい台本を書いてください。
${TONE_DESC[tone]}
以下の構成を意識してください:
- 冒頭で視聴者の興味を引くフック (1〜2 文)
- 本題は 3〜5 ポイントに整理
- 最後に視聴者への行動呼びかけ (CTA)
- 段落ごとに空行を入れる
- 見出しや箇条書き記号は使わない、純粋な話し言葉のみ
- 余計な説明は不要、台本本文のみを出力`

    const userPrompt = `テーマ: ${theme}
目安時間: 約 ${minutes} 分 (約 ${targetChars} 文字)
この条件に沿った日本語の動画台本を書いてください。`

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: Math.min(2000, Math.ceil(targetChars * 1.5)),
      }),
    })

    if (!openaiRes.ok) {
      const detail = await openaiRes.text().catch(() => '')
      return json({ error: 'ai provider error', detail }, 502)
    }

    const result = (await openaiRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const script = result.choices?.[0]?.message?.content?.trim() ?? null
    return json({ script, fallback: false })
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500)
  }
})
