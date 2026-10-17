import React, { useState, useRef } from 'react';
import { 
  FolderOpen, Save, Trash2, Calendar, FileText, Globe, 
  Download, Upload, Check, AlertCircle, X, Search, Clock,
  ExternalLink, Layers, ArrowRight, ShieldCheck, Sparkles
} from 'lucide-react';
import { Session, db } from '../lib/firebase';
import { formatDistanceToNow } from 'date-fns';
import { getMillis, cn, extractSafeHostname } from '../lib/utils';
import { collection, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';

interface CrawlerSessionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  sessions: Session[];
  activeSession: Session | null;
  currentSettings: {
    url: string;
    mode: string;
    maxPages: string;
    maxDepth: string;
    maxBreadth: string;
    crawlDelay: string;
    restrictDomain: string;
    includePatterns: string;
    excludePatterns: string;
    fileTypes: string;
    subdomainOnly: boolean;
    extractAll: boolean;
    fuzzPaths: boolean;
    verboseMode: boolean;
  };
  currentResults: any[];
  onLoadSession: (session: Session) => void;
  onExportCurrent: (format: 'csv' | 'json') => void;
}

export function CrawlerSessionManagerModal({
  isOpen,
  onClose,
  userId,
  sessions,
  activeSession,
  currentSettings,
  currentResults,
  onLoadSession,
  onExportCurrent
}: CrawlerSessionManagerModalProps) {
  const [activeTab, setActiveTab] = useState<'saved' | 'save_new' | 'export_backup'>('saved');
  const [sessionTitleInput, setSessionTitleInput] = useState(activeSession?.title || '');
  const [saveDescription, setSaveDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const crawlerSessions = sessions.filter(s => s.type === 'crawler' || s.type === 'smart_crawler');

  const filteredSessions = crawlerSessions.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (s.title && s.title.toLowerCase().includes(q)) ||
           (s.url && s.url.toLowerCase().includes(q)) ||
           (s.tags && s.tags.some(t => t.toLowerCase().includes(q)));
  });

  const handleSaveCurrentSession = async () => {
    if (!userId) {
      setStatusFeedback({ type: 'error', message: 'You must be signed in to save sessions to Cloud storage.' });
      return;
    }

    if (!currentSettings.url && currentResults.length === 0) {
      setStatusFeedback({ type: 'error', message: 'Please provide at least a Target URL or run a crawl before saving.' });
      return;
    }

    setSaving(true);
    setStatusFeedback(null);

    try {
      let defaultTitle = `Crawl: ${currentSettings.url ? extractSafeHostname(currentSettings.url, 'Workspace') : 'Workspace'}`;
      const titleToSave = sessionTitleInput.trim() || defaultTitle;

      if (activeSession && activeSession.id) {
        // Update existing session
        await updateDoc(doc(db, 'sessions', activeSession.id), {
          title: titleToSave,
          url: currentSettings.url,
          results: currentResults,
          settings: currentSettings,
          updatedAt: serverTimestamp(),
          description: saveDescription.trim() || undefined
        });
        setStatusFeedback({ type: 'success', message: `Updated session "${titleToSave}" successfully!` });
      } else {
        // Create new session
        const newDoc = await addDoc(collection(db, 'sessions'), {
          userId,
          type: 'crawler',
          title: titleToSave,
          url: currentSettings.url,
          results: currentResults,
          logs: [],
          settings: currentSettings,
          description: saveDescription.trim() || undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setStatusFeedback({ type: 'success', message: `Saved new session "${titleToSave}" to Cloud!` });
      }
      setTimeout(() => {
        setStatusFeedback(null);
        setActiveTab('saved');
      }, 1500);
    } catch (err: any) {
      console.error('Save session error:', err);
      setStatusFeedback({ type: 'error', message: err.message || 'Failed to save session.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this crawl session configuration?')) return;
    try {
      await deleteDoc(doc(db, 'sessions', id));
      setStatusFeedback({ type: 'success', message: 'Session deleted.' });
      setTimeout(() => setStatusFeedback(null), 2000);
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: 'Failed to delete session.' });
    }
  };

  const handleExportSingleSessionJSON = (s: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    const exportData = {
      app: "Nexus Web Crawler",
      version: "4.0",
      type: "session_configuration_and_results",
      exportedAt: new Date().toISOString(),
      session: {
        title: s.title,
        url: s.url,
        settings: s.settings,
        resultsCount: (s.results || []).length,
        results: s.results || [],
        logs: s.logs || []
      }
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    const safeTitle = (s.title || 'crawl_session').replace(/[^a-z0-9_-]/gi, '_');
    link.setAttribute('download', `${safeTitle}_config_and_results.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  const handleImportConfigurationFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const sessionObj = parsed.session || parsed;
      if (sessionObj && (sessionObj.settings || sessionObj.url || sessionObj.results)) {
        onLoadSession({
          id: 'imported_' + Date.now(),
          userId: userId || 'local',
          type: 'crawler',
          title: sessionObj.title || file.name.replace('.json', ''),
          url: sessionObj.url || '',
          settings: sessionObj.settings || {},
          results: sessionObj.results || [],
          logs: sessionObj.logs || [],
          createdAt: new Date(),
          updatedAt: new Date()
        });
        setStatusFeedback({ type: 'success', message: `Loaded configuration from ${file.name}!` });
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setStatusFeedback({ type: 'error', message: 'Invalid session JSON schema.' });
      }
    } catch (err: any) {
      console.error('Import parse error:', err);
      setStatusFeedback({ type: 'error', message: 'Failed to read file: invalid JSON format.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Crawl Session Manager
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/50">
                  Android Spec
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Save, restore, and export crawling configurations & results</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Message */}
        {statusFeedback && (
          <div className={cn(
            "px-4 py-2.5 mx-5 mt-4 rounded-xl text-xs flex items-center gap-2 border shrink-0",
            statusFeedback.type === 'success' 
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" 
              : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
          )}>
            {statusFeedback.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="font-medium">{statusFeedback.message}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex px-5 pt-3 border-b border-zinc-200 dark:border-zinc-800 gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('saved')}
            className={cn(
              "px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors border-b-2 flex items-center gap-2",
              activeTab === 'saved' 
                ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10" 
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            )}
          >
            <FolderOpen className="w-4 h-4" />
            Saved Sessions ({crawlerSessions.length})
          </button>
          <button
            onClick={() => setActiveTab('save_new')}
            className={cn(
              "px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors border-b-2 flex items-center gap-2",
              activeTab === 'save_new' 
                ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10" 
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            )}
          >
            <Save className="w-4 h-4" />
            {activeSession ? 'Update Current Session' : 'Save Active Session'}
          </button>
          <button
            onClick={() => setActiveTab('export_backup')}
            className={cn(
              "px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors border-b-2 flex items-center gap-2",
              activeTab === 'export_backup' 
                ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10" 
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            )}
          >
            <Download className="w-4 h-4" />
            Export & Backup
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'saved' && (
            <div className="space-y-4">
              {/* Search Bar & Import Button */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search saved crawl sessions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept=".json" 
                  className="hidden" 
                  onChange={handleImportConfigurationFile} 
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 shrink-0"
                  title="Import from JSON file"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-500" />
                  <span>Import JSON</span>
                </button>
              </div>

              {/* Sessions List */}
              {filteredSessions.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                  <FolderOpen className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">No saved crawl sessions found</p>
                  <p className="text-xs text-zinc-400 mt-1">Configure your crawling strategy and save it to access it anytime.</p>
                  <button
                    onClick={() => setActiveTab('save_new')}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Current Workspace
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredSessions.map((s) => {
                    const isCurrent = activeSession?.id === s.id;
                    const resultsCount = (s.results || []).length;
                    const settings = s.settings || {};

                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          onLoadSession(s);
                          onClose();
                        }}
                        className={cn(
                          "group p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                          isCurrent 
                            ? "bg-blue-50/70 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 shadow-sm" 
                            : "bg-white dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700/60 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                              {s.title || 'Untitled Crawl'}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full shrink-0">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          
                          {s.url && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate mb-2">
                              {s.url}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                            <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 font-medium">
                              Mode: {settings.mode || 'domain'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 font-medium">
                              Depth: {settings.maxDepth || 3}
                            </span>
                            {settings.restrictDomain && (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-medium">
                                Domain: {settings.restrictDomain}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-medium">
                              {resultsCount} URLs
                            </span>
                            {s.updatedAt && (
                              <span className="text-[10px] text-zinc-400 ml-auto flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDistanceToNow(getMillis(s.updatedAt), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-700/50">
                          <button
                            onClick={(e) => handleExportSingleSessionJSON(s, e)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                            title="Export session JSON"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {s.id && (
                            <button
                              onClick={(e) => handleDeleteSession(s.id!, e)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                              title="Delete session"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold ml-1 group-hover:scale-105 transition-transform">
                            <ArrowRight className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'save_new' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                    Current Active Workspace
                  </span>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {currentResults.length} Discovered URLs
                  </span>
                </div>
                <div className="text-xs space-y-1 text-zinc-600 dark:text-zinc-400 font-mono bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700/60">
                  <div className="truncate"><strong>URL:</strong> {currentSettings.url || 'Not set'}</div>
                  <div><strong>Mode:</strong> {currentSettings.mode} | <strong>Depth:</strong> {currentSettings.maxDepth} | <strong>Pages:</strong> {currentSettings.maxPages}</div>
                  {currentSettings.restrictDomain && <div><strong>Restricted Domain:</strong> {currentSettings.restrictDomain}</div>}
                  {currentSettings.includePatterns && <div className="truncate"><strong>Include Regex:</strong> {currentSettings.includePatterns}</div>}
                  {currentSettings.excludePatterns && <div className="truncate"><strong>Exclude Regex:</strong> {currentSettings.excludePatterns}</div>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Session Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Documentation Spider - Docs v4"
                  value={sessionTitleInput}
                  onChange={(e) => setSessionTitleInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Description / Notes (Optional)
                </label>
                <textarea
                  placeholder="Add notes about this crawling run, parameters, or objective..."
                  rows={2}
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveCurrentSession}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 rounded-xl transition-all shadow-md inline-flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : (activeSession ? 'Save & Update Session' : 'Save New Session')}</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'export_backup' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Export Discovered URLs
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Instantly export all {currentResults.length} discovered URLs from your active crawling session to standard formats.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={() => onExportCurrent('csv')}
                    disabled={currentResults.length === 0}
                    className="p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-emerald-500 dark:hover:border-emerald-500 transition-all text-left group disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">CSV Spreadsheet</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">.csv</span>
                    </div>
                    <p className="text-[11px] text-zinc-500">Structured tabular data with URL, Source, and Status.</p>
                  </button>

                  <button
                    onClick={() => onExportCurrent('json')}
                    disabled={currentResults.length === 0}
                    className="p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-500 dark:hover:border-blue-500 transition-all text-left group disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">JSON Array</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-bold">.json</span>
                    </div>
                    <p className="text-[11px] text-zinc-500">Standard clean JSON array format ready for API pipelines.</p>
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/40 space-y-2">
                <h4 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>Complete Configuration Backup</span>
                </h4>
                <p className="text-xs text-zinc-500">
                  Export both the crawling parameters (depth, filters, regex, delays) and discovered URL results into a single shareable file.
                </p>
                <div className="pt-2">
                  <button
                    onClick={(e) => {
                      if (activeSession) {
                        handleExportSingleSessionJSON(activeSession, e);
                      } else {
                        const tempSession: Session = {
                          title: currentSettings.url || 'Active Crawl',
                          url: currentSettings.url,
                          userId: userId || 'local',
                          type: 'crawler',
                          settings: currentSettings,
                          results: currentResults,
                          logs: [],
                          createdAt: new Date(),
                          updatedAt: new Date()
                        };
                        handleExportSingleSessionJSON(tempSession, e);
                      }
                    }}
                    className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download Configuration & Results (.json)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
