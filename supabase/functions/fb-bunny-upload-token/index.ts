// fb-bunny-upload-token — 認証ユーザーからの POST で Bunny Stream 動画を作成し、
// TUS 直アップロード用の認証署名を返す。
//
// 認証: verify_jwt: false + 関数内で手動検証 (Bearer トークンを auth.getUser で検証)
//       ES256 移行後、ゲートウェイ側 verify_jwt=true は HS256 専用で動作しないため、
//       自前で検証するパターンに統一 (他子アプリの既存実装に準拠)。
//
// リクエスト:
//   POST /functions/v1/fb-bunny-upload-token
//   Headers: Authorization: Bearer <user-jwt>
//   Body: { title: string, mode: 'selfie'|'screen'|'selfie_mobile', script_id?: uuid|null, source_app?: string|null, source_ref?: uuid|null }
//
// レスポンス:
//   { recording_id, video_id, library_id, auth_signature, expires, upload_endpoint }
//
// TUS 認証署名:
//   SHA256( library_id || api_key || expires || video_guid )  (16 進小文字)
//   Bunny Stream 仕様: https://docs.bunny.net/reference/tus-resumable-uploads

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

type CreateBody = {
  title?: unknown
  mode?: unknown
  script_id?: unknown
  source_app?: unknown
  source_ref?: unknown
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const bunnyApiKey = Deno.env.get('BUNNY_STREAM_API_KEY')
  const libraryId = Deno.env.get('BUNNY_STREAM_LIBRARY_ID')

  if (!supabaseUrl || !anonKey || !serviceKey || !bunnyApiKey || !libraryId) {
    return json({ error: 'server misconfigured' }, 500)
  }

  // 手動認証 (ES256/HS256 両対応)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ code: 'UNAUTHORIZED_NO_AUTH_HEADER', message: 'Missing Authorization header' }, 401)
  }
  const token = authHeader.substring(7)
  const userClient = createClient(supabaseUrl, anonKey)
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser(token)
  if (authErr || !user) {
    return json({ code: 'UNAUTHORIZED', message: 'Invalid token' }, 401)
  }

  // 入力
  let body: CreateBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }
  const title = typeof body.title === 'string' ? body.title : ''
  const mode = typeof body.mode === 'string' ? body.mode : ''
  const scriptId = typeof body.script_id === 'string' ? body.script_id : null
  const sourceApp = typeof body.source_app === 'string' ? body.source_app : null
  const sourceRef = typeof body.source_ref === 'string' ? body.source_ref : null

  if (!title.trim()) return json({ error: 'title required' }, 400)
  if (!['selfie', 'screen', 'selfie_mobile'].includes(mode)) {
    return json({ error: 'mode must be selfie|screen|selfie_mobile' }, 400)
  }

  // Bunny Stream で動画作成
  const createRes = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}/videos`,
    {
      method: 'POST',
      headers: {
        AccessKey: bunnyApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    },
  )
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => '')
    return json({ error: `bunny create failed: ${createRes.status}`, detail }, 502)
  }
  const video = (await createRes.json()) as { guid?: string }
  if (!video.guid) return json({ error: 'bunny returned no guid' }, 502)

  // TUS 認証署名 (SHA256 hex)
  const expires = Math.floor(Date.now() / 1000) + 3600
  const authSignature = await sha256Hex(`${libraryId}${bunnyApiKey}${expires}${video.guid}`)

  // fb_recordings へ INSERT (service role で RLS bypass)
  const admin = createClient(supabaseUrl, serviceKey)
  const { data: recording, error: insErr } = await admin
    .from('fb_recordings')
    .insert({
      user_id: user.id,
      script_id: scriptId,
      title,
      mode,
      bunny_video_id: video.guid,
      bunny_library_id: libraryId,
      source_app: sourceApp,
      source_ref: sourceRef,
      status: 'uploading',
    })
    .select('id')
    .single()

  if (insErr || !recording) {
    return json({ error: 'db insert failed', detail: insErr?.message }, 500)
  }

  return json({
    recording_id: recording.id,
    video_id: video.guid,
    library_id: libraryId,
    auth_signature: authSignature,
    expires,
    upload_endpoint: 'https://video.bunnycdn.com/tusupload',
  })
})
