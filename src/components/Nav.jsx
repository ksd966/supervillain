export default function Nav() {
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      padding: '16px 24px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: '#000',
    }}>
      <div style={{
        fontFamily: "'Barlow', sans-serif",
        fontWeight: 800, fontSize: '2.1rem',
        color: '#F5C000', fontStyle: 'italic',
        letterSpacing: '-0.02em', lineHeight: 1,
      }}>VG</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="https://vigotransfers.com/shop/" style={{
          background: '#F5C000', color: '#000',
          padding: '12px 22px',
          fontFamily: "'Barlow', sans-serif",
          fontWeight: 700, fontSize: '0.85rem',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          textDecoration: 'none', display: 'inline-block',
        }}>REZERVIŠI</a>
        <div style={{ color: '#fff', fontSize: '1.4rem', lineHeight: 1 }}>≡</div>
      </div>
    </nav>
  )
}
