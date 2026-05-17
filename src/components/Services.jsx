import Reveal from './Reveal'
import SectionHeader from './SectionHeader'

const services = [
  {
    num: '01',
    title: 'Mreža Aerodromskih Transfera',
    desc: 'Tri pariška aerodroma. Nula kompromisa. Beauvais, Charles de Gaulle, Orly — svaka pista pokrivena, svaki dolazak predviđen. Fiksna cena. Direktno do vaše adrese.',
  },
  {
    num: '02',
    title: 'Privatni Transfer',
    desc: 'Vaše vozilo. Vaš raspored. Vozni park od 4 do 8 sedišta, proveren i akreditovan. Vozači govore engleski i prate status vašeg leta pre sletanja.',
  },
  {
    num: '03',
    title: 'Grupni Transfer',
    desc: 'Od 30€ po osobi. Matematika zajedničke preciznosti — oni koji biraju drugačije plaćaju više za znatno manje. Od Beauvaisa do Pariza, bez zaobilaznica i kašnjenja.',
  },
  {
    num: '04',
    title: 'Diznilend Direktno',
    desc: 'Direktno do ulaza. Bez shuttle veza, bez nepoznatog tranzita, bez izgubljenih minuta sa prtljagom. Dovozimo vas tačno tamo gde iskustvo počinje.',
  },
  {
    num: '05',
    title: 'Rute do Znamenitosti',
    desc: 'Versaj. Luvr. Ajfelov toranj. Mi organizujemo vaš polazak i povratak. Vi samo stižete — sve ostalo je već u pokretu.',
  },
  {
    num: '06',
    title: 'Licencirani i Sertifikovani',
    desc: 'Sertifikovani od Ministarstva transporta Francuske. 5+ godina rada. 3.000+ putnika koji su izabrali sigurnost pre svega. Naša licenca nije formalnost — to je standard.',
  },
]

export default function Services() {
  return (
    <section id="capabilities" className="section">
      <SectionHeader label="Usluge">
        Svaka pista. Svaka <em style={{ color: 'var(--gold)' }}>destinacija.</em>
      </SectionHeader>

      <div className="caps-grid">
        {services.map((s, i) => (
          <Reveal key={s.num} delay={(i % 3 + 1) * 0.1}>
            <div className="cap-card">
              <div className="serif" style={{
                fontSize: '0.9rem', fontWeight: 600,
                color: 'var(--crimson)', marginBottom: 32, letterSpacing: '0.1em',
              }}>{s.num}</div>
              <h3 className="serif" style={{
                fontSize: '1.8rem', fontWeight: 600, lineHeight: 1.1,
                color: 'var(--text-primary)', marginBottom: 16,
              }}>{s.title}</h3>
              <p style={{
                fontSize: '0.82rem', lineHeight: 1.85, color: 'var(--text-secondary)',
              }}>{s.desc}</p>
              <div className="cap-arrow">↗</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
