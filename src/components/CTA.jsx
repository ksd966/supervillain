export default function CTA() {
  return (
    <section style={{ background: '#F5C000', padding: '64px 24px', textAlign: 'center' }}>
      <h2 style={{
        fontFamily: "'Barlow', sans-serif", fontWeight: 800,
        fontSize: 'clamp(2.5rem, 10vw, 5.5rem)',
        textTransform: 'uppercase', color: '#000',
        lineHeight: 0.9, marginBottom: 20,
      }}>
        REZERVIŠITE<br />ODMAH
      </h2>
      <p style={{
        color: 'rgba(0,0,0,0.55)', fontSize: '0.95rem',
        lineHeight: 1.65, maxWidth: 360, margin: '0 auto 32px',
        fontFamily: "'Barlow', sans-serif", fontWeight: 300,
      }}>
        Vaš transfer, već rezervisan. Sigurnost od trenutka kada točkovi dodirnu pistu do vaše adrese.
      </p>
      <a href="https://vigotransfers.com/shop/" style={{
        display: 'inline-flex', alignItems: 'center', gap: 12,
        background: '#000', color: '#F5C000',
        padding: '16px 32px',
        fontFamily: "'Barlow', sans-serif",
        fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', textDecoration: 'none', fontSize: '0.95rem',
      }}>
        REZERVIŠITE TRANSFER →
      </a>
    </section>
  )
}
