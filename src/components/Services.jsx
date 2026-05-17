import { useState } from 'react'

const services = [
  {
    photo: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=900&q=80',
    title: 'AERODROMSKI TRANSFERI',
    sub: 'Premium, inkluzivni aerodromski transferi za CDG, Orly i Beauvais.',
  },
  {
    photo: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=80',
    title: 'MEET & GREET USLUGA',
    sub: 'Vozač vas dočekuje u Arrivals sa tablom sa vašim imenom.',
  },
  {
    photo: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0729?w=900&q=80',
    title: 'PRIVATNI TRANSFER',
    sub: 'Ekskluzivno vozilo samo za vas. Komfor bez kompromisa.',
  },
]

export default function Services() {
  const [idx, setIdx] = useState(0)
  const prev = () => setIdx(i => (i - 1 + services.length) % services.length)
  const next = () => setIdx(i => (i + 1) % services.length)
  const s = services[idx]

  return (
    <section style={{ background: '#000' }}>
      <div style={{
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #1a1a1a',
      }}>
        <span style={{
          color: '#F5C000', fontWeight: 700, fontSize: '0.9rem',
          fontFamily: "'Barlow', sans-serif",
        }}>
          {idx + 1} / {services.length}
        </span>
        <div style={{ display: 'flex', gap: 24 }}>
          <button onClick={prev} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#F5C000', fontSize: '1.5rem', padding: 0, lineHeight: 1,
          }}>‹</button>
          <button onClick={next} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#F5C000', fontSize: '1.5rem', padding: 0, lineHeight: 1,
          }}>›</button>
        </div>
      </div>

      <div style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden' }}>
        <img
          src={s.photo}
          alt={s.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'opacity 0.5s' }}
        />
      </div>

      <div style={{ padding: '32px 24px 48px', borderBottom: '1px solid #1a1a1a' }}>
        <h3 style={{
          fontFamily: "'Barlow', sans-serif", fontWeight: 800,
          fontSize: 'clamp(1.8rem, 6vw, 3rem)',
          textTransform: 'uppercase', color: '#fff',
          lineHeight: 0.95, marginBottom: 12,
        }}>{s.title}</h3>
        <p style={{
          color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem',
          lineHeight: 1.65, marginBottom: 20,
        }}>{s.sub}</p>
        <a href="https://vigotransfers.com/shop/" style={{
          color: '#fff', fontWeight: 700, fontSize: '0.78rem',
          letterSpacing: '0.1em', textTransform: 'uppercase',
          textDecoration: 'none', fontFamily: "'Barlow', sans-serif",
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>SAZNAJ VIŠE ›</a>
      </div>
    </section>
  )
}
