'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'

const STATUS_LABEL = {
  inkubasi: 'Inkubasi',
  aktif_makan: 'Aktif Makan',
  siap_panen: 'Siap Panen',
  selesai_panen: 'Selesai Panen'
}

export default function BatchManager() {
  const [siklus, setSiklus] = useState(null)
  const [batches, setBatches] = useState([])
  const [form, setForm] = useState({ batchKode: '', tanggalMulai: '', beratTelurGram: '', biayaBeli: '', catatan: '' })
  const [submitting, setSubmitting] = useState(false)
  const [panenLoading, setPanenLoading] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await api.get('/admin-sekolah/batches/status-siklus')
      setSiklus(data)
      setBatches(data.semuaBatch || [])
    } catch (err) {
      const raw = await api.get('/admin-sekolah/batches').catch(() => [])
      setSiklus({ batchAktif: null, peringatan: { perluPesanTelurBaru: false } })
      setBatches(raw)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/admin-sekolah/batches', form)
      setForm({ batchKode: '', tanggalMulai: '', beratTelurGram: '', biayaBeli: '', catatan: '' })
      await load()
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePanen(id) {
    setPanenLoading(id)
    try {
      await api.put(`/admin-sekolah/batches/${id}/panen`, {})
      await load()
    } catch (err) {
      alert(err.message)
    } finally {
      setPanenLoading(null)
    }
  }

  const peringatan = siklus && siklus.peringatan

  return (
    <div className="hairline rounded-md p-5 bg-surface space-y-4">
      <h3 className="font-display text-lg">Manajemen siklus batch telur maggot</h3>

      {peringatan && peringatan.perluPesanTelurBaru && (
        <div className="border-2 border-alert bg-alert/10 rounded-md p-4 text-sm">
          <p className="font-semibold text-alert">PERINGATAN SIKLUS</p>
          {siklus && siklus.batchAktif ? (
            <p className="text-ink mt-1">
              Batch saat ini sudah berumur {peringatan.umurHari} hari (memasuki masa prepupa/siap panen).
              Segera lakukan pembelian telur maggot baru agar siklus pengolahan sampah tidak terputus!
            </p>
          ) : (
            <p className="text-ink mt-1">{peringatan.alasan}</p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid md:grid-cols-5 gap-3">
        <input
          type="text"
          required
          placeholder="Kode batch"
          value={form.batchKode}
          onChange={(e) => setForm({ ...form, batchKode: e.target.value })}
          className="hairline rounded-sm p-2"
        />
        <input
          type="date"
          required
          value={form.tanggalMulai}
          onChange={(e) => setForm({ ...form, tanggalMulai: e.target.value })}
          className="hairline rounded-sm p-2"
        />
        <input
          type="number"
          required
          min="0"
          step="any"
          placeholder="Berat telur (gram)"
          value={form.beratTelurGram}
          onChange={(e) => setForm({ ...form, beratTelurGram: e.target.value })}
          className="hairline rounded-sm p-2"
        />
        <input
          type="number"
          min="0"
          step="any"
          placeholder="Biaya beli (Rp)"
          value={form.biayaBeli}
          onChange={(e) => setForm({ ...form, biayaBeli: e.target.value })}
          className="hairline rounded-sm p-2"
        />
        <input
          type="text"
          placeholder="Catatan"
          value={form.catatan}
          onChange={(e) => setForm({ ...form, catatan: e.target.value })}
          className="hairline rounded-sm p-2"
        />
        <button
          type="submit"
          disabled={submitting}
          className="md:col-span-5 bg-primary text-white rounded-sm py-2"
        >
          {submitting ? 'Menyimpan...' : 'Simpan batch baru'}
        </button>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-line text-primarylight">
            <th className="py-2">Kode batch</th>
            <th>Tanggal masuk</th>
            <th>Umur (hari)</th>
            <th>Fase saat ini</th>
            <th>Berat telur</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {batches.length === 0 && (
            <tr>
              <td colSpan={7} className="py-3 text-primarylight">
                Belum ada batch tercatat.
              </td>
            </tr>
          )}
          {batches.map((b) => (
            <tr key={b.id} className="border-b border-line">
              <td className="py-2">{b.batchKode || b.batch_kode}</td>
              <td>{b.tanggalMulai || b.tanggal_mulai}</td>
              <td>{b.umurHari ?? ''}</td>
              <td>{b.fase || ''}</td>
              <td>{(b.beratTelurGram ?? b.berat_telur_gram) ?? ''} g</td>
              <td>{STATUS_LABEL[b.status || b.status] || b.status}</td>
              <td>
                {b.status !== 'selesai_panen' ? (
                  <button
                    onClick={() => handlePanen(b.id)}
                    disabled={panenLoading === b.id}
                    className="text-alert underline text-xs"
                  >
                    {panenLoading === b.id ? 'Memproses...' : 'Selesai panen'}
                  </button>
                ) : (
                  <span className="text-primarylight">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}