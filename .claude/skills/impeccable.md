# Impeccable Skill

## Overview

This skill designs and iterates production-grade frontend interfaces, focusing on real working code, committed design choices, and exceptional craft. Use it when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface.

Covers: websites, landing pages, dashboards, product UI, app shells, components, forms, settings, onboarding, empty states.

Design aspects: UX review, visual hierarchy, information architecture, cognitive load, accessibility, performance, responsive behavior, theming, anti-patterns, typography, fonts, spacing, layout, alignment, color, motion, micro-interactions, UX copy, error states, edge cases, i18n, reusable design systems/tokens.

Also handles: bland designs that need to become bolder, loud designs that need to become quieter, live browser iteration, ambitious visual effects.

**Not for:** backend-only or non-UI tasks.

## Setup

Before any design work or file edits:

1. **Load context (PRODUCT.md / DESIGN.md)** via the loader script — provides users, brand, tone, anti-references, strategic principles, colors, typography, elevation, components.
2. **Identify and load the matching register reference** (`brand.md` or `product.md`) — determines whether the task is brand-focused (marketing, landing, campaign) or product-focused (app UI, admin, dashboard).
3. **If a sub-command was invoked** (`craft`, `shape`, `audit`), load its reference file too — do not skip shape-and-confirm steps.

Skipping setup produces generic output that ignores project context.

### Context Gathering

Load from two case-insensitive files:

- **PRODUCT.md** — Required. Users, brand, tone, anti-references, strategic principles.
- **DESIGN.md** — Optional but strongly recommended. Colors, typography, elevation, components.

Load both in one call: `node {{scripts_path}}/load-context.mjs`

Consume the full JSON output; `contextDir` indicates where files were resolved. Do not re-run if already in session history, unless `impeccable teach` or `impeccable document` was just run, or the user manually edited a file.

- If **PRODUCT.md is missing/empty/placeholder**: run `impeccable teach`, then resume the original task.
- If **DESIGN.md is missing**: nudge the user once per session to run `impeccable document` for more on-brand output, then proceed.

### Register

Every design task is either:
- **brand** — design IS the product (marketing, landing, campaign)
- **product** — design SERVES the product (app UI, admin, dashboard)

Identify from: cues in the task, the surface in focus, or the `register` field in PRODUCT.md. If `register` is missing, infer it once from the "Users" and "Product Purpose" sections and cache for the session, then suggest the user run `impeccable teach` to add it explicitly.

Load the matching reference: `brand.md` or `product.md`.

## Shared Design Laws

Apply to every design regardless of register. Match implementation complexity to the aesthetic vision. Vary creative choices across projects — never converge on the same solutions.

### Color

- Use **OKLCH color space**. Reduce chroma as lightness approaches 0 or 100 to avoid garishness.
- Never use pure black (`#000`) or pure white (`#fff`). Tint every neutral toward the brand hue (chroma 0.005–0.01 is sufficient).
- Pick a **color strategy** before selecting colors:
  - **Restrained** — tinted neutrals + one accent ≤10%
  - **Committed** — one saturated color carries 30–60% of the surface
  - **Full palette** — multiple saturated colors, for highly expressive brands
