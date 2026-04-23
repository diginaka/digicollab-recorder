// Phase A スタブ — Phase C で fb_scripts 編集 + AI 生成を実装
import { Link, useParams } from 'react-router-dom'

export default function ScriptEditor() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <Link to="/" className="text-sm text-emerald-700 hover:underline">
        ← 戻る
      </Link>
      <h1 className="text-3xl font-bold mt-4 mb-6">
        {id === 'new' ? '新しい台本' : `台本 (${id})`}
      </h1>
      <p className="text-gray-500 text-sm">
        Phase C で AI 台本生成 + 編集フォームを実装します。
      </p>
    </div>
  )
}
