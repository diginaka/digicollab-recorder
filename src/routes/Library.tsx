import { Link } from 'react-router-dom'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import { Layout } from '../components/Layout'

export default function Library() {
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

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 inline-flex items-center gap-2">
          <FolderOpen className="w-7 h-7 text-gray-700" />
          ライブラリ
        </h1>

        <p className="text-sm text-gray-500">
          録画済みの動画が保存されます (Phase E で実装)。
        </p>
      </div>
    </Layout>
  )
}
