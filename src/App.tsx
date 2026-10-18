import { useState, useEffect, useRef, useMemo } from 'react';
import Crawler from './components/Crawler';
import Extractor from './components/Extractor';
import { SmartCrawler } from './components/SmartCrawler';
import { DataExtractor } from './components/DataExtractor';
import BulkFetcher from './components/BulkFetcher';
import { FileMerger } from './components/FileMerger';
import { AIChat } from './components/AIChat';
import URLProcessor from './components/URLProcessor';
import YouTubeSearch from './components/youtube/YouTubeSearch';
import YouTubeAnalyzer from './components/youtube/YouTubeAnalyzer';
import { SchedulerDashboard } from './components/SchedulerDashboard';
import { HistoryDashboard } from './components/HistoryDashboard';
import { 
  Globe, FileText, Plus, History, Loader2, Menu, X, LogIn, 
  Sparkles, DownloadCloud, Trash2, Edit2, Search, Settings2, 
  Hash, Youtube, LayoutGrid, Brain, Layers, Info, Link, Merge,
  Pin, Archive, ArchiveRestore, CheckSquare, Square, RefreshCw,
  PanelLeft, Download, Upload, Clock, CalendarClock, BarChart3
} from 'lucide-react';
import { ApiUsageMonitor } from './components/ApiUsageMonitor';
import { cn, getMillis } from './lib/utils';
import { db, auth, Session, signInWithGoogle, handleFirestoreError, OperationType } from './lib/firebase';
import { collection, query, where, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { InfoModal } from './components/InfoModal';
import { TabInfoBanner } from './components/TabInfoBanner';
import { AboutPage } from './components/AboutPage';
import { GlobalExport } from './components/GlobalExport';
import { SessionNotesModal } from './components/SessionNotesModal';
import { GlobalScrollButtons } from './components/GlobalScrollButtons';
import { formatDistanceToNow } from 'date-fns';

export default function App() {
  const [activeTab, setActiveTab] = useState<'crawler' | 'extractor' | 'url_processor' | 'bulk' | 'file_merge' | 'ai_chat' | 'smart_crawler' | 'data_extractor' | 'scheduler' | 'history'>('crawler');
  const [appMode, setAppMode] = useState<'general' | 'youtube' | 'about'>('general');
  const [ytActiveTab, setYtActiveTab] = useState<'search' | 'analyzer'>('search');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedToolFilter, setSelectedToolFilter] = useState<string>('all');
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [sessionTab, setSessionTab] = useState<'active' | 'archived'>('active');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [selectedNotesSession, setSelectedNotesSession] = useState<Session | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialLoadRef = useRef(false);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        setUserId(null);
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'sessions'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedSessions: Session[] = [];
      snapshot.forEach((doc) => {
        loadedSessions.push({ id: doc.id, ...doc.data() } as Session);
      });
      // Sort on client side: pinned sessions first, then by createdAt desc
      loadedSessions.sort((a, b) => {
        const pinA = a.isPinned ? 1 : 0;
        const pinB = b.isPinned ? 1 : 0;
        if (pinA !== pinB) return pinB - pinA;
        const timeA = getMillis(a.createdAt);
        const timeB = getMillis(b.createdAt);
        return timeB - timeA;
      });
      setSessions(loadedSessions);
      setLoading(false);

      if (!initialLoadRef.current) {
        initialLoadRef.current = true;
        const urlParams = new URLSearchParams(window.location.search);
        const sessionParam = urlParams.get('session');
        if (sessionParam) {
          const targetSession = loadedSessions.find(s => s.id === sessionParam);
          if (targetSession) {
            setActiveSessionId(targetSession.id!);
            setActiveTab(targetSession.type as any);
          }
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sessions');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;
  const [sessionKey, setSessionKey] = useState(0);

  const handleNewSession = () => {
    setActiveSessionId(null);
    setSessionKey(prev => prev + 1);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
    
    // Clear URL param
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.pushState({path:newUrl}, '', newUrl);
  };

  const handleSelectSession = (session: Session) => {
    setActiveSessionId(session.id!);
    if (session.type && session.type !== ('history' as any)) {
      setActiveTab(session.type as any);
    }
    setSessionKey(prev => prev + 1);

    if (appMode === 'youtube') {
      setAppMode('general');
    }

    const url = new URL(window.location.href);
    url.searchParams.set('session', session.id!);
    window.history.pushState({}, '', url.toString());

    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this session?')) {
      try {
        await deleteDoc(doc(db, 'sessions', id));
        if (activeSessionId === id) {
          handleNewSession();
        }
      } catch (err) {
        console.error('Failed to delete session', err);
      }
    }
  };

  const copySessionUrl = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = new URL(window.location.href);
    url.searchParams.set('session', id);
    navigator.clipboard.writeText(url.toString());
    alert('Session URL copied to clipboard!');
  };

  const handleExportBackup = () => {
    if (sessions.length === 0) {
      alert('No sessions available to export.');
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `webtools-sessions-backup-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!Array.isArray(imported)) {
        alert('Invalid backup file format: Expected an array of sessions.');
        return;
      }
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      let count = 0;
      for (const item of imported) {
        if (item.title && item.type) {
          const { id, ...dataToSave } = item;
          await addDoc(collection(db, 'sessions'), {
            ...dataToSave,
            userId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          count++;
        }
      }
      alert(`Successfully imported ${count} session(s)!`);
    } catch (err) {
      console.error(err);
      alert('Failed to parse and import backup file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRecovery = async () => {
    if (!userId) return;
    setIsRefreshing(true);
    
    try {
      // Force a server fetch to bypass cache
      const { getDocs } = await import('firebase/firestore');
      const q = query(collection(db, 'sessions'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      
      const loadedSessions: Session[] = [];
      snapshot.forEach((doc) => {
        loadedSessions.push({ id: doc.id, ...doc.data() } as Session);
      });
      loadedSessions.sort((a, b) => {
        const pinA = a.isPinned ? 1 : 0;
        const pinB = b.isPinned ? 1 : 0;
        if (pinA !== pinB) return pinB - pinA;
        const timeA = getMillis(a.createdAt);
        const timeB = getMillis(b.createdAt);
        return timeB - timeA;
      });
      
      setSessions(loadedSessions);
    } catch (err) {
      console.error("Recovery failed", err);
      alert("Failed to recover sessions from server. Please check your network connection.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const renameSession = async (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTitle = prompt('Enter new session name (Use #tag to add tags):', currentTitle);
    if (newTitle && newTitle.trim() !== '' && newTitle !== currentTitle) {
      try {
        const tags = newTitle.match(/#\w+/g)?.map(t => t.slice(1)) || [];
        await updateDoc(doc(db, 'sessions', id), {
          title: newTitle.trim(),
          tags
        });
      } catch (err) {
        console.error('Failed to rename session', err);
      }
    }
  };

  const togglePinSession = async (id: string, currentPinned: boolean = false, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await updateDoc(doc(db, 'sessions', id), {
        isPinned: !currentPinned
      });
    } catch (err) {
      console.error('Failed to toggle pin', err);
    }
  };

  const toggleArchiveSession = async (id: string, currentArchived: boolean = false, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await updateDoc(doc(db, 'sessions', id), {
        isArchived: !currentArchived
      });
      if (activeSessionId === id && !currentArchived) {
        handleNewSession();
      }
    } catch (err) {
      console.error('Failed to toggle archive', err);
    }
  };

  const toggleSelectSession = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedSessionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const validIds = filteredSessions.map(s => s.id!).filter(Boolean);
    if (selectedSessionIds.size === validIds.length && validIds.length > 0) {
      setSelectedSessionIds(new Set());
    } else {
      setSelectedSessionIds(new Set(validIds));
    }
  };

  const handleBulkDeleteSessions = async () => {
    if (selectedSessionIds.size === 0) return;
    if (confirm(`Are you sure you want to permanently delete ${selectedSessionIds.size} session(s)?`)) {
      try {
        const deletePromises = Array.from(selectedSessionIds).map(id => deleteDoc(doc(db, 'sessions', id)));
        await Promise.all(deletePromises);
        if (activeSessionId && selectedSessionIds.has(activeSessionId)) {
          handleNewSession();
        }
        setSelectedSessionIds(new Set());
        setIsSelectMode(false);
      } catch (err) {
        console.error('Failed to bulk delete sessions', err);
      }
    }
  };

  const handleBulkArchiveSessions = async (archive: boolean) => {
    if (selectedSessionIds.size === 0) return;
    try {
      const updatePromises = Array.from(selectedSessionIds).map(id =>
        updateDoc(doc(db, 'sessions', id), { isArchived: archive })
      );
      await Promise.all(updatePromises);
      if (activeSessionId && selectedSessionIds.has(activeSessionId) && archive) {
        handleNewSession();
      }
      setSelectedSessionIds(new Set());
      setIsSelectMode(false);
    } catch (err) {
      console.error('Failed to bulk archive sessions', err);
    }
  };

  const allTags = useMemo(() => {
    const relevant = sessions.filter(s => sessionTab === 'active' ? !s.isArchived : !!s.isArchived);
    return Array.from(new Set(relevant.flatMap(s => s.tags || []).filter(Boolean)));
  }, [sessions, sessionTab]);

  const TOOL_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'crawler', label: 'Crawler' },
    { id: 'scheduler', label: 'Schedule' },
    { id: 'smart_crawler', label: 'Smart' },
    { id: 'bulk', label: 'Fetch' },
    { id: 'extractor', label: 'Extractor' },
    { id: 'url_processor', label: 'Processor' },
    { id: 'data_extractor', label: 'Local' },
    { id: 'file_merge', label: 'Merge' },
    { id: 'ai_chat', label: 'Chat' },
  ];

  const getToolIcon = (type?: string) => {
    switch (type) {
      case 'crawler':
        return <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />;
      case 'scheduler':
        return <CalendarClock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />;
      case 'smart_crawler':
        return <Brain className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />;
      case 'data_extractor':
        return <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
      case 'extractor':
        return <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
      case 'url_processor':
        return <Settings2 className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />;
      case 'bulk':
        return <DownloadCloud className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />;
      case 'file_merge':
        return <Merge className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />;
      case 'ai_chat':
        return <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />;
      default:
        return <Globe className="w-3.5 h-3.5 text-zinc-500" />;
    }
  };

  const getToolName = (type?: string) => {
    switch (type) {
      case 'crawler': return 'Crawler';
      case 'smart_crawler': return 'Smart';
      case 'data_extractor': return 'Local';
      case 'extractor': return 'Extractor';
      case 'url_processor': return 'Processor';
      case 'bulk': return 'Fetch';
      case 'file_merge': return 'Merge';
      case 'ai_chat': return 'Chat';
      default: return type || 'Tool';
    }
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
      if (sessionTab === 'active' && session.isArchived) return false;
      if (sessionTab === 'archived' && !session.isArchived) return false;

      if (selectedToolFilter !== 'all' && session.type !== selectedToolFilter) return false;

      if (selectedTag && (!session.tags || !session.tags.includes(selectedTag))) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = session.title?.toLowerCase().includes(q);
        const matchTag = session.tags?.some(tag => tag.toLowerCase().includes(q));
        if (!matchTitle && !matchTag) return false;
      }

      return true;
    });
  }, [sessions, sessionTab, selectedToolFilter, selectedTag, searchQuery]);

  const groupedSessions = useMemo(() => {
    const groups: {
      pinned: Session[];
      today: Session[];
      yesterday: Session[];
      previous7Days: Session[];
      older: Session[];
    } = {
      pinned: [],
      today: [],
      yesterday: [],
      previous7Days: [],
      older: [],
    };

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOf7Days = startOfToday - 7 * 24 * 60 * 60 * 1000;

    for (const session of filteredSessions) {
      if (session.isPinned && sessionTab === 'active') {
        groups.pinned.push(session);
        continue;
      }
      const millis = getMillis(session.createdAt) || Date.now();
      if (millis >= startOfToday) {
        groups.today.push(session);
      } else if (millis >= startOfYesterday) {
        groups.yesterday.push(session);
      } else if (millis >= startOf7Days) {
        groups.previous7Days.push(session);
      } else {
        groups.older.push(session);
      }
    }

    return groups;
  }, [filteredSessions, sessionTab]);

  const renderSessionCard = (session: Session) => {
    const isSelected = selectedSessionIds.has(session.id!);
    const isActive = activeSessionId === session.id;

    return (
      <div
        key={session.id}
        onClick={() => {
          if (isSelectMode) {
            toggleSelectSession(session.id!);
          } else {
            handleSelectSession(session);
          }
        }}
        className={cn(
          "w-full flex flex-col text-left px-2.5 py-2 rounded-xl border transition-all text-xs group cursor-pointer relative select-none",
          isActive 
            ? "bg-blue-50/90 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 shadow-2xs ring-1 ring-blue-500/20" 
            : session.isPinned
              ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/40 hover:border-amber-300"
              : "bg-white/80 dark:bg-zinc-900/60 border-zinc-200/70 dark:border-zinc-800/70 hover:bg-zinc-100 dark:hover:bg-zinc-800/90 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-2xs"
        )}
      >
        <div className="flex items-center justify-between gap-1.5 mb-1.5">
          <div className="flex items-center gap-2 truncate flex-1 pr-14">
            {isSelectMode && (
              <button
                type="button"
                onClick={(e) => toggleSelectSession(session.id!, e)}
                className="text-blue-600 shrink-0"
              >
                {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5 text-zinc-400" />}
              </button>
            )}
            
            <div className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-200/60 dark:border-zinc-700/60">
              {getToolIcon(session.type)}
            </div>

            <span className={cn(
              "font-medium truncate text-xs",
              isActive ? "text-blue-700 dark:text-blue-300 font-semibold" : "text-zinc-800 dark:text-zinc-200"
            )}>
              {session.title || 'Untitled Session'}
            </span>
          </div>

          {/* Active Badge */}
          {isActive && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-600 text-white shrink-0 shadow-2xs">
              Active
            </span>
          )}

          {/* Action buttons on hover */}
          <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-0.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-0.5 rounded-lg shadow-xs z-10">
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedNotesSession(session);
              }}
              className={cn(
                "p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors",
                session.notes ? "text-amber-500 hover:text-amber-600" : "text-zinc-400 hover:text-amber-500"
              )}
              title={session.notes ? "View/Edit Notes (has notes)" : "Add Session Notes"}
            >
              <FileText className="w-3 h-3" />
            </button>

            <button 
              type="button"
              onClick={(e) => togglePinSession(session.id!, session.isPinned, e)}
              className={cn(
                "p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors",
                session.isPinned ? "text-amber-500 hover:text-amber-600" : "text-zinc-400 hover:text-amber-500"
              )}
              title={session.isPinned ? "Unpin session" : "Pin to top"}
            >
              <Pin className={cn("w-3 h-3", session.isPinned && "fill-current")} />
            </button>

            <button 
              type="button"
              onClick={(e) => renameSession(session.id!, session.title, e)}
              className="p-1 hover:text-blue-600 text-zinc-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
              title="Rename Session"
            >
              <Edit2 className="w-3 h-3" />
            </button>

            <button 
              type="button"
              onClick={(e) => toggleArchiveSession(session.id!, session.isArchived, e)}
              className="p-1 hover:text-zinc-900 dark:hover:text-zinc-100 text-zinc-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
              title={session.isArchived ? "Restore to active" : "Archive session"}
            >
              {session.isArchived ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
            </button>

            <button 
              type="button"
              onClick={(e) => copySessionUrl(session.id!, e)}
              className="p-1 hover:text-emerald-600 text-zinc-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
              title="Copy Session URL"
            >
              <Link className="w-3 h-3" />
            </button>

            <button 
              type="button"
              onClick={(e) => deleteSession(session.id!, e)}
              className="p-1 hover:text-red-600 text-zinc-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Tags */}
        {session.tags && session.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5 pl-8">
            {session.tags.map((tag, tagIdx) => (
              <span key={`${tag}-${tagIdx}`} className="inline-flex items-center text-[9px] bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 px-1.5 py-0.2 rounded font-medium">
                <Hash className="w-2 h-2 mr-0.5" />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Bottom meta row */}
        <div className="text-[11px] text-zinc-400 dark:text-zinc-500 flex items-center justify-between pl-8">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-500 dark:text-zinc-400">
              {getToolName(session.type)}
            </span>
            <span>•</span>
            <span>{session.results?.length || 0} items</span>
            {session.notes && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNotesSession(session);
                }}
                className="inline-flex items-center text-amber-600 dark:text-amber-400 text-[10px] font-semibold hover:underline" 
                title="Has session notes"
              >
                <FileText className="w-2.5 h-2.5 mr-0.5 fill-current opacity-70" />
                Note
              </button>
            )}
          </div>
          <span>
            {formatDistanceToNow(getMillis(session.createdAt) || Date.now(), { addSuffix: true })}
          </span>
        </div>
      </div>
    );
  };

  const renderSessionGroup = (title: string, list: Session[], icon?: React.ReactNode) => {
    if (list.length === 0) return null;
    return (
      <div key={title} className="space-y-1.5">
        <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          {icon}
          <span>{title}</span>
          <span className="ml-auto text-[10px] font-normal text-zinc-400">({list.length})</span>
        </div>
        <div className="space-y-1.5">
          {list.map(renderSessionCard)}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-zinc-200 dark:bg-zinc-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-zinc-200 dark:bg-zinc-900 p-4">
        <div className="bg-white dark:bg-zinc-950 p-8 rounded-3xl shadow-xl max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Globe className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white mb-2">Web Tools</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mb-8">Sign in to save your crawling and extraction history.</p>
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium py-3 rounded-xl transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
          >
            <LogIn className="w-5 h-5" />
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-zinc-200 dark:bg-zinc-900 font-sans antialiased text-zinc-900 dark:text-zinc-100 overflow-hidden">
      
      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed md:static inset-y-0 left-0 z-50 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex flex-col transition-all duration-300 ease-in-out shadow-2xl md:shadow-none",
        sidebarOpen ? "translate-x-0 w-80" : "-translate-x-full md:translate-x-0",
        desktopSidebarOpen ? "md:w-80" : "md:w-0 md:border-r-0 md:overflow-hidden md:p-0"
      )}>
        {/* Top bar: Mode Switch + Close Mobile */}
        <div className="flex items-center justify-between p-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-lg p-1 w-full mr-2">
            <button
              onClick={() => {
                setAppMode('general');
                setActiveSessionId(null);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all",
                appMode === 'general' ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              General
            </button>
            <button
              onClick={() => {
                setAppMode('youtube');
                setActiveSessionId(null);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all",
                appMode === 'youtube' ? "bg-red-500 text-white shadow-xs" : "text-zinc-500 hover:text-red-500 dark:hover:text-red-400"
              )}
            >
              <Youtube className="w-3.5 h-3.5" />
              YouTube
            </button>
          </div>

          <button 
            className="md:hidden p-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 shrink-0 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900" 
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* New Session Action & Search */}
        <div className="p-3 flex flex-col gap-2.5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <button
            onClick={handleNewSession}
            className={cn(
              "w-full flex items-center justify-center gap-2 font-semibold py-2.5 px-4 rounded-xl transition-all shadow-xs text-xs",
              activeSessionId === null
                ? "bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-500/30"
                : "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90"
            )}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>New Session</span>
            {activeSessionId === null && (
              <span className="ml-auto text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/40 text-blue-100">
                Fresh
              </span>
            )}
          </button>
          
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search sessions or #tag..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-8 pr-7 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Tool Filter Chips */}
        <div className="px-3 py-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/20 shrink-0">
          {TOOL_FILTERS.map(tf => {
            const count = sessions.filter(s => (sessionTab === 'active' ? !s.isArchived : !!s.isArchived) && (tf.id === 'all' || s.type === tf.id)).length;
            return (
              <button
                key={tf.id}
                onClick={() => setSelectedToolFilter(tf.id)}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors flex items-center gap-1 shrink-0",
                  selectedToolFilter === tf.id
                    ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-semibold"
                    : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                )}
              >
                <span>{tf.label}</span>
                <span className="text-[10px] opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Active vs Archived Tabs & Select Mode Toggle */}
        <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 text-xs shrink-0">
          <div className="flex items-center gap-1 bg-zinc-200/70 dark:bg-zinc-800/80 p-0.5 rounded-lg">
            <button
              onClick={() => {
                setSessionTab('active');
                setSelectedSessionIds(new Set());
              }}
              className={cn(
                "px-2 py-0.5 rounded-md font-medium transition-all text-xs",
                sessionTab === 'active'
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-2xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              Active ({sessions.filter(s => !s.isArchived).length})
            </button>
            <button
              onClick={() => {
                setSessionTab('archived');
                setSelectedSessionIds(new Set());
              }}
              className={cn(
                "px-2 py-0.5 rounded-md font-medium transition-all flex items-center gap-1 text-xs",
                sessionTab === 'archived'
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-2xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              <Archive className="w-3 h-3" />
              Archived ({sessions.filter(s => !!s.isArchived).length})
            </button>
          </div>

          <button
            onClick={() => {
              setIsSelectMode(!isSelectMode);
              setSelectedSessionIds(new Set());
            }}
            className={cn(
              "px-2 py-0.5 rounded text-xs font-medium transition-colors",
              isSelectMode
                ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
            title={isSelectMode ? "Exit selection mode" : "Select sessions"}
          >
            {isSelectMode ? "Done" : "Select"}
          </button>
        </div>

        {/* Bulk Action Controls Bar */}
        {isSelectMode && (
          <div className="mx-3 mt-2 p-2 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded-lg flex items-center justify-between text-xs animate-in fade-in duration-150 shrink-0">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-medium hover:underline"
            >
              {selectedSessionIds.size === filteredSessions.length && filteredSessions.length > 0 ? (
                <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
              ) : (
                <Square className="w-3.5 h-3.5 text-blue-600" />
              )}
              <span>{selectedSessionIds.size === filteredSessions.length && filteredSessions.length > 0 ? 'Deselect All' : 'Select All'}</span>
              <span className="text-zinc-500 dark:text-zinc-400">({selectedSessionIds.size})</span>
            </button>

            {selectedSessionIds.size > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleBulkArchiveSessions(sessionTab === 'active')}
                  className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-zinc-700 dark:text-zinc-300 rounded transition-colors"
                  title={sessionTab === 'active' ? "Archive Selected" : "Restore Selected"}
                >
                  {sessionTab === 'active' ? <Archive className="w-3.5 h-3.5" /> : <ArchiveRestore className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleBulkDeleteSessions}
                  className="p-1 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 rounded transition-colors"
                  title="Delete Selected Permanently"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tags Filter Chips Bar */}
        {allTags.length > 0 && (
          <div className="px-3 py-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-zinc-100 dark:border-zinc-800/80 shrink-0">
            <button
              onClick={() => setSelectedTag(null)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors shrink-0",
                selectedTag === null
                  ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
              )}
            >
              All
            </button>
            {allTags.map(tag => {
              const count = sessions.filter(s => (sessionTab === 'active' ? !s.isArchived : !!s.isArchived) && s.tags?.includes(tag)).length;
              if (count === 0) return null;
              return (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors flex items-center gap-0.5 shrink-0",
                    selectedTag === tag
                      ? "bg-blue-600 text-white"
                      : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100"
                  )}
                >
                  <Hash className="w-2.5 h-2.5" />
                  {tag} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Sessions List (Grouped by Date & Pin status) */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-3 custom-scrollbar">
          {/* Active fresh session placeholder indicator if activeSessionId is null */}
          {activeSessionId === null && (
            <div className="px-3 py-2 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-dashed border-blue-300 dark:border-blue-800/60 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium text-blue-900 dark:text-blue-200">Current Draft (Unsaved)</span>
              </div>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold uppercase">Live</span>
            </div>
          )}

          {filteredSessions.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500 dark:text-zinc-400 space-y-2.5 my-2 bg-zinc-50/70 dark:bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                <History className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {sessionTab === 'archived' ? 'No archived sessions' : 'No saved sessions'}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                  {sessionTab === 'archived'
                    ? 'Archived sessions will appear here.'
                    : 'Every extraction session is automatically saved here for quick resume.'}
                </p>
              </div>
              {sessionTab === 'active' && activeSessionId !== null && (
                <button
                  onClick={handleNewSession}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition-colors shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Session
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3.5">
              {renderSessionGroup("Pinned", groupedSessions.pinned, <Pin className="w-3 h-3 text-amber-500 fill-current" />)}
              {renderSessionGroup("Today", groupedSessions.today, <Clock className="w-3 h-3 text-blue-500" />)}
              {renderSessionGroup("Yesterday", groupedSessions.yesterday, <Clock className="w-3 h-3 text-zinc-400" />)}
              {renderSessionGroup("Previous 7 Days", groupedSessions.previous7Days, <Clock className="w-3 h-3 text-zinc-400" />)}
              {renderSessionGroup("Older", groupedSessions.older, <Clock className="w-3 h-3 text-zinc-400" />)}
            </div>
          )}
        </div>
        
        {/* Sidebar Footer: Sync + Backup Tools + Info */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/80 shrink-0 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 px-1">
            <span className="font-medium text-[11px]">
              {sessions.length} total session{sessions.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleRecovery}
                disabled={isRefreshing}
                className="p-1 text-zinc-400 hover:text-blue-600 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                title="Sync & refresh sessions from cloud"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin text-blue-600")} />
              </button>
              <button
                onClick={handleExportBackup}
                className="p-1 text-zinc-400 hover:text-emerald-600 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                title="Export all sessions to JSON backup"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1 text-zinc-400 hover:text-indigo-600 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                title="Import sessions from JSON backup"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImportBackup} 
                accept=".json" 
                className="hidden" 
              />
            </div>
          </div>

          <div className="space-y-1.5 w-full">
            <a
              href="/api/download-blueprint"
              download="architectural_blueprint.md"
              className="w-full flex items-center justify-center gap-2 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 font-medium py-2 rounded-xl transition-all text-xs shadow-2xs"
              title="Download Full Architectural Blueprint Markdown file"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Download Blueprint (MD)</span>
            </a>

            <a
              href="/api/download-plan"
              download="implementation_plan.md"
              className="w-full flex items-center justify-center gap-2 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/80 font-medium py-2 rounded-xl transition-all text-xs shadow-2xs"
              title="Download Implementation Plan Markdown file"
            >
              <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Download Plan (MD)</span>
            </a>

            <button
              onClick={() => {
                setAppMode('general');
                setActiveTab('history');
                setSidebarOpen(false);
              }}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-2.5 rounded-xl transition-all text-xs shadow-xs active:scale-[0.98]"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Insights & Analytics Hub</span>
            </button>

            <button
              onClick={() => setInfoModalOpen(true)}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium py-2 rounded-xl transition-all text-xs"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Info & Guide</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto md:overflow-hidden relative custom-scrollbar">
        <div className="md:hidden flex items-center justify-between p-3.5 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-zinc-700 dark:text-zinc-300">
            <Menu className="w-6 h-6" />
          </button>
          <div className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center truncate px-2 gap-1.5">
            <span className="truncate text-xs font-semibold">{activeSessionId ? activeSession?.title : (appMode === 'youtube' ? 'YouTube Tools' : 'NIRZOR MAGIC CRAWLER')}</span>
            <a 
              href="/api/download-blueprint"
              download="architectural_blueprint.md"
              className="text-xs bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-full hover:bg-indigo-200 transition-colors shrink-0 flex items-center gap-0.5 font-medium"
              title="Download Architectural Blueprint Markdown"
            >
              <Download className="w-3 h-3" />
              <span>Blueprint</span>
            </a>
            <a 
              href="/api/download-plan"
              download="implementation_plan.md"
              className="text-xs bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-full hover:bg-emerald-200 transition-colors shrink-0 flex items-center gap-0.5 font-medium"
              title="Download Implementation Plan Markdown"
            >
              <Download className="w-3 h-3" />
              <span>Plan</span>
            </a>
            <button 
              onClick={() => {
                setAppMode('about');
                setActiveSessionId(null);
              }}
              className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-full hover:bg-blue-200 transition-colors shrink-0"
            >
              About
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col md:p-6 lg:p-8 min-h-0 md:overflow-hidden">
          <div className="w-full max-w-4xl mx-auto flex items-center justify-between mb-3 gap-3">
             {/* Desktop Sidebar Toggle button & active session breadcrumb */}
             <div className="hidden md:flex items-center gap-2.5 flex-1 min-w-0">
               <button
                 onClick={() => setDesktopSidebarOpen(!desktopSidebarOpen)}
                 className="p-2 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors shrink-0 border border-zinc-200/80 dark:border-zinc-800"
                 title={desktopSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
               >
                 <PanelLeft className="w-4 h-4" />
               </button>

               {activeSessionId && activeSession && (
                 <div className="flex items-center gap-1.5 truncate text-xs text-zinc-600 dark:text-zinc-400 bg-white/70 dark:bg-zinc-900/70 px-2.5 py-1.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60 shadow-2xs">
                   <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                   <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-xs">{activeSession.title}</span>
                 </div>
               )}
             </div>

             {appMode !== 'about' && (
               <div className="flex bg-zinc-300/50 dark:bg-zinc-950 p-1 rounded-xl shrink-0 mt-2 md:mt-0 w-full overflow-x-auto md:w-auto custom-scrollbar">
                {appMode === 'general' ? (
                <>
                  <button 
                    onClick={() => setActiveTab('crawler')}
                    className={cn("flex-none py-2 px-3.5 flex items-center justify-center gap-2 rounded-lg text-xs md:text-sm font-medium transition-all", activeTab === 'crawler' ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Globe className="w-4 h-4" />
                    Crawler
                  </button>
                  <button 
                    onClick={() => setActiveTab('scheduler')}
                    className={cn("flex-none py-2 px-3.5 flex items-center justify-center gap-2 rounded-lg text-xs md:text-sm font-medium transition-all", activeTab === 'scheduler' ? "bg-white dark:bg-zinc-800 text-purple-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <CalendarClock className="w-4 h-4" />
                    Scheduler
                  </button>
                  <button 
                    onClick={() => setActiveTab('smart_crawler')}
                    className={cn("flex-none py-2 px-3.5 flex items-center justify-center gap-2 rounded-lg text-xs md:text-sm font-medium transition-all", activeTab === 'smart_crawler' ? "bg-white dark:bg-zinc-800 text-rose-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Brain className="w-4 h-4" />
                    Smart Crawler
                  </button>
                  <button 
                    onClick={() => setActiveTab('data_extractor')}
                    className={cn("flex-none py-2 px-3.5 flex items-center justify-center gap-2 rounded-lg text-xs md:text-sm font-medium transition-all", activeTab === 'data_extractor' ? "bg-white dark:bg-zinc-800 text-emerald-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <FileText className="w-4 h-4" />
                    Local Extractor
                  </button>
                  <button 
                    onClick={() => setActiveTab('extractor')}
                    className={cn("flex-none py-2 px-3.5 flex items-center justify-center gap-2 rounded-lg text-xs md:text-sm font-medium transition-all", activeTab === 'extractor' ? "bg-white dark:bg-zinc-800 text-emerald-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Layers className="w-4 h-4" />
                    Extractor
                  </button>
                  <button 
                    onClick={() => setActiveTab('url_processor')}
                    className={cn("flex-none py-2 px-3.5 flex items-center justify-center gap-2 rounded-lg text-xs md:text-sm font-medium transition-all", activeTab === 'url_processor' ? "bg-white dark:bg-zinc-800 text-orange-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Settings2 className="w-4 h-4" />
                    Processor
                  </button>
                  <button 
                    onClick={() => setActiveTab('bulk')}
                    className={cn("flex-none py-2 px-3.5 flex items-center justify-center gap-2 rounded-lg text-xs md:text-sm font-medium transition-all", activeTab === 'bulk' ? "bg-white dark:bg-zinc-800 text-indigo-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <DownloadCloud className="w-4 h-4" />
                    Fetch
                  </button>
                  <button 
                    onClick={() => setActiveTab('file_merge')}
                    className={cn("flex-none py-2 px-3.5 flex items-center justify-center gap-2 rounded-lg text-xs md:text-sm font-medium transition-all", activeTab === 'file_merge' ? "bg-white dark:bg-zinc-800 text-cyan-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Merge className="w-4 h-4" />
                    File Merge
                  </button>
                  <button 
                    onClick={() => setActiveTab('ai_chat')}
                    className={cn("flex-none py-2 px-3.5 flex items-center justify-center gap-2 rounded-lg text-xs md:text-sm font-medium transition-all", activeTab === 'ai_chat' ? "bg-white dark:bg-zinc-800 text-purple-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                     <Sparkles className="w-4 h-4" />
                    Chat
                  </button>
                  <button 
                    onClick={() => setActiveTab('history')}
                    className={cn("flex-none min-h-[44px] py-2 px-3.5 flex items-center justify-center gap-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all active:scale-95", activeTab === 'history' ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <BarChart3 className="w-4 h-4 text-blue-500" />
                    Insights & History
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => setYtActiveTab('search')}
                    className={cn("flex-none py-2 px-4 flex items-center justify-center gap-2 rounded-lg text-xs md:text-sm font-medium transition-all", ytActiveTab === 'search' ? "bg-white dark:bg-zinc-800 text-red-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Search className="w-4 h-4" />
                    Search
                  </button>
                  <button 
                    onClick={() => setYtActiveTab('analyzer')}
                    className={cn("flex-none py-2 px-4 flex items-center justify-center gap-2 rounded-lg text-xs md:text-sm font-medium transition-all", ytActiveTab === 'analyzer' ? "bg-white dark:bg-zinc-800 text-red-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Youtube className="w-4 h-4" />
                    Analyzer
                  </button>
                </>
              )}
             </div>
             )}
            <div className="hidden md:flex flex-1 justify-end items-center gap-2">
               <ApiUsageMonitor />
               {activeSessionId && activeSession && appMode !== 'about' && (
                 <GlobalExport session={activeSession} />
               )}
            </div>
          </div>

          <div className="flex-none md:flex-1 w-full md:h-full max-w-6xl mx-auto flex flex-col md:overflow-hidden relative">
            {appMode !== 'about' && <TabInfoBanner tab={appMode === 'general' ? activeTab : ytActiveTab} />}
            <div className="flex-1 flex w-full h-full min-h-0 relative">
              {appMode === 'about' ? (
                <AboutPage onBack={() => setAppMode('general')} />
              ) : (
                <>
                  {/* General Mode Tabs - All preserved in memory across tab navigation */}
                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'crawler' ? "flex flex-col" : "hidden")}>
                    <Crawler 
                      key={`crawler-${sessionKey}`}
                      session={activeSessionId && (!activeSession?.type || activeSession?.type === 'crawler') ? activeSession : null} 
                      userId={userId} 
                      allSessions={sessions}
                      onSelectSession={(s) => setActiveSessionId(s.id || null)}
                      onSessionCreated={setActiveSessionId} 
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'scheduler' ? "flex flex-col" : "hidden")}>
                    <SchedulerDashboard 
                      userId={userId} 
                      onOpenCrawler={(targetUrl) => {
                        setActiveTab('crawler');
                      }}
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'smart_crawler' ? "flex flex-col" : "hidden")}>
                    <SmartCrawler 
                      key={`smart-crawler-${sessionKey}`}
                      session={activeSessionId && activeSession?.type === 'smart_crawler' ? activeSession : null} 
                      userId={userId} 
                      onSessionCreated={setActiveSessionId} 
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'data_extractor' ? "flex flex-col" : "hidden")}>
                    <DataExtractor 
                      key={`data-extractor-${sessionKey}`}
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'extractor' ? "flex flex-col" : "hidden")}>
                    <Extractor 
                      key={`extractor-${sessionKey}`}
                      session={activeSessionId && activeSession?.type === 'extractor' ? activeSession : null} 
                      userId={userId} 
                      onSessionCreated={setActiveSessionId} 
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'url_processor' ? "flex flex-col" : "hidden")}>
                    <URLProcessor 
                      key={`processor-${sessionKey}`}
                      session={activeSessionId && activeSession?.type === 'url_processor' ? activeSession : null} 
                      userId={userId} 
                      onSessionCreated={setActiveSessionId} 
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'bulk' ? "flex flex-col" : "hidden")}>
                    <BulkFetcher 
                      key={`bulk-${sessionKey}`}
                      session={activeSessionId && activeSession?.type === 'bulk' ? activeSession : null}
                      userId={userId}
                      onSessionCreated={setActiveSessionId}
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'file_merge' ? "flex flex-col" : "hidden")}>
                    <FileMerger 
                      key={`file-merge-${sessionKey}`}
                      session={activeSessionId && activeSession?.type === 'file_merge' ? activeSession : null}
                      userId={userId}
                      onSessionCreated={setActiveSessionId}
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'ai_chat' ? "flex flex-col" : "hidden")}>
                    <AIChat 
                      allSessions={sessions} 
                      key={`ai-chat-${sessionKey}`}
                      session={activeSessionId && activeSession ? activeSession : null}
                      userId={userId}
                      onSessionCreated={setActiveSessionId}
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'history' ? "flex flex-col" : "hidden")}>
                    <HistoryDashboard 
                      sessions={sessions}
                      userId={userId}
                      onReRunSession={(sess) => {
                        setActiveSessionId(sess.id || null);
                        if (sess.type === 'smart_crawler') setActiveTab('smart_crawler');
                        else if (sess.type === 'extractor' || sess.type === 'data_extractor') setActiveTab('extractor');
                        else if (sess.type === 'url_processor') setActiveTab('url_processor');
                        else if (sess.type === 'bulk') setActiveTab('bulk');
                        else if (sess.type === 'ai_chat') setActiveTab('ai_chat');
                        else setActiveTab('crawler');
                      }}
                      onDeleteSession={(id) => {
                        deleteDoc(doc(db, 'sessions', id)).catch(console.error);
                      }}
                      onTogglePinSession={togglePinSession}
                      onToggleArchiveSession={toggleArchiveSession}
                      onBulkDeleteSessions={(ids) => {
                        const promises = ids.map(id => deleteDoc(doc(db, 'sessions', id)));
                        Promise.all(promises).catch(console.error);
                      }}
                      onBulkArchiveSessions={(ids, archive) => {
                        const promises = ids.map(id => updateDoc(doc(db, 'sessions', id), { isArchived: archive }));
                        Promise.all(promises).catch(console.error);
                      }}
                      onRecovery={handleRecovery}
                    />
                  </div>

                  {/* YouTube Mode Tabs */}
                  <div className={cn("w-full h-full min-h-0", appMode === 'youtube' && ytActiveTab === 'search' ? "flex flex-col" : "hidden")}>
                    <YouTubeSearch 
                      key={`yt-search-${sessionKey}`}
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'youtube' && ytActiveTab === 'analyzer' ? "flex flex-col" : "hidden")}>
                    <YouTubeAnalyzer 
                      key={`yt-analyzer-${sessionKey}`}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <GlobalScrollButtons />
      <InfoModal isOpen={infoModalOpen} onClose={() => setInfoModalOpen(false)} sessions={sessions} />
      <SessionNotesModal
        isOpen={!!selectedNotesSession}
        onClose={() => setSelectedNotesSession(null)}
        session={selectedNotesSession}
        userId={userId}
      />
    </div>
  );
}
