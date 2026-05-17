import Reveal from './Reveal'

export default function SectionHeader({ label, children }) {
  return (
    <>
      <Reveal className="section-label">{label}</Reveal>
      <Reveal delay={0.1}>
        <h2 className="serif" style={{
          fontSize: 'clamp(2.8rem, 5vw, 5rem)',
          fontWeight: 300, lineHeight: 1.08,
          color: 'var(--text-primary)',
        }}>
          {children}
        </h2>
      </Reveal>
    </>
  )
}
