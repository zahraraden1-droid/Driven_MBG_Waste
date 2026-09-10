'use client'

import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import KpiCard from '../components/KpiCard'
import WasteChart from '../components/WasteChart'
import EducationCard from '../components/EducationCard'
import { api } from '../lib/api'

export default function HomePage() {
  const [kpi, setKpi] = useState(null)
  const [waste, setWaste] = useState([])
  const [education, setEducation] = useState([])

  useEffect(() => {
    api.get('/public/kpi').then(setKpi).catch(() => {})
    api.get('/public/waste-by-category').then(setWaste).catch(() => {})
    api.get('/public/education').then(setEducation).catch(() => {})
  }, [])

  return (
    <main>
      <Navbar />
      <section className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="font-display text-3xl mb-2">Dari sisa makanan menjadi maggot dan pupuk</h1>
        <p className="text-primarylight mb-8 max-w-xl">
          Sekolah mengubah sisa makanan menjadi pakan larva black soldier fly, mengurangi emisi, dan membuka sumber pemasukan baru.
        </p>

        {kpi && (
          <div className="grid md:grid-cols-3 gap-4 mb-10">
            <KpiCard label="Total limbah terolah" value={kpi.totalLimbahTerolahKg} unit="kg" />
            <KpiCard label="Total panen maggot" value={kpi.totalPanenMaggotKg} unit="kg" />
            <KpiCard label="Penghematan emisi" value={kpi.penghematanEmisiCo2e} unit="kg CO2e" />
          </div>
        )}

        <div className="mb-10">
          <WasteChart data={waste} />
        </div>

        <h2 className="font-display text-2xl mb-4">Belajar tentang BSF dan ekonomi sirkular</h2>
        <EducationCard cards={education} />
      </section>
    </main>
  )
}
