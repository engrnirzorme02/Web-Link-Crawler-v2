import React, { useState, useEffect } from 'react';
import { 
  Download, Lock, AlertCircle, CheckCircle2, ArrowLeft, History, Boxes, Layout,
  Smartphone, Cpu, Database, ShieldCheck, Activity, Sparkles, Layers, Globe,
  Sliders, FileCode2, Tag, HeartPulse, GitCompare, Key, ChevronRight, Info,
  ExternalLink, Zap, Terminal, Check, Delete
} from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { UI_BLUEPRINT, DEV_BLUEPRINT, BLUEPRINT_VERSION } from '../config/blueprints';
import { BlueprintHistoryModal } from './BlueprintHistoryModal';
import { BlueprintDashboardModal } from './BlueprintDashboardModal';
import { cn } from '../lib/utils';

interface AboutPageProps {
  onBack?: () => void;
}

type TabCategory = 'overview' | 'blueprints' | 'android' | 'features';

export function AboutPage({ onBack }: AboutPageProps) {
  const [activeCategory, setActiveCategory] = useState<TabCategory>('overview');
  const [selectedBlueprint, setSelectedBlueprint] = useState<'ui' | 'dev' | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  useEffect(() => {
    const syncBlueprintVersion = async () => {
      try {
        const historyRef = collection(db, 'blueprint_history');
        const q = query(historyRef, orderBy('createdAt', 'desc'), limit(1));
        const snapshot = await getDocs(q);
        
        let latestVersion = "0.0.0";
        if (!snapshot.empty) {
          latestVersion = snapshot.docs[0].data().version;
        }

        if (BLUEPRINT_VERSION !== latestVersion) {
          await addDoc(historyRef, {
            version: BLUEPRINT_VERSION,
            uiBlueprint: UI_BLUEPRINT,
            devBlueprint: DEV_BLUEPRINT,
            createdAt: serverTimestamp()
          });
          console.log(`Blueprint updated to version ${BLUEPRINT_VERSION} in Firestore`);
        }
      } catch (err) {
        console.error("Failed to sync blueprint version to Firestore:", err);
      }
    };

    syncBlueprintVersion();
  }, []);

  const closeModal = () => {
    setSelectedBlueprint(null);
    setPassword('');
    setError('');
    setLoading(false);
    setSuccess(false);
  };

  const downloadBlob = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownload = async (inputPass?: string) => {
    const codeToVerify = inputPass !== undefined ? inputPass : password;
    if (codeToVerify !== '10076') {
      setError('Invalid Access Code. Please enter the 5-digit PIN.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const content = selectedBlueprint === 'ui' ? UI_BLUEPRINT : DEV_BLUEPRINT;
      const filename = selectedBlueprint === 'ui' ? `ui-blueprint-${BLUEPRINT_VERSION}.md` : `dev-blueprint-${BLUEPRINT_VERSION}.md`;
      
      addDoc(collection(db, 'blueprint_access_logs'), {
        blueprint: selectedBlueprint,
        version: BLUEPRINT_VERSION,
        accessedAt: serverTimestamp(),
        userId: auth.currentUser?.uid || 'anonymous',
        status: 'success'
      }).catch(logErr => console.warn("Logging warning:", logErr.message));

      setSuccess(true);
      downloadBlob(content, filename);
      
      setTimeout(() => {
        closeModal();
      }, 1600);
    } catch (err: any) {
      console.warn("Download handling warning:", err.message);
      setError('An error occurred during verification.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeypadPress = (digit: string) => {
    if (password.length < 5) {
      const newPass = password + digit;
      setPassword(newPass);
      setError('');
      if (newPass.length === 5) {
        handleDownload(newPass);
      }
    }
  };

  const handleKeypadBackspace = () => {
    setPassword(prev => prev.slice(0, -1));
    setError('');
  };

  const handleKeypadClear = () => {
    setPassword('');
    setError('');
  };

  return (
    <div className="min-h-full w-full bg-zinc-50 dark:bg-zinc-950 pb-20 select-none">
      {/* Android Top App Bar */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between transition-all">
        <div className="flex items-center gap-3">
          {onBack && (
            <button 
              onClick={onBack}
              className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all"
              title="Back to Previous View"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                About & Specifications
              </h1>
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                v{BLUEPRINT_VERSION}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Nirzor Magic Crawler • Architecture & System Specs
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowDashboard(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-xs font-semibold shadow-sm transition-all active:scale-95"
            title="Open Interactive Architecture Dashboard"
          >
            <Boxes className="w-4 h-4" />
            <span className="hidden sm:inline">Visual Dashboard</span>
          </button>

          <button 
            onClick={() => setShowHistory(true)}
            className="w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2 rounded-full flex items-center justify-center gap-1.5 text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
            title="Version Snapshot History"
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">History</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        
        {/* Android Material Chips Segmented Filter Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {[
            { id: 'overview', label: 'System Overview', icon: Sparkles },
            { id: 'blueprints', label: 'Architecture Blueprints', icon: Layers },
            { id: 'android', label: 'Android Native Spec', icon: Smartphone },
            { id: 'features', label: 'Latest v4.0 Features', icon: Zap }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id as TabCategory)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border shrink-0",
                  isActive
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 shadow-sm"
                    : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
                )}
              >
                <Icon className={cn("w-3.5 h-3.5", isActive ? "text-indigo-400 dark:text-indigo-600" : "text-zinc-400")} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: OVERVIEW */}
        {(activeCategory === 'overview' || activeCategory === 'features') && (
          <div className="space-y-6">
            {/* Hero Card */}
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900/10 via-purple-900/5 to-blue-900/10 dark:from-indigo-950/40 dark:via-zinc-900 dark:to-purple-950/30 border border-indigo-200/80 dark:border-indigo-900/50 rounded-3xl p-6 sm:p-8 shadow-sm">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-3 max-w-2xl">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Intelligent Web Spider & Extraction Engine
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                    Nirzor Magic Crawler
                  </h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    A multi-threaded web intelligence platform featuring automated HTTP health monitoring, BFS deep crawling, Gemini AI semantic tagging, and unified session diff analysis.
                  </p>
                  <div className="pt-2 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">Architect:</span> Engr. Nirzor •
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">Runtime:</span> React 18 + Node/Express •
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">Persistence:</span> Cloud Firestore
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row md:flex-col gap-3 w-full md:w-auto shrink-0">
                  <button
                    onClick={() => setShowDashboard(true)}
                    className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Layout className="w-4 h-4" />
                    Explore Architecture
                  </button>
                  <button
                    onClick={() => setActiveCategory('blueprints')}
                    className="px-5 py-3 rounded-2xl bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Download className="w-4 h-4" />
                    Download Blueprints
                  </button>
                </div>
              </div>
            </div>

            {/* Android Tonal Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 rounded-2xl p-4 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Engine Version</span>
                <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">v{BLUEPRINT_VERSION}</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Fully Updated
                </span>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 rounded-2xl p-4 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">AI Integration</span>
                <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-2">Gemini 2.5</span>
                <span className="text-[10px] text-zinc-500 mt-1">Flash & Pro Models</span>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 rounded-2xl p-4 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Session Health</span>
                <span className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-2">404 / 500 Check</span>
                <span className="text-[10px] text-zinc-500 mt-1">One-Click Clean-up</span>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 rounded-2xl p-4 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Persistence</span>
                <span className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-2">Firestore</span>
                <span className="text-[10px] text-zinc-500 mt-1">Multi-device Synced</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB: LATEST FEATURES */}
        {(activeCategory === 'features' || activeCategory === 'overview') && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Latest v4.0 Capabilities
              </h3>
              <span className="text-xs font-semibold text-zinc-400">4 New Core Engines</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Feature 1: Health & Broken Link Cleanup */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-5 hover:border-rose-300 dark:hover:border-rose-900/60 transition-colors">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <HeartPulse className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      Session Health Monitor & Broken Link Cleanup
                    </h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Instant HTTP status scanning (/api/check-urls-health) with HEAD and GET fallback. Detects 404 Not Found and 500 Server Errors, allowing one-click cleanup directly in Firestore.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 2: Session Comparison Diff Engine */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-5 hover:border-indigo-300 dark:hover:border-indigo-900/60 transition-colors">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <GitCompare className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      Session Comparison & Overlap Engine
                    </h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Side-by-side analysis of two crawled sets. Displays Venn diagram overlap percentages, unique discovered URLs, and differences in server status codes.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 3: AI Auto-Tagging & Classification */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-5 hover:border-purple-300 dark:hover:border-purple-900/60 transition-colors">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                    <Tag className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      AI Auto-Tagging & Semantic Categorization
                    </h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Gemini 2.5 Flash inspects session titles and URLs to automatically produce contextual tags (e.g. #Documentation, #API, #Security, #E-commerce) for fast filtering.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 4: Android Material 3 Specs */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-5 hover:border-emerald-300 dark:hover:border-emerald-900/60 transition-colors">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      Android Native Architecture Blueprint
                    </h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Kotlin Coroutine Flow BFS crawler, Jsoup HTML parser, OkHttpClient connection pool, Material 3 dynamic color tokens, and 48px touch targets.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ARCHITECTURE BLUEPRINTS */}
        {(activeCategory === 'blueprints' || activeCategory === 'overview') && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  Architecture Blueprints
                </h3>
                <p className="text-xs text-zinc-500">
                  Password-protected markdown specifications for 100% clone reproduction
                </p>
              </div>
              <span className="font-mono text-xs px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
                v{BLUEPRINT_VERSION}
              </span>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              {/* UI Blueprint Card */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 p-6 rounded-3xl flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Layout className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      UI Blueprint
                    </h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      User Interface, Material Design 3 guidelines, and component specifications.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['App.tsx Layout', 'DataExtractor', 'BulkFetcher', 'Crawler UI', 'History Dashboard', 'Android MD3'].map(tag => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { setSelectedBlueprint('ui'); setPassword(''); setError(''); setSuccess(false); }}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-2xl font-semibold text-xs transition-all flex items-center justify-center gap-2 shadow-sm shadow-blue-500/20"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Unlock & Download UI Blueprint
                </button>
              </div>

              {/* Dev Blueprint Card */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 p-6 rounded-3xl flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <FileCode2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      Developer Blueprint
                    </h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      System Architecture, Server Endpoints, Firestore Schemas, and State Logic.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['Express Proxy', 'SSE Streaming', '/api/check-urls-health', 'Firestore Schema', 'Kotlin BFS Engine', 'Gemini AI'].map(tag => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { setSelectedBlueprint('dev'); setPassword(''); setError(''); setSuccess(false); }}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 active:scale-98 text-white rounded-2xl font-semibold text-xs transition-all flex items-center justify-center gap-2 shadow-sm shadow-purple-500/20"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Unlock & Download Dev Blueprint
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ANDROID NATIVE SPEC */}
        {activeCategory === 'android' && (
          <div className="space-y-6 pt-2 animate-in fade-in">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-500" />
                Android Native Architecture & UI/UX Guidelines
              </h3>
              <p className="text-xs text-zinc-500">
                Detailed mobile engineering blueprint tailored for Android 13/14/15 standards
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Android Card 1: Core Engine */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 rounded-3xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      Kotlin Coroutine & Flow Crawler
                    </h4>
                    <p className="text-xs text-zinc-500">Non-blocking background spidering</p>
                  </div>
                </div>
                <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-2 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span><strong>BFS Queue:</strong> Uses <code>ArrayDeque&lt;Pair&lt;String, Int&gt;&gt;</code> with synchronized visited URLs set.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span><strong>Politeness Throttle:</strong> Configurable <code>delay(politenessDelayMs)</code> (100ms - 3000ms) to respect server load.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span><strong>Jsoup Parser:</strong> Extracts relative links and converts to clean absolute URLs.</span>
                  </li>
                </ul>
              </div>

              {/* Android Card 2: Material 3 UI/UX */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 rounded-3xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <Layout className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      Material Design 3 (MD3) Guidelines
                    </h4>
                    <p className="text-xs text-zinc-500">Google Android Design Tokens</p>
                  </div>
                </div>
                <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-2 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                    <span><strong>Touch Targets:</strong> All buttons and interactive pills meet minimum 48dp x 48dp dimensions.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                    <span><strong>TopAppBar & BottomSheet:</strong> Modal sheets for health inspection and copy operations.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                    <span><strong>Data Saver:</strong> Toggle to avoid downloading image/binary assets on metered cellular data.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Android Security Dialog / Bottom Sheet Modal */}
      {selectedBlueprint && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-950 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden animate-in slide-in-from-bottom-5">
            
            {/* Top Indicator bar on mobile */}
            <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto sm:hidden -mt-2 mb-2" />

            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                Security Check
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Enter the 5-digit PIN for {selectedBlueprint === 'ui' ? 'UI' : 'Developer'} Blueprint v{BLUEPRINT_VERSION}.
              </p>
            </div>

            {/* PIN Code Visual Indicators */}
            <div className="flex items-center justify-center gap-3 py-2">
              {[0, 1, 2, 3, 4].map(idx => {
                const isFilled = password.length > idx;
                return (
                  <div
                    key={idx}
                    className={cn(
                      "w-4 h-4 rounded-full border-2 transition-all duration-200",
                      isFilled
                        ? "bg-indigo-600 border-indigo-600 scale-110 shadow-sm shadow-indigo-500/30"
                        : "border-zinc-300 dark:border-zinc-700 bg-transparent"
                    )}
                  />
                );
              })}
            </div>

            {/* Error & Success Alerts */}
            {error && (
              <div className="flex items-center justify-center gap-2 text-rose-600 dark:text-rose-400 text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 animate-in shake">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Access Granted! Downloading blueprint...</span>
              </div>
            )}

            {/* Keypad Container (Android Lockscreen Style) */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  type="button"
                  disabled={loading || success}
                  onClick={() => handleKeypadPress(num)}
                  className="h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 active:scale-95 text-zinc-900 dark:text-zinc-100 font-bold text-lg transition-all flex items-center justify-center"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                disabled={loading || success || password.length === 0}
                onClick={handleKeypadClear}
                className="h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 active:scale-95 text-zinc-600 dark:text-zinc-400 text-xs font-bold transition-all flex items-center justify-center"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={loading || success}
                onClick={() => handleKeypadPress('0')}
                className="h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 active:scale-95 text-zinc-900 dark:text-zinc-100 font-bold text-lg transition-all flex items-center justify-center"
              >
                0
              </button>
              <button
                type="button"
                disabled={loading || success || password.length === 0}
                onClick={handleKeypadBackspace}
                className="h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 active:scale-95 text-zinc-600 dark:text-zinc-400 text-sm font-bold transition-all flex items-center justify-center"
                title="Backspace"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* Cancel & Manual input toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleDownload()}
                disabled={loading || success || password.length < 5}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
              >
                {loading ? 'Verifying...' : success ? 'Unlocked' : 'Unlock Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blueprint Sub-modals */}
      {showHistory && <BlueprintHistoryModal onClose={() => setShowHistory(false)} />}
      {showDashboard && <BlueprintDashboardModal onClose={() => setShowDashboard(false)} />}
    </div>
  );
}
