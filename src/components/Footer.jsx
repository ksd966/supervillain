import ViGoMark from './ViGoMark'

export default function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border)',
      padding: '40px 48px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: 'var(--bg-surface)',
    }}>
      <div className="serif" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: '0.95rem', fontWeight: 600, letterSpacing: '0.4em',
        color: 'var(--text-secondary)', textTransform: 'uppercase',
      }}>
        <ViGoMark width={28} height={28} />
        ViGo Transfer
      </div>
      <div style={{ fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        © MMXXV · ViGo Transfer · Sva prava zadržana
      </div>
    </footer>
  )
}
