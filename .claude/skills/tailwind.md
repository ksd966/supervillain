# Tailwind CSS v4 Development Guidelines

Best practices for using Tailwind CSS v4 utility classes effectively.

Note: Tailwind CSS v4 (released January 2025) uses a CSS-first configuration approach. If you need v3 compatibility, `tailwind.config.js` is still supported.

## Core Principles

- **Utility-First**: Use utility classes instead of custom CSS
- **Mobile-First**: Design for mobile, then scale up with responsive modifiers
- **Component Extraction**: Extract repeated patterns into components
- **Consistent Spacing**: Use Tailwind's spacing scale
- **Custom Configuration**: Extend the default theme for brand consistency

## Basic Utilities

### Layout

```jsx
// Flexbox
<div className="flex items-center justify-between gap-4">
  <div className="flex-1">Content</div>
  <div className="flex-shrink-0">Sidebar</div>
</div>

// Grid
<div className="grid grid-cols-3 gap-4">
  <div>1</div>
  <div>2</div>
  <div>3</div>
</div>

// Positioning
<div className="relative">
  <div className="absolute top-0 right-0">Badge</div>
</div>
```

### Spacing

```jsx
<div className="p-4 m-2">           {/* padding: 1rem, margin: 0.5rem */}
<div className="px-6 py-4">        {/* padding-x: 1.5rem, padding-y: 1rem */}
<div className="mt-8 mb-4">        {/* margin-top: 2rem, margin-bottom: 1rem */}

// Space between children
<div className="space-y-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```

### Typography

```jsx
<h1 className="text-4xl font-bold text-gray-900">Heading</h1>
<p className="text-base font-normal text-gray-600 leading-relaxed">Paragraph</p>
<span className="text-sm font-medium text-blue-600">Label</span>
```

### Colors

```jsx
<p className="text-gray-900 dark:text-gray-100">Text</p>
<div className="bg-blue-500 hover:bg-blue-600">Button</div>
<div className="border border-gray-300">Box</div>
```

## Responsive Design

### Breakpoints

```jsx
<div className="w-full md:w-1/2 lg:w-1/3">
  {/* Full width on mobile, half on medium, third on large */}
</div>

<h1 className="text-2xl md:text-4xl lg:text-6xl">Responsive heading</h1>

<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* Responsive grid */}
</div>
```

### Container

```jsx
<div className="container mx-auto px-4">...</div>
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">...</div>
```

## Component Patterns

### Button

```jsx
<button className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
  Click me
</button>

<button className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
  Secondary
</button>
```

### Card

```jsx
<div className="bg-white rounded-lg shadow-md overflow-hidden">
  <img src="/image.jpg" alt="" className="w-full h-48 object-cover" />
  <div className="p-6">
    <h2 className="text-xl font-semibold mb-2">Card Title</h2>
    <p className="text-gray-600">Card content goes here.</p>
  </div>
</div>
```

### Form Input

```jsx
<div className="space-y-2">
  <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
  <input
    type="email"
    id="email"
    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    placeholder="you@example.com"
  />
  <p className="text-sm text-gray-500">We'll never share your email.</p>
</div>
```

## State Variants

```jsx
// Hover, Focus, Active
<button className="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 focus:ring-2 focus:ring-blue-500">
  Interactive Button
</button>

// Group Hover
<div className="group">
  <img src="/image.jpg" className="group-hover:opacity-75 transition-opacity" />
  <p className="group-hover:text-blue-600">Hover the container</p>
</div>

// Disabled
<button className="disabled:opacity-50 disabled:cursor-not-allowed" disabled>
  Disabled Button
</button>
```

## Dark Mode

```css
/* Tailwind v4: Configure in app/globals.css */
@import "tailwindcss";

@media (prefers-color-scheme: dark) {
  /* Or use class-based: .dark */
}
```

```jsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <h1 className="text-gray-900 dark:text-white">Title</h1>
  <p className="text-gray-600 dark:text-gray-400">Description</p>
</div>
```

## Custom Styles

### Arbitrary Values

```jsx
<div className="top-[117px]">
<div className="bg-[#1da1f2]">
<div className="grid-cols-[200px_1fr]">
```

### @apply Directive

```css
.btn-primary {
  @apply px-4 py-2 bg-blue-600 text-white font-medium rounded-md;
  @apply hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500;
  @apply disabled:opacity-50 disabled:cursor-not-allowed;
}
```

## Configuration

### Tailwind v4: CSS-First

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --color-brand-50: #eff6ff;
  --color-brand-100: #dbeafe;
  --color-brand-900: #1e3a8a;
  --spacing-128: 32rem;
  --font-family-sans: 'Inter', sans-serif;
  --breakpoint-3xl: 1920px;
}
```

### Tailwind v3 Config (still supported in v4)

```js
// tailwind.config.js
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: { brand: { 50: '#eff6ff', 100: '#dbeafe', 900: '#1e3a8a' } },
      spacing: { '128': '32rem' },
      fontFamily: { sans: ['Inter', 'sans-serif'] },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
```

## Plugins

```bash
npm install @tailwindcss/forms
npm install @tailwindcss/typography
npm install @tailwindcss/aspect-ratio
npm install @tailwindcss/container-queries
```

```jsx
<input type="text" className="form-input rounded-md" />

<article className="prose lg:prose-xl">
  <h1>Article Title</h1>
  <p>Content...</p>
</article>
```

## Performance

- **Auto content detection**: v4 scans all template files automatically — no `content` config needed
- **Build speed**: ~3.5x faster than v3 (~100ms full builds) using `@property` and `color-mix()`
- **Browser requirements**: Safari 16.4+, Chrome 111+, Firefox 128+

## Common Patterns

```jsx
// Centered full-screen
<div className="flex items-center justify-center min-h-screen">
  <div>Centered content</div>
</div>

// Sticky header
<header className="sticky top-0 z-50 bg-white border-b">
  <nav>Navigation</nav>
</header>

// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {posts.map(post => <PostCard key={post.id} post={post} />)}
</div>

// Text truncation
<p className="truncate">Long text...</p>
<p className="line-clamp-3">Max 3 lines...</p>
```
