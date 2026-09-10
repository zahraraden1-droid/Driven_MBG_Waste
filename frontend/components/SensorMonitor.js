export default function SensorMonitor({ data }) {
  if (!data) return null

  const items = [
    { label: 'Suhu bilik', value: data.suhuBilikC, unit: '°C' },
    { label: 'Kelembaban', value: data.kelembabanPersen, unit: '%' },
    { label: 'Kadar amonia', value: data.kadarAmoniaPpm, unit: 'ppm' },
    { label: 'Estimasi berat maggot', value: data.estimasiBeratMaggotKg, unit: 'kg' }
  ]

  return (
    <div className="hairline rounded-md p-5 bg-surface">
      <h3 className="font-display text-lg mb-4">Monitoring real time</h3>
      <div className="grid grid-cols-2 gap-4">
        {items.map((item) => (
          <div key={item.label} className="border-l-2 border-accent pl-3">
            <p className="text-xs text-primarylight">{item.label}</p>
            <p className="text-xl font-display">
              {item.value} <span className="text-sm font-body">{item.unit}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
