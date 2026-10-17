# Web Link Crawler V2 - Comprehensive Architectural Blueprint & Optimization Plan

## 1. System Vision & Purpose
Web Link Crawler V2 (Nirzor Magic Crawler) is a full-stack, enterprise-grade web intelligence, crawler, and data extraction tool tailored for power users, developers, SEO researchers, and Android mobile users.

---

## 2. Current Full System Architecture

### 2.1 Technology Stack
- **Frontend SPA:** React 18, Vite, TypeScript, Tailwind CSS, Lucide React, Framer Motion.
- **Backend Server:** Node.js, Express.js on Port 3000 (`tsx server.ts`), Server-Sent Events (SSE) streaming.
- **Scraping Engine:** Cheerio DOM parser, Axios with exponential backoff (`axiosWithRetry`), robots.txt & sitemap.xml auto-parser, regex-based metadata/entity extractors.
- **Database & Persistence:** Firebase Firestore (`user_sessions`, `blueprint_history`, `blueprint_access_logs`), LocalStorage offline caches, progressive payload truncation (`truncateForFirestore` < 900KB safety guard).
- **Protection Architecture:** Passive Safe Mode (0 outbound unauthorized cloud automation calls, 100% compliant with Google Cloud policy).

### 2.2 System Architecture Diagram
```
[ User Browser / Android WebView ]
         |
         | HTTP / SSE Stream
         v
[ Express.js Server (Port 3000) ]
    ├── /api/crawl (SSE Streaming Spider)
    ├── /api/parse-page (DOM Metadata & Entity Extractor)
    ├── /api/check-urls-health (Status 200/404/500 Auditor)
    ├── /api/download-blueprint (Direct Blueprint Markdown Export)
    └── /api/download-plan (Direct Implementation Plan Export)
         |
    ├── Axios with Backoff & Polite Delay (0 - 10,000ms)
    ├── Cheerio DOM & XML Parser
    └── Firebase Firestore Storage Sync (<900KB Safe Truncation)
```

---

## 3. Core Modules & Subsystems

1. **Crawler Spider (`Crawler.tsx`, `server.ts /api/crawl`):**
   - Three boundary modes: Single Page, Subdirectory, Full Domain.
   - Polite delays (0–10s), depth & breadth limits, include/exclude regex, file extension filters.
   - Sensitive and administrative path exclusions (`/wp-json/wc-admin/`, `/wp-admin/`, `notice/dismiss`, `logout`) to prevent timeouts.
   - Real-time SSE streaming for live logs, statistics, and discovered links.
2. **Smart AI Crawler (`SmartCrawler.tsx`):**
   - Natural language instruction guidance with offline keyword and path heuristic token scoring.
3. **Session & Data Management (`CrawlerSessionManagerModal.tsx`, `HistoryDashboard.tsx`):**
   - Save, load, compare, and delete past sessions.
   - Multi-format archive exports (CSV, JSON, TXT, Markdown).
4. **Link Health & Broken URL Monitor (`SessionHealthModal.tsx`):**
   - Live HTTP ping testing with one-click broken URL purge.
5. **Bulk Fetcher (`BulkFetcher.tsx`):**
   - Parallel HTTP status auditing with custom request header injection (`Authorization`, User-Agent).
6. **URL Processor & Sanitizer (`URLProcessor.tsx`, `utils.ts`):**
   - RFC 3986 URL decoders, duplicate removal, path segmentation, and safe hostname extraction.

---

## 4. Evaluation Matrix for Proposed Enhancements

| Proposal | Architecture Integration Point | Status / Assessment |
| :--- | :--- | :--- |
| **Mobile Bottom Navigation Bar** | `Crawler.tsx`, `App.tsx` | **Implemented**: Quick-switch tabs for Config, Sessions, and Results on mobile viewports. |
| **Auto-Save Session Defaults** | `localStorage`, `CrawlerSessionManagerModal.tsx` | **Implemented**: Saves user-configured delays, boundaries, and patterns. |
| **Multi-Format Export (CSV, JSON, TXT, MD)** | `GlobalExport.tsx`, `/api/download-*` | **Implemented**: Client and server export mechanisms. |
| **Advanced Pattern Exclusions & Depth Controls** | `server.ts /api/crawl`, `Crawler.tsx` | **Implemented**: Hard boundary filters, depth limits, and CMS REST route shields. |
| **Reset Settings to Default** | Settings Panel in `Crawler.tsx` | **Implemented**: Instant one-tap reset to recommended crawler defaults. |

---

## 5. Export & Accessibility

The full architectural blueprint is downloadable directly via:
- HTTP Endpoint: `/api/download-blueprint`
- UI Download Buttons: Desktop Sidebar and Mobile Header (`Download Blueprint (MD)`)
- Repository Source Files:
  - `/downloadable_docs/architectural_blueprint.md`
  - `/docs/architectural_blueprint.md`
  - `/public/architectural_blueprint.md`
