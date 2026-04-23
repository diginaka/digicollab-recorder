import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Sparkles, Trash2, Video } from 'lucide-react'
import { Layout } from '../components/Layout'
import { AIScriptGenerator } from '../components/AIScriptGenerator'
import {
  createScript,
  deleteScript,
  getScript,
  updateScript,
} from '../lib/scriptsApi'
import { useLaunchParams } from '../hooks/useLaunchParams'
import type { AppId } from '../types'

const APP_IDS: AppId[] = [
  'course',
  'sales',
  'webinar',
  'thanks',
  'line',
  'email',
  'standalone',
]

function resolveAppId(raw: string | null): AppId {
  if (raw && (APP_IDS as string[]).includes(raw)) return raw as AppId
  return 'standalone'
}

export default function ScriptEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const launch = useLaunchParams()
  const isNew = !id || id === 'new'

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  useEffect(() => {
    if (isNew) {
      setLoading(false)
      return
    }
    let cancelled = false
    getScript(id!)
      .then((s) => {
        if (cancelled) return
        if (!s) {
          setError('\u53f0\u672c\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002\u524a\u9664\u6e08\u307f\u304b\u6a29\u9650\u304c\u3042\u308a\u307e\u305b\u3093\u3002')
        } else {
          setTitle(s.title ?? '')
          setContent(s.content)
          setSavedId(s.id)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '\u8aad\u307f\u8fbc\u307f\u5931\u6557')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  const handleSave = async () => {
    if (!content.trim()) {
      setError('\u53f0\u672c\u306e\u5185\u5bb9\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (isNew || !savedId) {
        const appId = resolveAppId(launch.appId)
        const created = await createScript({
          title: title.trim() || null,
          content,
          source_app: appId,
          source_ref: launch.sourceRef,
        })
        setSavedId(created.id)
        setDirty(false)
        navigate(`/script/${created.id}`, { replace: true })
      } else {
        const updated = await updateScript(savedId, {
          title: title.trim() || null,
          content,
        })
        setSavedId(updated.id)
        setDirty(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!savedId) return
    if (!window.confirm('\u3053\u306e\u53f0\u672c\u3092\u524a\u9664\u3057\u307e\u3059\u3002\u3088\u308d\u3057\u3044\u3067\u3059\u304b\uff1f')) return
    try {
      await deleteScript(savedId)
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : '\u524a\u9664\u306b\u5931\u6557\u3057\u307e\u3057\u305f')
    }
  }

  return (
    <Layout>
      <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-emerald-700 hover:underline mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          \u30db\u30fc\u30e0\u3078
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
          {isNew && !savedId ? '\u65b0\u3057\u3044\u53f0\u672c' : '\u53f0\u672c\u306e\u7de8\u96c6'}
        </h1>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">\u8aad\u307f\u8fbc\u307f\u4e2d...</p>
        ) : (
          <>
            <label className="block mb-4">
              <span className="block text-sm font-medium text-gray-700 mb-1">\u30bf\u30a4\u30c8\u30eb</span>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setDirty(true)
                }}
                placeholder="\u4f8b: \u65b0\u5546\u54c1\u7d39\u4ecb"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </label>

            <label className="block mb-5">
              <div className="flex items-center justify-between mb-1">
                <span className="block text-sm font-medium text-gray-700">\u53f0\u672c\u306e\u5185\u5bb9</span>
                <button
                  type="button"
                  onClick={() => setAiOpen(true)}
                  className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded transition"
                >
                  <Sparkles className="w-4 h-4" />
                  AI \u3067\u4e0b\u66f8\u304d\u3092\u4f5c\u308b
                </button>
              </div>
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  setDirty(true)
                }}
                placeholder="\u3053\u3053\u306b\u53f0\u672c\u3092\u66f8\u304f\u304b\u3001\u300cAI \u3067\u4e0b\u66f8\u304d\u3092\u4f5c\u308b\u300d\u3067\u81ea\u52d5\u751f\u6210\u3067\u304d\u307e\u3059\u3002"
                rows={16}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-y leading-relaxed"
              />
            </label>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleSave}
                disabled={saving || !content.trim()}
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg text-base font-medium hover:bg-emerald-700 disabled:opacity-40 transition shadow-sm"
              >
                <Save className="w-5 h-5" />
                {saving ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58\u3059\u308b'}
              </button>
              {savedId && (
                <Link
                  to={`/record?script_id=${savedId}`}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-white border border-gray-300 text-gray-800 rounded-lg text-base font-medium hover:bg-gray-50 transition"
                >
                  <Video className="w-5 h-5" />
                  \u3053\u306e\u53f0\u672c\u3067\u9332\u753b
                </Link>
              )}
              {savedId && (
                <button
                  onClick={handleDelete}
                  className="ml-auto inline-flex items-center gap-1 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded transition"
                >
                  <Trash2 className="w-4 h-4" />
                  \u524a\u9664
                </button>
              )}
            </div>

            {dirty && !saving && (
              <p className="mt-3 text-xs text-amber-700">
                \u203b \u672a\u4fdd\u5b58\u306e\u5909\u66f4\u304c\u3042\u308a\u307e\u3059
              </p>
            )}
          </>
        )}
      </div>

      {aiOpen && (
        <AIScriptGenerator
          onClose={() => setAiOpen(false)}
          onAccept={(generated) => {
            setContent((prev) => (prev.trim() ? `${prev}\n\n${generated}` : generated))
            setDirty(true)
            setAiOpen(false)
          }}
        />
      )}
    </Layout>
  )
}
