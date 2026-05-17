export default function Footer() {
  return (
    <footer style={{
      background: '#000', borderTop: '1px solid #1a1a1a',
      padding: '32px 24px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div style={{
        fontFamily: "'Barlow', sans-serif",
        fontWeight: 800, fontSize: '1.8rem',
        color: '#F5C000', fontStyle: 'italic',
      }}>VG</div>
      <div style={{
        color: 'rgba(255,255,255,0.25)', fontSize: '0.6rem',
        letterSpacing: '0.15em', textTransform: 'uppercase',
        fontFamily: "'Barlow', sans-serif",
      }}>
        © MMXXV · ViGo Transfer · Sva prava zadržana
      </div>
    </footer>
  )
}
