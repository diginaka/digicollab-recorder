// Phase A スタブ — Phase E で fb_recordings 一覧 + Bunny Stream 再生を実装
import { Link } from 'react-router-dom'

export default function Library() {
  return (
    <div className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <Link to="/" className="text-sm text-emerald-700 hover:underline">
        ← 戻る
      </Link>
      <h1 className="text-3xl font-bold mt-4 mb-6">ライブラリ</h1>
      <p className="text-gray-500 text-sm">
        録画済みの動画が一覧表示されます (Phase E で実装)。
      </p>
    </div>
  )
}
