# Motion & Framer Motion

## Overview

Motion (formerly Framer Motion) is a production-ready animation library for React and JavaScript. It provides `motion` components that wrap HTML elements with animation superpowers, supports gesture recognition (hover, tap, drag, focus), and includes layout animations, exit animations, and spring physics.

**When to use:**
- Interactive UI components (buttons, cards, menus)
- Micro-interactions and hover effects
- Page transitions and route animations
- Scroll-based animations and parallax effects
- Layout changes (resizing, reordering, shared element transitions)
- Drag-and-drop interfaces
- Complex animation sequences and state-based animations

**Tech:** Motion v11+ / Framer Motion · React 18+ · TypeScript · Next.js / Vite / Remix compatible

## Core Concepts

### Motion Components

```jsx
import { motion } from "framer-motion"

<motion.div />
<motion.button />
<motion.svg />
<motion.path />
```

### Animate + Initial

```jsx
<motion.div
  initial={{ opacity: 0, y: 50 }}
  animate={{ opacity: 1, y: 0 }}
/>

// State-driven
const [isOpen, setIsOpen] = useState(false)
<motion.div animate={{ width: isOpen ? 300 : 100 }} />
```

### Transitions

```jsx
// Duration-based
<motion.div animate={{ x: 100 }} transition={{ duration: 0.5, ease: "easeInOut" }} />

// Spring physics
<motion.div animate={{ scale: 1.2 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} />

// Per-property transitions
<motion.div
  animate={{ x: 100, opacity: 1 }}
  transition={{
    x: { type: "spring", stiffness: 300 },
    opacity: { duration: 0.2 }
  }}
/>
```

**Types:** `"tween"` (default, duration+easing) · `"spring"` (physics) · `"inertia"` (drag deceleration)

### Variants

```jsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}

const itemVariants = {
  hidden: { x: -20, opacity: 0 },
  visible: { x: 0, opacity: 1 }
}

<motion.ul variants={containerVariants} initial="hidden" animate="visible">
  <motion.li variants={itemVariants} />
  <motion.li variants={itemVariants} />
</motion.ul>
```

Children automatically inherit parent variant state names — only the parent needs `initial`/`animate`.

## Common Patterns

### Hover & Tap

```jsx
<motion.button
  whileHover={{ scale: 1.1, boxShadow: "0px 10px 30px rgba(0,0,0,0.2)" }}
  whileTap={{ scale: 0.9 }}
  transition={{ type: "spring", stiffness: 400, damping: 17 }}
>
  Click me
</motion.button>
```

### Drag

```jsx
<motion.div
  drag
  dragConstraints={{ left: 0, right: 300, top: 0, bottom: 300 }}
  dragElastic={0.2}
  whileDrag={{ scale: 1.1 }}
/>
```

### Exit Animations

```jsx
import { motion, AnimatePresence } from "framer-motion"

<AnimatePresence>
  {items.map(item => (
    <motion.div
      key={item}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      {item}
    </motion.div>
  ))}
</AnimatePresence>
```

### Layout Animations

```jsx
// Auto-animate layout changes
<motion.div layout />

// Toggle switch example
<div style={{ display: "flex", justifyContent: isOn ? "flex-end" : "flex-start" }}>
  <motion.div layout style={{ width: 40, height: 40, borderRadius: 20 }} />
</div>
```

### Scroll-based

```jsx
import { motion, useScroll, useTransform } from "framer-motion"

function ParallaxSection() {
  const { scrollYProgress } = useScroll()
  const y = useTransform(scrollYProgress, [0, 1], [0, -200])
  const scale = useTransform(scrollYProgress, [0, 1], [0.8, 1.2])

  return <motion.div style={{ y, scale }} />
}
```

### Imperative Controls

```jsx
import { useAnimation } from "framer-motion"

function Box() {
  const controls = useAnimation()

  const handleClick = async () => {
    await controls.start({ x: 100, transition: { duration: 0.5 } })
    controls.start({ x: 0 })
  }

  return <motion.div animate={controls} onClick={handleClick} />
}
```

### Page Transitions (Next.js)

```jsx
// app/layout.tsx
<AnimatePresence mode="wait">
  <motion.div
    key={pathname}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.3 }}
  >
    {children}
  </motion.div>
</AnimatePresence>
```

## Performance

- Motion uses `transform` and `opacity` by default — GPU-accelerated, no layout recalculation
- Prefer animating `x/y` over `left/top`, `scale` over `width/height`
- Use `layout` prop sparingly — it triggers layout reads on every frame
- `will-change: transform` is set automatically during animation
- Wrap exit animations in `<AnimatePresence>` — required for `exit` prop to work
