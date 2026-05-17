import { useState, useEffect } from 'react'

const slides = [
  {
    photo: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1400&q=80',
    label: 'USLUGA',
    accent: 'KOJU ZASLUŽUJEŠ',
    text: 'Rezervišite vaš aerodromski transfer do Pariza sa ViGo Transfer — pouzdan izbor za CDG, Orly i Beauvais.',
    cta: 'REZERVIŠITE',
  },
  {
    photo: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1400&q=80',
    label: 'REZERVIŠITE',
    accent: 'AERODROMSKI TRANSFER',
    text: 'Fiksne cene, praćenje letova i 100% garancija dolaska na vreme. Bez iznenađenja.',
    cta: 'SAZNAJTE VIŠE',
  },
  {
    photo: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1400&q=80',
    label: 'VOZITE SA',
    accent: 'VIGO TRANSFER',
    text: 'Licencirani, profesionalni vozači koji vam stoje na usluzi od aerodroma do vaše adrese.',
    cta: 'SAZNAJTE VIŠE',
  },
]

export default function Hero() {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % slides.length), 5500)
    return () => clearInterval(t)
  }, [])

  const prev = () => setIdx(i => (i - 1 + slides.length) % slides.length)
  const next = () => setIdx(i => (i + 1) % slides.length)
  const s = slides[idx]

  return (
    <section style={{ minHeight: '100vh', position: 'relative', background: '#000', overflow: 'hidden' }}>
      {slides.map((sl, i) => (
        <div key={i} style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${sl.photo})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          opacity: i === idx ? 0.55 : 0,
          transition: 'opacity 1s ease',
        }} />
      ))}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, #000 30%, rgba(0,0,0,0.15) 70%)',
      }} />

      <div style={{ position: 'absolute', top: 80, left: 24, zIndex: 10 }}>
        <div style={{
          color: '#F5C000', fontSize: '0.9rem', fontWeight: 700,
          fontFamily: "'Barlow', sans-serif", letterSpacing: '0.05em', marginBottom: 10,
        }}>
          {idx + 1} / {slides.length}
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <button onClick={prev} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#F5C000', fontSize: '1.6rem', padding: 0, lineHeight: 1,
          }}>‹</button>
          <button onClick={next} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#F5C000', fontSize: '1.6rem', padding: 0, lineHeight: 1,
          }}>›</button>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 60, left: 24, right: 24, zIndex: 10 }}>
        <h1 style={{
          fontFamily: "'Barlow', sans-serif",
          fontWeight: 800, textTransform: 'uppercase',
          fontSize: 'clamp(3rem, 14vw, 8rem)',
          lineHeight: 0.88, color: '#fff', marginBottom: 20,
        }}>
          {s.label}<br />
          <span style={{ color: '#F5C000' }}>{s.accent}</span>
        </h1>
        <p style={{
          color: 'rgba(255,255,255,0.72)', fontSize: '1rem',
          lineHeight: 1.65, maxWidth: 420, marginBottom: 32, fontWeight: 300,
        }}>
          {s.text}
        </p>
        <a href="https://vigotransfers.com/shop/" style={{
          display: 'inline-flex', alignItems: 'center', gap: 12,
          background: '#F5C000', color: '#000',
          padding: '16px 28px',
          fontFamily: "'Barlow', sans-serif",
          fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', textDecoration: 'none', fontSize: '0.95rem',
        }}>
          {s.cta} <span>→</span>
        </a>
      </div>
    </section>
  )
}
