# Web Link Crawler V2 - Comprehensive UX, Workflow & Mobile Optimization Architecture

A production-grade UX, mobile-first design, and workflow optimization plan for Web Link Crawler V2. Tailored for high-efficiency Android mobile usability, power-user progressive disclosure, per-session configuration retention, and instant file download/copy access.

> **📁 File Download & Copy Availability (সরাসরি ডাউনলোড ও কপি করার লোকেশন):**
> 1. **সোর্স কোড ফোল্ডার পাথ ১:** `/docs/implementation_plan.md`
> 2. **সোর্স কোড ফোল্ডার পাথ ২:** `/downloadable_docs/implementation_plan.md`
> 3. **পাবলিক ওয়েব ডাউনলোড পাথ:** `/public/implementation_plan.md`
> 4. **ব্রাউজারে সরাসরি ওয়ান-ক্লিক ডাউনলোড URL:** `/api/download-plan` (বা `https://[app-url]/api/download-plan`)
> 5. **অ্যাপ্লিকেশনের UI বাটন:** সাইডবার ও মোবাইল হেডার বারে থাকা "Download Plan" বাটনে ক্লিক করলেই সম্পূর্ণ ফাইলটি সরাসরি ডাউনলোড হয়ে যাবে।

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were aligned during Phase 1 clarification:
> - **Mobile Experience**: Optimized for smartphone/Android touch ergonomics ($375\text{px}$–$430\text{px}$) featuring a smooth slide-out drawer, touch targets $\ge 44\text{px}$, sticky thumb-zone action bars, and zero horizontal viewport spill.
> - **Progressive Disclosure**: High-utility smart defaults out-of-the-box with expandable "Advanced Options" accordions for power users.
> - **Configuration Persistence**: Automatic persistence of user settings per session in Firestore, auto-populating the last-used settings into new sessions, coupled with a dedicated "Reset to Defaults" trigger on each tool panel.
> - **Unified Hub**: Home view upgraded with a quick-action card system unifying Crawler, Extractor, Bulk Fetcher, YouTube Analyzer, and Scheduler into a cohesive workspace.
> - **Direct Download & Export**: The architecture and documentation are exported directly into the project repository so users can inspect, copy, or download it anytime outside the artifact curtain.

---

## 1. Overview & Core Concept

### What It Delivers
Web Link Crawler V2 transforms from a collection of isolated scraping utilities into a cohesive, tactile intelligence workbench. It streamlines the user journey from entry to exported dataset by introducing a high-contrast Mobile Navigation Drawer, an instant-start Quick Action Dashboard, automated configuration memory, and collapsible power-user controls.

### Target Audience & Personas
- **Mobile Operators / Field Researchers**: Users operating on Android mobile browsers needing rapid URL extraction, site audits, and contact discovery with one hand.
- **Power Data Engineers & Developers**: Users configuring complex regex rules, subdirectory boundaries, custom headers, and multi-threaded bulk fetches who need fast access to advanced controls without visual clutter.
- **Content & SEO Analysts**: Users needing quick domain mapping, broken link checks, and exportable CSV/JSON archives on the fly.

### Key Value
- **Zero-Friction Zero-State**: Default configurations match 90% of crawling needs immediately upon launch.
- **Cognitive Ergonomics**: Progressive disclosure keeps primary actions clean while power settings stay one tap away.
- **Session Continuity**: Settings, filters, and depth parameters persist per session, eliminating repetitive input.
- **Universal Portability**: Instant one-click file download and copy directly from the source repository.

---

## 2. User Experience & Visual Design

### Key User Flows

#### A. Rapid Crawl Flow (Mobile & Desktop)
```
[Home Dashboard] ──> Tap "New Crawl" ──> [Paste Target URL]
       │
       ▼
[Smart Defaults Active: Domain Mode, Depth: 3, Clean URLs]
       │
       ├──> (Optional: Tap "Advanced Settings" to expand regex/delays)
       │
       ▼
[Tap "Start Crawl" (Sticky Mobile CTA)] ──> [Live Visual Progress & Terminal Logs]
       │
       ▼
[1-Tap Export: CSV / JSON / Markdown] & Auto-Saved to Session
```

