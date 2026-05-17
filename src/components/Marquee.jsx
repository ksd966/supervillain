const items = [
  'Beauvais · Pariz', 'Charles de Gaulle · Pariz', 'Orly · Pariz',
  'Diznilend Direktno', 'Privatni Transfer', 'Praćenje Letova',
  'Versailles · Louvre · Tour Eiffel', 'Licencirani · MTC Francuska',
]

const all = [...items, ...items]

export default function Marquee() {
  return (
    <div className="marquee-wrap">
      <div className="marquee-track">
        {all.map((item, i) => (
          <div key={i} className="marquee-item">
            <div className="marquee-dot" />
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}
