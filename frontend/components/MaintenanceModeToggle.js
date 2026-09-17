'use client'

import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function MaintenanceModeToggle() {
  const [aktif, setAktif] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/iot/maintenance-mode').then((data) => setAktif(data.aktif)).catch(() => {})
  }, [])

  async function toggle() {
    setLoading(true)
    try {
      const target = !aktif
      const data = await api.post('/iot/maintenance-mode', { aktif: target })
      setAktif(data.aktif)
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (aktif === null) return null

  return (
    <div className="hairline rounded-md p-5 bg-surface flex items-center justify-between gap-4">
      <div>
        <h3 className="font-display text-lg">Mode pemeliharaan</h3>
        <p className="text-sm text-primarylight">
          {aktif
            ? 'Perangkat IoT dinyatakan dalam pemeliharaan harian.'
            : 'Perangkat IoT beroperasi normal.'}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={loading}
        className={`rounded-sm px-4 py-2 text-white text-sm ${aktif ? 'bg-alert' : 'bg-primary'}`}
      >
        {loading ? 'Memproses...' : aktif ? 'Nonaktifkan mode' : 'Aktifkan mode'}
      </button>
    </div>
  )
}