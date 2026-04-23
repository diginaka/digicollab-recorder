import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Video, FolderOpen, FileText } from 'lucide-react'
import { Layout } from '../components/Layout'
import { listScripts } from '../lib/scriptsApi'
import type { Script } from '../types'

export default function Home() {
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listScripts(10)
      .then(setScripts)
      .catch((e) => setError(e instanceof Error ? e.message : '\u53f0\u672c\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Layout>
      <div className="px-4 sm:px-6 py-8 max-w-4xl mx-auto w-full">
        <section className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            \u3088\u3046\u3053\u305d
          </h1>
          <p className="text-base text-gray-600">
            \u53f0\u672c\u3092\u4f5c\u3063\u3066\u3001\u30d7\u30ed\u30f3\u30d7\u30bf\u30fc\u3092\u898b\u306a\u304c\u3089\u9332\u753b\u3067\u304d\u307e\u3059\u3002
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-3 mb-10">
          <Link
            to="/script/new"
            className="flex flex-col items-center rounded-xl border-2 border-emerald-500 bg-emerald-50 px-4 py-8 hover:bg-emerald-100 transition text-center"
          >
            <Plus className="w-12 h-12 text-emerald-700 mb-2" />
            <p className="text-base font-bold text-emerald-900">\u65b0\u3057\u3044\u53f0\u672c</p>
            <p className="text-sm text-emerald-800 mt-1">AI \u3067\u4e0b\u66f8\u304d\u3082\u4f5c\u308c\u307e\u3059</p>
          </Link>
          <Link
            to="/record"
            className="flex flex-col items-center rounded-xl border border-gray-200 bg-white px-4 py-8 hover:border-emerald-400 transition shadow-sm text-center"
          >
            <Video className="w-12 h-12 text-gray-700 mb-2" />
            <p className="text-base font-bold text-gray-900">\u9332\u753b\u3059\u308b</p>
            <p className="text-sm text-gray-600 mt-1">\u30d7\u30ed\u30f3\u30d7\u30bf\u30fc\u4ed8\u304d</p>
          </Link>
          <Link
            to="/library"
            className="flex flex-col items-center rounded-xl border border-gray-200 bg-white px-4 py-8 hover:border-emerald-400 transition shadow-sm text-center"
          >
            <FolderOpen className="w-12 h-12 text-gray-700 mb-2" />
            <p className="text-base font-bold text-gray-900">\u30e9\u30a4\u30d6\u30e9\u30ea</p>
            <p className="text-sm text-gray-600 mt-1">\u9332\u753b\u6e08\u307f\u306e\u52d5\u753b</p>
          </Link>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-600" />
              \u6700\u8fd1\u306e\u53f0\u672c
            </h2>
          </div>

          {loading && <p className="text-sm text-gray-500 px-1">\u8aad\u307f\u8fbc\u307f\u4e2d...</p>}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {!loading && !error && scripts.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-gray-300 p-10 text-center text-gray-500">
              <p className="text-base">\u307e\u3060\u53f0\u672c\u306f\u3042\u308a\u307e\u305b\u3093\u3002</p>
              <p className="text-sm mt-1">\u4e0a\u306e\u300c\u65b0\u3057\u3044\u53f0\u672c\u300d\u304b\u3089\u4f5c\u6210\u3067\u304d\u307e\u3059\u3002</p>
            </div>
          )}

          {!loading && scripts.length > 0 && (
            <ul className="space-y-2">
              {scripts.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/script/${s.id}`}
                    className="block rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-emerald-400 transition"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium text-gray-900 text-base truncate">
                        {s.title || '\u7121\u984c'}
                      </p>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {new Date(s.updated_at).toLocaleString('ja-JP', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {s.content.slice(0, 120)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  )
}
