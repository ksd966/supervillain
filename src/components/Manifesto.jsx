import { useState } from 'react'

const features = [
  {
    icon: '◎',
    label: 'POUZDAN',
    text: 'Svaki transfer je garantovan. Pratimo vaš let u realnom vremenu i prilagođavamo dolazak prema aktuelnim podacima.',
  },
  {
    icon: '◉',
    label: 'PRECIZAN',
    text: 'Fiksne cene, bez skrivenih troškova. 30 minuta besplatnog čekanja za međunarodne letove, 15 minuta za domaće.',
  },
  {
    icon: '▣',
    label: 'PREMIUM',
    text: 'Luksuzna vozila, profesionalni vozači u odelu, boca vode — komfor koji ne kompromitujemo ni na jednom transferu.',
  },
  {
    icon: '◈',
    label: 'LICENCIRAN',
    text: 'Licencirani od strane MTC Francuska. Svi vozači provereni, iskusni i profesionalni. 5+ godina rada, 3000+ putnika.',
  },
  {
    icon: '⬡',
    label: 'BEZBEDNO',
    text: 'Vaša bezbednost je naš prioritet. Provereni vozači, registrovana vozila, osigurani transferi od aerodroma do adrese.',
  },
]

export default function Manifesto() {
  const [open, setOpen] = useState(null)

  return (
    <section style={{ background: '#000', padding: '40px 24px', borderTop: '1px solid #1a1a1a' }}>
      {features.map((f, i) => (
        <div
          key={i}
          onClick={() => setOpen(open === i ? null : i)}
          style={{ borderBottom: '1px solid #1a1a1a', padding: '20px 0', cursor: 'pointer' }}
        >
          <span style={{ color: '#F5C000', fontSize: '1.5rem', display: 'block', marginBottom: 10 }}>{f.icon}</span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{
              fontFamily: "'Barlow', sans-serif", fontWeight: 800,
              fontSize: 'clamp(1.8rem, 7vw, 3rem)',
              textTransform: 'uppercase', color: '#fff',
            }}>{f.label}</span>
            <span style={{ color: '#F5C000', fontSize: '1.2rem', fontWeight: 700 }}>
              {open === i ? '↑' : '↓'}
            </span>
          </div>
          {open === i && (
            <p style={{
              marginTop: 14, color: 'rgba(255,255,255,0.5)',
              fontSize: '0.9rem', lineHeight: 1.75, maxWidth: 500,
            }}>{f.text}</p>
          )}
        </div>
      ))}
    </section>
  )
}
