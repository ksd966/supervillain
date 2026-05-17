import { useEffect, useRef } from 'react'

const callbacks = new WeakMap()
const sharedObserver = typeof window !== 'undefined'
  ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        const cb = callbacks.get(entry.target)
        if (cb) cb(entry.target)
      })
    }, { threshold: 0.12 })
  : null

export default function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !sharedObserver) return
    callbacks.set(el, target => {
      target.classList.add('visible')
      sharedObserver.unobserve(target)
      callbacks.delete(target)
    })
    sharedObserver.observe(el)
    return () => { sharedObserver.unobserve(el); callbacks.delete(el) }
  }, [])

  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
    >
      {children}
    </Tag>
  )
}
