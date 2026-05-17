import ViGoMark from './ViGoMark'

export default function Nav() {
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      padding: '28px 48px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: 'linear-gradient(to bottom, var(--bg-base), transparent)',
    }}>
      <a href="#" style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: '1.05rem', fontWeight: 600, letterSpacing: '0.3em',
        color: 'var(--text-primary)', textDecoration: 'none', textTransform: 'uppercase',
      }}>
        <ViGoMark />
        <span>ViGo Transfer</span>
      </a>

      <ul className="nav-links" style={{ display: 'flex', gap: '40px', listStyle: 'none' }}>
        <li><a href="#capabilities" className="nav-link">Usluge</a></li>
        <li><a href="#plans"        className="nav-link">Rute</a></li>
        <li><a href="#join"         className="nav-link">Rezervacija</a></li>
      </ul>
    </nav>
  )
}
