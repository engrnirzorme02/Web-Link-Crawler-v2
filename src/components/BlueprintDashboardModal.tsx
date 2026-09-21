import React, { useState, useEffect } from 'react';
import { 
  X, Layout, Database, Cpu, Layers, ShieldCheck, ArrowRight, 
  Activity, Sparkles, Server, CheckCircle2, Zap, Globe, Lock, 
  RefreshCw, Terminal, Code, Boxes, Bot, HardDrive, FileText, Check, AlertTriangle, Download
} from 'lucide-react';
import { BLUEPRINT_VERSION, UI_BLUEPRINT, DEV_BLUEPRINT } from '../config/blueprints';
import { db, auth } from '../lib/firebase';
import { doc, getDocFromServer } from 'firebase/firestore';

interface BlueprintDashboardModalProps {
  onClose: () => void;
}

type TabType = 'architecture' | 'data_layer' | 'matrix' | 'health';

export function BlueprintDashboardModal({ onClose }: BlueprintDashboardModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('architecture');
  const [dbStatus, setDbStatus] = useState<'testing' | 'online' | 'offline'>('testing');
  const [dbLatency, setDbLatency] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>('ui_components');
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const testFirebaseConnection = async () => {
    setDbStatus('testing');
    const startTime = performance.now();
    try {
      // Test direct server fetch to verify Firestore availability
      await getDocFromServer(doc(db, 'blueprint_history', 'connection_health_check'));
      const endTime = performance.now();
      setDbLatency(Math.round(endTime - startTime));
      setDbStatus('online');
    } catch (err: any) {
      const endTime = performance.now();
      setDbLatency(Math.round(endTime - startTime));
      // Even if document doesn't exist, if it reaches server without client offline error, DB is accessible
      if (err?.message?.includes('client is offline')) {
        setDbStatus('offline');
      } else {
        setDbStatus('online');
      }
    }
  };

  useEffect(() => {
    testFirebaseConnection();
  }, []);

  const handleDownloadDashboardBlueprint = () => {
    const summaryMarkdown = `# Nirzor Magic Crawler - Visual Blueprint Dashboard (v${BLUEPRINT_VERSION})
Generated: ${new Date().toISOString()}
Database Connection Status: ${dbStatus.toUpperCase()} (${dbLatency ? dbLatency + 'ms' : 'N/A'})

---

## 1. System Architecture Overview
- **Version**: ${BLUEPRINT_VERSION}
- **Frontend**: React 18, Vite, Tailwind CSS, TypeScript
- **Backend / Proxy**: Express.js (Port 3000, 0.0.0.0 Container Ingress)
- **Database**: Firebase Firestore (Collections: blueprint_history, user_sessions, blueprint_access_logs)
- **AI Engine**: Google Gemini API (@google/genai)

---

## 2. Multi-Layer Technical Specifications

### Layer 1: React UI Component Map
- **DataExtractor**: Client-side regex link filter, paragraph sanitizer, multi-file upload parser.
- **BulkFetcher**: Batch fetching with custom header injection (Authorization, Cookies), status badges.
- **Crawler**: SSE live terminal logs, D3/Graph visualizer, depth/boundary filters.
- **SmartCrawler**: Gemini-powered deep crawl and one-shot URL relevance evaluator.
- **AIChat**: Auto-scrolling streaming chat, Web Speech dictation, context selector.
- **AboutPage & Security Modal**: Password-gated blueprint downloads and version history.

### Layer 2: Client State Engine & Buffers
- **FileReader API**: Converts multi-file attachments to text buffers asynchronously.
- **Auto-Scroll Engine**: Dynamic calculation (\`scrollHeight - scrollTop - clientHeight < 50\`).
- **AbortController**: Instant fetch request cancellation for crawler and batch requests.

### Layer 3: Server API Endpoints (Express proxy)
- **POST /api/chat**: Streamed Gemini responses with token window truncation (~4M chars limit).
- **POST /api/crawl**: Server-Sent Events (SSE) stream for web crawling.
- **POST /api/smart-crawl**: Headless browsing + AI evaluation streaming.
- **POST /api/fetch & /api/fetch-bulk**: Concurrent URL fetcher with custom header parsing.
- **POST /api/check-urls-health**: Rapid HTTP status checks (HEAD/GET fallback) to detect 404/500 broken links.
- **POST /api/auto-tag**: Gemini AI semantic session categorization and tag generation.

### Layer 4: Firebase Data Layer
- **sessions**: Full session persistence, results arrays, tags, pinned status, and archive state.
- **blueprint_history**: Stores architectural blueprint versions and history snapshots.
- **blueprint_access_logs**: Audit logs for security check unlocks.

---

## 3. Component Technical Matrix Summary
| Component | Primary Inputs | Local Buffers | API Endpoint | Firestore Target |
| --- | --- | --- | --- | --- |
| DataExtractor | Text / File(s) | inputText, attachedFiles | Client-side | Transient / Export |
| BulkFetcher | URLs + Headers | customHeadersText, AbortController | POST /api/fetch & /fetch-bulk | sessions |
| Crawler | URLs + Depth | logs, graphNodes | POST /api/crawl (SSE) | sessions |
| SmartCrawler | URLs + AI Prompt | aiInstruction, deepResearchLogs | POST /api/smart-crawl | sessions |
| AIChat | Speech / File / Text | messages, contextSource | POST /api/chat | sessions |
| HistoryDashboard | Session filters & tags | selectedIds, filterOnlyBroken | /api/check-urls-health, /api/auto-tag | sessions |
| SessionHealthModal | Crawled URL arrays | healthResults, brokenUrls | POST /api/check-urls-health | sessions (Atomic update) |
| SessionCompareModal | 2 selected sessions | comparison metrics, diff sets | Client-side diff engine | Reference only |

---

## 4. UI Blueprint Summary
${UI_BLUEPRINT}

---

## 5. Developer Blueprint Summary
${DEV_BLUEPRINT}
`;

    const blob = new Blob([summaryMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visual-blueprint-dashboard-v${BLUEPRINT_VERSION}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-3 sm:p-6 backdrop-blur-md overflow-hidden">
      <div className="bg-white dark:bg-zinc-950 rounded-3xl max-w-6xl w-full h-[90vh] flex flex-col shadow-2xl border border-zinc-200 dark:border-zinc-800 relative overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4 bg-zinc-50/50 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-tr from-indigo-500 to-purple-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                  Blueprint Dashboard
                </h2>
                <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                  v{BLUEPRINT_VERSION} Architecture Map
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Visual high-level technical map of components, state engine, API proxy, and Firestore data layer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs">
              <span className={`w-2 h-2 rounded-full ${dbStatus === 'online' ? 'bg-emerald-500 animate-pulse' : dbStatus === 'testing' ? 'bg-amber-500 animate-ping' : 'bg-rose-500'}`} />
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                Firestore: {dbStatus === 'online' ? `Connected (${dbLatency}ms)` : dbStatus === 'testing' ? 'Testing...' : 'Offline'}
              </span>
            </div>

            <button
              onClick={handleDownloadDashboardBlueprint}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                downloadSuccess
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-sm'
              }`}
              title="Download Visual Blueprint Summary (.md)"
            >
              {downloadSuccess ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
              <span>{downloadSuccess ? 'Downloaded!' : 'Download Blueprint'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-800 dark:hover:text-white rounded-xl hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
              title="Close Dashboard"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Nav Tabs */}
        <div className="px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center gap-2 overflow-x-auto custom-scrollbar py-2">
          <button
            onClick={() => setActiveTab('architecture')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'architecture'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <Layout className="w-4 h-4" />
            Architecture Flow Map
          </button>

          <button
            onClick={() => setActiveTab('data_layer')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'data_layer'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <Database className="w-4 h-4" />
            Firebase Data Layer
          </button>

          <button
            onClick={() => setActiveTab('matrix')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'matrix'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            Component-State Matrix
          </button>

          <button
            onClick={() => setActiveTab('health')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'health'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            System Health & Status
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-zinc-50/50 dark:bg-zinc-900/20">
          
          {/* TAB 1: ARCHITECTURE FLOW MAP */}
          {activeTab === 'architecture' && (
            <div className="space-y-6">
              
              {/* Top Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                    <Layout className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 font-medium">Frontend Layer</p>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">9 Interactive Components</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 font-medium">State & Cache</p>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">Local + File Buffer</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 font-medium">Express API Proxy</p>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">5 Endpoints (SSE/Stream)</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 font-medium">Data & AI Store</p>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">Firestore + Gemini API</p>
                  </div>
                </div>
              </div>

              {/* Visual Architectural Map Diagram */}
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      Application Data & Control Flow Diagram
                    </h3>
                    <p className="text-xs text-zinc-500">Click any tier node to inspect detailed technical specifications</p>
                  </div>
                  <span className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-lg text-zinc-600 dark:text-zinc-400">
                    Client ➔ Server Proxy ➔ Cloud Sync
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 relative">
                  
                  {/* NODE 1: USER INTERFACE */}
                  <div 
                    onClick={() => setSelectedNode('ui_components')}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer relative ${
                      selectedNode === 'ui_components' 
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 ring-2 ring-blue-500/30 shadow-lg' 
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 hover:border-blue-300 dark:hover:border-blue-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold">
                        Layer 1
                      </span>
                      <Layout className="w-4 h-4 text-blue-500" />
                    </div>
                    <h4 className="font-bold text-sm text-zinc-900 dark:text-white mb-1">React UI Modules</h4>
                    <p className="text-xs text-zinc-500 mb-4">Vite SPA, Tailwind UI, Custom Icons & Modals</p>
                    
                    <div className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300 font-mono">
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>DataExtractor</span>
                        <span className="text-[10px] text-zinc-400">File & Regex</span>
                      </div>
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>BulkFetcher</span>
                        <span className="text-[10px] text-zinc-400">Header Inject</span>
                      </div>
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>SmartCrawler</span>
                        <span className="text-[10px] text-zinc-400">AI Deep Crawl</span>
                      </div>
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>AIChat</span>
                        <span className="text-[10px] text-zinc-400">Universal Context</span>
                      </div>
                    </div>
                  </div>

                  {/* NODE 2: STATE & CLIENT PIPELINE */}
                  <div 
                    onClick={() => setSelectedNode('state_pipeline')}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer relative ${
                      selectedNode === 'state_pipeline' 
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 ring-2 ring-amber-500/30 shadow-lg' 
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 hover:border-amber-300 dark:hover:border-amber-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-semibold">
                        Layer 2
                      </span>
                      <Cpu className="w-4 h-4 text-amber-500" />
                    </div>
                    <h4 className="font-bold text-sm text-zinc-900 dark:text-white mb-1">State & Client Buffer</h4>
                    <p className="text-xs text-zinc-500 mb-4">In-Memory Buffers, FileReader, SSE Readers</p>
                    
                    <div className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300 font-mono">
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>attachedFiles</span>
                        <span className="text-[10px] text-zinc-400">Array Buffer</span>
                      </div>
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>AbortControllers</span>
                        <span className="text-[10px] text-zinc-400">Cancel Fetch</span>
                      </div>
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>EventSource SSE</span>
                        <span className="text-[10px] text-zinc-400">Stream Logs</span>
                      </div>
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>Context Truncator</span>
                        <span className="text-[10px] text-zinc-400">4M Char Limit</span>
                      </div>
                    </div>
                  </div>

                  {/* NODE 3: EXPRESS SERVER API PROXY */}
                  <div 
                    onClick={() => setSelectedNode('api_proxy')}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer relative ${
                      selectedNode === 'api_proxy' 
                        ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20 ring-2 ring-purple-500/30 shadow-lg' 
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 hover:border-purple-300 dark:hover:border-purple-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-semibold">
                        Layer 3
                      </span>
                      <Server className="w-4 h-4 text-purple-500" />
                    </div>
                    <h4 className="font-bold text-sm text-zinc-900 dark:text-white mb-1">Express API Backend</h4>
                    <p className="text-xs text-zinc-500 mb-4">Node server.ts (Port 3000), esbuild CJS bundle</p>
                    
                    <div className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300 font-mono">
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>POST /api/chat</span>
                        <span className="text-[10px] text-purple-500">Gemini Stream</span>
                      </div>
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>POST /api/crawl</span>
                        <span className="text-[10px] text-purple-500">SSE Crawler</span>
                      </div>
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>POST /api/smart-crawl</span>
                        <span className="text-[10px] text-purple-500">AI Evaluate</span>
                      </div>
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>POST /api/fetch</span>
                        <span className="text-[10px] text-purple-500">Header Inject</span>
                      </div>
                    </div>
                  </div>

                  {/* NODE 4: FIREBASE & GEMINI */}
                  <div 
                    onClick={() => setSelectedNode('cloud_data')}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer relative ${
                      selectedNode === 'cloud_data' 
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-2 ring-emerald-500/30 shadow-lg' 
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 hover:border-emerald-300 dark:hover:border-emerald-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-semibold">
                        Layer 4
                      </span>
                      <Database className="w-4 h-4 text-emerald-500" />
                    </div>
                    <h4 className="font-bold text-sm text-zinc-900 dark:text-white mb-1">Firebase & AI Cloud</h4>
                    <p className="text-xs text-zinc-500 mb-4">Firestore Database, Auth, Google Gemini API</p>
                    
                    <div className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300 font-mono">
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>blueprint_history</span>
                        <span className="text-[10px] text-emerald-500">Firestore</span>
                      </div>
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>user_sessions</span>
                        <span className="text-[10px] text-emerald-500">Firestore</span>
                      </div>
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>blueprint_access_logs</span>
                        <span className="text-[10px] text-emerald-500">Firestore</span>
                      </div>
                      <div className="p-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
                        <span>@google/genai SDK</span>
                        <span className="text-[10px] text-emerald-500">Gemini 2.5</span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Selected Node Technical Spec Drawer */}
                {selectedNode && (
                  <div className="mt-6 p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                        <Terminal className="w-4 h-4" />
                        Selected Layer Technical Details: {selectedNode.toUpperCase().replace('_', ' ')}
                      </h5>
                      <span className="text-[11px] text-zinc-500">Click other layer cards to inspect</span>
                    </div>

                    {selectedNode === 'ui_components' && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed font-mono">
                        • <strong>Data Extractor</strong>: Uses client-side regex parsing with instant Paragraph Sanitizer & Link Extractor.<br />
                        • <strong>Bulk Fetcher</strong>: Injects custom HTTP authorization headers (e.g., Bearer tokens, cookies, nonces) and batch fetches target URLs.<br />
                        • <strong>Universal AI Chat</strong>: Auto-scrolling transcript engine with file attachments,Web Speech dictation, and cross-tab context selection.
                      </p>
                    )}

                    {selectedNode === 'state_pipeline' && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed font-mono">
                        • <strong>FileReader API</strong>: Asynchronously converts uploaded file attachments into readable text streams before passing to API payloads.<br />
                        • <strong>Auto-Scroll Calculation</strong>: <code className="text-indigo-500">scrollHeight - scrollTop - clientHeight &lt; 50</code> dynamically enables smooth auto-scrolling during active SSE streams.<br />
                        • <strong>AbortController</strong>: Attached to live HTTP requests to allow instant cancellation when users click "Stop".
                      </p>
                    )}

                    {selectedNode === 'api_proxy' && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed font-mono">
                        • <strong>Express Entry (<code className="text-purple-400">server.ts</code>)</strong>: Binds to port 3000 (0.0.0.0).<br />
                        • <strong>Build Script</strong>: Bundled with esbuild to output single CommonJS <code className="text-purple-400">dist/server.cjs</code>.<br />
                        • <strong>Streaming Pipeline</strong>: Server-Sent Events (SSE) deliver real-time terminal output and chunked AI responses directly to the browser iframe.
                      </p>
                    )}

                    {selectedNode === 'cloud_data' && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed font-mono">
                        • <strong>Firestore Storage</strong>: Configured with collections <code className="text-emerald-400">blueprint_history</code>, <code className="text-emerald-400">user_sessions</code>, and <code className="text-emerald-400">blueprint_access_logs</code>.<br />
                        • <strong>Security Verification</strong>: Protected with passcode checks and Firestore access logs.<br />
                        • <strong>Gemini Integration</strong>: Server-side API key protection ensuring keys never leak to client JavaScript.
                      </p>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}

          {/* TAB 2: FIREBASE DATA LAYER */}
          {activeTab === 'data_layer' && (
            <div className="space-y-6">
              
              <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-zinc-900 dark:text-white">Firestore Database Schema</h3>
                      <p className="text-xs text-zinc-500">Live collections mapping for persistent state and audit logs</p>
                    </div>
                  </div>

                  <span className="text-xs font-mono bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                    Database ID: ai-studio-1b5a...
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  
                  {/* Collection 1 */}
                  <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">blueprint_history</span>
                      <span className="text-[10px] font-mono bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-600 dark:text-zinc-300">
                        Collection
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Stores architectural blueprint checkpoints and historical versions.</p>
                    <div className="space-y-1 text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
                      <div><strong className="text-zinc-800 dark:text-zinc-200">version:</strong> string (e.g. "3.0.0")</div>
                      <div><strong className="text-zinc-800 dark:text-zinc-200">uiBlueprint:</strong> markdown string</div>
                      <div><strong className="text-zinc-800 dark:text-zinc-200">devBlueprint:</strong> markdown string</div>
                      <div><strong className="text-zinc-800 dark:text-zinc-200">createdAt:</strong> timestamp</div>
                    </div>
                  </div>

                  {/* Collection 2 */}
                  <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">user_sessions</span>
                      <span className="text-[10px] font-mono bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-600 dark:text-zinc-300">
                        Collection
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Saves tool outputs and crawling history for cross-session access.</p>
                    <div className="space-y-1 text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
                      <div><strong className="text-zinc-800 dark:text-zinc-200">userId:</strong> string (auth.currentUser)</div>
                      <div><strong className="text-zinc-800 dark:text-zinc-200">type:</strong> crawler | smart_crawler | fetcher</div>
                      <div><strong className="text-zinc-800 dark:text-zinc-200">results:</strong> JSON array</div>
                      <div><strong className="text-zinc-800 dark:text-zinc-200">updatedAt:</strong> timestamp</div>
                    </div>
                  </div>

                  {/* Collection 3 */}
                  <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">blueprint_access_logs</span>
                      <span className="text-[10px] font-mono bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-600 dark:text-zinc-300">
                        Collection
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Logs secure blueprint access unlock attempts for audit verification.</p>
                    <div className="space-y-1 text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
                      <div><strong className="text-zinc-800 dark:text-zinc-200">blueprint:</strong> "ui" | "dev"</div>
                      <div><strong className="text-zinc-800 dark:text-zinc-200">version:</strong> string</div>
                      <div><strong className="text-zinc-800 dark:text-zinc-200">userId:</strong> string</div>
                      <div><strong className="text-zinc-800 dark:text-zinc-200">status:</strong> "success" | "denied"</div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Firestore Security Rules Card */}
              <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Firestore Security & Access Control</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-zinc-800 dark:text-zinc-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Client-Side Authentication Checks
                    </div>
                    <p className="text-zinc-500 leading-relaxed">
                      All write operations require <code className="text-indigo-500">request.auth != null</code>. Session documents are scoped to <code className="text-indigo-500">resource.data.userId == request.auth.uid</code>.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-zinc-800 dark:text-zinc-200">
                      <Lock className="w-4 h-4 text-purple-500" />
                      Blueprint Download Verification
                    </div>
                    <p className="text-zinc-500 leading-relaxed">
                      Blueprint content downloads are password-gated with client verification and audit logs recorded to Firestore on every unlock.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: COMPONENT-STATE MATRIX */}
          {activeTab === 'matrix' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-x-auto custom-scrollbar">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-2">Component Technical Matrix</h3>
                <p className="text-xs text-zinc-500 mb-4">Detailed relationship between React components, local state, backend endpoints, and cloud data</p>

                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-mono">
                      <th className="py-2.5 px-3">Component</th>
                      <th className="py-2.5 px-3">Primary User Inputs</th>
                      <th className="py-2.5 px-3">State & Local Buffers</th>
                      <th className="py-2.5 px-3">API Proxy Endpoint</th>
                      <th className="py-2.5 px-3">Firebase Storage Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono text-zinc-700 dark:text-zinc-300">
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="py-3 px-3 font-semibold text-indigo-600 dark:text-indigo-400">DataExtractor</td>
                      <td className="py-3 px-3">Textarea + Upload File(s)</td>
                      <td className="py-3 px-3">inputText, extractedLinks, attachedFiles</td>
                      <td className="py-3 px-3 text-zinc-400">Client-Side Only</td>
                      <td className="py-3 px-3 text-zinc-400">Transient / Export</td>
                    </tr>
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="py-3 px-3 font-semibold text-indigo-600 dark:text-indigo-400">BulkFetcher</td>
                      <td className="py-3 px-3">URLs + Header Injection Box</td>
                      <td className="py-3 px-3">customHeadersText, results, AbortController</td>
                      <td className="py-3 px-3 text-purple-500">POST /api/fetch</td>
                      <td className="py-3 px-3 text-emerald-500">user_sessions</td>
                    </tr>
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="py-3 px-3 font-semibold text-indigo-600 dark:text-indigo-400">Crawler</td>
                      <td className="py-3 px-3">Target URLs + Depth/Domain Select</td>
                      <td className="py-3 px-3">logs, graphNodes, crawlResults</td>
                      <td className="py-3 px-3 text-purple-500">POST /api/crawl (SSE)</td>
                      <td className="py-3 px-3 text-emerald-500">crawls / user_sessions</td>
                    </tr>
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="py-3 px-3 font-semibold text-indigo-600 dark:text-indigo-400">SmartCrawler</td>
                      <td className="py-3 px-3">URLs + AI Filter Instruction</td>
                      <td className="py-3 px-3">aiInstruction, deepResearchLogs</td>
                      <td className="py-3 px-3 text-purple-500">POST /api/smart-crawl</td>
                      <td className="py-3 px-3 text-emerald-500">user_sessions</td>
                    </tr>
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="py-3 px-3 font-semibold text-indigo-600 dark:text-indigo-400">AIChat</td>
                      <td className="py-3 px-3">Text Input, Speech Mic, Attachments</td>
                      <td className="py-3 px-3">messages, isAutoScroll, contextSource</td>
                      <td className="py-3 px-3 text-purple-500">POST /api/chat</td>
                      <td className="py-3 px-3 text-emerald-500">user_sessions</td>
                    </tr>
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="py-3 px-3 font-semibold text-indigo-600 dark:text-indigo-400">AboutPage</td>
                      <td className="py-3 px-3">Password Modal Input</td>
                      <td className="py-3 px-3">selectedBlueprint, password, success</td>
                      <td className="py-3 px-3 text-zinc-400">Local Download Blob</td>
                      <td className="py-3 px-3 text-emerald-500">blueprint_history & access_logs</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: SYSTEM HEALTH & STATUS */}
          {activeTab === 'health' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Live Firestore Connection Status */}
                <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-500" />
                      Live Firestore Health Check
                    </h3>
                    <button
                      onClick={testFirebaseConnection}
                      className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors"
                      title="Retest Firestore Connection"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Firestore Server Access:</span>
                      <span className={`font-bold ${dbStatus === 'online' ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {dbStatus === 'online' ? 'ONLINE (Operational)' : dbStatus === 'testing' ? 'Testing connection...' : 'OFFLINE'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Roundtrip Latency:</span>
                      <span className="font-mono text-zinc-800 dark:text-zinc-200">
                        {dbLatency ? `${dbLatency} ms` : 'Measuring...'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Auth User UID:</span>
                      <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate max-w-[180px]">
                        {auth.currentUser?.uid || 'Anonymous Session'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Server-Side Safeguards */}
                <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Engine Safeguards & Payload Limits
                  </h3>

                  <div className="space-y-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">Context Window Limit (AI Chat):</span>
                      <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">~4,000,000 Chars (Auto-Truncated)</span>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">Express Body Limit:</span>
                      <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">50 MB JSON Payload</span>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">Server Ingress Port:</span>
                      <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">3000 (0.0.0.0 Container Ingress)</span>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Architecture Blueprint v{BLUEPRINT_VERSION} Fully Active</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadDashboardBlueprint}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 font-semibold rounded-xl border border-indigo-200 dark:border-indigo-800/60 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Blueprint (.md)
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-medium rounded-xl transition-colors"
            >
              Close Dashboard
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
