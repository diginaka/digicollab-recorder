import { Link, useLocation } from 'react-router-dom'
import { FileText, Video, FolderOpen, Home as HomeIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

export function Layout({ children }: Props) {
  const loc = useLocation()
  const isExact = (path: string) => loc.pathname === path
  const startsWith = (prefix: string) => loc.pathname.startsWith(prefix)

  const navItem = (to: string, active: boolean, icon: ReactNode, label: string) => (
    <Link
      to={to}
      className={[
        'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition',
        active
          ? 'bg-emerald-100 text-emerald-800'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      ].join(' ')}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  )

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
            \u9332\u753b\u30b9\u30bf\u30b8\u30aa
          </Link>
          <nav className="flex items-center gap-1">
            {navItem('/', isExact('/'), <HomeIcon className="w-4 h-4" />, '\u30db\u30fc\u30e0')}
            {navItem(
              '/script/new',
              startsWith('/script'),
              <FileText className="w-4 h-4" />,
              '\u53f0\u672c',
            )}
            {navItem('/record', startsWith('/record'), <Video className="w-4 h-4" />, '\u9332\u753b')}
            {navItem(
              '/library',
              startsWith('/library'),
              <FolderOpen className="w-4 h-4" />,
              '\u30e9\u30a4\u30d6\u30e9\u30ea',
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  )
}
