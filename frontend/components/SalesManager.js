'use client'

import { useState } from 'react'
import { api } from '../lib/api'

export default function SalesManager({ initialSales }) {
  const [sales, setSales] = useState(initialSales || [])
  const [form, setForm] = useState({ tanggal: '', jenis: 'segar', beratKg: '', hargaPerKg: '' })
  const [submitting, setSubmitting] = useState(false)

  const totalPendapatan = sales.reduce((sum, s) => sum + Number(s.total), 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const created = await api.post('/admin-sekolah/penjualan', form)
      setSales([created, ...sales])
      setForm({ tanggal: '', jenis: 'segar', beratKg: '', hargaPerKg: '' })
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="hairline rounded-md p-5 bg-surface">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg">Manajemen penjualan maggot</h3>
        <span className="pill">Total Rp{totalPendapatan.toLocaleString('id-ID')}</span>
      </div>

      <form onSubmit={handleSubmit} className="grid md:grid-cols-4 gap-3 mb-6">
        <input
          type="date"
          required
          value={form.tanggal}
          onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
          className="hairline rounded-sm p-2"
        />
        <select
          value={form.jenis}
          onChange={(e) => setForm({ ...form, jenis: e.target.value })}
          className="hairline rounded-sm p-2"
        >
          <option value="segar">Maggot segar</option>
          <option value="kering">Maggot kering</option>
        </select>
        <input
          type="number"
          required
          placeholder="Berat (kg)"
          value={form.beratKg}
          onChange={(e) => setForm({ ...form, beratKg: e.target.value })}
          className="hairline rounded-sm p-2"
        />
        <input
          type="number"
          required
          placeholder="Harga per kg"
          value={form.hargaPerKg}
          onChange={(e) => setForm({ ...form, hargaPerKg: e.target.value })}
          className="hairline rounded-sm p-2"
        />
        <button
          type="submit"
          disabled={submitting}
          className="md:col-span-4 bg-primary text-white rounded-sm py-2"
        >
          {submitting ? 'Menyimpan...' : 'Catat penjualan'}
        </button>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-line text-primarylight">
            <th className="py-2">Tanggal</th>
            <th>Jenis</th>
            <th>Berat</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id} className="border-b border-line">
              <td className="py-2">{s.tanggal}</td>
              <td>{s.jenis}</td>
              <td>{s.beratKg} kg</td>
              <td>Rp{Number(s.total).toLocaleString('id-ID')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
