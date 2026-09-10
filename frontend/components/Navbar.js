'use client'

import Link from 'next/link'
import { useAuth } from '../context/AuthContext'
import DemoModeToggle from './DemoModeToggle'

export default function Navbar() {
  const { user, logout } = useAuth()

  return (
    <header className="border-b border-line bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-display text-xl text-primary">
          Sisa Pangan &amp; Maggot
        </Link>
        <div className="flex items-center gap-4">
          <DemoModeToggle />
          {user ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="pill">{user.role.replace('_', ' ')}</span>
              <span>{user.nama}</span>
              <button onClick={logout} className="text-alert underline">
                Keluar
              </button>
            </div>
          ) : (
            <Link href="/login" className="text-sm text-primary underline">
              Masuk
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
