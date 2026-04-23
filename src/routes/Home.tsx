// Phase A スタブ — Phase C でライブラリ + 新規録画導線に拡張
import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">録画スタジオ</h1>
      <p className="text-gray-600 mb-8 text-base leading-relaxed">
        台本を作って、プロンプターを見ながら録画できます。
      </p>
      <nav className="grid gap-3 sm:grid-cols-3">
        <Link
          to="/record"
          className="block rounded-xl border border-gray-200 bg-white px-5 py-6 shadow-sm hover:border-emerald-400 hover:shadow transition-colors text-center"
        >
          <p className="text-lg font-semibold text-gray-900">新しく録画</p>
          <p className="text-sm text-gray-500 mt-1">台本と併せて撮影</p>
        </Link>
        <Link
          to="/library"
          className="block rounded-xl border border-gray-200 bg-white px-5 py-6 shadow-sm hover:border-emerald-400 hover:shadow transition-colors text-center"
        >
          <p className="text-lg font-semibold text-gray-900">ライブラリ</p>
          <p className="text-sm text-gray-500 mt-1">録画済みの動画</p>
        </Link>
        <Link
          to="/script/new"
          className="block rounded-xl border border-gray-200 bg-white px-5 py-6 shadow-sm hover:border-emerald-400 hover:shadow transition-colors text-center"
        >
          <p className="text-lg font-semibold text-gray-900">台本を作る</p>
          <p className="text-sm text-gray-500 mt-1">AI で下書きも可能</p>
        </Link>
      </nav>
      <p className="mt-10 text-xs text-gray-400 text-center">Phase A スタブ — 完全実装は Phase C 以降</p>
    </div>
  )
}