#### B. Configuration Continuity Flow
```
[User adjusts Crawl Depth: 4, Delays: 500ms, Exclude: "/admin/*"]
       │
       ▼
[Debounced Auto-Save to Active Session State + Local Cache]
       │
       ▼
[User taps "+ New Session"] ──> [New Session initializes with Last-Used Settings]
       │
       ▼
[User taps "Reset to Default Settings"] ──> [Safe Confirmation Toast & Factory Reset]
```

### Visual Identity & Theme
- **Theme Palette**: Deep slate background (`#0B0F17`) with crisp neutral card surfaces (`#131B2B`), border dividers (`#1F293D`), and high-contrast text (`#F8FAFC`).
- **Accent Tokens**: Electric Cyan (`#06B6D4` / `#0EA5E9`) for primary actions, Emerald (`#10B981`) for completed statuses, Amber (`#F59E0B`) for warnings/rate limits, and Indigo (`#6366F1`) for smart crawler actions.
- **Typography**: Display typography using `Plus Jakarta Sans` / `Outfit` for confident readability; telemetry, numeric counters, and URLs rendered strictly in monospace tabular figures (`JetBrains Mono`, `font-mono`).
- **Touch Ergonomics**: All buttons, inputs, segmented controls, and drawer list items have hitboxes $\ge 44\text{px}$ height (`min-h-[44px]`).

### Component Styling & Mobile Presence
- **Mobile Drawer Navigation**: Slide-out backdrop drawer with clean section groupings (Quick Tools, Saved History, Global Analytics).
- **Sticky Bottom Action Bar on Mobile**: During active crawls, progress counters and Pause/Stop/Export buttons stay fixed in the natural thumb zone without obscuring content.
- **Expandable Settings Accordion**: Clean card enclosure with chevron trigger, active badges highlighting non-default configurations (e.g. "3 custom filters active").

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Progressive Disclosure for Advanced Settings
- **Chosen Approach**: Collapse granular filters (regex, exclude paths, file type filters, crawl delay, breadth limit) into an expandable "Advanced Configuration" accordion.
- **Why**: Prevents overwhelming mobile users with 15+ input fields on initial view while giving power users instant access when needed.
- **Alternatives Considered**: Multi-step wizard (adds too many screen transitions for simple repeat crawls).

### Decision 2: Per-Session Settings Persistence with Last-Used Fallback
- **Chosen Approach**: Store tool configuration objects inside Firestore session documents (`session.settings`) while caching the most recent configuration in `localStorage`.
- **Why**: Opening a past session restores its exact scraping rules, while starting a new session carries over user habits seamlessly.
- **Alternatives Considered**: Global hardcoded defaults only (forces power users to re-enter regex and headers on every single session).

### Decision 3: "Reset to Factory Defaults" Safe Trigger
- **Chosen Approach**: Provide an explicit, subtle button at the bottom of each settings panel with an immediate undo toast.
- **Why**: Allows users to recover from misconfigured regex or restrictive filters without having to manually clear individual fields.

