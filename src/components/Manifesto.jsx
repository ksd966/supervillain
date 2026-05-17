import Reveal from './Reveal'

export default function Manifesto() {
  return (
    <section style={{
      padding: '140px 48px',
      background: 'var(--bg-surface)',
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
        <Reveal>
          <blockquote className="serif" style={{
            fontSize: 'clamp(2rem, 4vw, 3.8rem)',
            fontWeight: 300, fontStyle: 'italic',
            lineHeight: 1.3, letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
          }}>
            "Pouzdanost nije opcija — to je{' '}
            <strong className="manifesto-highlight">osnova pristojnosti.</strong>
            {' '}Tu smo u zoru. Tu smo kada let kasni. Jednostavno — tu smo."
          </blockquote>
        </Reveal>
        <Reveal delay={0.1}>
          <p style={{ marginTop: 40, fontSize: '0.68rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            — Direktor, ViGo Transfer · Pariz, Francuska
          </p>
        </Reveal>
      </div>
    </section>
  )
}
