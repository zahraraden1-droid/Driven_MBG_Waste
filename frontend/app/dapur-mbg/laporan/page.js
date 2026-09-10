'use client'

import { useEffect, useState } from 'react'
import ReportDownload from '../../../components/ReportDownload'
import { api } from '../../../lib/api'

export default function LaporanPage() {
  const [schools, setSchools] = useState([])

  useEffect(() => {
    api.get('/dapur-mbg/sekolah').then(setSchools).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl">Pelaporan</h1>
      <ReportDownload schools={schools} />
    </div>
  )
}
