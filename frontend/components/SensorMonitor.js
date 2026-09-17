export default function SensorMonitor({ data }) {
  if (!data) return null

  const items = [
    { label: 'Suhu udara bilik', value: data.suhuBilikC, unit: '°C', sumber: 'DHT22' },
    { label: 'Kelembaban udara', value: data.kelembabanPersen, unit: '%', sumber: 'DHT22' },
    { label: 'Kadar gas amonia', value: data.kadarAmoniaPpm, unit: 'ppm', sumber: 'MQ-135' },
    { label: 'Suhu substrat pakan', value: data.suhuSubstratC, unit: '°C', sumber: 'DS18B20' },
    { label: 'Berat maggot panen', value: data.estimasiBeratMaggotKg, unit: 'kg', sumber: 'Load cell wadah atas' }
  ]

  return (
    <div className="hairline rounded-md p-5 bg-surface">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg">Monitoring real time</h3>
        <span className={`pill ${data.aman === false ? 'text-alert' : ''}`}>
          {data.aman === false ? 'Kondisi bilik: perlu perhatian' : 'Kondisi bilik: aman'}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {items.map((item) => (
          <div key={item.label} className="border-l-2 border-accent pl-3">
            <p className="text-xs text-primarylight">{item.label}</p>
            <p className="text-xl font-display">
              {item.value} <span className="text-sm font-body">{item.unit}</span>
            </p>
            <p className="text-[10px] text-primarylight">{item.sumber}</p>
          </div>
        ))}
      </div>
      {data.rekomendasi && (
        <p className="text-sm mt-4 bg-alert/10 border-l-2 border-alert pl-3 py-2 text-ink">
          {data.rekomendasi}
        </p>
      )}
    </div>
  )
}