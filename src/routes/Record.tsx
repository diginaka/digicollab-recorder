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
  Upload,
  CheckCircle2,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { Teleprompter } from '../components/Teleprompter'
import { VideoRecorder } from '../lib/recorder'
import { useDeviceCapability } from '../hooks/useDeviceCapability'
import { useLaunchParams } from '../hooks/useLaunchParams'
import { getScript } from '../lib/scriptsApi'
import type { Script, RecordingMode } from '../types'

type Phase = 'select' | 'preparing' | 'ready' | 'countdown' | 'recording' | 'preview'

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

  const recorderRef = useRef<VideoRecorder | null>(null)
  const livePreviewRef = useRef<HTMLVideoElement>(null)
  const startTimeRef = useRef<number>(0)

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

  // unmount 時に stream を破棄
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel()
      recorderRef.current = null
    }
  }, [])

  // 録画用 URL の revoke
  useEffect(() => {
    return () => {
      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    }
  }, [recordedUrl])

  // ページ離脱警告(カウントダウン + 録画中)
  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'recording') return
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

  const handleSelectMode = useCallback(
    async (m: RecordingMode) => {
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
    },
    [],
  )

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
          // テレプロンプター自動再生(新しいトリガー値で発火)
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
    try {
      const blob = await rec.stop()
      recorderRef.current = null
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
    setPhase('select')
  }, [recordedUrl])

  const handleBack = useCallback(() => {
    recorderRef.current?.cancel()
    recorderRef.current = null
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

  const scriptText = script?.content ?? ''
  const isSelfieLike = mode === 'selfie' || mode === 'selfie_mobile'

  return (
    <Layout>
      <div className="px-4 sm:px-6 py-5 max-w-5xl mx-auto w-full">
        {phase !== 'recording' && phase !== 'countdown' && (
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
              <Teleprompter
                text={scriptText}
                playTrigger={promptPlayTrigger}
              />
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
                      経過: <span className="font-mono font-bold">{formatElapsed(elapsedMs)}</span>
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
                ファイルサイズ: 約 {recordedBlob ? Math.round(recordedBlob.size / 1024 / 1024 * 10) / 10 : 0} MB
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                ※ アップロードはまだ始まっていません。「アップロード」ボタンで動画サーバーに保存されます。
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                disabled
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg text-base font-semibold opacity-50 cursor-not-allowed"
                title="Phase E で実装予定"
              >
                <Upload className="w-5 h-5" />
                アップロードする
                <span className="ml-1 text-xs bg-white/20 px-2 py-0.5 rounded">準備中</span>
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
