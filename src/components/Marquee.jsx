const items = [
  'Beauvais · Pariz', 'Charles de Gaulle · Pariz', 'Orly · Pariz',
  'Diznilend Direktno', 'Privatni Transfer', 'Praćenje Letova',
  'Versailles · Louvre · Tour Eiffel', 'Licencirani · MTC Francuska',
]

const all = [...items, ...items]

export default function Marquee() {
  return (
    <div style={{
      borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
      padding: '18px 0', overflow: 'hidden',
      background: 'var(--bg-surface)',
    }}>
      <div style={{
        display: 'flex', width: 'max-content',
        animation: 'marquee 28s linear infinite',
      }}>
        {all.map((item, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 32,
            padding: '0 32px',
            fontSize: '0.68rem', letterSpacing: '0.3em', textTransform: 'uppercase',
            color: 'var(--text-muted)', whiteSpace: 'nowrap',
          }}>
            <div style={{
              width: 4, height: 4, borderRadius: '50%',
              background: 'var(--crimson)', flexShrink: 0,
            }} />
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}
