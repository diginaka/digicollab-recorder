// 動画のアップロード (TUS / tus-js-client 4.3)
//
// フロー:
//   1. Edge Function fb-bunny-upload-token を呼び、動画サーバー側で動画オブジェクトを作成
//   2. 返却された認証署名 + expires + video_id + library_id を TUS ヘッダーに設定
//   3. tus.Upload で 5MB チャンクごとにアップロード (中断時の再開は tus-js-client が自動処理)
//   4. 完了時に { recordingId, videoId } を返す
//
// UI では Bunny / TUS / HLS などの外部サービス名を使わない。

import { Upload } from 'tus-js-client'
import { supabase } from './supabase'
import type { RecordingMode } from '../types'

export interface UploadMetadata {
  title: string
  mode: RecordingMode
  script_id?: string | null
  source_app?: string | null
  source_ref?: string | null
}

export interface UploadResult {
  recordingId: string
  videoId: string
}

export interface UploadHandle {
  /** アップロード完了・失敗を待つ Promise */
  promise: Promise<UploadResult>
  /** 進行中のアップロードを中断する */
  abort: () => Promise<void>
}

interface TokenPayload {
  recording_id: string
  video_id: string
  library_id: string
  auth_signature: string
  expires: number
  upload_endpoint: string
}

const CHUNK_SIZE = 5 * 1024 * 1024 // 5 MB
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000]

export function startUpload(
  blob: Blob,
  metadata: UploadMetadata,
  onProgress?: (percent: number) => void,
): UploadHandle {
  let upload: Upload | null = null
  let aborted = false

  const promise: Promise<UploadResult> = (async () => {
    if (!supabase) throw new Error('通信の準備ができませんでした。ページを再読み込みしてください。')

    // Step 1: upload 認証トークン取得
    const invokeRes = await supabase.functions.invoke('fb-bunny-upload-token', {
      body: metadata,
    })
    if (invokeRes.error) {
      throw new Error('アップロードの準備に失敗しました。しばらくしてからもう一度お試しください。')
    }
    const token = invokeRes.data as TokenPayload | null
    if (!token?.upload_endpoint || !token.video_id) {
      throw new Error('サーバーの応答が不正でした。しばらくしてからもう一度お試しください。')
    }
    if (aborted) throw new Error('アップロードを中断しました')

    // Step 2: TUS アップロード
    return await new Promise<UploadResult>((resolve, reject) => {
      upload = new Upload(blob, {
        endpoint: token.upload_endpoint,
        retryDelays: RETRY_DELAYS,
        chunkSize: CHUNK_SIZE,
        headers: {
          AuthorizationSignature: token.auth_signature,
          AuthorizationExpire: String(token.expires),
          VideoId: token.video_id,
          LibraryId: token.library_id,
        },
        metadata: {
          filetype: blob.type || 'video/webm',
          title: metadata.title,
        },
        onProgress(bytesSent: number, bytesTotal: number) {
          const pct = bytesTotal > 0 ? Math.min(100, Math.round((bytesSent / bytesTotal) * 100)) : 0
          onProgress?.(pct)
        },
        onSuccess() {
          resolve({ recordingId: token.recording_id, videoId: token.video_id })
        },
        onError(err: Error) {
          reject(err)
        },
      })
      if (aborted) {
        reject(new Error('アップロードを中断しました'))
        return
      }
      upload.start()
    })
  })()

  return {
    promise,
    abort: async () => {
      aborted = true
      if (upload) {
        try {
          await upload.abort(false)
        } catch {
          /* abort 中のエラーは握りつぶす */
        }
      }
    },
  }
}
