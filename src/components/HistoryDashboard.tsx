import React, { useMemo, useState, useRef } from 'react';
import { Session, db } from '../lib/firebase';
import { 
  History, Play, FileText, Globe, Brain, ListOrdered, Calendar, 
  Layers, Download, RefreshCw, Trash2, Pin, Archive, 
  ArchiveRestore, Upload, Hash, CheckCircle2, Loader2, Database,
  CheckSquare, Square
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getMillis, cn } from '../lib/utils';
import { GlobalExport } from './GlobalExport';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

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
  const [viewTab, setViewTab] = useState<'active' | 'archived'>('active');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Filter sessions based on active/archived state and tags
  const historySessions = useMemo(() => {
    return sessions.filter(s => {
      const matchType = ['crawler', 'smart_crawler', 'bulk', 'extractor', 'url_processor', 'ai_chat'].includes(s.type);
      if (!matchType) return false;

      if (viewTab === 'active' && s.isArchived) return false;
      if (viewTab === 'archived' && !s.isArchived) return false;

      if (selectedTag && (!s.tags || !s.tags.includes(selectedTag))) return false;

      return true;
    });
  }, [sessions, viewTab, selectedTag]);

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
    return {
      totalCrawls: activeTotal.filter(s => ['crawler', 'smart_crawler', 'bulk'].includes(s.type)).length,
      totalLinks: activeTotal.reduce((acc, s) => acc + (s.results?.length || 0), 0),
      totalSmartCrawls: activeTotal.filter(s => s.type === 'smart_crawler').length,
      activeCount: activeTotal.length,
      archivedCount: sessions.filter(s => !!s.isArchived).length,
    };
  }, [sessions]);

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-zinc-950 p-6 md:p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto w-full space-y-6">
        
        {/* Header with Global Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">History & Reports</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage sessions, backup all history, and restore data anytime.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Backup All Button */}
            <button
              onClick={handleBackupAllJSON}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all"
              title="Export all sessions with parameters and results into a single JSON backup file"
            >
              <Database className="w-4 h-4" />
              Backup All (JSON)
            </button>

            {/* Restore from Backup Button */}
            <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg cursor-pointer transition-all border border-zinc-300 dark:border-zinc-700">
              {isRestoring ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <Upload className="w-4 h-4 text-zinc-500" />}
              <span>{isRestoring ? 'Restoring...' : 'Restore Backup'}</span>
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-lg transition-colors"
              title="Export all extracted links to CSV"
            >
              <Download className="w-4 h-4" />
              Links CSV
            </button>

            {onRecovery && (
              <button
                onClick={onRecovery}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg transition-colors"
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

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Crawl Sessions</span>
              <Globe className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalCrawls}</span>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Items Extracted</span>
              <ListOrdered className="w-5 h-5 text-emerald-500" />
            </div>
            <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalLinks}</span>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Smart AI Crawls</span>
              <Brain className="w-5 h-5 text-purple-500" />
            </div>
            <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalSmartCrawls}</span>
          </div>
        </div>

        {/* Views: Active vs Archived and Tag Filtering */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
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
                title={isSelectMode ? "Cancel selection" : "Select multiple sessions"}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {isSelectMode ? 'Cancel Selection' : 'Select / Bulk'}
              </button>
            </div>

            <span className="text-xs text-zinc-400">
              Showing {historySessions.length} session(s)
            </span>
          </div>

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

              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
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
                </div>
              )}
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
                      <h3 className="font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[180px] sm:max-w-[220px]" title={session.title}>
                        {session.title || 'Untitled Session'}
                      </h3>
                    </div>
                    <span className="text-xs text-zinc-400 flex items-center gap-1 shrink-0">
                      <Calendar className="w-3 h-3" />
                      {session.createdAt ? formatDistanceToNow(session.createdAt.toDate?.() || new Date(getMillis(session.createdAt)), { addSuffix: true }) : 'Unknown'}
                    </span>
                  </div>

                  {session.tags && session.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2.5">
                      {session.tags.map(tag => (
                        <span key={tag} className="inline-flex items-center text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                          <Hash className="w-2.5 h-2.5 mr-0.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="space-y-1.5 mb-4 flex-1">
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-1">
                      <span className="font-medium text-zinc-500">Source:</span> {session.url || 'N/A'}
                    </div>
                    {session.settings?.maxDepth && (
                      <div className="text-sm text-zinc-600 dark:text-zinc-400">
                        <span className="font-medium text-zinc-500">Depth:</span> {session.settings.maxDepth}
                      </div>
                    )}
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium text-zinc-500">Items:</span> {session.results?.length || 0}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center gap-2">
                    <div className="scale-90 origin-left">
                      <GlobalExport session={session} />
                    </div>

                    <div className="flex items-center gap-2">
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
    </div>
  );
}
