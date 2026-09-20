export const BLUEPRINT_VERSION = "3.0.0";

export const UI_BLUEPRINT = `# UI Blueprint (v${BLUEPRINT_VERSION}) - 100% Clone Specifications

## 1. Global Application Layout (App.tsx)
- **Root Container**: \`<div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30 overflow-hidden">\`
- **Header**: Sticky top header (\`h-16\`), flex row, containing:
  - Left: App Title (Nirzor Magic Crawler) + Sparkles Icon + Version Badge + "by Nirzor" link.
  - Right: Theme toggle (Moon/Sun), Info button, Firebase Auth state (Avatar/Login).
- **Navigation Bar**: Horizontal scrollable list (\`overflow-x-auto custom-scrollbar\`) with Tabs:
  - Extractor, Crawler, Smart AI Crawler, Bulk Fetcher, AI Chat, URL Processor, API Usage, History, About.
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
- **Input Area**: Fixed at bottom.
  - \`<textarea>\`: Auto-expanding (min-h-[52px], max-h-[160px]), padding on left/right for icons.
  - \`Upload Icon\`: Absolute positioned inside textarea (left side), attaches files as chips above textarea.
  - \`Mic Icon\`: Absolute positioned, red pulse when recording.
  - \`Send Button\`: Absolute positioned (right side), indigo background.

### F. About Page & Blueprint Secure Access
- **Layout**: Centered content, max-w-4xl.
- **Header Section**: App title, description, and Version Badge (\`v${BLUEPRINT_VERSION}\`).
- **Cards**: Two large cards for UI and DEV Blueprints.
  - \`bg-zinc-50 border p-6 rounded-2xl hover:-translate-y-1\`
  - Buttons: "Secure Download" with Lock icon.
- **Security Modal**: Fixed overlay (\`bg-black/60 backdrop-blur-sm\`).
  - Centered white/dark-zinc box.
  - Password input field (\`text-center tracking-widest text-lg\`).
  - Unlock button. Success state triggers automatic download.

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
- **Styling**: Tailwind CSS v3 (Utility-first, dark mode via \`class\` strategy).
- **Backend**: Express.js server (\`server.ts\`) running on Node.js (Port 3000, 0.0.0.0).
- **Build Process**: \`npm run build\` uses \`esbuild\` to bundle the backend into a single \`dist/server.cjs\` while Vite builds the frontend into \`dist/\`.
- **Database / Auth**: Firebase SDK (Web). Authentication via Google/Email, Database via Firestore.
- **AI Integration**: \`@google/genai\` official SDK.

## 2. Server-Side Endpoints & Logic (\`server.ts\`)

### A. \`POST /api/chat\`
- **Input Payload**: \`{ history: [], message: string, context: string, expertMode: boolean }\`
- **Logic**:
  1. Concatenates \`context\` + \`message\`.
  2. If length > ~4M chars, truncates strictly to prevent 413 Payload Too Large / Token limit errors.
  3. Uses \`gemini-2.5-pro\` (Expert Mode) or \`gemini-2.5-flash\` (Standard).
  4. Calls \`ai.chats.stream()\`.
  5. Pipes response back via Express \`res.write()\` for real-time typewriter effect.

### B. \`POST /api/smart-crawl\` and \`/api/crawl\`
- **Transport**: Server-Sent Events (SSE). HTTP Headers: \`Content-Type: text/event-stream\`.
- **Logic**:
  1. Client connects via \`EventSource\` or \`fetch\` reader.
  2. Server uses \`cheerio\` + \`axios\` or headless browser simulation to fetch HTML.
  3. Parses \`<a href>\` tags, sanitizes relative URLs to absolute.
  4. For Smart Crawl: Sends text chunks to Gemini for evaluation against user instructions.
  5. Streams back JSON objects: \`data: {"type": "log", "message": "..."}\\n\\n\`.

### C. \`POST /api/fetch\` (Bulk Fetcher)
- **Input Payload**: \`{ urls: string[], customHeaders: Record<string, string> }\`
- **Logic**:
  1. Limits concurrent requests using \`p-limit\` or manual batching (e.g., 5 at a time) to prevent memory crashes.
  2. Injects \`customHeaders\` directly into the \`axios.get()\` or \`fetch()\` headers.
  3. Wraps each request in a \`try/catch\`. Returns an array of results with \`status\`, \`content\`, and \`error\` properties.

## 3. Client-Side State & Logic Patterns

### A. File Uploads (Universal Pattern)
- Every component with file support uses a hidden \`<input type="file" multiple />\`.
- **Logic**:
  1. \`onChange\` event captures \`FileList\`.
  2. \`FileReader.readAsText()\` parses text/csv/json files into strings asynchronously.
  3. Stored in state: \`const [attachedFiles, setAttachedFiles] = useState<{name: string, content: string}[]>([])\`.
  4. On form submission, \`attachedFiles\` content is concatenated with text input.

### B. Abort Controllers (Cancellable Requests)
- Used in Bulk Fetcher and Crawlers.
  \`\`\`typescript
  const abortControllerRef = useRef<AbortController | null>(null);
  // On Start:
  abortControllerRef.current = new AbortController();
  fetch('/api/url', { signal: abortControllerRef.current.signal })
  // On Stop:
  abortControllerRef.current.abort();
  \`\`\`

### C. Auto-Scrolling (AI Chat & Terminal Logs)
- **Logic**:
  1. \`onScroll\` listener on the container div calculates: \`isAtBottom = scrollHeight - scrollTop - clientHeight < 50\`.
  2. \`useEffect\` triggers on new messages: \`if (isAtBottom) endRef.current.scrollIntoView({ behavior: 'smooth' })\`.

## 4. Firebase Database Schema (Firestore)
- **Collection \`blueprint_history\`**: Tracks versions of this exact file.
  - \`version\` (string), \`uiBlueprint\` (string), \`devBlueprint\` (string), \`createdAt\` (timestamp).
- **Collection \`user_sessions\`**: Saves user tabs.
  - \`userId\` (string), \`type\` (string), \`data\` (JSON stringified session state).
- **Collection \`blueprint_access_logs\`**:
  - \`userId\`, \`blueprint\` ('ui'|'dev'), \`accessedAt\` (timestamp).

## 5. Error Handling & Edge Cases
- **CORS bypass**: Handled entirely by proxying all external requests through the Express backend.
- **Large Payloads**: Textareas and combined file strings can easily reach 10MB+. The backend \`express.json({ limit: '50mb' })\` is required.
- **Invalid URLs**: Client-side \`new URL(target)\` validation before sending to backend.
`;
