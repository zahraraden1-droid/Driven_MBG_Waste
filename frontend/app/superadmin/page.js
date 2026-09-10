'use client'

import { useEffect, useState } from 'react'
import KpiCard from '../../components/KpiCard'
import { api } from '../../lib/api'

export default function SuperadminPage() {
  const [kpi, setKpi] = useState(null)
  const [schools, setSchools] = useState([])

  useEffect(() => {
    api.get('/public/kpi').then(setKpi).catch(() => {})
    api.get('/dapur-mbg/sekolah').then(setSchools).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl">Ringkasan superadmin</h1>
      <p className="text-sm text-primarylight">
        Gunakan tombol mode demo di bagian atas untuk berpindah antara data contoh dan data live dari Supabase serta layanan AI lokal.
      </p>

      {kpi && (
        <div className="grid md:grid-cols-3 gap-4">
          <KpiCard label="Total limbah terolah" value={kpi.totalLimbahTerolahKg} unit="kg" />
          <KpiCard label="Total panen maggot" value={kpi.totalPanenMaggotKg} unit="kg" />
          <KpiCard label="Penghematan emisi" value={kpi.penghematanEmisiCo2e} unit="kg CO2e" />
        </div>
      )}

      <div className="hairline rounded-md p-5 bg-surface">
        <h3 className="font-display text-lg mb-4">Daftar sekolah terdaftar</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-line text-primarylight">
              <th className="py-2">Nama sekolah</th>
              <th>Kontak</th>
            </tr>
          </thead>
          <tbody>
            {schools.map((s) => (
              <tr key={s.id} className="border-b border-line">
                <td className="py-2">{s.nama}</td>
                <td>{s.kontak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
