import { useState } from 'react'
import { X, Sparkles, Loader2 } from 'lucide-react'
import { generateScript, type Tone } from '../lib/aiScript'

const TONE_OPTIONS: { value: Tone; label: string; desc: string }[] = [
  { value: 'friendly', label: 'フレンドリー', desc: '親しみやすい' },
  {
    value: 'professional',
    label: 'プロフェッショナル',
    desc: '落ち着いた',
  },
  { value: 'passionate', label: '情熱的', desc: '力強い' },
]

const DURATION_OPTIONS = [1, 2, 3, 5, 10]

interface Props {
  onClose: () => void
  onAccept: (script: string) => void
}

export function AIScriptGenerator({ onClose, onAccept }: Props) {
  const [theme, setTheme] = useState('')
  const [duration, setDuration] = useState(2)
  const [tone, setTone] = useState<Tone>('friendly')
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!theme.trim()) return
    setLoading(true)
    setError(null)
    setGenerated(null)
    try {
      const { script, fallback } = await generateScript({
        theme: theme.trim(),
        durationMinutes: duration,
        tone,
      })
      if (fallback || !script) {
        setError(
          'AI 設定がまだ済ませていません。管理者にお問い合わせください。',
        )
      } else {
        setGenerated(script)
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : '生成に失敗しました。しばらくしてから再度お試しください。',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[92vh] flex flex-col">
        <header className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            AI で台本を作る
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">
              話したいテーマ
            </span>
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              rows={3}
              placeholder="例: 副業で月 5 万円を目指す会社員向けの Notion 活用入門"
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">目安の長さ</span>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} 分
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">トーン</span>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as Tone)}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              >
                {TONE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
              {error}
            </div>
          )}

          {generated && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">生成結果</p>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto text-gray-900">
                {generated}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 p-5 border-t border-gray-200">
          {!generated ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading || !theme.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-base font-medium hover:bg-emerald-700 disabled:opacity-40 transition"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
                {loading ? '作成中...' : '作る'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setGenerated(null)
                  setError(null)
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                もう一度作る
              </button>
              <button
                onClick={() => onAccept(generated)}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-base font-medium hover:bg-emerald-700"
              >
                この内容を使う
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
