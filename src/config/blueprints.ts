export const BLUEPRINT_VERSION = "4.0.0";

export const UI_BLUEPRINT = `# UI Blueprint (v${BLUEPRINT_VERSION}) - 100% Clone Specifications

## 1. Global Application Layout (App.tsx)
- **Root Container**: \`<div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30 overflow-hidden">\`
- **Header**: Sticky top header (\`h-16\`), flex row, containing:
  - Left: App Title (Nirzor Magic Crawler) + Sparkles Icon + Version Badge (\`v${BLUEPRINT_VERSION}\`) + "by Nirzor" link.
  - Right: Theme toggle (Moon/Sun), Info button, Firebase Auth state (Avatar/Login).
- **Navigation Bar**: Horizontal scrollable list (\`overflow-x-auto custom-scrollbar\`) with Tabs:
  - Extractor, Crawler, Smart AI Crawler, Bulk Fetcher, AI Chat, URL Processor, API Usage, History & Reports, About.
  - Tab Active State: \`bg-white dark:bg-zinc-800 text-indigo-600 shadow-sm\`
  - Tab Inactive State: \`hover:bg-zinc-200/50 text-zinc-600\`
- **Main Content Area**: \`flex-1 overflow-hidden relative\`. The active tab's component is rendered here.
- **Floating Controls**:
  - \`GlobalScrollButtons\`: Bottom right, fixed. Up/Down chevrons for rapid scrolling.
  - \`GlobalExport\`: Bottom right, next to scroll buttons. Export current session data.

## 2. Component-Level Visual & Structural Details

### A. Data Extractor (\`<DataExtractor />\`)
- **Layout**: 2-column grid on desktop (\`md:grid-cols-2\`), single column on mobile.
- **Left Panel (Input)**:
  - **Header**: "Input Data" + clear button (\`Trash2\` icon).
  - **Upload Row**: Horizontal list of uploaded files (FileText icon + filename + 'X' remove button).
  - **Textarea**: \`w-full h-48 md:h-64 p-3 md:p-4 bg-transparent resize-none focus:outline-none text-slate-700 font-mono text-sm\`
- **Action Buttons (Middle)**:
  - "Filter Links": Indigo gradient (\`bg-gradient-to-r from-indigo-500 to-indigo-600\`).
  - "Sanitize Paragraphs": Cyan gradient (\`bg-gradient-to-r from-cyan-500 to-cyan-600\`).
- **Right Panel (Output)**:
  - **Header**: Dynamic label (e.g., "Output: 5 Unique Links") + Copy button.
  - **Textarea**: Read-only, \`bg-slate-50/50 dark:bg-slate-950/50\`.
- **Toast**: Fixed top-center, Emerald background, pops up on action success.

### B. Bulk Fetcher (\`<BulkFetcher />\`)
- **Layout**: Flex column, split into a Configuration section (top) and Results section (bottom).
- **Header Injection**:
  - \`<label>\`: "Header Injection (Optional)" with Key icon.
  - \`<p>\`: Helper text explaining format \`Header-Name: Value\`.
  - \`<textarea>\`: \`h-24 font-mono text-xs\` for user to type headers like \`Authorization: Bearer <token>\`.
- **Target URLs Input**:
  - Contains an upload button \`<label>\` (hidden file input) that appends files as chips.
  - Textarea for raw URLs.
- **Controls**: "Start Fetching" button (\`bg-indigo-600\`) and "Stop" button (\`bg-rose-600\`, shown during fetch).
- **Progress Bar**: Shows % complete when fetching.
- **Results Table**:
  - Grid showing URL, Status Code (Green/Red/Yellow badges), Content Snippet, and Copy button.

### C. Crawler (Advanced Web Spider)
- **Top Section**: Configuration cards.
  - **URLs**: Textarea + File upload chips.
  - **Crawl Boundary**: 3 Option Cards (Single Page, Subdirectory, Full Domain).
  - **Advanced Settings Toggle**: Reveals Max Pages, Depth, Include/Exclude Regex, File Extensions.
- **Execution Controls**: Start Crawl (Blue) / Stop (Red).
- **Bottom Section (Tabs)**:
  - **Results**: Table of crawled URLs + status.
  - **Logs**: Terminal-style black window (\`bg-zinc-950\`) with green monospace text (\`text-emerald-400\`), auto-scrolling.
  - **Visualizer**: D3.js or react-force-graph rendering the site map nodes.

### D. Smart Crawler (AI-Powered)
- **Layout**: Similar to Crawler but heavily focused on AI interactions.
- **Inputs**: URL text area + Upload File(s) button, AI Filter Instruction text area (Purple border).
- **Modes**: Dropdown for "One-Shot AI Filter" vs "Deep Crawl".
- **Status Box**: While running, shows pulsing "Deep Research Agent Active..." with typewriter effect.
- **AI Summary**: A dedicated Markdown rendered box (\`react-markdown\`) showing the AI's final analysis.

### E. Universal AI Chat (\`<AIChat />\`)
- **Container**: Flex column, taking full height of the tab.
- **Header**: "AI Research Assistant" + Expert Mode Toggle + Context Selector Dropdown.
- **Messages Area**: \`flex-1 overflow-y-auto p-4\`.
  - **User Message**: Aligned right, \`bg-indigo-600 text-white rounded-2xl rounded-tr-sm\`.
  - **AI Message**: Aligned left, \`bg-white dark:bg-zinc-900 border text-zinc-800 rounded-2xl rounded-tl-sm\`.
  - Contains Markdown rendering, code blocks with syntax highlighting and copy buttons.
- **Input Area**: Fixed at bottom with multi-file attachment and speech synthesis.

### F. History, Analytics & Session Health Dashboard (\`<HistoryDashboard />\`)
- **Stats Overview Grid**:
  - Total Crawl Sessions, Total Discovered Links, Smart Crawls, and **Session Health Card**.
  - **Session Health Card**: Live detection of broken 404/500 sessions with one-click filtering.
  - **Alert Banner**: Highlights non-functioning links across all crawled sessions.
- **Session Health Monitor Modal (\`<SessionHealthModal />\`)**:
  - Live HTTP status scanner pinging server proxy (\`/api/check-urls-health\`).
  - Displays status badges (\`404 Not Found\`, \`500 Server Error\`, \`200 OK\`, \`Timeout (408)\`).
  - "Clean Up All Broken Links" button with atomic Firestore document updating.
- **Session Comparison Engine (\`<SessionCompareModal />\`)**:
  - Side-by-side URL diffing, shared vs unique links calculation, and status code distribution.
- **AI Auto-Tagging System (\`<TagEditModal />\`)**:
  - Single and bulk session tagging via Gemini AI categorization.
  - Custom tag chip filtering and management.

### G. Android Native Architecture & Wireframe Specifications
- **Material Design 3**: TopAppBar, OutlinedTextField, Slider depth controls, Chips, and ElevatedCards.
- **Polite Crawling UX**: Politeness delay slider (100ms - 3000ms), regex include/exclude pattern matching.
- **Touch-Friendly Controls**: Minimum 48px touch targets, quick copy-to-clipboard button per URL card.
- **Theme & Data Saver**: Dynamic dark/light mode toggle and bandwidth-saving asset filters.

### H. About Page & Blueprint Secure Access
- **Android Material You Surface Design**: Clean tonal cards, segmented category tabs, version pills.
- **Live Visual Architecture Dashboard Modal**: Interactive system topology, node inspection, and latency meter.
- **Security Check Gate**: 5-digit PIN modal (\`10076\`) with visual feedback, automatic logging, and file generation.

## 3. Micro-Interactions, CSS, and Animations
- **Hover States**: All buttons use \`hover:bg-[color]\` or \`hover:opacity-90\` and \`transition-all duration-200\`.
- **Click Feedback**: \`active:scale-[0.98]\` on primary action buttons.
- **Scrollbars**: \`custom-scrollbar\` class applied globally (thin width, rounded thumb, subtle track).
- **Responsive Design**: Mobile-first Tailwind. Stacked columns on \`xs/sm\`, expanding to grids on \`md/lg\`.
`;

