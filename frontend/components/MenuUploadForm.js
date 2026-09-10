'use client'

import { useState } from 'react'
import { api } from '../lib/api'

export default function MenuUploadForm({ initialMenus, onCreated }) {
  const [menus, setMenus] = useState(initialMenus || [])
  const [form, setForm] = useState({ tanggal: '', nama: '', kalori: '', protein: '' })
  const [foto, setFoto] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const formData = new FormData()
      Object.entries(form).forEach(([key, value]) => formData.append(key, value))
      if (foto) formData.append('foto', foto)

      const created = await api.postForm('/admin-sekolah/menu', formData)
      const updated = [created, ...menus]
      setMenus(updated)
      setForm({ tanggal: '', nama: '', kalori: '', protein: '' })
      setFoto(null)
      if (onCreated) onCreated(created)
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="hairline rounded-md p-5 bg-surface">
      <h3 className="font-display text-lg mb-4">Input menu MBG harian</h3>
      <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-3 mb-6">
        <input
          type="date"
          required
          value={form.tanggal}
          onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
          className="hairline rounded-sm p-2"
        />
        <input
          type="text"
          required
          placeholder="Nama menu"
          value={form.nama}
          onChange={(e) => setForm({ ...form, nama: e.target.value })}
          className="hairline rounded-sm p-2"
        />
        <input
          type="number"
          placeholder="Kalori"
          value={form.kalori}
          onChange={(e) => setForm({ ...form, kalori: e.target.value })}
          className="hairline rounded-sm p-2"
        />
        <input
          type="number"
          placeholder="Protein (gram)"
          value={form.protein}
          onChange={(e) => setForm({ ...form, protein: e.target.value })}
          className="hairline rounded-sm p-2"
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFoto(e.target.files[0])}
          className="md:col-span-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="md:col-span-2 bg-primary text-white rounded-sm py-2"
        >
          {submitting ? 'Menyimpan...' : 'Simpan menu'}
        </button>
      </form>

      <ul className="divide-y divide-line">
        {menus.map((menu) => (
          <li key={menu.id} className="py-2 flex justify-between text-sm">
            <span>{menu.nama}</span>
            <span className="text-primarylight">{menu.tanggal}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
