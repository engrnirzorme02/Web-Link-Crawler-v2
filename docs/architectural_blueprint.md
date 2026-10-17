# Web Link Crawler V2 (Nirzor Magic Crawler) - Full Architectural Blueprint
**Document Version:** 4.1.0  
**Generated Date:** 2026-10-16  
**Architecture Status:** Production Grade / Passive Safe Mode Active  
**Author:** Nirzor Magic Crawler Architecture Team  

---

## 1. Executive Summary & Architecture Overview

**Web Link Crawler V2** (branded as **Nirzor Magic Crawler**) is a high-performance, full-stack web intelligence, crawling, extraction, and URL analysis platform. It is engineered to operate seamlessly across both desktop browsers and Android mobile devices, offering both standard web spidering capabilities and deep metadata/entity extraction.

### Core Architecture Highlights
- **Client Architecture:** Single Page Application (SPA) powered by **React 18**, **TypeScript**, **Vite**, and **Tailwind CSS**. Designed mobile-first with Material Design 3 and Android touch optimization (min 48px targets, bottom navigation, drawer menus).
- **Server Runtime:** High-throughput **Express.js** proxy running under Node.js (`tsx server.ts`) on container port `3000`. Features real-time Server-Sent Events (SSE) streaming for crawl progress, diagnostic telemetry, and robust error recovery.
- **Database & Persistence:** **Firebase Firestore** (`user_sessions`, `blueprint_history`, `blueprint_access_logs`) with client-side local cache fallback (`localStorage`), progressive document truncation (<900KB safety limit), and instant multi-format export/import.
- **Passive Safe Mode:** Strict compliance with Google Cloud API security policies. Background automated loops and external third-party calls are completely disabled to prevent automated spam flags, while local Cheerio DOM parsing, regex extractors, and offline intelligence work 100% locally.

---

## 2. High-Level System Architecture Diagram

```
+-----------------------------------------------------------------------------------------+
|                                    CLIENT APPLICATION                                    |
|   (Android WebView / Chrome Mobile / Desktop Browser - Port 3000)                        |
|                                                                                         |
|   +-----------------------+  +-----------------------+  +---------------------------+   |
|   |  Crawler (Spider)     |  |  Smart AI Crawler     |  |  Bulk URL Fetcher         |   |
|   |  (Crawler.tsx)        |  |  (SmartCrawler.tsx)   |  |  (BulkFetcher.tsx)        |   |
|   +-----------------------+  +-----------------------+  +---------------------------+   |
|   +-----------------------+  +-----------------------+  +---------------------------+   |
|   |  URL Processor        |  |  Data Extractor       |  |  Session Health Monitor   |   |
|   |  (URLProcessor.tsx)   |  |  (DataExtractor.tsx)  |  |  (SessionHealthModal.tsx) |   |
|   +-----------------------+  +-----------------------+  +---------------------------+   |
|   +-----------------------+  +-----------------------+  +---------------------------+   |
|   |  Crawler Session Mgr  |  |  History Dashboard   |  |  Blueprint Dashboard      |   |
|   |  (SessionManagerModal)|  |  (HistoryDashboard.tsx)|  |  (BlueprintDashboardModal)|   |
|   +-----------------------+  +-----------------------+  +---------------------------+   |
+-----------------------------------------------------------------------------------------+
                                         |
                       HTTP GET / POST   |  Server-Sent Events (SSE)
                       JSON / Multipart  |  text/event-stream
                                         v
+-----------------------------------------------------------------------------------------+
|                                  EXPRESS.JS BACKEND                                     |
|                                    (server.ts)                                          |
|                                                                                         |
|   +-------------------+  +--------------------+  +----------------------------------+   |
|   | /api/crawl (SSE)  |  | /api/parse-page    |  | /api/check-urls-health           |   |
|   +-------------------+  +--------------------+  +----------------------------------+   |
|   +-------------------+  +--------------------+  +----------------------------------+   |
|   | /api/subdomains   |  | /api/download-plan |  | /api/download-blueprint         |   |
|   +-------------------+  +--------------------+  +----------------------------------+   |
|                                                                                         |
|   [Crawl Engine Components]:                                                            |
|   - Axios with Exponential Backoff (`axiosWithRetry` - polite timeout & error guard)    |
|   - Cheerio HTML Parser (Fast in-memory DOM traversal, regex entity extraction)         |
|   - URL Sanitizer (`sanitizeAndDecodeUrl`, RFC 3986 decoding, strip tracking params)    |
|   - Scope Boundary Engine (Single Page, Subdirectory, Full Domain, Subdomain Lock)      |
|   - Robots.txt & Sitemap.xml Auto-Discovery                                             |
+-----------------------------------------------------------------------------------------+
                     |                                           |
                     v                                           v
      +-----------------------------+             +-------------------------------+
      |      TARGET WEBSITES        |             |      FIREBASE FIRESTORE       |
      |   (HTML, XML, JSON, CMS)    |             |  - `user_sessions`            |
      |   (Polite delay 0-10000ms)  |             |  - `blueprint_history`        |
      +-----------------------------+             |  - `blueprint_access_logs`    |
                                                  +-------------------------------+
```

