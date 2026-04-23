// fb-bunny-webhook — Bunny Stream からのエンコード完了通知を受け取り、fb_recordings を更新する。
//
// 認証: verify_jwt: false (Bunny Stream は JWT を送らない)
//
// 検証戦略 (二重防御):
//   [A] URL パラメータ ?token= が BUNNY_WEBHOOK_URL_TOKEN と一致
//   [B] ペイロードの VideoLibraryId が BUNNY_STREAM_LIBRARY_ID と一致 + VideoGuid が fb_recordings に存在
//   (Bunny Stream は HMAC 署名方式を提供していないため、これが正しい検証)
//
// Webhook URL (Bunny 管理画面に登録する値):
//   https://whpqheywobndaeaikchh.supabase.co/functions/v1/fb-bunny-webhook?token=<URL_TOKEN>
//
// Bunny Stream Status コード:
//   0=Created, 1=Uploaded, 2=Processing, 3=Transcoding,
//   4=Finished, 5=Error, 6=UploadFailed, ...

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type BunnyPayload = {
  VideoLibraryId?: number | string
  VideoGuid?: string
  Status?: number
  Length?: number
  ErrorMessage?: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  // [A] URL token 検証
  const urlToken = new URL(req.url).searchParams.get('token')
  const expectedToken = Deno.env.get('BUNNY_WEBHOOK_URL_TOKEN')
  if (!expectedToken) return new Response('server misconfigured', { status: 500 })
  if (urlToken !== expectedToken) return new Response('forbidden', { status: 401 })

  // [B-1] ペイロード ライブラリ ID 検証
  let event: BunnyPayload
  try {
    event = (await req.json()) as BunnyPayload
  } catch {
    return new Response('bad json', { status: 400 })
  }

  const expectedLibraryId = Deno.env.get('BUNNY_STREAM_LIBRARY_ID')
  if (
    !event.VideoLibraryId ||
    String(event.VideoLibraryId) !== String(expectedLibraryId)
  ) {
    return new Response('library mismatch', { status: 403 })
  }

  const videoGuid = event.VideoGuid
  if (!videoGuid) return new Response('missing VideoGuid', { status: 400 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const cdnHostname = Deno.env.get('BUNNY_STREAM_CDN_HOSTNAME')
  if (!supabaseUrl || !serviceKey || !cdnHostname) {
    return new Response('server misconfigured', { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  // [B-2] DB 突合: fb_recordings に該当動画が存在するか
  const { data: existing, error: selErr } = await supabase
    .from('fb_recordings')
    .select('id, status')
    .eq('bunny_video_id', videoGuid)
    .maybeSingle()

  if (selErr) return new Response(`lookup failed: ${selErr.message}`, { status: 500 })
  if (!existing) return new Response('unknown video', { status: 404 })

  // Status に応じて fb_recordings を更新
  let update: Record<string, unknown>
  if (event.Status === 4) {
    update = {
      status: 'ready',
      public_url: `https://${cdnHostname}/${videoGuid}/playlist.m3u8`,
      mp4_url: `https://${cdnHostname}/${videoGuid}/play_720p.mp4`,
      thumbnail_url: `https://${cdnHostname}/${videoGuid}/thumbnail.jpg`,
      duration_seconds: typeof event.Length === 'number' ? event.Length : null,
    }
  } else if (event.Status === 5 || event.Status === 6) {
    update = {
      status: 'error',
      error_message: event.ErrorMessage ?? `bunny status ${event.Status}`,
    }
  } else {
    // 0/1/2/3 は中間状態
    update = { status: 'processing' }
  }

  const { error: updErr } = await supabase
    .from('fb_recordings')
    .update(update)
    .eq('bunny_video_id', videoGuid)

  if (updErr) return new Response(`update failed: ${updErr.message}`, { status: 500 })

  return new Response('ok', { status: 200 })
})
