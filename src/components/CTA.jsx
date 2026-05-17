import Reveal from './Reveal'

export default function CTA() {
  return (
    <section id="join" style={{
      padding: '140px 48px',
      textAlign: 'center',
      background: 'var(--bg-base)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Watermark */}
      <div aria-hidden style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: '28vw', fontWeight: 700,
        color: 'var(--bg-elevated)',
        pointerEvents: 'none', userSelect: 'none',
        letterSpacing: '-0.05em', lineHeight: 1,
      }}>VIGO</div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <h2 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 'clamp(3rem, 8vw, 8rem)',
            fontWeight: 300, lineHeight: 1, letterSpacing: '-0.02em',
            color: 'var(--text-primary)', marginBottom: 32,
          }}>
            Vaš transfer,<br />
            <em style={{ fontStyle: 'italic', color: 'var(--crimson-bright)' }}>već</em> rezervisan.
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <p style={{
            fontSize: '0.85rem', color: 'var(--text-secondary)',
            maxWidth: 360, margin: '0 auto 52px', lineHeight: 1.8,
          }}>
            Ne nudimo prevoz. Pružamo sigurnost — od trenutka kada
            točkovi dodirnu pistu do vaše željene adrese.
          </p>
        </Reveal>

        <Reveal delay={0.2}>
          <a href="https://vigotransfers.com/shop/" className="btn-primary">
            <span>Rezervišite Transfer</span><span>→</span>
          </a>
        </Reveal>
      </div>
    </section>
  )
}
