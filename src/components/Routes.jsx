const routes = [
  { code: 'CDG', name: 'Charles de Gaulle', time: '30–50 min', price: 'od €45' },
  { code: 'ORY', name: 'Orly', time: '25–40 min', price: 'od €40' },
  { code: 'BVA', name: 'Beauvais', time: '75–90 min', price: 'od €90' },
  { code: 'DIS', name: 'Disneyland Pariz', time: '35–50 min', price: 'od €55' },
  { code: 'VER', name: 'Versailles', time: '30–45 min', price: 'od €50' },
]

export default function Routes() {
  return (
    <>
      <div style={{ width: '100%', overflow: 'hidden', lineHeight: 0 }}>
        <img
          src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=80"
          alt="Chauffeur service"
          style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
        />
      </div>

      <div style={{ background: '#000', padding: '48px 24px', borderBottom: '1px solid #1a1a1a' }}>
        <p style={{
          color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem',
          letterSpacing: '0.2em', textTransform: 'uppercase',
          marginBottom: 14, fontFamily: "'Barlow', sans-serif",
        }}>NAŠE PREDNOSTI</p>
        <h2 style={{
          fontFamily: "'Barlow', sans-serif", fontWeight: 800,
          fontSize: 'clamp(2.5rem, 10vw, 5rem)',
          textTransform: 'uppercase', lineHeight: 0.9, marginBottom: 20,
        }}>
          KVALITET<br /><span style={{ color: '#F5C000' }}>ZAGARANTOVAN</span>
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.95rem', lineHeight: 1.7, maxWidth: 460 }}>
          Iskusni, provereni vozači. Praćenje letova, besplatno čekanje, fiksne cene — garantujemo profesionalizam na svakom koraku.
        </p>
      </div>

      <div style={{ background: '#000', padding: '0 24px 56px' }}>
        <p style={{
          color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem',
          letterSpacing: '0.2em', textTransform: 'uppercase',
          padding: '32px 0 16px', fontFamily: "'Barlow', sans-serif",
        }}>RUTE</p>
        {routes.map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid #1a1a1a', padding: '18px 0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{
                fontFamily: "'Barlow', sans-serif", fontWeight: 800,
                fontSize: '0.82rem', color: '#F5C000', minWidth: 36,
              }}>{r.code}</span>
              <span style={{
                fontFamily: "'Barlow', sans-serif", fontWeight: 700,
                fontSize: '1.1rem', textTransform: 'uppercase', color: '#fff',
              }}>{r.name}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontFamily: "'Barlow', sans-serif", fontWeight: 800,
                fontSize: '1rem', color: '#F5C000',
              }}>{r.price}</div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem' }}>{r.time}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