export const DEV_BLUEPRINT = `# Developer Blueprint (v${BLUEPRINT_VERSION}) - 100% Logic & Architecture Clone

## 1. System Architecture & Tech Stack
- **Frontend Framework**: React 18 (Functional Components, Hooks), Vite bundler.
- **Language**: TypeScript (Strict mode enabled).
- **Styling**: Tailwind CSS v3 (Utility-first, dark mode via \`class\` strategy, Material Design 3 inspired tokens).
- **Backend**: Express.js server (\`server.ts\`) running on Node.js (Port 3000, 0.0.0.0).
- **Build Process**: \`npm run build\` uses \`esbuild\` to bundle the backend into a single \`dist/server.cjs\` while Vite builds the frontend into \`dist/\`.
- **Database / Auth**: Firebase SDK (Web). Authentication via Google/Email, Database via Firestore.
- **AI Integration**: \`@google/genai\` official SDK with Gemini 2.5 Flash / Pro models.

## 2. Server-Side Endpoints & Logic (\`server.ts\`)

### A. \`POST /api/check-urls-health\` (Session Health & Broken Link Scanner)
- **Input Payload**: \`{ urls: string[] }\` (validates HTTP/HTTPS, slices up to 50 URLs).
- **Logic**:
  1. Batches requests in chunks of 6 concurrent workers.
  2. Issues rapid \`axios.head()\` request with a 5000ms timeout and browser User-Agent.
  3. If \`HEAD\` returns 405 (Method Not Allowed) or fails, falls back gracefully to \`axios.get()\`.
  4. Collects HTTP status codes (detecting 404 Not Found, 500 Server Error, 408 Timeout).
  5. Returns \`{ totalChecked, brokenCount, results: [{ url, status, ok, statusText }] }\`.

### B. \`POST /api/chat\`
- **Input Payload**: \`{ history: [], message: string, context: string, expertMode: boolean }\`
- **Logic**:
  1. Truncates context window to ~4M characters to prevent 413 Payload Too Large errors.
  2. Uses \`gemini-2.5-pro\` (Expert Mode) or \`gemini-2.5-flash\` (Standard).
  3. Calls \`ai.chats.stream()\` and pipes chunks via Server-Sent Events / Express \`res.write()\`.

### C. \`POST /api/smart-crawl\` and \`/api/crawl\`
- **Transport**: Server-Sent Events (SSE). HTTP Headers: \`Content-Type: text/event-stream\`.
- **Logic**:
  1. Connects via \`fetch\` reader with AbortController signal support.
  2. Cheerio HTML parsing with depth and domain boundary checks.
  3. Streams real-time JSON log events: \`data: {"type": "log", "message": "..."}\\n\\n\`.

### D. \`POST /api/fetch\` and \`/api/fetch-bulk\` (Bulk Fetcher)
- **Input Payload**: \`{ urls: string[], customHeaders: Record<string, string> }\`
- **Logic**:
  1. Limits concurrent requests using batching to prevent memory overload.
  2. Injects custom HTTP headers (Authorization, Custom Cookies, Tokens).
  3. Returns status codes, raw text snippets, and error diagnostics.

### E. \`POST /api/auto-tag\`
- **Input Payload**: \`{ title: string, results: any[], type: string }\`
- **Logic**: Analyzes session metadata with Gemini AI to generate 3-5 concise, semantic tags for automated organization.

## 3. Client-Side State & Logic Patterns

### A. Session Health Monitoring & Cleanup Logic
- \`SessionHealthModal\`:
  1. Extracts URLs from Firestore \`session.results\`.
  2. Calls \`/api/check-urls-health\` to determine active vs broken links.
  3. Allows selective single-URL removal or bulk "Clean Up All Broken Links".
  4. Performs atomic update on Firestore \`sessions/{id}\` using \`updateDoc\` with \`serverTimestamp()\`.

### B. Session Comparison Engine
- \`SessionCompareModal\`:
  - Computes intersection (\`Set.prototype.has\`) and relative complements of two session result sets.
  - Visualizes overlap percentage and divergence statistics in real time.

### C. File Uploads (Universal Pattern)
- Multi-file attachment parsing via \`FileReader.readAsText()\` supporting .txt, .csv, .json, and .html files.

### D. Abort Controllers (Cancellable Requests)
- Prevents rogue background requests when users navigate between tabs or halt operations.

## 4. Android Core Crawler Architecture Specification
- **Engine**: Kotlin Coroutines + Flow (cold stream emitting \`CrawledUrlItem\`).
- **Algorithm**: Breadth-First Search (BFS) with \`ArrayDeque<Pair<String, Int>>\` and synchronized \`visitedUrls\` Set.
- **Politeness Throttle**: Configurable \`delay(politenessDelayMs)\` (100ms - 3000ms) to respect target servers.
- **Filtering**: Regex include/exclude filters, same-domain constraints, and binary extension suppression (.png, .pdf, .zip).
- **Error Tolerance**: Recovers gracefully from \`SocketTimeoutException\`, \`MalformedURLException\`, and SSL errors.

## 5. Firebase Database Schema (Firestore)
- **Collection \`sessions\`**:
  - \`id\` (string), \`title\` (string), \`type\` ('crawler' | 'smart_crawler' | 'bulk' | 'extractor'),
  - \`results\` (array of URLs or metadata objects),
  - \`tags\` (array of strings), \`isPinned\` (boolean), \`isArchived\` (boolean),
  - \`createdAt\` (timestamp), \`updatedAt\` (timestamp).
- **Collection \`blueprint_history\`**:
  - \`version\` (string), \`uiBlueprint\` (string), \`devBlueprint\` (string), \`createdAt\` (timestamp).
- **Collection \`blueprint_access_logs\`**:
  - \`userId\` (string), \`blueprint\` ('ui' | 'dev'), \`accessedAt\` (timestamp), \`status\` ('success' | 'failed').

## 6. Security & Performance
- **CORS Proxy**: All external HTTP requests pass through the container Express proxy to bypass browser SOP restrictions.
- **Payload Limits**: \`express.json({ limit: '50mb' })\` accommodates massive raw crawl arrays.
- **PIN Authorization**: Protected blueprints with access code \`10076\` and audit logging.
`;
