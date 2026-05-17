import { useEffect, useRef } from 'react'

export default function Cursor() {
  const dotRef  = useRef(null)
  const ringRef = useRef(null)
  const pos     = useRef({ mx: 0, my: 0, rx: 0, ry: 0 })

  useEffect(() => {
    const onMove = e => { pos.current.mx = e.clientX; pos.current.my = e.clientY }
    document.addEventListener('mousemove', onMove)

    const dot  = dotRef.current
    const ring = ringRef.current
    let raf
    const animate = () => {
      const p = pos.current
      dot.style.left  = p.mx + 'px'
      dot.style.top   = p.my + 'px'
      p.rx += (p.mx - p.rx) * 0.12
      p.ry += (p.my - p.ry) * 0.12
      ring.style.left = p.rx + 'px'
      ring.style.top  = p.ry + 'px'
      raf = requestAnimationFrame(animate)
    }
    animate()

    return () => { document.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf) }
  }, [])

  return (
    <>
      <div ref={dotRef}  className="cursor" />
      <div ref={ringRef} className="cursor-ring" />
    </>
  )
}
