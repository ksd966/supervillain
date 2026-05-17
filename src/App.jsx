import Nav       from './components/Nav'
import Hero      from './components/Hero'
import Marquee   from './components/Marquee'
import Services  from './components/Services'
import Manifesto from './components/Manifesto'
import Routes    from './components/Routes'
import CTA       from './components/CTA'
import Footer    from './components/Footer'

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Services />
        <Manifesto />
        <Routes />
        <CTA />
      </main>
      <Footer />
    </>
  )
}
