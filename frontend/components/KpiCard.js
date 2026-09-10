export default function KpiCard({ label, value, unit }) {
  return (
    <div className="hairline rounded-md p-5 bg-surface">
      <p className="text-sm text-primarylight">{label}</p>
      <p className="font-display text-3xl mt-2">
        {value}
        <span className="text-base font-body ml-1 text-primarylight">{unit}</span>
      </p>
    </div>
  )
}
