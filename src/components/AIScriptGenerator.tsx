import { useState } from 'react'
import { X, Sparkles, Loader2 } from 'lucide-react'
import { generateScript, type Tone } from '../lib/aiScript'

const TONE_OPTIONS: { value: Tone; label: string; desc: string }[] = [
  { value: 'friendly', label: '\u30d5\u30ec\u30f3\u30c9\u30ea\u30fc', desc: '\u89aa\u3057\u307f\u3084\u3059\u3044' },
  {
    value: 'professional',
    label: '\u30d7\u30ed\u30d5\u30a7\u30c3\u30b7\u30e7\u30ca\u30eb',
    desc: '\u843d\u3061\u7740\u3044\u305f',
  },
  { value: 'passionate', label: '\u60c5\u71b1\u7684', desc: '\u529b\u5f37\u3044' },
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
          'AI \u8a2d\u5b9a\u304c\u307e\u3060\u6e08\u307e\u305b\u3066\u3044\u307e\u305b\u3093\u3002\u7ba1\u7406\u8005\u306b\u304a\u554f\u3044\u5408\u308f\u305b\u304f\u3060\u3055\u3044\u3002',
        )
      } else {
        setGenerated(script)
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : '\u751f\u6210\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u3057\u3070\u3089\u304f\u3057\u3066\u304b\u3089\u518d\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002',
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
            AI \u3067\u53f0\u672c\u3092\u4f5c\u308b
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
            aria-label="\u9589\u3058\u308b"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">
              \u8a71\u3057\u305f\u3044\u30c6\u30fc\u30de
            </span>
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              rows={3}
              placeholder="\u4f8b: \u526f\u696d\u3067\u6708 5 \u4e07\u5186\u3092\u76ee\u6307\u3059\u4f1a\u793e\u54e1\u5411\u3051\u306e Notion \u6d3b\u7528\u5165\u9580"
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">\u76ee\u5b89\u306e\u9577\u3055</span>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} \u5206
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">\u30c8\u30fc\u30f3</span>
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
              <p className="text-sm font-medium text-gray-700 mb-1">\u751f\u6210\u7d50\u679c</p>
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
                \u30ad\u30e3\u30f3\u30bb\u30eb
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
                {loading ? '\u4f5c\u6210\u4e2d...' : '\u4f5c\u308b'}
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
                \u3082\u3046\u4e00\u5ea6\u4f5c\u308b
              </button>
              <button
                onClick={() => onAccept(generated)}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-base font-medium hover:bg-emerald-700"
              >
                \u3053\u306e\u5185\u5bb9\u3092\u4f7f\u3046
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
