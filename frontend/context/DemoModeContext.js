'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'

const DemoModeContext = createContext(null)

export function DemoModeProvider({ children }) {
  const [demoActive, setDemoActive] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/demo/status')
      .then((data) => setDemoActive(data.demoActive))
      .catch(() => setDemoActive(true))
      .finally(() => setLoading(false))
  }, [])

  async function toggleDemo(next) {
    const data = await api.post('/demo/toggle', { active: next })
    setDemoActive(data.demoActive)
    return data.demoActive
  }

  return (
    <DemoModeContext.Provider value={{ demoActive, loading, toggleDemo }}>
      {children}
    </DemoModeContext.Provider>
  )
}

export function useDemoMode() {
  return useContext(DemoModeContext)
}
