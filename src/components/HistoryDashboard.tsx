import React, { useMemo, useState, useRef } from 'react';
import { Session, db } from '../lib/firebase';
import { 
  History, Play, FileText, Globe, Brain, ListOrdered, Calendar, 
  Layers, Download, RefreshCw, Trash2, Pin, Archive, 
  ArchiveRestore, Upload, Hash, CheckCircle2, Loader2, Database,
  CheckSquare, Square, Search, Sparkles, ArrowLeftRight, GitCompare, Plus, Tag, X,
  HeartPulse, AlertTriangle, BarChart2, PieChart as PieChartIcon, Activity, TrendingUp
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, 
  AreaChart, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid 
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { getMillis, cn } from '../lib/utils';
import { GlobalExport } from './GlobalExport';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { SessionCompareModal } from './SessionCompareModal';
import { TagEditModal } from './TagEditModal';
import { SessionHealthModal } from './SessionHealthModal';

// Inline SVG Mini-Trendline component showing volume progression next to saved session cards
function SessionVolumeTrendline({ results }: { results?: any[] }) {
  if (!results || results.length === 0) return null;
  const count = results.length;
  const numPoints = 7;
  const points: number[] = [];
  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    // Smooth volume progression curve
    const h = Math.round(3 + Math.pow(t, 0.65) * 12);
    points.push(h);
  }
  const width = 42;
  const height = 18;
  const step = width / (numPoints - 1);
  const pathD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${idx * step} ${height - p}`).join(' ');

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-900/40" title={`${count} links extracted (volume progression)`}>
      <svg className="w-9 h-3.5 overflow-visible" viewBox={`0 0 ${width} ${height}`}>
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-blue-500 dark:text-blue-400"
        />
      </svg>
      <span className="text-[10px] font-mono font-semibold text-blue-600 dark:text-blue-400">
        +{count}
      </span>
    </div>
  );
}

interface HistoryDashboardProps {
  sessions: Session[];
  userId?: string | null;
  onReRunSession: (session: Session) => void;
  onDeleteSession: (id: string) => void;
  onTogglePinSession?: (id: string, currentPinned?: boolean) => void;
  onToggleArchiveSession?: (id: string, currentArchived?: boolean) => void;
  onBulkDeleteSessions?: (ids: string[]) => void;
  onBulkArchiveSessions?: (ids: string[], archive: boolean) => void;
  onRecovery?: () => void;
}

export function HistoryDashboard({ 
  sessions, 
  userId,
  onReRunSession, 
  onDeleteSession, 
  onTogglePinSession,
  onToggleArchiveSession,
  onBulkDeleteSessions,
  onBulkArchiveSessions,
  onRecovery 
}: HistoryDashboardProps) {
  const [dashboardSubTab, setDashboardSubTab] = useState<'sessions' | 'analytics'>('sessions');
  const [viewTab, setViewTab] = useState<'active' | 'archived'>('active');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingTagsSession, setEditingTagsSession] = useState<Session | null>(null);
  const [compareSessions, setCompareSessions] = useState<[Session, Session] | null>(null);
  const [comparePickId, setComparePickId] = useState<string | null>(null);
  const [aiTaggingSessionId, setAiTaggingSessionId] = useState<string | null>(null);
  const [bulkAiTagging, setBulkAiTagging] = useState(false);
  const [healthCheckSession, setHealthCheckSession] = useState<Session | null>(null);
  const [filterOnlyBroken, setFilterOnlyBroken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getSessionBrokenCount = (s: Session) => {
    if (!s.results || !Array.isArray(s.results)) return 0;
    return s.results.filter((r: any) => {
      if (typeof r === 'object' && r !== null) {
        const st = Number(r.status || r.statusCode);
        if (st === 404 || st >= 500) return true;
        if (r.error || r.isBroken) return true;
      }
      return false;
    }).length;
  };

  const toggleSelectCard = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const validIds = historySessions.map(s => s.id!).filter(Boolean);
    if (selectedIds.size === validIds.length && validIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(validIds));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Permanently delete ${selectedIds.size} selected session(s)?`)) {
      if (onBulkDeleteSessions) {
        onBulkDeleteSessions(Array.from(selectedIds));
      } else {
        selectedIds.forEach(id => onDeleteSession(id));
      }
      setSelectedIds(new Set());
      setIsSelectMode(false);
    }
  };

  const handleBulkArchive = (archive: boolean) => {
    if (selectedIds.size === 0) return;
    if (onBulkArchiveSessions) {
      onBulkArchiveSessions(Array.from(selectedIds), archive);
    } else if (onToggleArchiveSession) {
      selectedIds.forEach(id => onToggleArchiveSession(id, !archive));
    }
    setSelectedIds(new Set());
    setIsSelectMode(false);
  };

  const handleDirectAiTag = async (session: Session, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!session.id) return;
    setAiTaggingSessionId(session.id);
    try {
      const sampleUrls = (session.results || []).slice(0, 25).map((r: any) => 
        typeof r === 'string' ? r : (r.url || r.title || '')
      ).filter(Boolean);

      const res = await fetch('/api/generate-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: session.title,
          url: session.url,
          type: session.type,
          sampleUrls,
          existingTags: session.tags || []
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tags) && data.tags.length > 0) {
          const merged = Array.from(new Set([...(session.tags || []), ...data.tags]));
          await updateDoc(doc(db, 'sessions', session.id), {
            tags: merged,
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (err) {
      console.error('Direct AI tagging failed:', err);
    } finally {
      setAiTaggingSessionId(null);
    }
  };

  const handleBulkAiTag = async () => {
    if (selectedIds.size === 0) return;
    setBulkAiTagging(true);
    try {
      const selectedList = historySessions.filter(s => s.id && selectedIds.has(s.id));
      for (const s of selectedList) {
        if (!s.id) continue;
        const sampleUrls = (s.results || []).slice(0, 20).map((r: any) => 
          typeof r === 'string' ? r : (r.url || r.title || '')
        ).filter(Boolean);

        const res = await fetch('/api/generate-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: s.title,
            url: s.url,
            type: s.type,
            sampleUrls,
            existingTags: s.tags || []
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.tags) && data.tags.length > 0) {
            const merged = Array.from(new Set([...(s.tags || []), ...data.tags]));
            await updateDoc(doc(db, 'sessions', s.id), {
              tags: merged,
              updatedAt: serverTimestamp()
            });
          }
        }
      }
    } catch (err) {
      console.error('Bulk AI tag error:', err);
    } finally {
      setBulkAiTagging(false);
      setSelectedIds(new Set());
      setIsSelectMode(false);
    }
  };

  const handleOpenCompareFromSelection = () => {
    const selected = historySessions.filter(s => s.id && selectedIds.has(s.id));
    if (selected.length === 2) {
      setCompareSessions([selected[0], selected[1]]);
    }
  };

  const handleQuickCompare = (session: Session, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!comparePickId) {
      setComparePickId(session.id || null);
    } else if (comparePickId === session.id) {
      setComparePickId(null);
    } else {
      const firstSession = sessions.find(s => s.id === comparePickId);
      if (firstSession) {
        setCompareSessions([firstSession, session]);
        setComparePickId(null);
      }
    }
  };

  // Filter sessions based on active/archived state, tags, broken health, and keyword search
  const historySessions = useMemo(() => {
    return sessions.filter(s => {
      const matchType = ['crawler', 'smart_crawler', 'bulk', 'extractor', 'url_processor', 'ai_chat'].includes(s.type);
      if (!matchType) return false;

      if (viewTab === 'active' && s.isArchived) return false;
      if (viewTab === 'archived' && !s.isArchived) return false;

      if (selectedTag && (!s.tags || !s.tags.includes(selectedTag))) return false;

      // Filter to only sessions with detected 404/500 broken links
      if (filterOnlyBroken && getSessionBrokenCount(s) === 0) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = s.title?.toLowerCase().includes(q);
        const matchUrl = s.url?.toLowerCase().includes(q);
        const matchType = s.type?.toLowerCase().includes(q);
        const matchTag = s.tags?.some(tag => tag.toLowerCase().includes(q));
        if (!matchTitle && !matchUrl && !matchType && !matchTag) return false;
      }

      return true;
    });
  }, [sessions, viewTab, selectedTag, searchQuery, filterOnlyBroken]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const relevant = sessions.filter(s => viewTab === 'active' ? !s.isArchived : !!s.isArchived);
    return Array.from(new Set(relevant.flatMap(s => s.tags || []).filter(Boolean)));
  }, [sessions, viewTab]);

  const handleExportAll = (format: 'json' | 'csv') => {
    let content = '';
    let type = '';
    let extension = format;
    
    // Combine all results from all sessions
    const allResults = historySessions.flatMap(s => {
      if (!s.results) return [];
      return s.results.map(r => {
        // Normalize string results to objects for consistency
        if (typeof r === 'string') return { url: r, source: s.url, sessionTitle: s.title, date: s.createdAt ? new Date(getMillis(s.createdAt)).toISOString() : '' };
        return { ...r, sessionTitle: s.title, date: s.createdAt ? new Date(getMillis(s.createdAt)).toISOString() : '' };
      });
    });

    if (allResults.length === 0) {
      alert('No extracted items to export.');
      return;
    }

    if (format === 'json') {
      content = JSON.stringify(allResults, null, 2);
      type = 'application/json;charset=utf-8;';
    } else {
      const keys = ['url', 'source', 'sessionTitle', 'date', 'status'];
      content = keys.join(',') + '\n' + allResults.map((r: any) => 
        keys.map(k => `"${(r[k] || '').toString().replace(/"/g, '""')}"`).join(',')
      ).join('\n');
      type = 'text/csv;charset=utf-8;';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `global-export-${new Date().toISOString().split('T')[0]}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleBackupAllJSON = () => {
    if (sessions.length === 0) {
      alert('No sessions available to backup.');
      return;
    }

    const backupData = {
      app: "Nirzor Web Tools & Crawler",
      version: "2.0",
      backupDate: new Date().toISOString(),
      totalSessions: sessions.length,
      sessions: sessions.map(s => ({
        id: s.id,
        title: s.title || 'Untitled Session',
        type: s.type,
        url: s.url || '',
        settings: s.settings || {},
        tags: s.tags || [],
        isPinned: !!s.isPinned,
        isArchived: !!s.isArchived,
        results: s.results || [],
        logs: s.logs || [],
        createdAt: s.createdAt ? new Date(getMillis(s.createdAt)).toISOString() : new Date().toISOString(),
        updatedAt: s.updatedAt ? new Date(getMillis(s.updatedAt)).toISOString() : new Date().toISOString(),
      }))
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `webtools-full-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    try {
      setIsRestoring(true);
      setRestoreStatus(null);
      const text = await file.text();
      const parsed = JSON.parse(text);

      let backupSessions: any[] = [];
      if (Array.isArray(parsed)) {
        backupSessions = parsed;
      } else if (parsed.sessions && Array.isArray(parsed.sessions)) {
        backupSessions = parsed.sessions;
      } else {
        throw new Error('Invalid format: Missing sessions array.');
      }

      if (backupSessions.length === 0) {
        alert('The backup file contains no sessions.');
        setIsRestoring(false);
        return;
      }

      let count = 0;
      for (const bSession of backupSessions) {
        await addDoc(collection(db, 'sessions'), {
          userId,
          title: bSession.title || 'Restored Session',
          type: bSession.type || 'crawler',
          url: bSession.url || '',
          settings: bSession.settings || {},
          tags: bSession.tags || [],
          isPinned: !!bSession.isPinned,
          isArchived: !!bSession.isArchived,
          results: bSession.results || [],
          logs: bSession.logs || [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        count++;
      }

      setRestoreStatus(`Successfully restored ${count} session(s)!`);
      setTimeout(() => setRestoreStatus(null), 5000);
    } catch (err: any) {
      console.error('Backup restore failed:', err);
      alert(`Failed to restore backup: ${err.message || 'Invalid JSON file'}`);
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const stats = useMemo(() => {
    const activeTotal = sessions.filter(s => !s.isArchived);
    const brokenSessions = sessions.filter(s => getSessionBrokenCount(s) > 0);
    return {
      totalCrawls: activeTotal.filter(s => ['crawler', 'smart_crawler', 'bulk'].includes(s.type)).length,
      totalLinks: activeTotal.reduce((acc, s) => acc + (s.results?.length || 0), 0),
      totalSmartCrawls: activeTotal.filter(s => s.type === 'smart_crawler').length,
      activeCount: activeTotal.length,
      archivedCount: sessions.filter(s => !!s.isArchived).length,
      brokenSessionsCount: brokenSessions.length,
    };
  }, [sessions]);

  // Analytics & Telemetry computations
  const tagDistributionData = useMemo(() => {
    const counts: Record<string, { count: number; links: number }> = {};
    sessions.forEach(s => {
      const linkCount = s.results?.length || 0;
      const tags = s.tags && s.tags.length > 0 ? s.tags : ['untagged'];
      tags.forEach(t => {
        if (!counts[t]) counts[t] = { count: 0, links: 0 };
        counts[t].count += 1;
        counts[t].links += linkCount;
      });
    });
    return Object.entries(counts)
      .map(([tag, val]) => ({
        tag: `#${tag}`,
        rawTag: tag,
        sessions: val.count,
        links: val.links
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [sessions]);

  const crawlFrequencyData = useMemo(() => {
    const dateMap: Record<string, { date: string; sessions: number; links: number }> = {};
    const sorted = [...sessions].sort((a, b) => getMillis(a.createdAt) - getMillis(b.createdAt));
    sorted.forEach(s => {
      const rawDate = s.createdAt ? new Date(getMillis(s.createdAt)) : new Date();
      const dateStr = rawDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (!dateMap[dateStr]) {
        dateMap[dateStr] = { date: dateStr, sessions: 0, links: 0 };
      }
      dateMap[dateStr].sessions += 1;
      dateMap[dateStr].links += (s.results?.length || 0);
    });
    const list = Object.values(dateMap);
    return list.length > 0 ? list.slice(-10) : [{ date: 'Today', sessions: 1, links: 0 }];
  }, [sessions]);

  const topDomainsData = useMemo(() => {
    const domainMap: Record<string, { domain: string; sessions: number; links: number }> = {};
    sessions.forEach(s => {
      if (s.url) {
        try {
          const host = new URL(s.url.startsWith('http') ? s.url : `https://${s.url}`).hostname.replace(/^www\./, '');
          if (host) {
            if (!domainMap[host]) domainMap[host] = { domain: host, sessions: 0, links: 0 };
            domainMap[host].sessions += 1;
            domainMap[host].links += (s.results?.length || 0);
          }
        } catch {}
      }
    });
    return Object.values(domainMap)
      .sort((a, b) => b.links - a.links)
      .slice(0, 6);
  }, [sessions]);

  const statusCodeData = useMemo(() => {
    let ok = 0;
    let redirects = 0;
    let notFound = 0;
    let serverErrors = 0;
    let other = 0;

    sessions.forEach(s => {
      if (Array.isArray(s.results)) {
        s.results.forEach((r: any) => {
          if (typeof r === 'object' && r !== null) {
            const st = Number(r.status || r.statusCode);
            if (st >= 200 && st < 300) ok++;
            else if (st >= 300 && st < 400) redirects++;
            else if (st === 404) notFound++;
            else if (st >= 500) serverErrors++;
            else if (st > 0) other++;
          }
        });
      }
    });

    const total = ok + redirects + notFound + serverErrors + other;
    if (total === 0) {
      return [
        { name: '200 OK', value: Math.max(1, stats.totalLinks || 1), color: '#10b981' }
      ];
    }
    return [
      { name: '200 OK', value: ok, color: '#10b981' },
      { name: '3xx Redirect', value: redirects, color: '#3b82f6' },
      { name: '404 Broken', value: notFound, color: '#f43f5e' },
      { name: '5xx Error', value: serverErrors, color: '#ef4444' },
      { name: 'Other', value: other, color: '#8b5cf6' }
    ].filter(d => d.value > 0);
  }, [sessions, stats.totalLinks]);

  const TAG_PALETTE = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#6366f1'];

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-zinc-950 p-4 md:p-8 overflow-y-auto custom-scrollbar pb-safe">
      <div className="max-w-5xl mx-auto w-full space-y-5">
        
        {/* Header with Global Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">History & Analytics Hub</h1>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">Lightweight telemetry, tag insights, and offline-ready session archives.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Backup All Button */}
            <button
              onClick={handleBackupAllJSON}
              className="min-h-[44px] flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all active:scale-[0.98]"
              title="Export all sessions with parameters and results into a single JSON backup file"
            >
              <Database className="w-4 h-4" />
              Backup All
            </button>

            {/* Restore from Backup Button */}
            <label className="min-h-[44px] flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl cursor-pointer transition-all border border-zinc-200 dark:border-zinc-700 active:scale-[0.98]">
              {isRestoring ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <Upload className="w-4 h-4 text-zinc-500" />}
              <span>{isRestoring ? 'Restoring...' : 'Restore'}</span>
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".json" 
                onChange={handleRestoreFile} 
                disabled={isRestoring || !userId}
                className="hidden" 
              />
            </label>

            <button
              onClick={() => handleExportAll('csv')}
              className="min-h-[44px] flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 rounded-xl transition-all active:scale-[0.98]"
              title="Export all extracted links to CSV"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>

            {onRecovery && (
              <button
                onClick={onRecovery}
                className="min-h-[44px] flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-xl transition-all active:scale-[0.98]"
                title="Force sync with Firestore server"
              >
                <RefreshCw className="w-4 h-4" />
                Sync
              </button>
            )}
          </div>
        </div>

        {restoreStatus && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{restoreStatus}</span>
          </div>
        )}

        {/* Dedicated Sub-Tab Segmented Switcher for Android Viewport */}
        <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
          <button
            onClick={() => setDashboardSubTab('sessions')}
            className={cn(
              "flex-1 min-h-[44px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all",
              dashboardSubTab === 'sessions'
                ? "bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            <History className="w-4 h-4" />
            <span>Session Logs ({stats.activeCount})</span>
          </button>

          <button
            onClick={() => setDashboardSubTab('analytics')}
            className={cn(
              "flex-1 min-h-[44px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all",
              dashboardSubTab === 'analytics'
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            <BarChart2 className="w-4 h-4" />
            <span>Insights & Telemetry Hub</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold",
              dashboardSubTab === 'analytics' ? "bg-white/20 text-white" : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
            )}>
              Live
            </span>
          </button>
        </div>

        {/* SUB-TAB 1: DEDICATED INSIGHTS & ANALYTICS HUB */}
        {dashboardSubTab === 'analytics' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Quick KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between">
                <span className="text-xs text-zinc-500 font-medium">Total Crawls</span>
                <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">{stats.totalCrawls}</span>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between">
                <span className="text-xs text-zinc-500 font-medium">Links Extracted</span>
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.totalLinks}</span>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between">
                <span className="text-xs text-zinc-500 font-medium">Active Tags</span>
                <span className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{tagDistributionData.length}</span>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between">
                <span className="text-xs text-zinc-500 font-medium">Health Status</span>
                <span className={cn(
                  "text-2xl font-bold mt-1",
                  stats.brokenSessionsCount > 0 ? "text-rose-600" : "text-emerald-600"
                )}>
                  {stats.brokenSessionsCount > 0 ? `${stats.brokenSessionsCount} Issues` : '100% Clean'}
                </span>
              </div>
            </div>

            {/* Recharts Card 1: Session Tag Distribution with Tap-to-Filter Support */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Hash className="w-4 h-4 text-blue-500" />
                    Session Tag Distribution
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Tap any tag bar or chip below to filter the session logs instantly.
                  </p>
                </div>
                {selectedTag && (
                  <button
                    onClick={() => setSelectedTag(null)}
                    className="self-start sm:self-auto min-h-[36px] px-2.5 py-1 text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 rounded-lg border border-rose-200 dark:border-rose-900/40 flex items-center gap-1 active:scale-95 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear Filter (#{selectedTag})
                  </button>
                )}
              </div>

              {tagDistributionData.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500 italic">
                  No tags detected. Add #tags to session titles to view distribution charts.
                </div>
              ) : (
                <>
                  <div className="h-56 sm:h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={tagDistributionData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                        onClick={(state: any) => {
                          if (state && state.activePayload && state.activePayload[0]) {
                            const raw = state.activePayload[0].payload.rawTag;
                            setSelectedTag(raw);
                            setDashboardSubTab('sessions');
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" strokeOpacity={0.4} />
                        <XAxis 
                          dataKey="tag" 
                          tick={{ fontSize: 11, fill: '#71717a' }} 
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                        />
                        <YAxis tick={{ fontSize: 11, fill: '#71717a' }} />
                        <Tooltip 
                          formatter={(value: any, name: any) => [value, name === 'sessions' ? 'Sessions' : 'Links']}
                          contentStyle={{ backgroundColor: '#18181b', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }}
                        />
                        <Bar 
                          dataKey="sessions" 
                          name="Sessions"
                          radius={[6, 6, 0, 0]}
                          cursor="pointer"
                        >
                          {tagDistributionData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={selectedTag === entry.rawTag ? '#2563eb' : TAG_PALETTE[index % TAG_PALETTE.length]} 
                              opacity={selectedTag && selectedTag !== entry.rawTag ? 0.35 : 1}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Tap-to-Filter Tag Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mr-1">Tap to Filter:</span>
                    {tagDistributionData.map((item, idx) => (
                      <button
                        key={item.rawTag}
                        onClick={() => {
                          setSelectedTag(selectedTag === item.rawTag ? null : item.rawTag);
                          setDashboardSubTab('sessions');
                        }}
                        className={cn(
                          "min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95",
                          selectedTag === item.rawTag
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                        )}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TAG_PALETTE[idx % TAG_PALETTE.length] }} />
                        <span>{item.tag}</span>
                        <span className="text-[10px] opacity-75 font-mono">({item.sessions})</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Recharts Card 2: Search & Crawl Telemetry (Crawl Frequency, Top Domains, Status Ratios) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              
              {/* Crawl Frequency Over Time (Area Chart) */}
              <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      Crawl Frequency & Volume Progression
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Session creation and discovered link accumulation over time.
                    </p>
                  </div>
                </div>

                <div className="h-56 sm:h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart 
                      data={crawlFrequencyData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient id="colorLinks" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" strokeOpacity={0.4} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717a' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#71717a' }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="links" 
                        name="Links Discovered" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorLinks)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* HTTP Status Code Ratios (Donut/Pie Chart) */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-indigo-500" />
                    HTTP Status Code Ratios
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Response code health distribution.
                  </p>
                </div>

                <div className="h-44 w-full my-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusCodeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={68}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {statusCodeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(val: any, name: any) => [val, name]}
                        contentStyle={{ backgroundColor: '#18181b', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  {statusCodeData.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-zinc-600 dark:text-zinc-400 font-medium">{s.name}</span>
                      </div>
                      <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Crawled Domains Card */}
              {topDomainsData.length > 0 && (
                <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs">
                  <h3 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-1">
                    <Globe className="w-4 h-4 text-blue-500" />
                    Top Crawled Target Domains
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                    Most frequently crawled website hosts and their aggregated output link volumes.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {topDomainsData.map((item, i) => (
                      <div key={item.domain} className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold text-[10px] flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                            {item.domain}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md shrink-0">
                          {item.links} links
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* SUB-TAB 2: SESSION ARCHIVES & MANAGEMENT */}
        {dashboardSubTab === 'sessions' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Stats Grid with Session Health Indicator */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Crawls</span>
                  <Globe className="w-4 h-4 text-blue-500" />
                </div>
                <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalCrawls}</span>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Extracted Links</span>
                  <ListOrdered className="w-4 h-4 text-emerald-500" />
                </div>
                <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalLinks}</span>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Smart AI Crawls</span>
                  <Brain className="w-4 h-4 text-purple-500" />
                </div>
                <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalSmartCrawls}</span>
              </div>

              {/* Session Health Indicator Card */}
              <div 
                onClick={() => setFilterOnlyBroken(!filterOnlyBroken)}
                className={cn(
                  "border rounded-xl p-3.5 transition-all cursor-pointer relative group",
                  stats.brokenSessionsCount > 0
                    ? "bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 hover:border-rose-400"
                    : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-emerald-400"
                )}
                title={stats.brokenSessionsCount > 0 ? "Click to filter sessions with 404/500 broken links" : "All crawled sessions are healthy"}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Session Health</span>
                  <div className={cn(
                    "p-1 rounded-md",
                    stats.brokenSessionsCount > 0 ? "bg-rose-100 dark:bg-rose-900/40 text-rose-600" : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600"
                  )}>
                    <HeartPulse className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className={cn(
                    "text-xl font-bold",
                    stats.brokenSessionsCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                  )}>
                    {stats.brokenSessionsCount > 0 ? `${stats.brokenSessionsCount} Issues` : '100%'}
                  </span>
                  <span className="text-[10px] font-semibold text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors">
                    {filterOnlyBroken ? 'Show All' : 'Filter 404'}
                  </span>
                </div>
              </div>
            </div>

            {/* Session Health Alert Banner */}
            {stats.brokenSessionsCount > 0 && (
              <div className="p-3 bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-300 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-rose-100 dark:bg-rose-900/60 rounded-lg text-rose-600 shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
                      Session Health: {stats.brokenSessionsCount} session(s) contain 404 or 500 links.
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">
                      Click any session's Health icon to clean up broken links.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setFilterOnlyBroken(!filterOnlyBroken)}
                  className={cn(
                    "min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors border active:scale-95",
                    filterOnlyBroken
                      ? "bg-rose-600 text-white border-rose-600"
                      : "bg-white dark:bg-zinc-900 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800"
                  )}
                >
                  {filterOnlyBroken ? 'Clear Filter' : 'Filter Broken'}
                </button>
              </div>
            )}

        {/* Views: Active vs Archived and Tag Filtering */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => { setViewTab('active'); setSelectedTag(null); setSelectedIds(new Set()); }}
                className={cn(
                  "px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all",
                  viewTab === 'active' 
                    ? "bg-blue-600 text-white shadow-xs" 
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                )}
              >
                Active Sessions ({stats.activeCount})
              </button>
              <button
                onClick={() => { setViewTab('archived'); setSelectedTag(null); setSelectedIds(new Set()); }}
                className={cn(
                  "px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-1.5",
                  viewTab === 'archived' 
                    ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 shadow-xs" 
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                )}
              >
                <Archive className="w-4 h-4" />
                Archived ({stats.archivedCount})
              </button>

              <button
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  setSelectedIds(new Set());
                }}
                className={cn(
                  "ml-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5",
                  isSelectMode
                    ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                )}
                title={isSelectMode ? "Cancel selection" : "Select multiple sessions for bulk actions or side-by-side comparison"}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {isSelectMode ? 'Cancel Selection' : 'Select / Compare'}
              </button>
            </div>

            {/* Keyword Search Bar within History */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative w-full md:w-80">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by keyword, URL, or #tag..."
                  className="w-full text-xs pl-8 pr-7 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <span className="text-xs text-zinc-400 shrink-0 whitespace-nowrap">
                {historySessions.length} session{historySessions.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Compare Pick Banner (when 1 session is selected for comparison via card button) */}
          {comparePickId && (
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl flex items-center justify-between gap-3 text-xs text-indigo-900 dark:text-indigo-200 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-pulse shrink-0" />
                <span>
                  <strong>1st session selected for comparison.</strong> Click the <strong>Compare</strong> button on any other session card to see side-by-side diff!
                </span>
              </div>
              <button 
                onClick={() => setComparePickId(null)}
                className="px-2.5 py-1 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 font-medium shrink-0 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Bulk Action Bar */}
          {isSelectMode && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded-xl flex flex-wrap items-center justify-between gap-2 text-sm animate-in fade-in duration-150">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-medium hover:underline text-xs"
                >
                  {selectedIds.size === historySessions.length && historySessions.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-blue-600" />
                  )}
                  <span>{selectedIds.size === historySessions.length && historySessions.length > 0 ? 'Deselect All' : 'Select All'}</span>
                </button>
                <span className="text-zinc-500 dark:text-zinc-400 text-xs">
                  {selectedIds.size} of {historySessions.length} selected
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Compare 2 Sessions Button */}
                {selectedIds.size === 2 && (
                  <button
                    onClick={handleOpenCompareFromSelection}
                    className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors animate-pulse"
                    title="Compare these 2 selected sessions side-by-side"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    Compare (2 Sessions)
                  </button>
                )}

                {/* Bulk AI Auto-Tagging on Demand */}
                {selectedIds.size > 0 && (
                  <button
                    onClick={handleBulkAiTag}
                    disabled={bulkAiTagging}
                    className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                    title="Generate smart AI tags for selected sessions on-demand"
                  >
                    {bulkAiTagging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>{bulkAiTagging ? 'AI Tagging...' : `AI Tag (${selectedIds.size})`}</span>
                  </button>
                )}

                {selectedIds.size > 0 && (
                  <>
                    <button
                      onClick={() => handleBulkArchive(viewTab === 'active')}
                      className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
                    >
                      {viewTab === 'active' ? <Archive className="w-3.5 h-3.5" /> : <ArchiveRestore className="w-3.5 h-3.5" />}
                      {viewTab === 'active' ? `Archive (${selectedIds.size})` : `Restore (${selectedIds.size})`}
                    </button>

                    <button
                      onClick={handleBulkDelete}
                      className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Selected ({selectedIds.size})
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Tags bar if tags exist */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar">
              <span className="text-xs font-semibold text-zinc-400 uppercase mr-1">Tags:</span>
              <button
                onClick={() => setSelectedTag(null)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                  selectedTag === null
                    ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
                    : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                )}
              >
                All
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1",
                    selectedTag === tag
                      ? "bg-blue-600 text-white"
                      : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100"
                  )}
                >
                  <Hash className="w-3 h-3" />
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Session List */}
        <div className="space-y-4">
          {historySessions.length === 0 ? (
            <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 border-dashed">
              <History className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500 font-medium">
                {viewTab === 'archived' ? 'No archived sessions found.' : 'No active history found.'}
              </p>
              <p className="text-sm text-zinc-400">
                {viewTab === 'archived' ? 'Archived sessions will be saved here safely.' : 'Start a new session to see it here.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {historySessions.sort((a, b) => {
                const pinA = a.isPinned ? 1 : 0;
                const pinB = b.isPinned ? 1 : 0;
                if (pinA !== pinB) return pinB - pinA;
                const timeA = getMillis(a.createdAt);
                const timeB = getMillis(b.createdAt);
                return timeB - timeA;
              }).map(session => (
                <div 
                  key={session.id} 
                  onClick={() => {
                    if (isSelectMode && session.id) {
                      toggleSelectCard(session.id);
                    }
                  }}
                  className={cn(
                    "bg-white dark:bg-zinc-900 border rounded-xl p-5 flex flex-col transition-all shadow-xs relative",
                    isSelectMode && "cursor-pointer",
                    session.id && selectedIds.has(session.id)
                      ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50/20 dark:bg-blue-900/10"
                      : session.isPinned 
                        ? "border-amber-300 dark:border-amber-700/60 bg-amber-50/20 dark:bg-amber-950/10" 
                        : "border-zinc-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-800"
                  )}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isSelectMode && session.id && (
                        <button
                          type="button"
                          onClick={(e) => toggleSelectCard(session.id!, e)}
                          className="text-blue-600 mr-1"
                        >
                          {selectedIds.has(session.id) ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-zinc-400" />
                          )}
                        </button>
                      )}
                      {session.isPinned && (
                        <span className="bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 text-xs font-semibold px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Pin className="w-3 h-3 fill-current" /> Pinned
                        </span>
                      )}
                      {session.type === 'smart_crawler' ? (
                        <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1">
                          <Brain className="w-3 h-3" /> Smart
                        </span>
                      ) : session.type === 'bulk' ? (
                        <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1">
                          <Layers className="w-3 h-3" /> Bulk
                        </span>
                      ) : session.type === 'extractor' || session.type === 'url_processor' ? (
                        <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1">
                          <FileText className="w-3 h-3" /> Extractor
                        </span>
                      ) : session.type === 'ai_chat' ? (
                        <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1">
                          <Brain className="w-3 h-3" /> AI Chat
                        </span>
                      ) : (
                        <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1">
                          <Globe className="w-3 h-3" /> Standard
                        </span>
                      )}

                      {/* Broken Links Alert Badge on Card */}
                      {getSessionBrokenCount(session) > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHealthCheckSession(session);
                          }}
                          className="bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/70 dark:hover:bg-rose-900/80 text-rose-700 dark:text-rose-300 text-xs font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 border border-rose-200 dark:border-rose-900/60 transition-colors"
                          title="404/500 broken links detected! Click to inspect & clean up"
                        >
                          <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                          {getSessionBrokenCount(session)} Broken
                        </button>
                      )}

                      <h3 className="font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[180px] sm:max-w-[220px]" title={session.title}>
                        {session.title || 'Untitled Session'}
                      </h3>
                    </div>
                    <span className="text-xs text-zinc-400 flex items-center gap-1 shrink-0">
                      <Calendar className="w-3 h-3" />
                      {session.createdAt ? formatDistanceToNow(session.createdAt.toDate?.() || new Date(getMillis(session.createdAt)), { addSuffix: true }) : 'Unknown'}
                    </span>
                  </div>

                  {/* Tags and On-Demand Tagging Controls */}
                  <div className="flex items-center flex-wrap gap-1.5 mb-3">
                    {session.tags && session.tags.length > 0 && session.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center text-[10px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                        <Hash className="w-2.5 h-2.5 mr-0.5" />
                        {tag}
                      </span>
                    ))}

                    {/* Add / Edit Tag Manually */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTagsSession(session);
                      }}
                      className="inline-flex items-center text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-1.5 py-0.5 rounded transition-colors font-medium"
                      title="Add or edit tags manually"
                    >
                      <Plus className="w-2.5 h-2.5 mr-0.5" />
                      Tag
                    </button>

                    {/* AI Tagging On-Demand */}
                    <button
                      type="button"
                      onClick={(e) => handleDirectAiTag(session, e)}
                      disabled={aiTaggingSessionId === session.id}
                      className="inline-flex items-center text-[10px] font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/50 px-1.5 py-0.5 rounded transition-colors disabled:opacity-50"
                      title="Scan content and auto-generate smart #tags with Gemini AI"
                    >
                      {aiTaggingSessionId === session.id ? (
                        <Loader2 className="w-2.5 h-2.5 mr-0.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                      )}
                      {aiTaggingSessionId === session.id ? 'Generating...' : 'AI Tag'}
                    </button>
                  </div>

                  <div className="space-y-1.5 mb-4 flex-1">
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-1">
                      <span className="font-medium text-zinc-500">Source:</span> {session.url || 'N/A'}
                    </div>
                    {session.settings?.maxDepth && (
                      <div className="text-sm text-zinc-600 dark:text-zinc-400">
                        <span className="font-medium text-zinc-500">Depth:</span> {session.settings.maxDepth}
                      </div>
                    )}
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-zinc-500">Items:</span> {session.results?.length || 0}
                      </div>
                      <SessionVolumeTrendline results={session.results} />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center gap-2">
                    <div className="scale-90 origin-left">
                      <GlobalExport session={session} />
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Session Health Check & Cleanup Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHealthCheckSession(session);
                        }}
                        className={cn(
                          "p-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1",
                          getSessionBrokenCount(session) > 0
                            ? "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 font-semibold"
                            : "text-zinc-500 hover:text-rose-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        )}
                        title="Inspect Session Health, scan 404/500 status codes, and clean up broken links"
                      >
                        <HeartPulse className="w-3.5 h-3.5 text-rose-500" />
                      </button>

                      {/* Compare Button on Card */}
                      <button
                        type="button"
                        onClick={(e) => handleQuickCompare(session, e)}
                        className={cn(
                          "p-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1",
                          comparePickId === session.id
                            ? "text-indigo-600 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/60 ring-1 ring-indigo-500 font-semibold"
                            : "text-zinc-500 hover:text-indigo-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        )}
                        title={comparePickId === session.id ? "Selected for compare! Click another session card to view diff" : "Compare this session side-by-side"}
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                      </button>

                      {/* Pin Toggle Button */}
                      {onTogglePinSession && (
                        <button
                          onClick={() => session.id && onTogglePinSession(session.id, session.isPinned)}
                          className={cn(
                            "p-1.5 rounded-lg text-xs font-medium transition-colors",
                            session.isPinned
                              ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100"
                              : "text-zinc-500 hover:text-amber-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          )}
                          title={session.isPinned ? "Unpin session" : "Pin session to top"}
                        >
                          <Pin className="w-4 h-4" />
                        </button>
                      )}

                      {/* Archive Toggle Button */}
                      {onToggleArchiveSession && (
                        <button
                          onClick={() => session.id && onToggleArchiveSession(session.id, session.isArchived)}
                          className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          title={session.isArchived ? "Restore to active sessions" : "Move to archive"}
                        >
                          {session.isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                        </button>
                      )}

                      <button
                        onClick={() => session.id && onDeleteSession(session.id)}
                        className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {['crawler', 'smart_crawler', 'bulk'].includes(session.type) && (
                        <button
                          onClick={() => onReRunSession(session)}
                          className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                          title="Re-run crawl with saved settings"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Re-run
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )}
  </div>

      {/* Manual & On-Demand AI Tag Editor Modal */}
      {editingTagsSession && (
        <TagEditModal
          session={editingTagsSession}
          onClose={() => setEditingTagsSession(null)}
        />
      )}

      {/* Side-by-Side Session Comparison Modal */}
      {compareSessions && (
        <SessionCompareModal
          sessionA={compareSessions[0]}
          sessionB={compareSessions[1]}
          onClose={() => setCompareSessions(null)}
        />
      )}

      {/* Session Health & Broken Links Monitor Modal */}
      {healthCheckSession && (
        <SessionHealthModal
          session={healthCheckSession}
          onClose={() => setHealthCheckSession(null)}
        />
      )}
    </div>
  );
}
