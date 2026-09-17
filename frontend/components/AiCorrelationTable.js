export default function AiCorrelationTable({ data }) {
  if (!data) {
    return (
      <div className="hairline rounded-md p-5 bg-surface">
        <h3 className="font-display text-lg mb-2">Analisis sisa makanan tidak disukai</h3>
        <p className="text-sm text-alert">Data persentase sisa belum tersedia.</p>
      </div>
    )
  }

  if (data.error) {
    return (
      <div className="hairline rounded-md p-5 bg-surface">
        <h3 className="font-display text-lg mb-2">Analisis sisa makanan tidak disukai</h3>
        <p className="text-sm text-alert">{data.message || 'Gagal memuat data sisa makanan.'}</p>
      </div>
    )
  }

  const rows = Array.isArray(data.peringkatSisa) ? data.peringkatSisa : []
  const maxPersentase = Math.max(...rows.map((r) => Number(r.persentase) || 0), 1)

  return (
    <div className="hairline rounded-md p-5 bg-surface">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg">Analisis sisa makanan tidak disukai</h3>
        <span className="pill">Total {Number(data.totalSisaKg || 0).toLocaleString('id-ID')} kg terbuang</span>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-primarylight">Belum ada data sisa makanan tercatat.</p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-line text-primarylight">
            <th className="py-2">Peringkat</th>
            <th>Nama menu / kategori</th>
            <th>Total kg terbuang</th>
            <th className="w-2/5">Persentase sisa (% porsi sampah)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.kategori} className="border-b border-line">
              <td className="py-2">{index + 1}</td>
              <td>{row.nama}</td>
              <td>{Number(row.beratKg).toLocaleString('id-ID')} kg</td>
              <td>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-line rounded-sm h-3 overflow-hidden">
                    <div
                      className="bg-accent h-full"
                      style={{ width: `${(Number(row.persentase) / maxPersentase) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 text-right">{row.persentase}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}