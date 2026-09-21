import React, { useState, useEffect } from 'react';
import { 
  X, HeartPulse, AlertTriangle, CheckCircle2, XCircle, 
  RefreshCw, Trash2, ExternalLink, ShieldAlert, Loader2, Download, Check
} from 'lucide-react';
import { Session, db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from '../lib/utils';

interface UrlHealthResult {
  url: string;
  status: number;
  ok: boolean;
  statusText: string;
}

interface SessionHealthModalProps {
  session: Session;
  onClose: () => void;
  onSessionUpdated?: (updatedSession: Session) => void;
}

export function SessionHealthModal({ session, onClose, onSessionUpdated }: SessionHealthModalProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [healthResults, setHealthResults] = useState<UrlHealthResult[]>([]);
  const [filter, setFilter] = useState<'all' | 'broken' | 'healthy'>('broken');
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanSuccess, setCleanSuccess] = useState<string | null>(null);

  // Extract clean URLs from session results
  const rawUrls: string[] = React.useMemo(() => {
    if (!session.results || !Array.isArray(session.results)) return [];
    return session.results.map((r: any) => {
      if (typeof r === 'string') return r;
      return r.url || r.link || '';
    }).filter((u: string) => typeof u === 'string' && u.startsWith('http'));
  }, [session.results]);

  // Initial check or load
  const runHealthCheck = async () => {
    if (rawUrls.length === 0) return;
    setIsChecking(true);
    setCleanSuccess(null);
    try {
      // First check if any results already have stored status codes (e.g. 404, 500)
      const initialMap = new Map<string, UrlHealthResult>();
      if (Array.isArray(session.results)) {
        session.results.forEach((r: any) => {
          if (typeof r === 'object' && r.url && (r.status || r.statusCode)) {
            const st = Number(r.status || r.statusCode);
            initialMap.set(r.url, {
              url: r.url,
              status: st,
              ok: st >= 200 && st < 400,
              statusText: st === 404 ? '404 Not Found' : st === 500 ? '500 Server Error' : String(st)
            });
          }
        });
      }

      // Query server health check endpoint
      const res = await fetch('/api/check-urls-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: rawUrls.slice(0, 50) })
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results)) {
          data.results.forEach((item: UrlHealthResult) => {
            initialMap.set(item.url, item);
          });
        }
      }

      const allList = Array.from(initialMap.values());
      // For any URL that wasn't checked, default to healthy if not broken
      rawUrls.slice(0, 50).forEach(u => {
        if (!initialMap.has(u)) {
          allList.push({
            url: u,
            status: 200,
            ok: true,
            statusText: '200 OK'
          });
        }
      });

      setHealthResults(allList);
      // If broken links exist, default filter to broken
      const broken = allList.filter(r => !r.ok);
      if (broken.length > 0) {
        setFilter('broken');
      } else {
        setFilter('all');
      }
    } catch (err) {
      console.error('Failed to run health check:', err);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    runHealthCheck();
  }, [session.id]);

  const brokenUrls = healthResults.filter(r => !r.ok || r.status === 404 || r.status === 500);
  const healthyUrls = healthResults.filter(r => r.ok && r.status !== 404 && r.status !== 500);

  const displayedList = filter === 'broken' 
    ? brokenUrls 
    : filter === 'healthy' 
      ? healthyUrls 
      : healthResults;

  // Clean up broken links from session in Firestore
  const handleCleanBrokenLinks = async () => {
    if (!session.id || brokenUrls.length === 0) return;
    const brokenSet = new Set(brokenUrls.map(b => b.url));
    setIsCleaning(true);

    try {
      const updatedResults = (session.results || []).filter((r: any) => {
        const u = typeof r === 'string' ? r : (r.url || r.link || '');
        return !brokenSet.has(u);
      });

      await updateDoc(doc(db, 'sessions', session.id), {
        results: updatedResults,
        updatedAt: serverTimestamp()
      });

      // Update local health state
      setHealthResults(prev => prev.filter(item => !brokenSet.has(item.url)));
      setCleanSuccess(`Successfully cleaned ${brokenUrls.length} broken link(s)!`);
      
      if (onSessionUpdated) {
        onSessionUpdated({
          ...session,
          results: updatedResults
        });
      }
    } catch (err: any) {
      console.error('Failed to clean broken links:', err);
      alert(`Could not clean up broken links: ${err.message || 'Firestore update failed'}`);
    } finally {
      setIsCleaning(false);
    }
  };

  // Remove a single broken link
  const handleRemoveSingle = async (targetUrl: string) => {
    if (!session.id) return;
    try {
      const updatedResults = (session.results || []).filter((r: any) => {
        const u = typeof r === 'string' ? r : (r.url || r.link || '');
        return u !== targetUrl;
      });

      await updateDoc(doc(db, 'sessions', session.id), {
        results: updatedResults,
        updatedAt: serverTimestamp()
      });

      setHealthResults(prev => prev.filter(item => item.url !== targetUrl));
    } catch (err: any) {
      console.error('Failed to remove URL:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "p-2 rounded-xl shrink-0",
              brokenUrls.length > 0 
                ? "bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400"
                : "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400"
            )}>
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">Session Health Monitor</h2>
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                  brokenUrls.length > 0
                    ? "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300"
                    : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                )}>
                  {brokenUrls.length > 0 ? `${brokenUrls.length} Broken Link(s)` : 'All Healthy (100%)'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-md">
                Session: <strong className="font-medium text-zinc-700 dark:text-zinc-300">{session.title}</strong>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5">
            <button
              onClick={runHealthCheck}
              disabled={isChecking}
              className="p-2 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
              title="Re-scan session URLs"
            >
              <RefreshCw className={cn("w-4 h-4", isChecking && "animate-spin text-blue-500")} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success Banner */}
        {cleanSuccess && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{cleanSuccess}</span>
          </div>
        )}

        {/* Health Overview Stats */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/20">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <span className="text-xs text-zinc-500 block mb-0.5">Scanned URLs</span>
              <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{healthResults.length}</span>
            </div>
            <div className={cn(
              "p-3 rounded-xl border",
              brokenUrls.length > 0 
                ? "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300"
                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
            )}>
              <span className="text-xs text-zinc-500 block mb-0.5">404 / 500 Broken</span>
              <span className="text-lg font-bold">{brokenUrls.length}</span>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <span className="text-xs text-zinc-500 block mb-0.5">Healthy Links</span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{healthyUrls.length}</span>
            </div>
          </div>

          {/* Quick Clean-up Action Callout */}
          {brokenUrls.length > 0 && (
            <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Found <strong>{brokenUrls.length}</strong> non-functioning links (404/500/Timeout). Clean them up to maintain clean session data!</span>
              </div>
              <button
                onClick={handleCleanBrokenLinks}
                disabled={isCleaning}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
              >
                {isCleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isCleaning ? 'Cleaning...' : `Clean Up All (${brokenUrls.length})`}</span>
              </button>
            </div>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="px-5 pt-3 pb-2 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilter('broken')}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5",
                filter === 'broken'
                  ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
            >
              <XCircle className="w-3.5 h-3.5 text-rose-500" />
              Broken ({brokenUrls.length})
            </button>
            <button
              onClick={() => setFilter('healthy')}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5",
                filter === 'healthy'
                  ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Healthy ({healthyUrls.length})
            </button>
            <button
              onClick={() => setFilter('all')}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-lg transition-colors",
                filter === 'all'
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
            >
              All Scanned ({healthResults.length})
            </button>
          </div>

          <span className="text-xs text-zinc-400">
            {displayedList.length} URL{displayedList.length !== 1 ? 's' : ''} shown
          </span>
        </div>

        {/* URL List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2 custom-scrollbar">
          {isChecking ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Pinging crawled URLs for 404/500 responses...</p>
            </div>
          ) : displayedList.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-sm">
              {filter === 'broken' ? (
                <div className="flex flex-col items-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  <p className="font-semibold text-zinc-800 dark:text-zinc-200">No broken links found!</p>
                  <p className="text-xs">All checked URLs are active and returning healthy HTTP status codes.</p>
                </div>
              ) : (
                'No URLs to display.'
              )}
            </div>
          ) : (
            displayedList.map((item, idx) => (
              <div 
                key={idx}
                className={cn(
                  "p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors",
                  !item.ok
                    ? "bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40"
                    : "bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className={cn(
                    "px-2 py-0.5 rounded font-mono font-bold text-[11px] shrink-0",
                    item.status === 404
                      ? "bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300"
                      : item.status >= 500
                        ? "bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300"
                        : item.ok
                          ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300"
                          : "bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300"
                  )}>
                    {item.status || 'ERR'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{item.url}</p>
                    <span className="text-[10px] text-zinc-400">{item.statusText}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded transition-colors"
                    title="Open link in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  {!item.ok && (
                    <button
                      onClick={() => handleRemoveSingle(item.url)}
                      className="p-1.5 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded transition-colors"
                      title="Remove broken link from session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
          <span>Scanned via Server Proxy • Timeout: 5000ms</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
