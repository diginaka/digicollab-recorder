// fb-bunny-webhook — Bunny Stream からのエンコード完了通知を受け取り、fb_recordings を更新する。
//
// 認証: verify_jwt: false (Bunny Stream は JWT を送らない)
//
// 検証戦略 (二重防御):
//   [A] URL パラメータ ?token= が BUNNY_WEBHOOK_URL_TOKEN と一致
//   [B] ペイロードの VideoLibraryId が BUNNY_STREAM_LIBRARY_ID と一致 + VideoGuid が fb_recordings に存在
//
// ステータス判定方針 (実測に基づく堅牢化 / 2026-04-23):
//   Webhook ペイロードの `Status` は Bunny のバージョンにより意味が変わるケースが
//   観測された (Status=6 が実質成功など、ドキュメントと乖離)。
//   そのため Webhook をトリガーとしつつ、最終的な ready/error 判定は
//   Bunny API `GET /library/{id}/videos/{guid}` から返る video オブジェクトの
//   availableResolutions / encodeProgress / status を元に行う。
//   - availableResolutions が非空 = 少なくとも 1 解像度が再生可能 → ready
//   - video.status === 5 = 明示的エラー
//   - それ以外 = 中間状態 (processing のまま維持、DB 更新しない)
//
// Webhook URL (Bunny 管理画面に登録する値):
//   https://whpqheywobndaeaikchh.supabase.co/functions/v1/fb-bunny-webhook?token=<URL_TOKEN>

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decideRecordingUpdate, fetchBunnyVideo } from '../_shared/bunnyVideoStatus.ts'

type BunnyPayload = {
  VideoLibraryId?: number | string
  VideoGuid?: string
  // Status / Length / ErrorMessage はログ用途のみ (判定には使わない)
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
  const bunnyApiKey = Deno.env.get('BUNNY_STREAM_API_KEY')
  if (!supabaseUrl || !serviceKey || !cdnHostname || !expectedLibraryId || !bunnyApiKey) {
    return new Response('server misconfigured', { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  // [B-2] DB 突合
  const { data: existing, error: selErr } = await supabase
    .from('fb_recordings')
    .select('id, status')
    .eq('bunny_video_id', videoGuid)
    .maybeSingle()

  if (selErr) return new Response(`lookup failed: ${selErr.message}`, { status: 500 })
  if (!existing) return new Response('unknown video', { status: 404 })

  // 動画 API で実状態を取得し、ready/error/processing は共通判定(1 か所集約)に委ねる。
  const video = await fetchBunnyVideo(expectedLibraryId, bunnyApiKey, videoGuid)
  const update = decideRecordingUpdate({
    video,
    existingStatus: existing.status,
    cdnHostname,
    guid: videoGuid,
    fallback: { status: event.Status, length: event.Length, errorMessage: event.ErrorMessage },
  })

  if (!update) {
    return new Response('ok-nochange', { status: 200 })
  }

  const { error: updErr } = await supabase
    .from('fb_recordings')
    .update(update)
    .eq('bunny_video_id', videoGuid)

  if (updErr) return new Response(`update failed: ${updErr.message}`, { status: 500 })

  return new Response('ok', { status: 200 })
})
