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
//   Body: { title: string, mode: 'selfie'|'screen'|'selfie_mobile', script_id?: uuid|null, source_app?: string|null, source_ref?: string|null }
//   ※ source_ref は source_app ごとに名前空間が異なる不透明な text 識別子（uuid とは限らない）。
//      source_app とセットで解釈する。例: funnel thanks="step_"+nanoid / course=page_id / funnel sales_lp=uuid。
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

  // 孤児動画対策: 「fb_recordings へ先に INSERT → Bunny 動画作成 → guid を UPDATE」の順にする。
  // Bunny 動画作成より前に INSERT するため、INSERT が失敗しても Bunny 上に孤児動画を残さない。
  // source_app + source_ref はセットで扱う異種 ID。source_ref は source_app 名前空間の不透明な
  // text（uuid とは限らない: funnel thanks="step_"+nanoid / course=page_id / funnel sales_lp=uuid）。
  const admin = createClient(supabaseUrl, serviceKey)

  // 1) 先に行を作成（bunny_video_id は動画作成後に UPDATE する）。service role で RLS bypass。
  const { data: recording, error: insErr } = await admin
    .from('fb_recordings')
    .insert({
      user_id: user.id,
      script_id: scriptId,
      title,
      mode,
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

  // 2) Bunny Stream で動画作成。失敗時は作成済みの行を削除して孤児（DB 側）を残さない。
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
    await admin.from('fb_recordings').delete().eq('id', recording.id)
    return json({ error: `bunny create failed: ${createRes.status}`, detail }, 502)
  }
  const video = (await createRes.json()) as { guid?: string }
  if (!video.guid) {
    await admin.from('fb_recordings').delete().eq('id', recording.id)
    return json({ error: 'bunny returned no guid' }, 502)
  }

  // 3) 作成した動画の guid を行へ反映。失敗時は行と Bunny 動画の両方を後始末（孤児防止）。
  const { error: updErr } = await admin
    .from('fb_recordings')
    .update({ bunny_video_id: video.guid })
    .eq('id', recording.id)
  if (updErr) {
    await admin.from('fb_recordings').delete().eq('id', recording.id)
    await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${video.guid}`, {
      method: 'DELETE',
      headers: { AccessKey: bunnyApiKey },
    }).catch(() => {})
    return json({ error: 'db update failed', detail: updErr.message }, 500)
  }

  // 4) TUS 認証署名 (SHA256 hex)
  const expires = Math.floor(Date.now() / 1000) + 3600
  const authSignature = await sha256Hex(`${libraryId}${bunnyApiKey}${expires}${video.guid}`)

  return json({
    recording_id: recording.id,
    video_id: video.guid,
    library_id: libraryId,
    auth_signature: authSignature,
    expires,
    upload_endpoint: 'https://video.bunnycdn.com/tusupload',
  })
})
