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
          setError('台本が見つかりません。削除済みか権限がありません。')
        } else {
          setTitle(s.title ?? '')
          setContent(s.content)
          setSavedId(s.id)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '読み込み失敗')
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
      setError('台本の内容を入力してください')
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
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!savedId) return
    if (!window.confirm('この台本を削除します。よろしいですか？')) return
    try {
      await deleteScript(savedId)
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
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
          ホームへ
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
          {isNew && !savedId ? '新しい台本' : '台本の編集'}
        </h1>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : (
          <>
            <label className="block mb-4">
              <span className="block text-sm font-medium text-gray-700 mb-1">タイトル</span>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setDirty(true)
                }}
                placeholder="例: 新商品紹介"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </label>

            <label className="block mb-5">
              <div className="flex items-center justify-between mb-1">
                <span className="block text-sm font-medium text-gray-700">台本の内容</span>
                <button
                  type="button"
                  onClick={() => setAiOpen(true)}
                  className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded transition"
                >
                  <Sparkles className="w-4 h-4" />
                  AI で下書きを作る
                </button>
              </div>
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  setDirty(true)
                }}
                placeholder="ここに台本を書くか、「AI で下書きを作る」で自動生成できます。"
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
                {saving ? '保存中...' : '保存する'}
              </button>
              {savedId && (
                <Link
                  to={`/record?script_id=${savedId}`}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-white border border-gray-300 text-gray-800 rounded-lg text-base font-medium hover:bg-gray-50 transition"
                >
                  <Video className="w-5 h-5" />
                  この台本で録画
                </Link>
              )}
              {savedId && (
                <button
                  onClick={handleDelete}
                  className="ml-auto inline-flex items-center gap-1 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded transition"
                >
                  <Trash2 className="w-4 h-4" />
                  削除
                </button>
              )}
            </div>

            {dirty && !saving && (
              <p className="mt-3 text-xs text-amber-700">
                ※ 未保存の変更があります
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
