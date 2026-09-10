'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function EfficiencyChart({ data }) {
  return (
    <div className="hairline rounded-md p-5 bg-surface">
      <h3 className="font-display text-lg mb-4">Tren penurunan food waste</h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid stroke="#D8DED0" vertical={false} />
          <XAxis dataKey="minggu" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Line type="monotone" dataKey="totalLimbahKg" stroke="#C68A2E" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
