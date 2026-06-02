import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Video,
  Smartphone,
  Monitor,
  PictureInPicture,
  Circle,
  Square,
  Loader2,
  RefreshCw,
  Upload as UploadIcon,
  CheckCircle2,
  X,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { Teleprompter } from '../components/Teleprompter'
import { VideoRecorder } from '../lib/recorder'
import { useDeviceCapability } from '../hooks/useDeviceCapability'
import { useLaunchParams } from '../hooks/useLaunchParams'
import { getScript } from '../lib/scriptsApi'
import { startUpload, type UploadHandle } from '../lib/bunnyUpload'
import { waitForRecordingReady, RecordingReadyTimeoutError } from '../lib/recordingsApi'
import type { Recording, Script, RecordingMode, AppId } from '../types'

type Phase =
  | 'select'
  | 'preparing'
  | 'ready'
  | 'countdown'
  | 'recording'
  | 'preview'
  | 'uploading'
  | 'processing'
  | 'await_library' // 準備待ちタイムアウト / 処理エラーの出口(動画は既にアップ済・再送しない)
  | 'upload_failed' // アップロード失敗(同じ blob で再送導線)
  | 'done'

// ── 0Byte/極小録画ガード ──────────────────────────────────
// 空・短すぎる録画をアップロード前にフロントで弾くための閾値(調整可)。
// blob / video の duration メタデータは WebM では不定なため使わず、
// 録画経過タイマー(startTimeRef からの elapsedMs)で尺を判定する。
const MIN_BLOB_BYTES = 50_000 // 50KB 未満は空/ヘッダのみとみなす
const MIN_DURATION_MS = 1500 // 1.5 秒未満は誤操作の即停止とみなす

// 40〜60代向けに簡潔・責めない文言。内部名(Bunny 等)は出さない(白ラベル原則)。
const EMPTY_RECORDING_MESSAGE =
  '録画データがありません（または短すぎます）。もう一度録り直してください。'

function isRecordingTooSmall(blobSize: number, elapsedMs: number): boolean {
  return blobSize < MIN_BLOB_BYTES || elapsedMs < MIN_DURATION_MS
}

// ── 準備待ちタイムアウト / 再送ガード ──────────────────────
// 準備完了をフロントで待つ上限。超過したら「失敗」ではなく「準備中の出口」へ。
// 行は processing のまま残し、webhook (後続 reconcile) の ready 化に委ねる。
const READY_TIMEOUT_MS = 150_000 // 2.5 分。調整可
// アップロード再送の上限。v32 EF は呼ぶ度に新規行+新規動画を作るため、
// 無制限再送は孤児を量産する。初回 + 2 回 = 計 3 回まで。
const MAX_UPLOAD_RETRIES = 2

// 白ラベル原則: 内部名 (Bunny / TUS 等) を出さず、40〜60代向けに簡潔・責めない文言。
// 各画面の見出し(「アップロードに失敗しました」「アップロードは完了しました」)と
// 合わせて、依頼書記載の文面そのままになるよう本文側を定義している。
const UPLOAD_FAILED_MESSAGE = '通信状況をご確認のうえ、もう一度お試しください。'
// 再送上限に到達した時の文言。アップロード失敗時は動画が使える形で存在しないため、
// ライブラリ導線は出さず、録り直し/ホームのみに誘導する。
const UPLOAD_FAILED_FINAL_MESSAGE = '通信環境をご確認のうえ、後ほど録り直してください。'
const PREPARING_TIMEOUT_NOTICE =
  '動画の準備に少し時間がかかっています。ライブラリで後ほどご確認ください。'
const PROCESSING_ERROR_NOTICE =
  '動画の準備中に問題が発生しました。ライブラリで後ほどご確認ください。'

// 中断(キャンセル操作)の検出。準備待ちは DOMException(AbortError)、
// アップロード中断は Error('…中断しました') で来るため両方を拾う。
function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true
  const msg = e instanceof Error ? e.message : ''
  return /中断|abort/i.test(msg)
}

