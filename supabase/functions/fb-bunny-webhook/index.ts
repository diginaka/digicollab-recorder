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

type BunnyPayload = {
  VideoLibraryId?: number | string
  VideoGuid?: string
  // Status / Length / ErrorMessage はログ用途のみ (判定には使わない)
  Status?: number
  Length?: number
  ErrorMessage?: string
}

type BunnyVideo = {
  guid?: string
  status?: number
  encodeProgress?: number
  availableResolutions?: string
  length?: number
  errorMessage?: string
  thumbnailCount?: number
}

async function fetchBunnyVideo(
  libraryId: string,
  apiKey: string,
  guid: string,
): Promise<BunnyVideo | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${guid}`,
      { headers: { AccessKey: apiKey }, signal: ctrl.signal },
    )
    if (!res.ok) return null
    return (await res.json()) as BunnyVideo
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
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

  // Bunny API で実際の動画状態を取得 (webhook Status enum の乖離対策)
  const video = await fetchBunnyVideo(expectedLibraryId, bunnyApiKey, videoGuid)

  const hasResolutions =
    typeof video?.availableResolutions === 'string' &&
    video.availableResolutions.trim().length > 0
  const isExplicitError = video?.status === 5
  const isEncodingComplete = typeof video?.encodeProgress === 'number' && video.encodeProgress >= 100

  let update: Record<string, unknown> | null = null

  // 状態遷移時は関連列を明示的にクリアする (例: error → ready 遷移時の古い error_message 残留を防止)
  const readyUpdate = (dur: number | null) => ({
    status: 'ready',
    public_url: `https://${cdnHostname}/${videoGuid}/playlist.m3u8`,
    mp4_url: `https://${cdnHostname}/${videoGuid}/play_720p.mp4`,
    thumbnail_url: `https://${cdnHostname}/${videoGuid}/thumbnail.jpg`,
    duration_seconds: dur,
    error_message: null,
  })

  const errorUpdate = (msg: string) => ({
    status: 'error',
    error_message: msg,
    public_url: null,
    mp4_url: null,
    thumbnail_url: null,
  })

  const processingUpdate = () => ({
    status: 'processing',
    error_message: null,
  })

  if (isExplicitError) {
    update = errorUpdate(
      video?.errorMessage ??
        event.ErrorMessage ??
        `エンコードに失敗しました (webhook status ${event.Status ?? '不明'})`,
    )
  } else if (hasResolutions || isEncodingComplete) {
    const dur =
      typeof video?.length === 'number'
        ? Math.max(0, Math.round(video.length))
        : typeof event.Length === 'number'
          ? Math.max(0, Math.round(event.Length))
          : null
    update = readyUpdate(dur)
  } else if (!video) {
    // Bunny API 到達不可 — webhook を取り損ねないよう前ロジックで最低限の判定:
    // 公式の Status=4 だけは ready、5 は error、他は processing 維持
    if (event.Status === 4) {
      update = readyUpdate(
        typeof event.Length === 'number' ? Math.max(0, Math.round(event.Length)) : null,
      )
    } else if (event.Status === 5) {
      update = errorUpdate(event.ErrorMessage ?? 'エンコードに失敗しました')
    } else {
      console.log(
        `[webhook] Bunny API unreachable and intermediate status (${event.Status}); keeping processing for ${videoGuid}`,
      )
      if (existing.status === 'uploading') update = processingUpdate()
    }
  } else {
    // Bunny API は返ったが中間状態
    console.log(
      `[webhook] intermediate: guid=${videoGuid} bunnyStatus=${video.status} progress=${video.encodeProgress} res=${video.availableResolutions}`,
    )
    // ready 状態から巻き戻さないため既に ready なら触らない
    if (existing.status !== 'ready') update = processingUpdate()
  }

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
