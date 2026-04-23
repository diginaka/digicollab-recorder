import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  FolderOpen,
  Video,
  Loader2,
  AlertCircle,
  Trash2,
  FileVideo,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { listRecordings, deleteRecording } from '../lib/recordingsApi'
import type { Recording, RecordingStatus } from '../types'

function StatusBadge({ status }: { status: RecordingStatus }) {
  if (status === 'ready') return null
  const map: Record<
    Exclude<RecordingStatus, 'ready'>,
    { label: string; className: string; icon?: React.ReactNode }
  > = {
    uploading: {
      label: '送信中',
      className: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    processing: {
      label: '準備中',
      className: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    error: {
      label: '失敗',
      className: 'bg-red-50 text-red-700 border-red-200',
      icon: <AlertCircle className="w-3 h-3" />,
    },
  }
  const m = map[status as Exclude<RecordingStatus, 'ready'>]
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${m.className}`}
    >
      {m.icon}
      {m.label}
    </span>
  )
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatDuration(sec: number | null): string | null {
  if (sec == null || sec <= 0) return null
  const mm = Math.floor(sec / 60)
  const ss = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

interface CardProps {
  recording: Recording
  onDelete: (r: Recording) => void
  deleting: boolean
}

function RecordingCard({ recording: r, onDelete, deleting }: CardProps) {
  const [open, setOpen] = useState(false)
  const canPlay =
    r.status === 'ready' && !!r.bunny_video_id && !!r.bunny_library_id

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => canPlay && setOpen((v) => !v)}
        disabled={!canPlay}
        aria-expanded={open}
        className={[
          'w-full text-left p-4 transition',
          canPlay ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default',
        ].join(' ')}
      >
        <div className="flex gap-3 items-start">
          {/* サムネイル placeholder (Bunny の直 URL アクセスは Referer 制限で 403 のため、
              動画アイコンで代替。展開時に iframe プレーヤーで再生) */}
          <div className="w-24 h-16 rounded bg-gradient-to-br from-emerald-100 to-emerald-200 flex-shrink-0 flex items-center justify-center text-emerald-600">
            <FileVideo className="w-8 h-8" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-gray-900 text-base truncate">
                {r.title || '無題'}
              </p>
              <StatusBadge status={r.status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
              <span>{formatDateTime(r.created_at)}</span>
              {formatDuration(r.duration_seconds) && (
                <span>{formatDuration(r.duration_seconds)}</span>
              )}
            </div>
            {r.status === 'error' && r.error_message && (
              <p className="text-xs text-red-700 mt-1 line-clamp-2">
                {r.error_message}
              </p>
            )}
          </div>

          {canPlay && (
            <span className="text-sm text-emerald-700 font-medium inline-flex items-center gap-0.5 flex-shrink-0 pt-0.5">
              {open ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  閉じる
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  再生
                </>
              )}
            </span>
          )}
        </div>
      </button>

      {/* 展開時のみ iframe を生成 (未展開では重い player を読み込まない) */}
      {open && canPlay && (
        <div className="border-t border-gray-100">
          <iframe
            src={`https://iframe.mediadelivery.net/embed/${r.bunny_library_id}/${r.bunny_video_id}?autoplay=false`}
            loading="lazy"
            className="block w-full border-0 bg-black"
            style={{ aspectRatio: '16 / 9' }}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title={r.title || '録画'}
          />
          <div className="flex items-center justify-end gap-2 p-3 bg-gray-50">
            <button
              onClick={() => onDelete(r)}
              disabled={deleting}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 rounded disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? '削除中...' : '削除'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Library() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const reload = async () => {
    setError(null)
    try {
      const list = await listRecordings(50)
      setRecordings(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました')
    }
  }

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [])

  const handleDelete = async (rec: Recording) => {
    if (!window.confirm(`「${rec.title || '無題'}」を削除します。よろしいですか?`)) return
    setDeletingId(rec.id)
    try {
      await deleteRecording(rec.id)
      setRecordings((list) => list.filter((r) => r.id !== rec.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Layout>
      <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto w-full">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-emerald-700 hover:underline mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          ホームへ
        </Link>

        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 inline-flex items-center gap-2">
            <FolderOpen className="w-7 h-7 text-gray-700" />
            ライブラリ
          </h1>
          <Link
            to="/record"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition"
          >
            <Video className="w-4 h-4" />
            新規録画
          </Link>
        </div>

        {loading && (
          <p className="text-sm text-gray-500 py-8 text-center">読み込み中...</p>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
            {error}
          </div>
        )}

        {!loading && recordings.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-10 text-center text-gray-500">
            <FileVideo className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-base">まだ録画はありません。</p>
            <Link
              to="/record"
              className="mt-3 inline-block text-emerald-700 hover:underline text-sm"
            >
              録画を始める →
            </Link>
          </div>
        )}

        {!loading && recordings.length > 0 && (
          <ul className="space-y-3">
            {recordings.map((r) => (
              <li key={r.id}>
                <RecordingCard
                  recording={r}
                  onDelete={handleDelete}
                  deleting={deletingId === r.id}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  )
}
