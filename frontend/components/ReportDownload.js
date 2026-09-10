'use client'

import { useState } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'

export default function ReportDownload({ schools }) {
  const [note, setNote] = useState('')

  async function downloadCsv() {
    const token = window.localStorage.getItem('sppg_token')
    const response = await fetch(`${API_BASE}/reports/csv`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'laporan-limbah.csv'
    link.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="hairline rounded-md p-5 bg-surface">
      <h3 className="font-display text-lg mb-4">Pelaporan dan koordinasi</h3>
      <button onClick={downloadCsv} className="bg-primary text-white rounded-sm px-4 py-2 text-sm mb-6">
        Unduh laporan CSV
      </button>

      <div>
        <p className="text-sm mb-2 text-primarylight">Koordinasi langsung ke pihak sekolah</p>
        <select className="hairline rounded-sm p-2 mb-3 w-full">
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.nama} · {s.kontak}</option>
          ))}
        </select>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Tulis catatan koordinasi untuk sekolah"
          className="hairline rounded-sm p-2 w-full text-sm"
          rows={3}
        />
      </div>
    </div>
  )
}
