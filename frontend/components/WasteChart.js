'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function WasteChart({ data }) {
  return (
    <div className="hairline rounded-md p-5 bg-surface">
      <h3 className="font-display text-lg mb-4">Kategori makanan terbanyak terbuang</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid stroke="#D8DED0" vertical={false} />
          <XAxis dataKey="kategori" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="beratKg" fill="#2F4A37" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
