export default function EducationCard({ cards }) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {cards.map((card) => (
        <div key={card.judul} className="hairline rounded-md p-5 bg-surface">
          <h4 className="font-display text-base mb-2">{card.judul}</h4>
          <p className="text-sm text-ink leading-relaxed">{card.isi}</p>
        </div>
      ))}
    </div>
  )
}
