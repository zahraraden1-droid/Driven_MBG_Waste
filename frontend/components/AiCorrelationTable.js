export default function AiCorrelationTable({ rows }) {
  if (!Array.isArray(rows)) {
    return (
      <div className="hairline rounded-md p-5 bg-surface">
        <h3 className="font-display text-lg mb-2">Tabel AI korelasi menu</h3>
        <p className="text-sm text-alert">Layanan AI lokal belum bisa dihubungi.</p>
      </div>
    )
  }

  return (
    <div className="hairline rounded-md p-5 bg-surface">
      <h3 className="font-display text-lg mb-4">Tabel AI korelasi menu</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-line text-primarylight">
            <th className="py-2">Menu</th>
            <th>Rata rata terbuang</th>
            <th>Rekomendasi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.menu} className="border-b border-line align-top">
              <td className="py-2">{row.menu}</td>
              <td>{row.rataRataTerbuangKg} kg</td>
              <td className="text-ink">{row.rekomendasi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