### Decision 4: Source Repository & In-App Plan Export
- **Chosen Approach**: Retain the complete markdown plan directly within `/docs/`, `/downloadable_docs/`, `/public/`, and provide an in-app download endpoint `/api/download-plan`.
- **Why**: Ensures that users who cannot copy or download artifacts within the host UI modal can immediately copy or download the file with standard tools.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER (React 19 SPA)                     │
│                                                                        │
│  ┌──────────────────────┐  ┌─────────────────┐  ┌───────────────────┐  │
│  │ Unified Home Hub     │  │ Responsive      │  │ Dynamic Workspace │  │
│  │ (Quick Action Cards) │  │ Mobile Drawer   │  │ (Active Tool Tab) │  │
│  └──────────┬───────────┘  └────────┬────────┘  └─────────┬─────────┘  │
│             │                       │                     │            │
│             └───────────────────────┼─────────────────────┘            │
│                                     ▼                                  │
│                 ┌──────────────────────────────────────┐               │
│                 │ Session & Settings State Manager     │               │
│                 │ - Active Session Hydration           │               │
│                 │ - Last-Used Config Local Cache       │               │
│                 │ - Default Reset State Engine         │               │
│                 └──────────────────┬───────────────────┘               │
└────────────────────────────────────┼───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA & STORAGE PERSISTENCE                      │
│                                                                        │
│  ┌───────────────────────────────┐   ┌──────────────────────────────┐  │
│  │ Firestore Database            │   │ Browser LocalStorage         │  │
│  │ - sessions/{id}.settings      │   │ - last_crawler_config        │  │
│  │ - crawl_schedules             │   │ - last_extractor_config      │  │
│  │ - crawl_logs                  │   │ - ui_drawer_state            │  │
│  └───────────────────────────────┘   └──────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### State Management & Configuration Schema

```typescript
export interface CrawlerConfig {
  mode: 'single' | 'subdir' | 'domain';
  maxPages: number;
  maxDepth: number;
  maxBreadth: number;
  crawlDelay: number;
  restrictDomain: string;
  fileTypes: string;
  includePatterns: string;
  excludePatterns: string;
  excludeExtensions: string;
  excludePaths: string;
  includeDomains: string;
  excludeDomains: string;
  includePathPattern: string;
  verboseMode: boolean;
  subdomainOnly: boolean;
  extractAll: boolean;
  fuzzPaths: boolean;
}

export const DEFAULT_CRAWLER_CONFIG: CrawlerConfig = {
  mode: 'domain',
  maxPages: 50,
  maxDepth: 3,
  maxBreadth: 1000,
  crawlDelay: 0,
  restrictDomain: '',
  fileTypes: '',
  includePatterns: '',
  excludePatterns: '',
  excludeExtensions: 'pdf,zip,exe,mp3,mp4,dmg',
  excludePaths: '/wp-admin,/admin,/login,/cart,/checkout',
  includeDomains: '',
  excludeDomains: '',
  includePathPattern: '',
  verboseMode: false,
  subdomainOnly: true,
  extractAll: false,
  fuzzPaths: false,
};
```

### Interactive Component Mapping & Implementation Roadmap

1. **`src/components/HomeDashboard.tsx` (New Component)**:
   - Quick action grid with visual cards: Crawler, Extractor, Smart Filter, Bulk Fetch, YouTube Explorer, Scheduler.
   - Recent sessions carousel with 1-tap resume and instant stats summary.
2. **`src/components/Crawler.tsx` (Refactoring & Progressive Disclosure)**:
   - Primary input: Clean URL textarea with clear/paste helpers and quick mode selector.
   - "Advanced Scraping Options" accordion (`Collapsible` pattern) with badge count indicating active overrides.
   - Settings footer with "Save as Default" and "Reset to Factory Defaults" buttons.
   - Mobile touch improvements: Bottom action bar during active crawls with sticky progress indicators.
3. **`src/lib/settingsManager.ts` (Persistence Helper)**:
   - Centralized hydration logic: Session Settings $\rightarrow$ LocalStorage Last Config $\rightarrow$ Default Config.
   - Debounced Firestore persistence to prevent quota pressure.
4. **`src/App.tsx` (Mobile Drawer & Navigation Ergonomics)**:
   - Optimized sidebar drawer for Android mobile touch ($375\text{px}$–$430\text{px}$) with smooth backdrop dismiss.
   - Header bar with quick-switch session badges, tool breadcrumbs, and 1-tap Download Plan triggers.
