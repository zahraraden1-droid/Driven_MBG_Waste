'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'

export default function RouteGuard({ allowedRoles, children }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.push('/login')
      return
    }
    if (!allowedRoles.includes(user.role)) {
      router.push('/')
    }
  }, [user, loading])

  if (loading || !user || !allowedRoles.includes(user.role)) {
    return <p className="p-10 text-primarylight">Memuat...</p>
  }

  return children
}
