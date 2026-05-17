const anim = (name, dur, delay, ease = 'ease') =>
  ({ opacity: 0, animation: `${name} ${dur} ${delay} ${ease} forwards` })

export default function Hero() {
  return (
    <section style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '120px 48px 80px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Orbs */}
      <div style={{ position: 'absolute', inset: 0, zIndex: -1, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', borderRadius: '50%', filter: 'blur(100px)',
          width: 600, height: 600,
          background: 'radial-gradient(circle, oklch(30% 0.18 22 / 0.18), transparent 70%)',
          top: -200, right: -100,
          animation: 'orbFloat 12s ease-in-out infinite alternate',
        }} />
        <div style={{
          position: 'absolute', borderRadius: '50%', filter: 'blur(100px)',
          width: 400, height: 400,
          background: 'radial-gradient(circle, oklch(40% 0.12 22 / 0.10), transparent 70%)',
          bottom: 0, left: '10%',
          animation: 'orbFloat 14s ease-in-out infinite alternate',
          animationDelay: '-6s',
        }} />
      </div>

      {/* Eyebrow */}
      <p style={{
        fontSize: '0.68rem', fontWeight: 500, letterSpacing: '0.4em',
        color: 'var(--crimson-bright)', textTransform: 'uppercase',
        marginBottom: 32,
        ...anim('fadeUp', '0.8s', '0.2s'),
      }}>
        Osn. MMXXV · Pouzdan Transfer do Pariza
      </p>

      {/* Title */}
      <h1 style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: 'clamp(4.5rem, 12vw, 11rem)',
        fontWeight: 300, lineHeight: 0.92, letterSpacing: '-0.02em',
        color: 'var(--text-primary)', marginBottom: 16,
      }}>
        {[
          { text: 'Svet', delay: '0.4s' },
          { text: <>Nikada Nije Bio <em style={{ fontStyle: 'italic', color: 'var(--crimson-bright)' }}>Tvoj</em></>, delay: '0.55s' },
          { text: 'Da Ga Čuvaš.', delay: '0.70s' },
        ].map((line, i) => (
          <span key={i} style={{ display: 'block', overflow: 'hidden' }}>
            <span style={{ display: 'block', ...anim('revealUp', '1s', line.delay) }}>
              {line.text}
            </span>
          </span>
        ))}
      </h1>

      {/* Sub */}
      <p style={{
        fontSize: '0.9rem', fontWeight: 300, lineHeight: 1.8,
        color: 'var(--text-secondary)', maxWidth: 440,
        marginTop: 48, marginLeft: 4,
        ...anim('fadeUp', '0.8s', '1.1s'),
      }}>
        Mi smo arhitekte pouzdanog transfera. Preciznost, komfor i svrha —
        bez izgovora. Pariz vas čeka.
      </p>

      {/* Actions */}
      <div className="hero-actions" style={{
        display: 'flex', gap: 20, alignItems: 'center', marginTop: 52,
        ...anim('fadeUp', '0.8s', '1.3s'),
      }}>
        <a href="#join" className="btn-primary">
          <span>Rezerviši Transfer</span><span>→</span>
        </a>
        <a href="#plans" className="btn-ghost">Pogledaj Rute</a>
      </div>

      {/* Scroll indicator */}
      <div style={{
        position: 'absolute', bottom: 48, left: 48,
        display: 'flex', alignItems: 'center', gap: 16,
        ...anim('fadeIn', '1s', '2.2s'),
      }}>
        <div style={{
          width: 1, height: 56,
          background: 'linear-gradient(to bottom, var(--crimson), transparent)',
          animation: 'scrollPulse 2s 2.5s ease-in-out infinite',
        }} />
        <span style={{
          fontSize: '0.62rem', letterSpacing: '0.3em', textTransform: 'uppercase',
          color: 'var(--text-muted)', writingMode: 'vertical-rl', transform: 'rotate(180deg)',
        }}>Dalje</span>
      </div>

      {/* Decorative divider */}
      <div className="hero-divider" style={{
        position: 'absolute', right: 80, top: '50%', transform: 'translateY(-50%)',
        width: 1, height: '45vh',
        background: 'linear-gradient(to bottom, transparent, var(--border-bright), transparent)',
        ...anim('fadeIn', '1.5s', '1.5s'),
      }} />

      {/* Stats */}
      <div className="hero-stat-col" style={{
        position: 'absolute', right: 120, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: 40,
        ...anim('fadeIn', '1s', '1.8s'),
      }}>
        {[
          { num: <>5<span style={{ color: 'var(--crimson-bright)' }}>+</span></>, label: 'Godina Iskustva' },
          { num: <>3K<span style={{ color: 'var(--crimson-bright)' }}>+</span></>, label: 'Zadovoljnih Putnika' },
          { num: '3', label: 'Aerodroma' },
        ].map((s, i) => (
          <div key={i} style={{ textAlign: 'right' }}>
            <div style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: '2.8rem', fontWeight: 600, lineHeight: 1,
              color: 'var(--text-primary)',
            }}>{s.num}</div>
            <div style={{
              fontSize: '0.62rem', letterSpacing: '0.25em', textTransform: 'uppercase',
              color: 'var(--text-muted)', marginTop: 4,
            }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
