// _shared/bunnyVideoStatus.ts
//
// 動画プロバイダ(Stream)の動画状態から fb_recordings の更新内容を決める「唯一の」判定ロジック。
// 通知契機の fb-bunny-webhook と、取りこぼし回収の fb-bunny-reconcile の両方から使う。
// ready / error / processing の確定判定をここ 1 か所に集約し、重複実装による乖離を防ぐ。
//
// 判定方針(実測ベース・2026-04-23):
//   通知ペイロードの Status はプロバイダのバージョン差で意味が揺れるため、最終判定は
//   動画 API から返る availableResolutions / encodeProgress / status を根拠にする。
//     - availableResolutions 非空 = 少なくとも 1 解像度が再生可能 → ready
//     - status === 5 = 明示エラー
//     - それ以外 = 中間状態(processing 維持・確定しない)
//
// 冪等性: 既に ready の行は触らない / 中間・到達不可では確定しない。
//   → 同じ行を何度評価しても安全(reconcile を繰り返し呼んでも壊れない)。

export type BunnyVideo = {
  guid?: string
  status?: number
  encodeProgress?: number
  availableResolutions?: string
  length?: number
  errorMessage?: string
  thumbnailCount?: number
}

/** 通知契機(webhook)だけが持つ補助フィールド。reconcile からは undefined。 */
export type WebhookFallback = {
  status?: number
  length?: number
  errorMessage?: string
}

/** 動画 API から現在の動画状態を取得。到達不可・非 200 は null(= 確定しない)。 */
export async function fetchBunnyVideo(
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

// 状態遷移時は関連列を明示的にクリアする(例: error → ready 遷移時の古い error_message 残留を防止)。
export function readyUpdate(
  cdnHostname: string,
  guid: string,
  durationSeconds: number | null,
): Record<string, unknown> {
  return {
    status: 'ready',
    public_url: `https://${cdnHostname}/${guid}/playlist.m3u8`,
    mp4_url: `https://${cdnHostname}/${guid}/play_720p.mp4`,
    thumbnail_url: `https://${cdnHostname}/${guid}/thumbnail.jpg`,
    duration_seconds: durationSeconds,
    error_message: null,
  }
}

export function errorUpdate(message: string): Record<string, unknown> {
  return {
    status: 'error',
    error_message: message,
    public_url: null,
    mp4_url: null,
    thumbnail_url: null,
  }
}

export function processingUpdate(): Record<string, unknown> {
  return { status: 'processing', error_message: null }
}

// 白ラベル原則: error_message に内部サービス名を出さない簡潔な文言。
const ENCODE_FAILED_MESSAGE = 'エンコードに失敗しました。'

/**
 * 動画状態(+任意の通知補助情報)から fb_recordings の更新内容を決める純関数。
 * 返り値 null = 「更新しない」(中間状態 / 到達不可 / 既に ready 等)。
 *
 * @param video        動画 API から取得した状態(到達不可なら null)
 * @param existingStatus 現在の fb_recordings.status
 * @param cdnHostname  ready 時の再生 URL 組み立て用ホスト
 * @param guid         対象 bunny_video_id
 * @param fallback     webhook のみが渡す補助情報(reconcile では undefined)
 */
export function decideRecordingUpdate(params: {
  video: BunnyVideo | null
  existingStatus: string
  cdnHostname: string
  guid: string
  fallback?: WebhookFallback
}): Record<string, unknown> | null {
  const { video, existingStatus, cdnHostname, guid, fallback } = params

  const hasResolutions =
    typeof video?.availableResolutions === 'string' &&
    video.availableResolutions.trim().length > 0
  const isExplicitError = video?.status === 5
  const isEncodingComplete =
    typeof video?.encodeProgress === 'number' && video.encodeProgress >= 100

  if (isExplicitError) {
    return errorUpdate(video?.errorMessage ?? fallback?.errorMessage ?? ENCODE_FAILED_MESSAGE)
  }

  if (hasResolutions || isEncodingComplete) {
    const dur =
      typeof video?.length === 'number'
        ? Math.max(0, Math.round(video.length))
        : typeof fallback?.length === 'number'
          ? Math.max(0, Math.round(fallback.length))
          : null
    return readyUpdate(cdnHostname, guid, dur)
  }

  if (!video) {
    // 動画 API 到達不可。通知の補助 Status があれば最低限の確定をする:
    //   Status=4 → ready / Status=5 → error / それ以外 → 中間(uploading のみ processing へ前進)。
    // reconcile(fallback 無し)はここで確定せず null を返し、次回再評価に委ねる。
    if (fallback?.status === 4) {
      return readyUpdate(
        cdnHostname,
        guid,
        typeof fallback.length === 'number' ? Math.max(0, Math.round(fallback.length)) : null,
      )
    }
    if (fallback?.status === 5) {
      return errorUpdate(fallback.errorMessage ?? ENCODE_FAILED_MESSAGE)
    }
    if (existingStatus === 'uploading') return processingUpdate()
    return null
  }

  // 動画 API は返ったが中間状態。ready からは巻き戻さない(冪等)。
  if (existingStatus !== 'ready') return processingUpdate()
  return null
}
