import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { initSSO } from './lib/digicollabSso'
import Home from './routes/Home'
import Record from './routes/Record'
import Library from './routes/Library'
import ScriptEditor from './routes/ScriptEditor'

type Status = 'booting' | 'ready' | 'standalone'

export default function App() {
  const [status, setStatus] = useState<Status>('booting')

  useEffect(() => {
    // .env 未設定時(standalone)は SSO を skip して stub UI を出す
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      setStatus('standalone')
      return
    }
    initSSO().then((ok) => {
      if (ok) setStatus('ready')
    })
  }, [])

  if (status === 'booting') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 text-base">読み込み中...</p>
      </div>
    )
  }

  if (status === 'standalone') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <h1 className="text-2xl font-bold mb-3">録画スタジオ</h1>
        <p className="text-gray-600 max-w-md">
          環境変数 <code className="bg-gray-100 px-1.5 py-0.5 rounded">VITE_SUPABASE_URL</code> /
          <code className="bg-gray-100 px-1.5 py-0.5 rounded ml-1">VITE_SUPABASE_ANON_KEY</code>{' '}
          が未設定です。<code>.env</code> を作成してください。
        </p>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/record" element={<Record />} />
        <Route path="/library" element={<Library />} />
        <Route path="/script/:id" element={<ScriptEditor />} />
      </Routes>
    </BrowserRouter>
  )
}