function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const mm = Math.floor(sec / 60).toString().padStart(2, '0')
  const ss = (sec % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

function friendlyErrorMessage(e: unknown, mode: RecordingMode): string {
  const err = e as { name?: string } | null
  const name = err?.name ?? ''
  if (name === 'NotAllowedError') {
    return mode === 'screen'
      ? '画面の共有が許可されませんでした。共有ダイアログで画面を選んで「共有」を押してください。'
      : 'カメラとマイクへのアクセスが許可されませんでした。ブラウザの設定を確認してもう一度お試しください。'
  }
  if (name === 'NotFoundError') {
    return 'カメラまたはマイクが見つかりません。接続を確認してください。'
  }
  if (name === 'NotReadableError') {
    return 'カメラまたはマイクが他のアプリで使われている可能性があります。他のアプリを閉じてもう一度お試しください。'
  }
  return '準備に失敗しました。しばらくしてからもう一度お試しください。'
}

function defaultRecordingTitle(script: Script | null): string {
  if (script?.title) return script.title
  const d = new Date()
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const dd = d.getDate().toString().padStart(2, '0')
  const hh = d.getHours().toString().padStart(2, '0')
  const mi = d.getMinutes().toString().padStart(2, '0')
  return `録画 ${mm}/${dd} ${hh}:${mi}`
}

export default function Record() {
  const device = useDeviceCapability()
  const launch = useLaunchParams()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('select')
  const [mode, setMode] = useState<RecordingMode | null>(null)
  const [script, setScript] = useState<Script | null>(null)
  const [scriptLoading, setScriptLoading] = useState<boolean>(Boolean(launch.scriptId))
  const [error, setError] = useState<string | null>(null)

  const [countdown, setCountdown] = useState(3)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [promptPlayTrigger, setPromptPlayTrigger] = useState(0)

  const [uploadPercent, setUploadPercent] = useState(0)
  const [readyRecording, setReadyRecording] = useState<Recording | null>(null)
  // アップロード失敗の回数(再送上限の判定用)。録り直しでリセット。
  const [uploadAttempts, setUploadAttempts] = useState(0)
  // await_library 出口の本文(タイムアウト / 処理エラーで文言が変わる)。
  const [noticeMessage, setNoticeMessage] = useState<string>('')

  const recorderRef = useRef<VideoRecorder | null>(null)
  const livePreviewRef = useRef<HTMLVideoElement>(null)
  const startTimeRef = useRef<number>(0)
  const uploadHandleRef = useRef<UploadHandle | null>(null)
  const processingAbortRef = useRef<AbortController | null>(null)
  // stop 時に実測した録画尺。handleUpload の多重防御で同じガードを再評価するため保持。
  const lastDurationMsRef = useRef<number>(0)

  // 台本ロード
  useEffect(() => {
    if (!launch.scriptId) return
    let cancelled = false
    getScript(launch.scriptId)
      .then((s) => {
        if (!cancelled) setScript(s)
      })
      .catch(() => {
        /* 台本取得失敗は UI に小さく出るだけ */
      })
      .finally(() => {
        if (!cancelled) setScriptLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [launch.scriptId])

  // unmount 時に stream / upload を破棄
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel()
      recorderRef.current = null
      uploadHandleRef.current?.abort().catch(() => {})
      processingAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    }
  }, [recordedUrl])

  // ページ離脱警告(録画 + アップロード + 処理待ち中)
  useEffect(() => {
    const guarded =
      phase === 'countdown' ||
      phase === 'recording' ||
      phase === 'uploading' ||
      phase === 'processing'
    if (!guarded) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [phase])

  // 経過時間タイマー
  useEffect(() => {
    if (phase !== 'recording') return
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current)
    }, 250)
    return () => window.clearInterval(id)
  }, [phase])

  // stream を <video> に繋ぐ
  useEffect(() => {
    if (phase !== 'ready' && phase !== 'countdown' && phase !== 'recording') return
    const el = livePreviewRef.current
    const stream = recorderRef.current?.getStream() ?? null
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream
      el.play().catch(() => {
        /* autoplay 制限 */
      })
    }
  }, [phase])

  const handleSelectMode = useCallback(async (m: RecordingMode) => {
    setError(null)
    setMode(m)
    setPhase('preparing')
    const rec = new VideoRecorder()
    recorderRef.current = rec
    try {
      if (m === 'screen') await rec.startScreen()
      else await rec.startSelfie()
      setPhase('ready')
    } catch (e) {
      recorderRef.current = null
      setMode(null)
      setPhase('select')
      setError(friendlyErrorMessage(e, m))
    }
  }, [])

  const handleStartRecording = useCallback(() => {
    const rec = recorderRef.current
    if (!rec) return
    setError(null)
    setPhase('countdown')
    setCountdown(3)
    let n = 3
    const id = window.setInterval(() => {
      n -= 1
      setCountdown(n)
      if (n <= 0) {
        window.clearInterval(id)
        try {
          rec.startRecording()
          startTimeRef.current = Date.now()
          setElapsedMs(0)
          setPhase('recording')
          setPromptPlayTrigger((x) => x + 1)
        } catch {
          setError('録画の開始に失敗しました。もう一度お試しください。')
          setPhase('ready')
        }
      }
    }, 1000)
  }, [])

  const handleStop = useCallback(async () => {
    const rec = recorderRef.current
    if (!rec) return
    // 経過尺は startTimeRef から実測する。elapsedMs state はこの useCallback
    // ([] deps)の closure では初期値 0 のままで stale になるため参照しない。
    const durationMs = Date.now() - startTimeRef.current
    try {
      const blob = await rec.stop()
      recorderRef.current = null
      // 0Byte/極小ガード: 空・短すぎる録画は preview に進めず録り直しへ戻す。
      // ここで弾けば Bunny に動画が作られず、トークン EF も呼ばれない。
      // stop() 済みで stream は破棄済みのため ready ではなく select へ戻す。
      if (isRecordingTooSmall(blob.size, durationMs)) {
        lastDurationMsRef.current = 0
        setRecordedBlob(null)
        setElapsedMs(0)
        setMode(null)
        setError(EMPTY_RECORDING_MESSAGE)
        setPhase('select')
        return
      }
      lastDurationMsRef.current = durationMs
      const url = URL.createObjectURL(blob)
      setRecordedBlob(blob)
      setRecordedUrl(url)
      setPhase('preview')
    } catch {
      setError('録画の停止に失敗しました。')
    }
  }, [])

  const handleRedo = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    setRecordedBlob(null)
    setRecordedUrl(null)
    setMode(null)
    setError(null)
    setElapsedMs(0)
    setReadyRecording(null)
    setUploadPercent(0)
    setUploadAttempts(0)
    setNoticeMessage('')
    setPhase('select')
  }, [recordedUrl])

  const handleBack = useCallback(() => {
    recorderRef.current?.cancel()
    recorderRef.current = null
    uploadHandleRef.current?.abort().catch(() => {})
    processingAbortRef.current?.abort()
    if (launch.returnTo) {
      try {
        window.location.href = decodeURIComponent(launch.returnTo)
        return
      } catch {
        /* fall through */
      }
    }
    navigate('/')
  }, [launch.returnTo, navigate])

  const redirectAfterReady = useCallback(
    (ready: Recording) => {
      if (launch.returnTo) {
        try {
          const url = new URL(decodeURIComponent(launch.returnTo))
          if (ready.public_url) url.searchParams.set('video_url', ready.public_url)
          if (ready.mp4_url) url.searchParams.set('video_mp4', ready.mp4_url)
          url.searchParams.set('recording_id', ready.id)
          if (launch.sourceRef) url.searchParams.set('source_ref', launch.sourceRef)
          window.location.href = url.toString()
          return
        } catch {
          /* fall through */
        }
      }
      navigate('/library')
    },
    [launch.returnTo, launch.sourceRef, navigate],
  )

  const handleUpload = useCallback(async () => {
    if (!recordedBlob || !mode) return
    // 多重防御: stop ガードをすり抜けた空/極小録画を Bunny / トークン EF へ送らない。
    if (isRecordingTooSmall(recordedBlob.size, lastDurationMsRef.current)) {
      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
      setRecordedBlob(null)
      setRecordedUrl(null)
      setElapsedMs(0)
      setMode(null)
      setError(EMPTY_RECORDING_MESSAGE)
      setPhase('select')
      return
    }
    setError(null)
    setNoticeMessage('')
    setUploadPercent(0)
    setPhase('uploading')

    const appId = launch.appId as AppId | null
    const handle = startUpload(
      recordedBlob,
      {
        title: defaultRecordingTitle(script),
        mode,
        script_id: script?.id ?? null,
        source_app: appId,
        source_ref: launch.sourceRef,
      },
      (pct) => setUploadPercent(pct),
    )
    uploadHandleRef.current = handle

    // ── フェーズ1: アップロード(トークン取得 + 送信) ──
    let recordingId: string
    try {
      const res = await handle.promise
      recordingId = res.recordingId
      uploadHandleRef.current = null
    } catch (e) {
      uploadHandleRef.current = null
      // 中断はキャンセル操作。preview へ戻すだけ(再送回数に数えない)。
      if (isAbortError(e)) {
        setPhase('preview')
        return
      }
      // トークン / 送信の失敗 -> 専用エラー + 再送導線(blob は保持して再録画を強要しない)。
      // 内部メッセージは出さず白ラベル文言で固定。再送上限の判定用にカウント。
      setUploadAttempts((n) => n + 1)
      setPhase('upload_failed')
      return
    }

    // ── フェーズ2: 準備完了待ち(動画は既にアップ済) ──
    setPhase('processing')
    const ctrl = new AbortController()
    processingAbortRef.current = ctrl
    try {
      const ready = await waitForRecordingReady(recordingId, {
        signal: ctrl.signal,
        timeoutMs: READY_TIMEOUT_MS,
      })
      processingAbortRef.current = null

      if (ready.status === 'error') {
        // 処理エラー。動画は既にアップ済のため再送はせず、ライブラリ確認の出口へ。
        setNoticeMessage(PROCESSING_ERROR_NOTICE)
        setPhase('await_library')
        return
      }

      setReadyRecording(ready)
      setPhase('done')
      window.setTimeout(() => redirectAfterReady(ready), 1800)
    } catch (e) {
      processingAbortRef.current = null
      // 中断はキャンセル操作。preview へ戻す。
      if (isAbortError(e)) {
        setPhase('preview')
        return
      }
      // タイムアウト: 「失敗」ではなく「準備中の出口」。row は processing のまま
      // (error に書き換えない)、webhook の ready 化に委ねる。再送は出さない。
      if (e instanceof RecordingReadyTimeoutError) {
        setNoticeMessage(PREPARING_TIMEOUT_NOTICE)
        setPhase('await_library')
        return
      }
      // 想定外の例外も同じ出口へ寄せる(動画は既にアップ済のため再送しない)。
      setNoticeMessage(PREPARING_TIMEOUT_NOTICE)
      setPhase('await_library')
    }
  }, [recordedBlob, recordedUrl, mode, script, launch.appId, launch.sourceRef, redirectAfterReady])

  const handleCancelUpload = useCallback(async () => {
    const h = uploadHandleRef.current
    if (h) {
      try {
        await h.abort()
      } catch {
        /* noop */
      }
      uploadHandleRef.current = null
    }
    processingAbortRef.current?.abort()
    processingAbortRef.current = null
  }, [])

  const scriptText = script?.content ?? ''
  const isSelfieLike = mode === 'selfie' || mode === 'selfie_mobile'
  // 再送上限内か(初回失敗=1 から数え、MAX_UPLOAD_RETRIES 回まで再送ボタンを出す)。
  const canRetryUpload = uploadAttempts <= MAX_UPLOAD_RETRIES

  const backButtonShown =
    phase !== 'recording' &&
    phase !== 'countdown' &&
    phase !== 'uploading' &&
    phase !== 'processing'

  return (
    <Layout>
      <div className="px-4 sm:px-6 py-5 max-w-5xl mx-auto w-full">
        {backButtonShown && (
          <button
            onClick={handleBack}
            className="inline-flex items-center text-sm text-emerald-700 hover:underline mb-3"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            戻る
          </button>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-4 text-red-900 text-base">
            {error}
          </div>
        )}

        {/* === Phase: select === */}
        {phase === 'select' && (
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-5 inline-flex items-center gap-2">
              <Video className="w-7 h-7 text-gray-700" />
              録画
            </h1>

            {scriptLoading && (
              <p className="text-sm text-gray-500 mb-4">台本を読み込んでいます...</p>
            )}

            {script && (
              <section className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs text-emerald-700 font-medium mb-1">使用する台本</p>
                <p className="text-base font-semibold text-gray-900">
                  {script.title || '無題'}
                </p>
                <p className="text-sm text-gray-700 mt-1 line-clamp-2">
                  {script.content.slice(0, 160)}
                </p>
              </section>
            )}

            <p className="text-base text-gray-700 mb-4">撮影方法を選んでください</p>

            <div className="grid gap-3 sm:grid-cols-3">
              <ModeCard
                icon={<Smartphone className="w-10 h-10" />}
                label="自撮り"
                desc={device.isMobile ? 'スマホのカメラ' : 'PC のカメラ'}
                disabled={!device.canCameraRecord}
                onClick={() =>
                  handleSelectMode(device.isMobile ? 'selfie_mobile' : 'selfie')
                }
              />
              <ModeCard
                icon={<Monitor className="w-10 h-10" />}
                label="画面録画"
                desc={device.canScreenRecord ? '画面と音声を記録' : 'PC でのみ使えます'}
                disabled={!device.canScreenRecord}
                onClick={() => handleSelectMode('screen')}
              />
              <ModeCard
                icon={<PictureInPicture className="w-10 h-10" />}
                label="画面 + 自撮り"
                desc="今後のバージョンで対応"
                disabled
                badge="Phase 2"
                onClick={() => {}}
              />
            </div>
          </div>
        )}

        {/* === Phase: preparing === */}
        {phase === 'preparing' && (
          <div className="text-center py-20">
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-emerald-600 mb-4" />
            <p className="text-base text-gray-700">カメラの準備中です...</p>
            <p className="text-sm text-gray-500 mt-1">
              ブラウザが許可を求めたら「許可」を選んでください。
            </p>
          </div>
        )}

        {/* === Phase: ready / countdown / recording === */}
        {(phase === 'ready' || phase === 'countdown' || phase === 'recording') && (
          <div className="flex flex-col gap-4">
            <div className="h-[55vh] min-h-[320px]">
              <Teleprompter text={scriptText} playTrigger={promptPlayTrigger} />
            </div>

            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1 rounded-xl overflow-hidden bg-black aspect-video">
                <video
                  ref={livePreviewRef}
                  className="w-full h-full object-contain"
                  style={isSelfieLike ? { transform: 'scaleX(-1)' } : undefined}
                  autoPlay
                  muted
                  playsInline
                />
                {phase === 'recording' && (
                  <div className="absolute top-3 left-3 inline-flex items-center gap-2 bg-red-600 text-white text-sm font-medium px-3 py-1.5 rounded-full shadow">
                    <Circle className="w-3 h-3 fill-white animate-pulse" />
                    録画中 {formatElapsed(elapsedMs)}
                  </div>
                )}
                {phase === 'countdown' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <span className="text-white text-8xl font-bold drop-shadow-lg">
                      {countdown > 0 ? countdown : '開始!'}
                    </span>
                  </div>
                )}
              </div>

              <div className="lg:w-64 flex lg:flex-col items-center justify-center gap-3 rounded-xl bg-white border border-gray-200 p-4">
                {phase === 'ready' && (
                  <>
                    <button
                      onClick={handleStartRecording}
                      className="inline-flex items-center gap-2 px-6 py-4 bg-red-600 text-white rounded-xl text-lg font-bold hover:bg-red-700 transition shadow-md"
                    >
                      <Circle className="w-5 h-5 fill-white" />
                      録画を開始
                    </button>
                    <p className="text-xs text-gray-500 text-center lg:mt-1">
                      3 秒のカウントダウン後に開始します
                    </p>
                  </>
                )}
                {phase === 'countdown' && (
                  <p className="text-base text-gray-700 text-center">
                    まもなく開始します...
                  </p>
                )}
                {phase === 'recording' && (
                  <>
                    <button
                      onClick={handleStop}
                      className="inline-flex items-center gap-2 px-6 py-4 bg-gray-900 text-white rounded-xl text-lg font-bold hover:bg-black transition shadow-md"
                    >
                      <Square className="w-5 h-5 fill-white" />
                      停止する
                    </button>
                    <p className="text-sm text-gray-600 lg:text-center">
                      経過:{' '}
                      <span className="font-mono font-bold">{formatElapsed(elapsedMs)}</span>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* === Phase: preview === */}
        {phase === 'preview' && recordedUrl && (
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 inline-flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              録画が完了しました
            </h2>

            <div className="rounded-xl overflow-hidden bg-black aspect-video mb-5">
              <video
                src={recordedUrl}
                className="w-full h-full object-contain"
                controls
                playsInline
              />
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 mb-5 text-sm text-gray-700">
              <p>
                ファイルサイズ: 約{' '}
                {recordedBlob
                  ? Math.round((recordedBlob.size / 1024 / 1024) * 10) / 10
                  : 0}{' '}
                MB
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                ※「アップロードする」を押すと、動画がサーバーに保存されます。
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleUpload}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg text-base font-semibold hover:bg-emerald-700 transition shadow-sm"
              >
                <UploadIcon className="w-5 h-5" />
                アップロードする
              </button>
              <button
                onClick={handleRedo}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-800 rounded-lg text-base font-medium hover:bg-gray-50 transition"
              >
                <RefreshCw className="w-5 h-5" />
                撮り直す
              </button>
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                あとで
              </Link>
            </div>
          </div>
        )}

        {/* === Phase: uploading === */}
        {phase === 'uploading' && (
          <div className="py-10 max-w-xl mx-auto text-center">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 inline-flex items-center gap-2">
              <UploadIcon className="w-6 h-6 text-emerald-600" />
              アップロード中
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              動画をサーバーに送っています。このページを閉じないでください。
            </p>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-end justify-between mb-2">
                <span className="text-sm text-gray-600">進捗</span>
                <span className="text-3xl sm:text-4xl font-bold font-mono text-emerald-700">
                  {uploadPercent}
                  <span className="text-xl">%</span>
                </span>
              </div>
              <div
                className="w-full bg-gray-200 rounded-full h-4 overflow-hidden"
                role="progressbar"
                aria-valuenow={uploadPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="bg-emerald-500 h-full transition-[width] duration-300"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-4">
                通信が不安定になっても、切れた所から自動で再開します。
              </p>
            </div>

            <button
              onClick={handleCancelUpload}
              className="mt-5 inline-flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
            >
              <X className="w-4 h-4" />
              中断する
            </button>
          </div>
        )}

        {/* === Phase: processing === */}
        {phase === 'processing' && (
          <div className="py-10 max-w-xl mx-auto text-center">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              動画を準備しています
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              送信が完了しました。再生できる形式に変換しています。少しだけお待ちください。
            </p>
            <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
              <Loader2 className="w-16 h-16 mx-auto animate-spin text-emerald-600 mb-3" />
              <p className="text-base text-gray-700">準備中…</p>
              <p className="text-xs text-gray-500 mt-2">
                通常は 30 秒〜 2 分で完了します。
              </p>
            </div>
            <p className="mt-4 text-xs text-gray-500">
              この画面を閉じても、ライブラリから後で確認できます。
            </p>
            <Link
              to="/library"
              className="mt-3 inline-block text-sm text-emerald-700 hover:underline"
            >
              ライブラリへ移動する →
            </Link>
          </div>
        )}

        {/* === Phase: done === */}
        {phase === 'done' && readyRecording && (
          <div className="py-10 max-w-xl mx-auto text-center">
            <CheckCircle2 className="w-20 h-20 mx-auto text-emerald-500 mb-3" />
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              完了しました
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              {launch.returnTo ? '呼び出し元に戻ります...' : 'ライブラリに移動します...'}
            </p>
            <button
              onClick={() => redirectAfterReady(readyRecording)}
              className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-lg text-base font-medium hover:bg-emerald-700 transition"
            >
              いますぐ移動
            </button>
          </div>
        )}

        {/* === Phase: await_library(準備待ちの出口・動画は既にアップ済) === */}
        {phase === 'await_library' && (
          <div className="py-10 max-w-xl mx-auto text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500 mb-3" />
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              アップロードは完了しました
            </h2>
            <p className="text-base text-gray-700 mb-6">{noticeMessage}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate('/library')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg text-base font-semibold hover:bg-emerald-700 transition shadow-sm"
              >
                ライブラリを開く
              </button>
              <button
                onClick={handleRedo}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-800 rounded-lg text-base font-medium hover:bg-gray-50 transition"
              >
                <Video className="w-5 h-5" />
                新しく録画
              </button>
            </div>
          </div>
        )}

        {/* === Phase: upload_failed(アップロード失敗・同じ blob で再送) === */}
        {phase === 'upload_failed' && (
          <div className="py-10 max-w-xl mx-auto text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
              <X className="w-9 h-9 text-red-500" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              {canRetryUpload
                ? 'アップロードに失敗しました'
                : 'アップロードに繰り返し失敗しました'}
            </h2>
            <p className="text-base text-gray-700 mb-6">
              {canRetryUpload ? UPLOAD_FAILED_MESSAGE : UPLOAD_FAILED_FINAL_MESSAGE}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {canRetryUpload ? (
                <>
                  <button
                    onClick={handleUpload}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg text-base font-semibold hover:bg-emerald-700 transition shadow-sm"
                  >
                    <UploadIcon className="w-5 h-5" />
                    もう一度アップロード
                  </button>
                  <button
                    onClick={handleRedo}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-800 rounded-lg text-base font-medium hover:bg-gray-50 transition"
                  >
                    <RefreshCw className="w-5 h-5" />
                    録り直す
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleRedo}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg text-base font-semibold hover:bg-emerald-700 transition shadow-sm"
                  >
                    <RefreshCw className="w-5 h-5" />
                    録り直す
                  </button>
                  <button
                    onClick={() => navigate('/')}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-800 rounded-lg text-base font-medium hover:bg-gray-50 transition"
                  >
                    ホーム
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

interface ModeCardProps {
  icon: React.ReactNode
  label: string
  desc: string
  disabled?: boolean
  badge?: string
  onClick: () => void
}

function ModeCard({ icon, label, desc, disabled, badge, onClick }: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'relative flex flex-col items-center rounded-xl border-2 px-4 py-7 text-center transition',
        disabled
          ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
          : 'border-emerald-500 bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
      ].join(' ')}
    >
      {badge && (
        <span className="absolute top-2 right-2 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
          {badge}
        </span>
      )}
      <div className={disabled ? 'text-gray-400' : 'text-emerald-700'}>{icon}</div>
      <p className="mt-2 text-base font-bold">{label}</p>
      <p className={`text-sm mt-1 ${disabled ? 'text-gray-400' : 'text-emerald-800'}`}>
        {desc}
      </p>
    </button>
  )
}