---

## 3. Subsystem Breakdown & Execution Flow

### 3.1 Web Crawler Spider Engine (`Crawler.tsx` & `server.ts /api/crawl`)
The crawler is the flagship subsystem of the platform.
1. **URL Ingestion & Validation:** Accepts single or multi-line URLs (or uploaded `.txt` / `.csv` / `.json` seed lists). Validates syntax and auto-prefixes protocol (`https://`).
2. **Boundary Enforcement:**
   - **Single Page Mode:** Extracts all anchors, media, and scripts from the specified URL without following outbound links.
   - **Subdirectory Mode (`isSubdirMatch`):** Traverses only links sharing the root folder path (e.g., `/blog/` or `/products/`), ignoring parent or sibling routes.
   - **Domain Mode:** Follows links across the entire domain or restricts strictly to the active subdomain.
3. **Robots & Sitemap Harvesting:**
   - Probes `/robots.txt` for `Disallow` rules and explicit `Sitemap:` declarations.
   - Fetches and parses `/sitemap.xml` via Cheerio XML mode, prepopulating candidate seeds.
4. **Link Extraction & Traversal:**
   - Extracts URLs from `<a>`, `<link>`, `<form>`, `<script>`, `<img>`, `<iframe>`, and deep inline regex patterns.
   - Decodes HTML entities (e.g., `&amp;` -> `&`, `&#038;` -> `&`), removes hash fragments (`#...`), and normalizes slashes.
   - Filters out non-content CMS administrative/REST endpoints (e.g., `/wp-json/wc-admin/`, `/wp-admin/`, `notice/dismiss`, `logout`) to prevent crawler timeouts.
5. **Streaming Telemetry via SSE:**
   - Sends real-time events: `status`, `link`, `page_data`, and `done`.
   - Client updates live metrics: pages crawled, discovered URLs, queue depth, error counters, and terminal logs.

### 3.2 Smart AI Crawler (`SmartCrawler.tsx`)
- Provides focused crawling based on user instructions (e.g., "Find only PDF download links" or "Find contact pages").
- Combines heuristic path scoring with keyword relevance tokens.
- Fully operational in Passive Safe Mode without outbound cloud LLM costs.

### 3.3 Session Management & History (`CrawlerSessionManagerModal.tsx` & `HistoryDashboard.tsx`)
- **Session Auto-Save:** Every crawl execution generates or updates a `CrawlSession` document.
- **Safety Downsampling (`truncateForFirestore`):** Inspects document byte size. If payload approaches 900KB, it safely trims repetitive raw HTML dumps while preserving 100% of discovered unique URLs, preventing Firestore quota violations.
- **Session Restoration:** Users can restore, clone, compare, or delete prior crawl runs.
- **Multi-Format Exporting:** Exports directly to CSV, JSON, TXT, and Markdown.

### 3.4 Session Health Monitor & Broken Link Auditor (`SessionHealthModal.tsx` & `/api/check-urls-health`)
- Allows users to audit discovered URLs in batch.
- Displays HTTP response badges:
  - `200 OK` (Green)
  - `404 Not Found` (Rose)
  - `500 Server Error` (Purple)
  - `Timeout / Network Error` (Amber)
- Features one-click cleanup: atomically removes dead links from the session in Firestore.

### 3.5 Bulk URL Fetcher (`BulkFetcher.tsx`)
- High-concurrency HTTP status inspector.
- Supports custom header injection (`Header-Name: Value`), e.g., `Authorization: Bearer <token>` or custom User-Agents.
- Visual status table with real-time response times and content snippet previews.

### 3.6 URL Processor & Sanitizer (`URLProcessor.tsx` & `src/lib/utils.ts`)
- Specialized workbench for raw URL dumps:
  - URL Decoding & Cleaning (`cleanAndSanitizeUrl`).
  - Protocol standardizer (`http://` -> `https://`).
  - Duplicate deduplication and sort by domain/path.
  - Path segment splitter and parameter stripper.

---

## 4. Data Models & Firestore Schemas

### 4.1 `CrawlSession` Interface
```typescript
interface CrawlSession {
  id: string;
  userId: string;
  title: string;
  appMode: 'crawler' | 'smart_crawler' | 'extractor' | 'bulk_fetcher' | 'processor';
  url: string;
  settings: CrawlerSettings;
  results: CrawlResult[];
  logs?: Array<{ timestamp: string; message: string; type?: 'info' | 'warn' | 'error' | 'success' }>;
  stats: {
    pagesCrawled: number;
    totalLinks: number;
    errors: number;
    durationMs?: number;
  };
  tags?: string[];
  notes?: string;
  createdAt: number | any;
  updatedAt: number | any;
}
```

