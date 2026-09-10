export default function AiPredictionPanel({ prediction }) {
  if (!prediction) return null

  if (prediction.error) {
    return (
      <div className="hairline rounded-md p-5 bg-surface">
        <h3 className="font-display text-lg mb-2">Fitur AI dan prediksi</h3>
        <p className="text-sm text-alert">Layanan AI lokal belum bisa dihubungi. {prediction.message}</p>
      </div>
    )
  }

  return (
    <div className="hairline rounded-md p-5 bg-surface">
      <h3 className="font-display text-lg mb-4">Fitur AI dan prediksi</h3>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-primarylight">Estimasi volume limbah harian</p>
          <p className="text-xl font-display">{prediction.estimasiVolumeLimbahHarianKg} kg</p>
        </div>
        <div>
          <p className="text-xs text-primarylight">Prediksi jadwal panen</p>
          <p className="text-xl font-display">{prediction.prediksiJadwalPanen}</p>
        </div>
      </div>
      {prediction.catatan && (
        <p className="text-sm mt-4 text-ink">{prediction.catatan}</p>
      )}
    </div>
  )
}
