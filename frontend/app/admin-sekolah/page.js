'use client'

import { useEffect, useState } from 'react'
import SensorMonitor from '../../components/SensorMonitor'
import AiPredictionPanel from '../../components/AiPredictionPanel'
import SalesManager from '../../components/SalesManager'
import { api } from '../../lib/api'

export default function AdminSekolahPage() {
  const [monitoring, setMonitoring] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [sales, setSales] = useState([])

  useEffect(() => {
    api.get('/admin-sekolah/monitoring').then(setMonitoring).catch(() => {})
    api.get('/admin-sekolah/prediksi').then(setPrediction).catch(() => {})
    api.get('/admin-sekolah/penjualan').then(setSales).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl">Dashboard admin sekolah</h1>
      <SensorMonitor data={monitoring} />
      <AiPredictionPanel prediction={prediction} />
      <SalesManager initialSales={sales} />
    </div>
  )
}