### 4.2 `CrawlerSettings` Interface
```typescript
interface CrawlerSettings {
  url: string;
  mode: 'single' | 'subdir' | 'domain';
  maxPages: number;
  maxDepth: number;
  maxBreadth: number;
  crawlDelay: number;
  restrictDomain?: string;
  includePatterns?: string;
  excludePatterns?: string;
  excludeExtensions?: string;
  excludePaths?: string;
  includeDomains?: string;
  excludeDomains?: string;
  includePathPattern?: string;
  fileTypes?: string;
  subdomainOnly: boolean;
  extractAll: boolean;
  fuzzPaths: boolean;
  verboseMode: boolean;
  customRegex?: string;
}
```

### 4.3 `CrawlResult` & `PageMetadata` Interface
```typescript
interface CrawlResult {
  url: string;
  source?: string;
  statusCode?: number;
  title?: string;
  description?: string;
  h1?: string[];
  emails?: string[];
  phones?: string[];
  socialLinks?: string[];
  canonical?: string;
}
```

---

## 5. Security, Politeness & Rate-Limiting Guardrails

1. **Polite Crawl Delay:** Users can configure delays between 0ms and 10,000ms. In production, 300ms–800ms delays prevent target server CPU spikes.
2. **Exponential Backoff & Timeout Circuit Breaker:**
   - Server-side `axiosWithRetry` caps retries at 2 attempts for transient errors (`429`, `502`, `503`, `504`).
   - For client timeouts (`ECONNABORTED`) or 4xx errors, retries are immediately aborted to prevent spider freezes.
3. **Administrative & Sensitive Route Shield:**
   - Auto-blocks WordPress/CMS internal REST endpoints: `/wp-json/wc-admin/`, `/wp-admin/`, `/wp-login.php`, `xmlrpc.php`, `wp-cron.php`, `action=dismiss`.
   - Prevents crawling cart, checkout, and logout endpoints.
4. **Massive Platform Boundary Fallback:**
   - If the seed URL targets massive social/code repositories (GitHub, Twitter, Reddit, YouTube), the boundary mode automatically narrows to `subdir` to prevent infinite spider traps.
5. **Firestore Storage Safeguards:**
   - Documents are progressively trimmed if they approach the 900KB threshold (`truncateForFirestore`), preserving all clean URLs while condensing repetitive diagnostic traces.

---

## 6. Android Mobile & Responsive UX Architecture

1. **Viewport Adaptation:**
   - Fully optimized for mobile screens (320px to 480px width) as well as desktop (1080p+).
   - Bottom navigation bar on mobile: **Config**, **Sessions**, and **Results** for effortless thumb reachability.
2. **Touch-First Discipline:**
   - Touch targets designed to adhere to Android Material Design guidelines (minimum 48x48px hit areas).
   - Instant tap-to-copy button on every discovered URL card.
3. **Collapsible Settings:**
   - Essential inputs (Target URL, Boundary mode, Start button) are immediately visible.
   - Advanced filters (Regex, Delay, Exclude paths, Depth) reside inside an expandable accordion.

---

## 7. Cross-Reference Evaluation with Proposals (`implementation_plan.md`)

This architectural blueprint serves as the baseline for evaluating proposed system enhancements:

| Proposed Feature in `implementation_plan.md` | Architecture Touchpoints | Evaluation & Feasibility |
| :--- | :--- | :--- |
| **Android Mobile Bottom Navigation** | `App.tsx`, `Crawler.tsx` | **Implemented**: Bottom bar enables instant switching between Config, Sessions, and Results on mobile. |
| **Auto-Save Session Defaults** | `localStorage`, `CrawlerSessionManagerModal.tsx` | **High Value**: Persisting the user's last configured delay, boundary, and regex filters per session reduces friction. |
| **Export crawled URLs to CSV, JSON, TXT, MD** | `GlobalExport.tsx`, `server.ts` | **Implemented**: Multi-channel download endpoints (`/api/download-blueprint`, `/api/download-plan`) and client-side format converters. |
| **Exclusion Pattern & Depth Settings** | `server.ts /api/crawl`, `Crawler.tsx` | **Implemented**: Max depth, breadth, include/exclude regex, and administrative route blocking are fully active. |
| **Reset Settings to Default Button** | Settings Accordion in `Crawler.tsx` | **Recommended**: Placing a "Reset to Defaults" button at the bottom of the config panel satisfies user requirements. |

---

## 8. Export & Download Access

This Architectural Blueprint is permanently accessible through multiple channels:
1. **Direct HTTP API Endpoint:** `/api/download-blueprint` (returns `architectural_blueprint.md` with `Content-Disposition: attachment`).
2. **In-App UI Download Button:** Available in the Desktop Sidebar and Mobile Header (`Download Blueprint (MD)`).
3. **Application Source Code Folders:**
   - `/downloadable_docs/architectural_blueprint.md`
   - `/docs/architectural_blueprint.md`
   - `/public/architectural_blueprint.md`
   - `.aistudio/artifacts/brain/b7d7b3c7-e6c6-456d-8aff-b255ec8af9be/implementation_plan.md`
