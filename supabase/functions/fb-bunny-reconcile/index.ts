// fb-bunny-reconcile — 通知取りこぼしで processing/uploading に固着した fb_recordings を
// 動画 API の実状態に照らして ready/error に矯正する「取りこぼし回収」EF。
//
// 背景: 通知(fb-bunny-webhook)が届かないと行が永久に processing/uploading のまま固着する
//   (実例: 約14時間固着→手動掃除した)。(b) でフロントはタイムアウトしても行を error に
//   書き換えない設計にしたため、processing→ready/error を確定させる主体はこの reconcile と
//   webhook のみ。両者は _shared/bunnyVideoStatus.ts の同一判定ロジックを使う(二重実装しない)。
//
// 認証: verify_jwt=false + 関数内で ?token= / Bearer を RECONCILE_TRIGGER_TOKEN と照合。
//   サービスロールで DB を書き換えるため、トークン不一致は拒否(運用/将来の cron からのみ呼ぶ)。
//
// 呼び出し(オンデマンド / 将来 cron):
//   POST /functions/v1/fb-bunny-reconcile?token=<RECONCILE_TRIGGER_TOKEN>
//   Body(任意): { "limit": 25 }   // 1 回で評価する最大行数(既定 25・上限 100・古い順)
//
// 冪等性: status IN (uploading,processing) かつ 5 分以上前の行のみ対象(ready は select で除外)。
//   UPDATE にも status 条件を重ねて、取得後に webhook が ready 化した行を上書きしない。
//   共通判定も ready から巻き戻さない。何度呼んでも安全(将来 cron 化前提)。

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  decideRecordingUpdate,
  errorUpdate,
  fetchBunnyVideo,
} from '../_shared/bunnyVideoStatus.ts'

const STALE_AFTER_MINUTES = 5
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

type StuckRow = {
  id: string
  status: string
  bunny_video_id: string | null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // 認証: トリガートークン照合(?token= か Authorization: Bearer)。
  const triggerToken = Deno.env.get('RECONCILE_TRIGGER_TOKEN')
  if (!triggerToken) return json({ error: 'server misconfigured' }, 500)
  const url = new URL(req.url)
  const provided =
    url.searchParams.get('token') ??
    req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  if (provided !== triggerToken) return json({ error: 'forbidden' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const cdnHostname = Deno.env.get('BUNNY_STREAM_CDN_HOSTNAME')
  const bunnyApiKey = Deno.env.get('BUNNY_STREAM_API_KEY')
  const libraryId = Deno.env.get('BUNNY_STREAM_LIBRARY_ID')
  if (!supabaseUrl || !serviceKey || !cdnHostname || !bunnyApiKey || !libraryId) {
    return json({ error: 'server misconfigured' }, 500)
  }

  // 任意パラメータ: limit(body 無し/不正は既定値で続行)。
  let limit = DEFAULT_LIMIT
  try {
    const body = (await req.json()) as { limit?: unknown }
    if (typeof body?.limit === 'number' && Number.isFinite(body.limit)) {
      limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(body.limit)))
    }
  } catch {
    // ignore — 既定値
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const staleBefore = new Date(Date.now() - STALE_AFTER_MINUTES * 60_000).toISOString()

  // 5 分以上 processing/uploading の行を古い順に取得。
  const { data: rows, error: selErr } = await supabase
    .from('fb_recordings')
    .select('id, status, bunny_video_id')
    .in('status', ['uploading', 'processing'])
    .lt('created_at', staleBefore)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (selErr) return json({ error: 'lookup failed', detail: selErr.message }, 500)

  const stuck = (rows ?? []) as StuckRow[]
  let readied = 0
  let errored = 0
  let keptProcessing = 0
  let unchanged = 0
  let failed = 0

  for (const row of stuck) {
    let update: Record<string, unknown> | null

    if (!row.bunny_video_id) {
      // 動画 ID が無い = トークン発行前に死んだ等。再生不能なので error 確定。
      update = errorUpdate('動画の作成に失敗しました。')
    } else {
      const video = await fetchBunnyVideo(libraryId, bunnyApiKey, row.bunny_video_id)
      update = decideRecordingUpdate({
        video,
        existingStatus: row.status,
        cdnHostname,
        guid: row.bunny_video_id,
      })
    }

    if (!update) {
      unchanged += 1
      continue
    }

    // UPDATE にも status 条件を重ね、取得後に webhook が ready 化していた行は触らない。
    const { error: updErr } = await supabase
      .from('fb_recordings')
      .update(update)
      .eq('id', row.id)
      .in('status', ['uploading', 'processing'])

    if (updErr) {
      failed += 1
      console.log(`[reconcile] update failed for row ${row.id}: ${updErr.message}`)
      continue
    }

    if (update.status === 'ready') readied += 1
    else if (update.status === 'error') errored += 1
    else keptProcessing += 1
  }

  console.log(
    `[reconcile] scanned=${stuck.length} readied=${readied} errored=${errored} ` +
      `keptProcessing=${keptProcessing} unchanged=${unchanged} failed=${failed}`,
  )

  return json({ scanned: stuck.length, readied, errored, keptProcessing, unchanged, failed })
})
