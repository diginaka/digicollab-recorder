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
          \u30db\u30fc\u30e0\u3078
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 inline-flex items-center gap-2">
          <FolderOpen className="w-7 h-7 text-gray-700" />
          \u30e9\u30a4\u30d6\u30e9\u30ea
        </h1>

        <p className="text-sm text-gray-500">
          \u9332\u753b\u6e08\u307f\u306e\u52d5\u753b\u304c\u5b89\u9332\u3055\u308c\u307e\u3059 (Phase E \u3067\u5b9f\u88c5)\u3002
        </p>
      </div>
    </Layout>
  )
}
