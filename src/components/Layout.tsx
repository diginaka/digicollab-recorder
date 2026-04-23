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
            録画スタジオ
          </Link>
          <nav className="flex items-center gap-1">
            {navItem('/', isExact('/'), <HomeIcon className="w-4 h-4" />, 'ホーム')}
            {navItem(
              '/script/new',
              startsWith('/script'),
              <FileText className="w-4 h-4" />,
              '台本',
            )}
            {navItem('/record', startsWith('/record'), <Video className="w-4 h-4" />, '録画')}
            {navItem(
              '/library',
              startsWith('/library'),
              <FolderOpen className="w-4 h-4" />,
              'ライブラリ',
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  )
}
