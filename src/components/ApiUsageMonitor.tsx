import React, { useState, useEffect, useRef } from 'react';
import { Activity, AlertTriangle, Cpu, CheckCircle2, RefreshCw, X, Database, Key, ShieldCheck, Flame } from 'lucide-react';
import { cn } from '../lib/utils';

interface KeyStatus {
  name: string;
  status: string;
  failCount: number;
  totalCalls: number;
  successCalls: number;
  lastUsedAt: string;
  cooldownRemainingSeconds: number;
  lastError: string | null;
}

interface SystemStatus {
  status: string;
  timestamp: string;
  firebase: {
    connected: boolean;
    status: string;
    projectId?: string;
    firestoreDatabaseId?: string;
    authDomain?: string;
  };
  gemini: {
    connected: boolean;
    totalKeysConfigured: number;
    activeHealthyKeysCount: number;
    keys: KeyStatus[];
    primaryModel: string;
    supportedModels: string[];
    rotationMode: string;
    autoFallback: boolean;
  };
}

export function ApiUsageMonitor() {
  const [model, setModel] = useState('gemini-3.5-flash');
  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusData, setStatusData] = useState<SystemStatus | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/system-status');
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
        if (data.gemini?.primaryModel) {
          setModel(data.gemini.primaryModel);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch system status:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // 30s auto check
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleUsageUpdate = (e: any) => {
      if (e.detail?.model) {
        setModel(e.detail.model);
      }
    };
    window.addEventListener('api-usage', handleUsageUpdate);
    return () => {
      window.removeEventListener('api-usage', handleUsageUpdate);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const isGeminiConnected = statusData?.gemini?.connected ?? true;
  const isFirebaseConnected = statusData?.firebase?.connected ?? true;
  const activeKeysCount = statusData?.gemini?.activeHealthyKeysCount ?? 2;

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchStatus();
        }}
        className={cn(
          "flex items-center gap-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full px-3 py-1.5 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50",
          isOpen && "ring-2 ring-blue-500/50"
        )}
        title="Firebase ও Gemini API Key Rotation স্ট্যাটাস দেখতে ক্লিক করুন"
      >
        <div className="flex items-center gap-1.5 border-r border-zinc-200 dark:border-zinc-800 pr-2.5">
          <Cpu className="w-3.5 h-3.5 text-purple-600" />
          <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300 max-w-[130px] truncate font-medium">
            {model.split(' ')[0]}
          </span>
        </div>
        
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {activeKeysCount} Keys Active
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-88 sm:w-96 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-800/40">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Firebase & API Connection Monitor
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                রিয়েল-টাইম কানেকশন ও অটো-ফলব্যাক স্থিতি
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={fetchStatus} 
                disabled={isRefreshing}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                title="রিফ্রেশ করুন"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
              </button>
              <button 
                onClick={() => setIsOpen(false)} 
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
            {/* 1. Firebase Connection Box */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">Firebase Firestore & Auth</span>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Database Connection</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  Connected
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60 text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
                <div className="flex justify-between items-center">
                  <span>Firestore DB ID:</span>
                  <span className="font-mono text-[10px] font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[190px]" title="ai-studio-weblinkcrawlerv2-b7d7b3c7-e6c6-456d-8aff-b255ec8af9be">
                    {statusData?.firebase?.firestoreDatabaseId || 'ai-studio-weblinkcrawlerv2-b7d7b3c7-e6c6...'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Cloud Project:</span>
                  <span className="font-mono text-[10px] font-semibold text-zinc-800 dark:text-zinc-200">
                    {statusData?.firebase?.projectId || 'gen-lang-client-0186182351'}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Gemini Multi-Key Rotation Pool */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600">
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">Gemini API Multi-Key Pool</span>
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                      Random & Round-Robin + Auto Fallback
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                  Active
                </div>
              </div>

              {/* Key Items List */}
              <div className="mt-2.5 space-y-2">
                {statusData?.gemini?.keys?.map((k, idx) => {
                  const isHealthy = k.status === 'active';
                  const isRateLimited = k.status.includes('rate_limited');
                  const isInvalid = k.status === 'invalid';

                  return (
                    <div key={k.name} className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200 truncate max-w-[180px]">
                          {k.name}
                        </span>
                        {isHealthy ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Healthy / Ready
                          </span>
                        ) : isRateLimited ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Quota Limit ({k.cooldownRemainingSeconds}s)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                            Invalid / Auto-Bypassed
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
                        <span>সফল কল: {k.successCalls} | মোট: {k.totalCalls}</span>
                        {k.lastUsedAt !== 'Never' && (
                          <span>ব্যবহৃত: {new Date(k.lastUsedAt).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Auto Fallback Rule description */}
              <div className="mt-3 p-2 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
                <span className="font-bold">⚡ অটো-ফলব্যাক কন্ডিশন সক্রিয়:</span>
                <p className="mt-0.5 text-[10px] text-blue-700 dark:text-blue-300">
                  প্রতিটি রিকোয়েস্টে সুস্থ কীগুলোর মধ্যে র‍্যান্ডম বা এক এক করে কানেক্ট করা হয়। কোনো কীতে রেট লিমিট (429/Quota) দেখা দিলে তাৎক্ষণিক কুলডাউন সেট করে পরের অ্যাক্টিভ কীতে অটোমেটিক ফলব্যাক ঘটে।
                </p>
              </div>
            </div>

            {/* 3. Active AI Models */}
            <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1">
              <span>Primary Engine:</span>
              <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">gemini-3.5-flash (Backup: flash-lite)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
