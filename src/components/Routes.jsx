import Reveal from './Reveal'

const routes = [
  { index: 'I',   name: 'Beauvais · Pariz',          status: 'Aktivno', active: true  },
  { index: 'II',  name: 'Charles de Gaulle · Pariz', status: 'Aktivno', active: true  },
  { index: 'III', name: 'Orly · Pariz',              status: 'Aktivno', active: true  },
  { index: 'IV',  name: 'Diznilend Pariz Direktno',  status: 'Aktivno', active: true  },
  { index: 'V',   name: 'Panoramski Pariz',          status: 'Uskoro',  active: false },
]

export default function Routes() {
  return (
    <section id="plans" style={{ padding: '140px 48px' }}>
      <Reveal className="section-label">Naše Rute</Reveal>
      <Reveal delay={0.1}>
        <h2 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 'clamp(2.8rem, 5vw, 5rem)',
          fontWeight: 300, lineHeight: 1.08,
          color: 'var(--text-primary)',
        }}>
          Aktivni <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>transferi</em>
        </h2>
      </Reveal>

      <div style={{ marginTop: 80 }}>
        {routes.map((r, i) => (
          <Reveal key={r.index} delay={i * 0.1}>
            <div className="plan-row">
              <div style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: '1.2rem', color: 'var(--text-muted)', textAlign: 'right',
              }}>{r.index}</div>

              <div className="plan-name" style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 'clamp(1.6rem, 3vw, 2.6rem)',
                fontWeight: 300, color: 'var(--text-primary)',
                transition: 'color 0.3s',
              }}>{r.name}</div>

              <div className="plan-status" style={{
                fontSize: '0.65rem', letterSpacing: '0.25em', textTransform: 'uppercase',
                padding: '6px 14px', border: `1px solid ${r.active ? 'var(--crimson)' : 'var(--border-bright)'}`,
                color: r.active ? 'var(--crimson-bright)' : 'var(--text-muted)',
                whiteSpace: 'nowrap', transition: 'border-color 0.3s, color 0.3s',
              }}>{r.status}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
