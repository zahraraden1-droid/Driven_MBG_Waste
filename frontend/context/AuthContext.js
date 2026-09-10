'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = window.localStorage.getItem('sppg_user')
    if (stored) {
      setUser(JSON.parse(stored))
    }
    setLoading(false)
  }, [])

  async function login(email, password) {
    const data = await api.post('/auth/login', { email, password })
    window.localStorage.setItem('sppg_token', data.token)
    window.localStorage.setItem('sppg_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }

  function logout() {
    window.localStorage.removeItem('sppg_token')
    window.localStorage.removeItem('sppg_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
