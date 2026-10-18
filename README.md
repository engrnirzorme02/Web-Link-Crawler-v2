# NIRZOR Web Link Crawler (v2)

A full-stack web application for crawling, extracting, and analyzing web content. The app combines a TypeScript React frontend (Vite) with a Node.js extraction server that performs robust HTTP resolution, SPA rendering via Puppeteer, content cleaning (Cheerio), and conversion to GitHub-Flavored Markdown (Turndown). User sessions and authentication are handled with Firebase (Firestore + Auth).

---

## Key features

- Smart web crawling (subdir, domain, single-page modes), with politeness controls and filtering
- Robust redirect resolution (HTTP redirects, meta-refresh, JavaScript redirects)
- SPA detection and headless rendering using a shared Puppeteer instance
- Main content extraction, boilerplate stripping, and conversion to Markdown (Turndown + GFM)
- Entity extraction (emails, phone numbers, social links) and page metadata parsing
- SSE endpoints for live crawl progress, bulk fetch, smart crawl, and AI chat streaming
- Multi-key Gemini API rotation manager with auto-fallback (passive safe-mode by default)
- Firestore-backed session saving with a rich React UI for session management, export/import, and analytics

---

## Quick Start (Development)

1. Clone the repository

```bash
git clone https://github.com/engrnirzorme02/Web-Link-Crawler-v2.git
cd Web-Link-Crawler-v2
```

2. Install dependencies

```bash
npm install
# or using bun
# bun install
```

3. Copy the environment example and configure

```bash
cp .env.example .env
# Edit .env to provide APP_URL and any runtime keys you need (Firebase / Gemini disabled by default)
```

4. Run in development

```bash
npm run dev
```

Open http://localhost:3000

---

## Production build

```bash
npm run build
npm run start
```

This builds the frontend with Vite and bundles the server (server.ts) into `dist/server.cjs` using esbuild. `npm run start` runs the bundled server.

---

## API endpoints (selected)

- GET /api/health — Basic health check
- GET /api/system-status or /api/gemini/status — Status of Firebase & Gemini key pool
- GET /api/download-plan — Download implementation plan markdown (if present)
- GET /api/download-blueprint — Download architectural blueprint markdown (if present)
- GET /api/crawl?url=...&mode=domain|subdir|single — SSE crawling endpoint (live events)
- GET /api/smart-crawl?url=...&instruction=... — Instruction-guided smart crawl (SSE)
- POST /api/parse-page — Parse single page and return metadata/entities
- POST /api/fetch-bulk — SSE bulk content fetch for URL lists
- POST /api/smart-filter — AI-assisted URL filtering (falls back to heuristics)
- POST /api/generate-tags — Generate tags for sessions (local heuristics + optional AI)
- POST /api/check-urls-health — Check a list of URLs for 200/404/500 etc.
- /api/yt/* — YouTube search & analyzer endpoints (uses youtubei.js)

Refer to `server.ts` for full request query options and behavior.

---

## Important configuration

- .env (copy from .env.example)
  - APP_URL — URL where the app runs
  - BLUEPRINT_ACCESS_PIN / VITE_BLUEPRINT_ACCESS_PIN — Optional pin for blueprint downloads
  - NODE_ENV — development or production

- Puppeteer: server/htmlExtractor.ts sets Puppeteer launch flags suitable for many container platforms (no-sandbox, disable-dev-shm-usage, etc.). When deploying to Cloud Run or Docker, ensure the container has the required Chromium dependencies.

- Firebase: this repo expects Firestore + Auth. Provide Firebase client config or the `firebase-applet-config.json` file. Review `firestore.rules` before deploying to production.

- Gemini API / Google GenAI: multi-key rotation is implemented but the repository ships a passive-safe default (no active calls). To enable, set GEMINI_API_KEY environment variables — the code supports multiple keys and will rotate/fallback on 429/503/400.

---

## Project layout (top-level)

```
src/                # React app (components, pages, lib)
server/             # Server extraction utilities & express server entry (server.ts)
downloadable_docs/  # Downloadable blueprint / plan files (if present)
public/             # Static public assets
docs/               # Documentation
package.json
vite.config.ts
tsconfig.json
.env.example
firebase-applet-config.json
firestore.rules
```

---

## Development notes & tips

- Headless rendering: The server uses a shared Puppeteer instance (lazy-created) for efficiency. Monitor memory when running many concurrent headless sessions.
- Rate-limited AI calls: The GeminiKeyRotationManager in `server.ts` handles multiple API keys and automatically cools keys on rate limit or errors.
- Entity extraction: `server/htmlExtractor.ts` provides strong heuristics for emails, phone numbers, and social links — check its `extractPageMetadataAndEntities` implementation if you need custom patterns.
- Troubleshooting: Check server logs for `[CRAWL_SERVER_LOG]`, `[SMART_EXTRACT]`, and `[GEMINI_ROTATION]` prefixes to diagnose crawl/fetch/AI issues.

---

## Contributing

Contributions are welcome — open issues or PRs for bug fixes, features, or documentation improvements. If you plan to add features that perform cloud AI calls, ensure passive-safe defaults and opt-in configuration.

---

## License & Security

See SECURITY.md for reporting vulnerabilities. Add a LICENSE file as needed.

---

## Acknowledgements

Built with Puppeteer, Cheerio, Turndown, Firebase, Vite and React.
