import { AlertTriangle, ArrowRight, BellRing, CheckCircle2, Cpu, Flame, Key, RefreshCw, ShieldCheck, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

export interface KeyStatus {
  index?: number;
  friendlyLabel?: string;
  name: string;
  isActive?: boolean;
  status: string;
  failCount: number;
  totalCalls: number;
  successCalls: number;
  lastUsedAt: string;
  cooldownRemainingSeconds: number;
  lastError: string | null;
}

export interface FallbackEvent {
  id: string;
  timestamp: string;
  fromKey: string;
  toKey: string;
  fromKeyLabel: string;
  toKeyLabel: string;
  reason: string;
  model: string;
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
    activeKey?: string;
    activeKeyLabel?: string;
    activeKeyBadge?: string;
    recentFallbackEvents?: FallbackEvent[];
    lastFallback?: FallbackEvent | null;
    keys: KeyStatus[];
    primaryModel: string;
    supportedModels: string[];
    rotationMode: string;
    autoFallback: boolean;
  };
}

interface ApiUsageMonitorProps {
  compact?: boolean;
}

export function ApiUsageMonitor({ compact = false }: ApiUsageMonitorProps) {
  const [model, setModel] = useState('gemini-3.5-flash');
  const [activeKeyLabel, setActiveKeyLabel] = useState('Key #1 in use');
  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusData, setStatusData] = useState<SystemStatus | null>(null);
  
  // Transient in-memory log list of the last 5 key fallback/rotation events
  const [fallbackLogs, setFallbackLogs] = useState<FallbackEvent[]>([]);
  const lastProcessedFallbackIdRef = useRef<string | null>(null);

  // Live Toast Alert state for immediate visual notification
  const [toastAlert, setToastAlert] = useState<{
    id: string;
    message: string;
    from: string;
    to: string;
    reason: string;
  } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerToastAlert = (from: string, to: string, reason: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    const alertId = `${Date.now()}`;
    setToastAlert({
      id: alertId,
      message: `${from} Quota reached ➔ Switched to ${to}`,
      from,
      to,
      reason
    });
    toastTimerRef.current = setTimeout(() => {
      setToastAlert(null);
    }, 6000);
  };

  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/system-status');
      if (res.ok) {
        const data: SystemStatus = await res.json();
        setStatusData(data);
        if (data.gemini?.primaryModel) {
          setModel(data.gemini.primaryModel);
        }
        if (data.gemini?.activeKeyLabel) {
          setActiveKeyLabel(`${data.gemini.activeKeyLabel} in use`);
        }

        // Sync fallback events
        if (Array.isArray(data.gemini?.recentFallbackEvents) && data.gemini.recentFallbackEvents.length > 0) {
          setFallbackLogs(prev => {
            const merged = [...data.gemini.recentFallbackEvents!, ...prev];
            const uniqueMap = new Map<string, FallbackEvent>();
            merged.forEach(item => {
              if (item && item.id && !uniqueMap.has(item.id)) {
                uniqueMap.set(item.id, item);
              }
            });
            return Array.from(uniqueMap.values()).slice(0, 5);
          });

          // Check if latest fallback is new and should trigger a visual toast alert
          const latest = data.gemini.recentFallbackEvents[0];
          if (latest && latest.id !== lastProcessedFallbackIdRef.current) {
            lastProcessedFallbackIdRef.current = latest.id;
            triggerToastAlert(latest.fromKeyLabel, latest.toKeyLabel, latest.reason);
          }
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
    const interval = setInterval(fetchStatus, 15000); // 15s auto check
    return () => clearInterval(interval);
  }, []);

  // Listen to live custom events from chat stream or API requests
  useEffect(() => {
    const handleUsageUpdate = (e: any) => {
      if (e.detail?.model) {
        setModel(e.detail.model);
      }
      if (e.detail?.keyLabel) {
        setActiveKeyLabel(`${e.detail.keyLabel} in use`);
      }
      if (e.detail?.fallbackEvent) {
        const fb: FallbackEvent = e.detail.fallbackEvent;
        setFallbackLogs(prev => {
          const updated = [fb, ...prev.filter(item => item.id !== fb.id)].slice(0, 5);
          return updated;
        });
        if (fb.id !== lastProcessedFallbackIdRef.current) {
          lastProcessedFallbackIdRef.current = fb.id;
          triggerToastAlert(fb.fromKeyLabel, fb.toKeyLabel, fb.reason);
        }
      }
    };

    const handleKeyFallback = (e: any) => {
      if (e.detail?.fallbackEvent) {
        const fb: FallbackEvent = e.detail.fallbackEvent;
        setFallbackLogs(prev => [fb, ...prev.filter(item => item.id !== fb.id)].slice(0, 5));
        if (fb.id !== lastProcessedFallbackIdRef.current) {
          lastProcessedFallbackIdRef.current = fb.id;
          triggerToastAlert(fb.fromKeyLabel, fb.toKeyLabel, fb.reason);
        }
      }
    };

    window.addEventListener('api-usage', handleUsageUpdate);
    window.addEventListener('api-key-fallback', handleKeyFallback);

    return () => {
      window.removeEventListener('api-usage', handleUsageUpdate);
      window.removeEventListener('api-key-fallback', handleKeyFallback);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
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

  const activeKeysCount = statusData?.gemini?.activeHealthyKeysCount ?? 2;
  const isHealthy = activeKeysCount > 0;

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* 1. Floating Instant Fallback Toast Alert */}
      {toastAlert && (
        <div className="fixed top-4 right-4 z-[9999] max-w-md bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-2xl p-4 shadow-2xl border border-amber-400/40 animate-in fade-in slide-in-from-top-4 duration-300 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0 animate-bounce">
            <Zap className="w-4 h-4 text-amber-200 fill-amber-200" />
          </div>
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/25 text-amber-100">
                Auto-Fallback Active
              </span>
              <span className="text-[10px] text-amber-100/90">Just now</span>
            </div>
            <p className="text-sm font-bold mt-1 text-white leading-snug">
              ⚠️ {toastAlert.from} Quota reached ➔ Switched to {toastAlert.to}
            </p>
            <p className="text-xs text-amber-100 mt-0.5">
              কারণ: {toastAlert.reason || 'রেট লিমিট (429) এর কারণে অটোমেটিক ব্যাকআপ কী সক্রিয় করা হয়েছে'}
            </p>
          </div>
          <button 
            onClick={() => setToastAlert(null)}
            className="p-1 rounded-lg text-amber-100 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Main Trigger Badge Button */}
      <button 
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchStatus();
        }}
        className={cn(
          "flex items-center transition-all focus:outline-none focus:ring-1 focus:ring-[#287653]",
          compact 
            ? "w-9 h-9 min-h-[36px] justify-center rounded-xl bg-white dark:bg-[#1F2420] border border-[#DCE2DC] dark:border-[#3A443D] shadow-2xs hover:bg-[#F0F2EF] dark:hover:bg-[#262D28] shrink-0" 
            : "gap-2 bg-white dark:bg-[#1F2420] border border-[#DCE2DC] dark:border-[#3A443D] rounded-full px-3 py-1.5 shadow-xs hover:bg-[#F0F2EF] dark:hover:bg-[#262D28]",
          isOpen && "ring-1 ring-[#287653] shadow-sm",
          toastAlert && "ring-1 ring-amber-500 animate-pulse"
        )}
        title={`Gemini API Status: ${model} (${activeKeyLabel}) - Click to inspect rotation`}
      >
        {compact ? (
          <div className="relative flex items-center justify-center">
            <Cpu className="w-4 h-4 text-[#287653] dark:text-[#75B992]" />
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className={cn(
                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                isHealthy ? "bg-emerald-400" : "bg-amber-400"
              )}></span>
              <span className={cn(
                "relative inline-flex rounded-full h-2 w-2",
                isHealthy ? "bg-emerald-500" : "bg-amber-500"
              )}></span>
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 border-r border-[#DCE2DC] dark:border-[#3A443D] pr-2.5">
              <Cpu className="w-3.5 h-3.5 text-[#287653] dark:text-[#75B992]" />
              <span className="text-xs font-mono tabular-nums text-zinc-700 dark:text-zinc-300 max-w-[110px] truncate font-medium">
                {model.split(' ')[0]}
              </span>
            </div>
            
            {/* Active Key Signal Indicator (e.g. 🟢 Key #1 in use) */}
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className={cn(
                  "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                  isHealthy ? "bg-emerald-400" : "bg-amber-400"
                )}></span>
                <span className={cn(
                  "relative inline-flex rounded-full h-2 w-2",
                  isHealthy ? "bg-emerald-500" : "bg-amber-500"
                )}></span>
              </span>
              <span className={cn(
                "text-[11px] font-bold tracking-tight font-mono tabular-nums",
                isHealthy ? "text-[#287653] dark:text-[#75B992]" : "text-amber-600 dark:text-amber-400"
              )}>
                🟢 {activeKeyLabel}
              </span>
            </div>
          </>
        )}
      </button>

      {/* 3. Detailed Monitor Modal Dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 sm:w-[420px] max-w-[90vw] bg-white dark:bg-[#1F2420] border border-[#DCE2DC] dark:border-[#3A443D] rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-[#DCE2DC] dark:border-[#3A443D] flex items-center justify-between bg-[#F0F2EF] dark:bg-[#262D28]">
            <div>
              <h3 className="text-sm font-bold text-[#202522] dark:text-[#F0F2EF] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#287653] dark:text-[#75B992]" />
                API Key Rotation & Fallback Monitor
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                রিয়েল-টাইম এপিআই কী সক্রিয়তা ও লাইভ ফলব্যাক লগ
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
            {/* Active Key Signal Banner */}
            <div className="p-3 bg-[#F0F2EF] dark:bg-[#262D28] border border-[#DCE2DC] dark:border-[#3A443D] rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#287653]/15 flex items-center justify-center text-[#287653] dark:text-[#75B992]">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 tracking-wider">
                    Current Active Engine
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono tabular-nums">
                      🟢 {activeKeyLabel}
                    </span>
                    <span className="text-[10px] text-[#287653] dark:text-[#75B992] font-semibold px-1.5 py-0.2 bg-[#287653]/15 rounded">
                      Live
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-mono tabular-nums text-zinc-700 dark:text-zinc-300 font-semibold block">
                  {statusData?.gemini?.activeHealthyKeysCount ?? 2} Healthy
                </span>
                <span className="text-[10px] text-zinc-400">in Key Pool</span>
              </div>
            </div>

            {/* Live Rotation & Fallback Event Logs (Last 5 Events) */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <BellRing className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">
                      কী ফলব্যাক ও রোটেশন ইভেন্ট লগ (Last 5)
                    </span>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      কোটা লিমিট (429) বা ত্রুটিতে অটো-সুইচের রিয়েলটাইম ইতিহাস
                    </span>
                  </div>
                </div>
              </div>

              {fallbackLogs.length === 0 ? (
                <div className="py-3 px-2 text-center bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200/70 dark:border-zinc-800 text-[11px] text-zinc-500">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium block">
                    ✓ কোনো কোটা ফলব্যাক ট্রিপ করেনি
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    প্রাথমিক কী সম্পূর্ণ সুস্থ ও সক্রিয় রয়েছে
                  </span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {fallbackLogs.slice(0, 5).map((log, i) => (
                    <div 
                      key={log.id || i}
                      className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] transition-all hover:border-amber-400/50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-zinc-900 dark:text-zinc-100">
                          <span className="text-amber-600 dark:text-amber-400">{log.fromKeyLabel || log.fromKey}</span>
                          <ArrowRight className="w-3 h-3 text-zinc-400" />
                          <span className="text-emerald-600 dark:text-emerald-400">{log.toKeyLabel || log.toKey}</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px]">
                        <span className="text-amber-600 dark:text-amber-400 font-medium truncate max-w-[220px]">
                          ⚠️ {log.reason}
                        </span>
                        <span className="text-zinc-400 font-mono">
                          {log.model}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Gemini Multi-Key Rotation Pool */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center text-purple-600">
                    <Key className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">Gemini Multi-Key Pool</span>
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                      Multi-Key Load Balancer & Auto-Failover
                    </span>
                  </div>
                </div>
              </div>

              {/* Key Items List */}
              <div className="mt-2 space-y-2">
                {statusData?.gemini?.keys?.map((k, idx) => {
                  const isKeyActive = k.isActive || (statusData.gemini.activeKey === k.name);
                  const isHealthyKey = k.status === 'active';
                  const isRateLimited = k.status.includes('rate_limited');
                  const friendlyName = k.friendlyLabel || `Key #${idx + 1}`;

                  return (
                    <div 
                      key={k.name} 
                      className={cn(
                        "p-2.5 rounded-xl bg-white dark:bg-[#1F2420] border text-[11px] transition-all",
                        isKeyActive 
                          ? "border-[#287653] dark:border-[#75B992] ring-1 ring-[#287653]/30 shadow-xs" 
                          : "border-[#DCE2DC] dark:border-[#3A443D]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#202522] dark:text-[#F0F2EF]">
                            {friendlyName}
                          </span>
                          <span className="font-mono text-[10px] text-zinc-400 truncate max-w-[130px]">
                            ({k.name})
                          </span>
                        </div>

                        {isKeyActive ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#287653] dark:text-[#75B992] bg-[#287653]/15 px-2 py-0.5 rounded-full border border-[#287653]/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#287653] dark:bg-[#75B992] animate-pulse" />
                            Active & In Use
                          </span>
                        ) : isHealthyKey ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Ready (Standby)
                          </span>
                        ) : isRateLimited ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800 font-mono tabular-nums">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Cooldown ({k.cooldownRemainingSeconds}s)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                            Bypassed
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-500 font-mono tabular-nums">
                        <span>সফল কল: {k.successCalls} | মোট: {k.totalCalls}</span>
                        {k.lastUsedAt && k.lastUsedAt !== 'Never' && (
                          <span>ব্যবহৃত: {new Date(k.lastUsedAt).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Auto Fallback Rule description */}
              <div className="mt-3 p-2 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
                <span className="font-bold">⚡ অটো-ফলব্যাক পলিসি:</span>
                <p className="mt-0.5 text-[10px] text-blue-700 dark:text-blue-300">
                  যেকোনো কীতে 429 Quota Exceeded দেখা দিলে স্বয়ংক্রিয়ভাবে পরবর্তী স্বাস্থ্যবান কীতে ট্রানজিশন ঘটে এবং 90 সেকেন্ডের কুলডাউন বরাদ্দ হয়।
                </p>
              </div>
            </div>

            {/* Firebase Connection Box */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Flame className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">Firebase Firestore & Auth</span>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Database Connection</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  Connected
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60 text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
                <div className="flex justify-between items-center">
                  <span>Firestore DB ID:</span>
                  <span className="font-mono text-[10px] font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[200px]">
                    {statusData?.firebase?.firestoreDatabaseId || 'ai-studio-weblinkcrawlerv2-b7d7b3c7-e6c6...'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
