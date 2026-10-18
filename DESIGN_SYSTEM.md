# NIRZOR Web Link Crawler Design System

A precision research console aesthetic: calm, legible, durable, and trustworthy.

## 1. Visual & Spatial Philosophy

- **Zero-Pill Discipline & Calm Hierarchy:** No arbitrary floating pills, distracting glowing borders, or neon rainbow gradients (`from-blue-600 via-indigo-600 to-purple-600`).
- **Precision Research Console:** Utilitarian, dense yet breathable layout designed for serious web intelligence, data extraction, and recursive crawling.
- **Tabular Figures & Monospace Discipline:** All telemetry, HTTP status codes, byte sizes, URL paths, and counters use tabular monospace figures (`font-mono tabular-nums`).

---

## 2. Color Tokens

### Light Mode (Paper Light)
- **Canvas / Background:** Paper Canvas `#F7F8F6`
- **Surface White:** `#FFFFFF` (flat cards with crisp 1px borders)
- **Raised Surface:** `#F0F2EF`
- **Borders & Dividers:** Crisp border `#DCE2DC`
- **Ink / Text:**
  - Primary: `#202522`
  - Secondary: `#48514B`
  - Subtle / Muted: `#707A73`
- **Primary Accent:** Muted Evergreen `#287653` (used for primary actions, selected navigation items, and active toggles)

### Dark Mode (Night Canvas)
- **Canvas / Background:** Deep Night `#171B18`
- **Surface Dark:** `#1F2420`
- **Raised Dark:** `#262D28`
- **Borders & Dividers:** `#3A443D`
- **Ink / Text:**
  - Primary: `#F0F2EF`
  - Secondary: `#C5CCC6`
  - Subtle / Muted: `#8B968E`
- **Primary Accent:** Evergreen Light `#75B992`

---

## 3. Typography
- **UI & Prose:** Inter / Geist Sans (clean legibility at 12–14px)
- **Data, Code & URLs:** JetBrains Mono / Geist Mono (`tabular-nums` enforced on all counters and tables)

---

## 4. Mobile & Touch Ergonomics
- Target viewports: 360–430px (e.g. Pixel, Galaxy, iPhone 14/15/16).
- Minimum touch target: 44×44px (touch-friendly buttons, toggles, and inputs).
- Safe-area insets (`env(safe-area-inset-bottom)`) supported across all bottom bars.
- Zero horizontal overflow (`overflow-x-hidden`).

---

## 5. Honest Telemetry Standards
- Never fabricate progress percentages during discovery spidering.
- While crawling: Show a calm activity indicator paired with exact tabular metrics: `"24 pages crawled / 50 cap · 142 discovered · Queue: 8"`.
- 100% progress is displayed only when the terminal `done` event is received, with a badge indicating the terminal outcome (`Queue Exhausted`, `Max Pages Cap Reached`, or `Stopped by User`).
