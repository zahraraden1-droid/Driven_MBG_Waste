'use client'

import { useAuth } from '../context/AuthContext'
import { useDemoMode } from '../context/DemoModeContext'

export default function DemoModeToggle() {
  const { user } = useAuth()
  const { demoActive, loading, toggleDemo } = useDemoMode()

  if (loading) return null

  if (!user || user.role !== 'superadmin') {
    return (
      <span className="pill text-xs">
        {demoActive ? 'Mode demo aktif' : 'Data live'}
      </span>
    )
  }

  return (
    <button
      onClick={() => toggleDemo(!demoActive)}
      className={`pill text-xs ${demoActive ? 'bg-accent text-white border-accent' : ''}`}
    >
      {demoActive ? 'Matikan mode demo' : 'Nyalakan mode demo'}
    </button>
  )
}
