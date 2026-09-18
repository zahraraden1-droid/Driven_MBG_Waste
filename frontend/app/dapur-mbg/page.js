'use client'

import { useEffect, useState } from 'react'
import AiCorrelationTable from '../../components/AiCorrelationTable'
import EfficiencyChart from '../../components/EfficiencyChart'
import { api } from '../../lib/api'

export default function DapurMbgPage() {
  const [correlation, setCorrelation] = useState(null)
  const [efficiency, setEfficiency] = useState([])

  useEffect(() => {
    api.get('/dapur-mbg/korelasi-menu').then(setCorrelation).catch(() => {})
    api.get('/dapur-mbg/efisiensi').then(setEfficiency).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl">Dashboard SPPG</h1>
      <AiCorrelationTable rows={correlation} />
      <EfficiencyChart data={efficiency} />
    </div>
  )
}
