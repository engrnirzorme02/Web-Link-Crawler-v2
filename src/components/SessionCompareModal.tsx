import React, { useState, useMemo } from 'react';
import { Session } from '../lib/firebase';
import { 
  X, GitCompare, Download, Copy, Check, Search, ExternalLink, 
  Layers, Globe, Calendar, ArrowRight, ArrowLeftRight, CheckCircle2,
  AlertCircle, Sparkles, Filter
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getMillis, cn } from '../lib/utils';

interface SessionCompareModalProps {
  sessionA: Session;
  sessionB: Session;
  onClose: () => void;
}

type DiffFilter = 'side-by-side' | 'common' | 'only-a' | 'only-b' | 'all';

function extractUrlString(item: any): string {
  if (!item) return '';
  if (typeof item === 'string') return item.trim();
  if (item.url) return String(item.url).trim();
  if (item.href) return String(item.href).trim();
  if (item.link) return String(item.link).trim();
  return JSON.stringify(item);
}

export function SessionCompareModal({ sessionA, sessionB, onClose }: SessionCompareModalProps) {
  const [activeTab, setActiveTab] = useState<DiffFilter>('side-by-side');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedState, setCopiedState] = useState<string | null>(null);

  // Extract raw URLs/strings
  const listA = useMemo(() => {
    return (sessionA.results || []).map(extractUrlString).filter(Boolean);
  }, [sessionA]);

  const listB = useMemo(() => {
    return (sessionB.results || []).map(extractUrlString).filter(Boolean);
  }, [sessionB]);

  const setA = useMemo(() => new Set(listA), [listA]);
  const setB = useMemo(() => new Set(listB), [listB]);

  // Calculations
  const commonUrls = useMemo(() => {
    return Array.from(setA).filter(u => setB.has(u));
  }, [setA, setB]);

  const onlyInA = useMemo(() => {
    return Array.from(setA).filter(u => !setB.has(u));
  }, [setA, setB]);

  const onlyInB = useMemo(() => {
    return Array.from(setB).filter(u => !setA.has(u));
  }, [setA, setB]);

  const unionUrls = useMemo(() => {
    return Array.from(new Set([...listA, ...listB]));
  }, [listA, listB]);

  // Overlap similarity
  const similarityScore = useMemo(() => {
    if (unionUrls.length === 0) return 0;
    return Math.round((commonUrls.length / unionUrls.length) * 100);
  }, [commonUrls.length, unionUrls.length]);

  // Filtered lists based on search
  const filteredCommon = useMemo(() => {
    if (!searchQuery.trim()) return commonUrls;
    const q = searchQuery.toLowerCase();
    return commonUrls.filter(u => u.toLowerCase().includes(q));
  }, [commonUrls, searchQuery]);

  const filteredOnlyInA = useMemo(() => {
    if (!searchQuery.trim()) return onlyInA;
    const q = searchQuery.toLowerCase();
    return onlyInA.filter(u => u.toLowerCase().includes(q));
  }, [onlyInA, searchQuery]);

  const filteredOnlyInB = useMemo(() => {
    if (!searchQuery.trim()) return onlyInB;
    const q = searchQuery.toLowerCase();
    return onlyInB.filter(u => u.toLowerCase().includes(q));
  }, [onlyInB, searchQuery]);

  const handleCopyList = (items: string[], label: string) => {
    navigator.clipboard.writeText(items.join('\n'));
    setCopiedState(label);
    setTimeout(() => setCopiedState(null), 2500);
  };

  const handleExportCSV = () => {
    const rows = [
      ['URL', `In ${sessionA.title || 'Session A'}`, `In ${sessionB.title || 'Session B'}`, 'Comparison Status']
    ];

    unionUrls.forEach(url => {
      const inA = setA.has(url);
      const inB = setB.has(url);
      let status = 'Unknown';
      if (inA && inB) status = 'Common in Both';
      else if (inA) status = `Unique to ${sessionA.title || 'Session A'}`;
      else if (inB) status = `Unique to ${sessionB.title || 'Session B'}`;

      rows.push([
        `"${url.replace(/"/g, '""')}"`,
        inA ? 'YES' : 'NO',
        inB ? 'YES' : 'NO',
        `"${status}"`
      ]);
    });

    const csvContent = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-diff-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Session Comparison & Diff
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {similarityScore}% Match Overlap
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Compare extracted items, discover delta additions, and inspect differences side-by-side.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 shadow-xs transition-colors"
              title="Export complete diff table to CSV"
            >
              <Download className="w-3.5 h-3.5 text-zinc-500" />
              Export Diff (CSV)
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sessions Summary Cards */}
        <div className="px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/40 dark:bg-zinc-950/40 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Session A */}
          <div className="p-3 bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-900/50 rounded-xl shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                Session A (Primary)
              </span>
              <span className="text-xs font-medium text-zinc-400">
                {sessionA.createdAt ? formatDistanceToNow(sessionA.createdAt.toDate?.() || new Date(getMillis(sessionA.createdAt)), { addSuffix: true }) : ''}
              </span>
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm truncate" title={sessionA.title}>
              {sessionA.title || 'Untitled Session'}
            </h3>
            <p className="text-xs text-zinc-500 truncate mt-0.5" title={sessionA.url}>
              {sessionA.url || 'No URL specified'}
            </p>
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
              <span className="text-zinc-600 dark:text-zinc-400">
                Items: <strong className="text-zinc-900 dark:text-zinc-100">{listA.length}</strong>
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                Unique: <strong className="text-blue-600 dark:text-blue-400">{onlyInA.length}</strong>
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                Type: <span className="capitalize">{sessionA.type.replace('_', ' ')}</span>
              </span>
            </div>
          </div>

          {/* Session B */}
          <div className="p-3 bg-white dark:bg-zinc-900 border border-purple-200 dark:border-purple-900/50 rounded-xl shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                Session B (Comparison)
              </span>
              <span className="text-xs font-medium text-zinc-400">
                {sessionB.createdAt ? formatDistanceToNow(sessionB.createdAt.toDate?.() || new Date(getMillis(sessionB.createdAt)), { addSuffix: true }) : ''}
              </span>
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm truncate" title={sessionB.title}>
              {sessionB.title || 'Untitled Session'}
            </h3>
            <p className="text-xs text-zinc-500 truncate mt-0.5" title={sessionB.url}>
              {sessionB.url || 'No URL specified'}
            </p>
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
              <span className="text-zinc-600 dark:text-zinc-400">
                Items: <strong className="text-zinc-900 dark:text-zinc-100">{listB.length}</strong>
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                Unique: <strong className="text-purple-600 dark:text-purple-400">{onlyInB.length}</strong>
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                Type: <span className="capitalize">{sessionB.type.replace('_', ' ')}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Diff Tabs & Search Toolbar */}
        <div className="px-6 py-2.5 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-zinc-900">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('side-by-side')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                activeTab === 'side-by-side'
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Side-by-Side View
            </button>

            <button
              onClick={() => setActiveTab('common')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                activeTab === 'common'
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Common in Both ({commonUrls.length})
            </button>

            <button
              onClick={() => setActiveTab('only-a')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                activeTab === 'only-a'
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
            >
              Only in A ({onlyInA.length})
            </button>

            <button
              onClick={() => setActiveTab('only-b')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                activeTab === 'only-b'
                  ? "bg-purple-600 text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
            >
              Only in B ({onlyInB.length})
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-xs ml-auto">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter compared URLs..."
                className="w-full text-xs pl-8 pr-7 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-zinc-50 dark:bg-zinc-950">
          
          {activeTab === 'side-by-side' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
              
              {/* Column A */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col h-full shadow-xs">
                <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[200px]">
                      {sessionA.title || 'Session A'}
                    </span>
                    <span className="text-xs text-zinc-400">({listA.length})</span>
                  </div>
                  <button
                    onClick={() => handleCopyList(listA, 'all-a')}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {copiedState === 'all-a' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedState === 'all-a' ? 'Copied' : 'Copy All'}</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar max-h-[500px]">
                  {listA.length === 0 ? (
                    <div className="text-center py-10 text-xs text-zinc-400">No items in Session A</div>
                  ) : (
                    listA
                      .filter(u => !searchQuery || u.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((url, idx) => {
                        const isCommon = setB.has(url);
                        return (
                          <div 
                            key={`a-${idx}`}
                            className={cn(
                              "p-2 rounded-lg text-xs font-mono break-all flex items-start justify-between gap-2 border transition-colors",
                              isCommon
                                ? "bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                                : "bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50 text-blue-900 dark:text-blue-200 font-medium"
                            )}
                          >
                            <span className="line-clamp-2">{url}</span>
                            <span className={cn(
                              "text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded shrink-0",
                              isCommon
                                ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                                : "bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-300"
                            )}>
                              {isCommon ? 'Common' : '+ Unique'}
                            </span>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              {/* Column B */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col h-full shadow-xs">
                <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[200px]">
                      {sessionB.title || 'Session B'}
                    </span>
                    <span className="text-xs text-zinc-400">({listB.length})</span>
                  </div>
                  <button
                    onClick={() => handleCopyList(listB, 'all-b')}
                    className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                  >
                    {copiedState === 'all-b' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedState === 'all-b' ? 'Copied' : 'Copy All'}</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar max-h-[500px]">
                  {listB.length === 0 ? (
                    <div className="text-center py-10 text-xs text-zinc-400">No items in Session B</div>
                  ) : (
                    listB
                      .filter(u => !searchQuery || u.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((url, idx) => {
                        const isCommon = setA.has(url);
                        return (
                          <div 
                            key={`b-${idx}`}
                            className={cn(
                              "p-2 rounded-lg text-xs font-mono break-all flex items-start justify-between gap-2 border transition-colors",
                              isCommon
                                ? "bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                                : "bg-purple-50/70 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900/50 text-purple-900 dark:text-purple-200 font-medium"
                            )}
                          >
                            <span className="line-clamp-2">{url}</span>
                            <span className={cn(
                              "text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded shrink-0",
                              isCommon
                                ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                                : "bg-purple-200 dark:bg-purple-900 text-purple-800 dark:text-purple-300"
                            )}>
                              {isCommon ? 'Common' : '+ Unique'}
                            </span>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

            </div>
          )}

          {activeTab === 'common' && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 mb-3">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Showing {filteredCommon.length} common item(s) found in both sessions
                </span>
                <button
                  onClick={() => handleCopyList(filteredCommon, 'common')}
                  className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1"
                >
                  {copiedState === 'common' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedState === 'common' ? 'Copied to Clipboard' : 'Copy List'}</span>
                </button>
              </div>

              {filteredCommon.length === 0 ? (
                <div className="text-center py-12 text-zinc-400 text-sm">
                  {searchQuery ? 'No common items match your search.' : 'No overlapping items between these two sessions.'}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredCommon.map((url, i) => (
                    <div key={i} className="p-2.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg text-xs font-mono break-all text-zinc-800 dark:text-zinc-200 flex items-center justify-between gap-2">
                      <span>{url}</span>
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded font-bold shrink-0">
                        In Both
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'only-a' && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 mb-3">
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                  Showing {filteredOnlyInA.length} unique item(s) exclusive to {sessionA.title || 'Session A'}
                </span>
                <button
                  onClick={() => handleCopyList(filteredOnlyInA, 'only-a')}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  {copiedState === 'only-a' ? <Check className="w-3.5 h-3.5 text-blue-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedState === 'only-a' ? 'Copied to Clipboard' : 'Copy List'}</span>
                </button>
              </div>

              {filteredOnlyInA.length === 0 ? (
                <div className="text-center py-12 text-zinc-400 text-sm">
                  {searchQuery ? 'No items match your search.' : `No exclusive items for ${sessionA.title || 'Session A'}. All items overlap with Session B.`}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredOnlyInA.map((url, i) => (
                    <div key={i} className="p-2.5 bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 rounded-lg text-xs font-mono break-all text-blue-900 dark:text-blue-200 flex items-center justify-between gap-2">
                      <span>{url}</span>
                      <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold shrink-0">
                        Only in A
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'only-b' && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 mb-3">
                <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                  Showing {filteredOnlyInB.length} unique item(s) exclusive to {sessionB.title || 'Session B'}
                </span>
                <button
                  onClick={() => handleCopyList(filteredOnlyInB, 'only-b')}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                >
                  {copiedState === 'only-b' ? <Check className="w-3.5 h-3.5 text-purple-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedState === 'only-b' ? 'Copied to Clipboard' : 'Copy List'}</span>
                </button>
              </div>

              {filteredOnlyInB.length === 0 ? (
                <div className="text-center py-12 text-zinc-400 text-sm">
                  {searchQuery ? 'No items match your search.' : `No exclusive items for ${sessionB.title || 'Session B'}. All items overlap with Session A.`}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredOnlyInB.map((url, i) => (
                    <div key={i} className="p-2.5 bg-purple-50/50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40 rounded-lg text-xs font-mono break-all text-purple-900 dark:text-purple-200 flex items-center justify-between gap-2">
                      <span>{url}</span>
                      <span className="text-[10px] bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded font-bold shrink-0">
                        Only in B
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between text-xs text-zinc-500">
          <div>
            Total Unique Combined Items: <strong className="text-zinc-900 dark:text-zinc-100">{unionUrls.length}</strong>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
