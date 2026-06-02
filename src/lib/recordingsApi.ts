// fb_recordings 読み取り系ヘルパー。
// RLS により auth.uid() 所有者分のみ返る。
import { supabase } from './supabase'
import type { Recording } from '../types'

function client() {
  if (!supabase) throw new Error('Supabase client not initialized')
  return supabase
}

export async function listRecordings(limit = 50): Promise<Recording[]> {
  const sb = client()
  const { data, error } = await sb
    .from('fb_recordings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Recording[]
}

export async function getRecording(id: string): Promise<Recording | null> {
  const sb = client()
  const { data, error } = await sb.from('fb_recordings').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Recording | null) ?? null
}

export async function deleteRecording(id: string): Promise<void> {
  const sb = client()
  const { error } = await sb.from('fb_recordings').delete().eq('id', id)
  if (error) throw error
}

export interface WaitOptions {
  signal?: AbortSignal
  /** タイムアウト (ms)、既定 5 分 */
  timeoutMs?: number
  /** ポーリング間隔 (ms) の固定上書き。未指定なら指数バックオフ(3→5→8→13秒)。 */
  intervalMs?: number
  /** status 変化時コールバック (uploading → processing → ready の各タイミング) */
  onTick?: (recording: Recording) => void
}

/**
 * 準備完了の待ち受けが timeoutMs を超えた時に投げる型付きエラー。
 * 呼び出し側が「アップロード失敗」と「準備待ちタイムアウト(動画は既にアップ済)」を
 * 区別して扱えるようにするためのもの。中断 (AbortError) とも区別される。
 */
export class RecordingReadyTimeoutError extends Error {
  constructor(message = '動画の準備がタイムアウトしました。') {
    super(message)
    this.name = 'RecordingReadyTimeoutError'
  }
}

// フィボ風ポーリングバックオフ(秒: 3→5→8→13、以降 13 で頭打ち)。
// 無駄な polling 回数を削減するのが目的で、最終挙動(ready 到達 / timeout throw)は不変。
const POLL_BACKOFF_MS = [3_000, 5_000, 8_000, 13_000]

/**
 * 動画の処理完了 (status='ready' or 'error') をポーリングで待つ。
 * Webhook 経由の更新を検知する想定。
 * ポーリング間隔は POLL_BACKOFF_MS の指数バックオフ。opts.intervalMs を渡すと固定間隔に上書き。
 */
export async function waitForRecordingReady(
  id: string,
  opts: WaitOptions = {},
): Promise<Recording> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000
  const start = Date.now()
  let attempt = 0

  while (Date.now() - start < timeoutMs) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const rec = await getRecording(id)
      if (rec) {
        opts.onTick?.(rec)
        if (rec.status === 'ready' || rec.status === 'error') return rec
      }
    } catch {
      // 一時的なエラーは無視してポーリング継続
    }
    // ポーリング間隔: 既定はバックオフ、opts.intervalMs 指定時は固定(テスト用の上書き)。
    const sleepMs =
      opts.intervalMs ?? POLL_BACKOFF_MS[Math.min(attempt, POLL_BACKOFF_MS.length - 1)]
    attempt += 1
    // 中断可能な sleep
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(resolve, sleepMs)
      const onAbort = () => {
        window.clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      opts.signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  throw new RecordingReadyTimeoutError()
}
