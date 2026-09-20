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
import { 
  Globe, FileText, Plus, History, Loader2, Menu, X, LogIn, 
  Sparkles, DownloadCloud, Trash2, Edit2, Search, Settings2, 
  Hash, Youtube, LayoutGrid, Brain, Layers, Info, Link, Merge,
  Pin, Archive, ArchiveRestore, CheckSquare, Square
} from 'lucide-react';
import { ApiUsageMonitor } from './components/ApiUsageMonitor';
import { cn, getMillis } from './lib/utils';
import { db, auth, Session, signInWithGoogle, handleFirestoreError, OperationType } from './lib/firebase';
import { collection, query, where, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { InfoModal } from './components/InfoModal';
import { TabInfoBanner } from './components/TabInfoBanner';
import { AboutPage } from './components/AboutPage';
import { GlobalExport } from './components/GlobalExport';

import { HistoryDashboard } from './components/HistoryDashboard';
import { GlobalScrollButtons } from './components/GlobalScrollButtons';

export default function App() {
  const [activeTab, setActiveTab] = useState<'crawler' | 'extractor' | 'url_processor' | 'bulk' | 'file_merge' | 'ai_chat' | 'smart_crawler' | 'data_extractor' | 'history'>('crawler');
  const [appMode, setAppMode] = useState<'general' | 'youtube' | 'about'>('general');
  const [ytActiveTab, setYtActiveTab] = useState<'search' | 'analyzer'>('search');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [sessionTab, setSessionTab] = useState<'active' | 'archived'>('active');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
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
    setSidebarOpen(false);
    
    // Clear URL param
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.pushState({path:newUrl}, '', newUrl);
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

const handleRecovery = async () => {
    if (!userId) return;
    setLoading(true);
    setSessions([]); // Clear local state to force refresh UI
    
    try {
      // Force a server fetch to bypass cache
      const { getDocs } = await import('firebase/firestore');
      const q = query(collection(db, 'sessions'), where('userId', '==', userId));
      const snapshot = await getDocs(q); // getDocs naturally tries server first unless offline
      
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
      setLoading(false);
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

  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
      if (sessionTab === 'active' && session.isArchived) return false;
      if (sessionTab === 'archived' && !session.isArchived) return false;

      if (selectedTag && (!session.tags || !session.tags.includes(selectedTag))) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = session.title?.toLowerCase().includes(q);
        const matchTag = session.tags?.some(tag => tag.toLowerCase().includes(q));
        if (!matchTitle && !matchTag) return false;
      }

      return true;
    });
  }, [sessions, sessionTab, selectedTag, searchQuery]);

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
        "fixed md:static inset-y-0 left-0 z-50 w-72 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex flex-col transition-transform duration-300 ease-in-out md:transform-none shadow-2xl md:shadow-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-lg p-1 w-full mr-2">
            <button
              onClick={() => {
                setAppMode('general');
                setActiveSessionId(null);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-all",
                appMode === 'general' ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
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
                "flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-all",
                appMode === 'youtube' ? "bg-red-500 text-white shadow-sm" : "text-zinc-500 hover:text-red-500 dark:hover:text-red-400"
              )}
            >
              <Youtube className="w-3.5 h-3.5" />
              YouTube
            </button>
          </div>
          <button className="md:hidden p-2 text-zinc-500 shrink-0" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 flex flex-col gap-3 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={handleNewSession}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Session
          </button>
          
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search sessions or #tags..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        </div>

        {/* Active vs Archived Tabs & Select Mode Toggle */}
        <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 text-xs">
          <div className="flex items-center gap-1 bg-zinc-200/70 dark:bg-zinc-800/80 p-0.5 rounded-lg">
            <button
              onClick={() => {
                setSessionTab('active');
                setSelectedSessionIds(new Set());
              }}
              className={cn(
                "px-2 py-0.5 rounded-md font-medium transition-all text-xs",
                sessionTab === 'active'
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs"
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
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs"
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
          <div className="mx-3 mt-2 p-2 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded-lg flex items-center justify-between text-xs animate-in fade-in duration-150">
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
          <div className="px-3 py-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-zinc-100 dark:border-zinc-800/80">
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

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
          {filteredSessions.length === 0 ? (
            <div className="text-center text-xs text-zinc-500 py-6">
              {sessionTab === 'archived' ? 'No archived sessions' : 'No sessions found'}
            </div>
          ) : (
            filteredSessions.map(session => {
              const isSelected = selectedSessionIds.has(session.id!);
              return (
                <div
                  key={session.id}
                  onClick={() => {
                    if (isSelectMode) {
                      toggleSelectSession(session.id!);
                    } else {
                      setActiveSessionId(session.id!);
                      setActiveTab(session.type);
                      setSessionKey(prev => prev + 1);
                      setSidebarOpen(false);
                    }
                  }}
                  className={cn(
                    "w-full flex flex-col text-left px-2.5 py-2 rounded-lg border transition-all text-xs group cursor-pointer relative",
                    activeSessionId === session.id 
                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 shadow-xs" 
                      : session.isPinned
                        ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/40 hover:border-amber-300"
                        : "bg-transparent border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className="flex items-center gap-1.5 truncate flex-1 pr-6">
                      {isSelectMode && (
                        <button
                          onClick={(e) => toggleSelectSession(session.id!, e)}
                          className="text-blue-600 shrink-0"
                        >
                          {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5 text-zinc-400" />}
                        </button>
                      )}
                      {session.isPinned && (
                        <span title="Pinned">
                          <Pin className="w-3 h-3 text-amber-500 fill-current shrink-0" />
                        </span>
                      )}
                      <span className={cn(
                        "font-medium truncate",
                        activeSessionId === session.id ? "text-blue-700 dark:text-blue-400 font-semibold" : "text-zinc-700 dark:text-zinc-300"
                      )}>
                        {session.title || 'Untitled Session'}
                      </span>
                    </div>
                    
                    {/* Action buttons on hover */}
                    <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-0.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-0.5 rounded-md shadow-xs z-10">
                      {/* Pin button */}
                      <button 
                        onClick={(e) => togglePinSession(session.id!, session.isPinned, e)}
                        className={cn(
                          "p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors",
                          session.isPinned ? "text-amber-500 hover:text-amber-600" : "text-zinc-400 hover:text-amber-500"
                        )}
                        title={session.isPinned ? "Unpin session" : "Pin to top"}
                      >
                        <Pin className={cn("w-3 h-3", session.isPinned && "fill-current")} />
                      </button>

                      {/* Archive button */}
                      <button 
                        onClick={(e) => toggleArchiveSession(session.id!, session.isArchived, e)}
                        className="p-1 hover:text-zinc-900 dark:hover:text-zinc-100 text-zinc-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                        title={session.isArchived ? "Restore to active" : "Archive session"}
                      >
                        {session.isArchived ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                      </button>

                      {/* Copy link */}
                      <button 
                        onClick={(e) => copySessionUrl(session.id!, e)}
                        className="p-1 hover:text-green-600 text-zinc-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                        title="Copy Session URL"
                      >
                        <Link className="w-3 h-3" />
                      </button>

                      {/* Rename */}
                      <button 
                        onClick={(e) => renameSession(session.id!, session.title, e)}
                        className="p-1 hover:text-blue-600 text-zinc-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                        title="Rename (#tag to tag)"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>

                      {/* Delete */}
                      <button 
                        onClick={(e) => deleteSession(session.id!, e)}
                        className="p-1 hover:text-red-600 text-zinc-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    
                    {session.type === 'crawler' ? <Globe className="w-3 h-3 text-zinc-400 shrink-0 group-hover:opacity-0" /> : 
                     session.type === 'extractor' ? <FileText className="w-3 h-3 text-zinc-400 shrink-0 group-hover:opacity-0" /> :
                     session.type === 'url_processor' ? <Settings2 className="w-3 h-3 text-zinc-400 shrink-0 group-hover:opacity-0" /> :
                     session.type === 'bulk' ? <DownloadCloud className="w-3 h-3 text-zinc-400 shrink-0 group-hover:opacity-0" /> :
                     <Sparkles className="w-3 h-3 text-zinc-400 shrink-0 group-hover:opacity-0" />}
                  </div>
                  
                  {session.tags && session.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {session.tags.map(tag => (
                        <span key={tag} className="inline-flex items-center text-[9px] bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 px-1 py-0.2 rounded font-medium">
                          <Hash className="w-2 h-2 mr-0.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 flex items-center justify-between">
                    <span>{session.results?.length || 0} items</span>
                    <span>{new Date(session.createdAt?.toDate?.() || Date.now()).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
        
        {/* Info Button at the absolute bottom of sidebar */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
          <button
            onClick={() => setInfoModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium py-2.5 rounded-xl transition-all shadow-sm"
          >
            <Info className="w-4 h-4" />
            Info
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto md:overflow-hidden relative custom-scrollbar">
        <div className="md:hidden flex items-center justify-between p-4 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-zinc-700 dark:text-zinc-300">
            <Menu className="w-6 h-6" />
          </button>
          <div className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center truncate px-2 gap-4">
            <span>{activeSessionId ? activeSession?.title : (appMode === 'youtube' ? 'YouTube Tools' : 'NIRZOR MAGIC CRAWLER')}</span>
            <button 
              onClick={() => {
                setAppMode('about');
                setActiveSessionId(null);
              }}
              className="text-sm bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors"
            >
              About
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col md:p-6 lg:p-10 min-h-0 md:overflow-hidden">
          <div className="w-full max-w-3xl mx-auto flex items-center justify-center md:justify-between mb-4">
             <div className="hidden md:flex flex-1" />
             {appMode !== 'about' && (
               <div className="flex bg-zinc-300/50 dark:bg-zinc-950 p-1 rounded-xl shrink-0 mt-4 md:mt-0 w-full overflow-x-auto md:w-auto custom-scrollbar">
                {appMode === 'general' ? (
                <>
                  <button 
                    onClick={() => setActiveTab('crawler')}
                    className={cn("flex-none py-2.5 px-4 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all", activeTab === 'crawler' ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Globe className="w-4 h-4" />
                    Crawler
                  </button>
                  <button 
                    onClick={() => setActiveTab('smart_crawler')}
                    className={cn("flex-none py-2.5 px-4 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all", activeTab === 'smart_crawler' ? "bg-white dark:bg-zinc-800 text-rose-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Brain className="w-4 h-4" />
                    Smart Crawler
                  </button>
                  <button 
                    onClick={() => setActiveTab('data_extractor')}
                    className={cn("flex-none py-2.5 px-4 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all", activeTab === 'data_extractor' ? "bg-white dark:bg-zinc-800 text-emerald-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <FileText className="w-4 h-4" />
                    Local Extractor
                  </button>
                  <button 
                    onClick={() => setActiveTab('extractor')}
                    className={cn("flex-none py-2.5 px-4 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all", activeTab === 'extractor' ? "bg-white dark:bg-zinc-800 text-emerald-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Layers className="w-4 h-4" />
                    Extractor
                  </button>
                  <button 
                    onClick={() => setActiveTab('url_processor')}
                    className={cn("flex-none py-2.5 px-4 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all", activeTab === 'url_processor' ? "bg-white dark:bg-zinc-800 text-orange-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Settings2 className="w-4 h-4" />
                    Processor
                  </button>
                  <button 
                    onClick={() => setActiveTab('bulk')}
                    className={cn("flex-none py-2.5 px-4 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all", activeTab === 'bulk' ? "bg-white dark:bg-zinc-800 text-indigo-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <DownloadCloud className="w-4 h-4" />
                    Fetch
                  </button>
                  <button 
                    onClick={() => setActiveTab('file_merge')}
                    className={cn("flex-none py-2.5 px-4 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all", activeTab === 'file_merge' ? "bg-white dark:bg-zinc-800 text-cyan-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Merge className="w-4 h-4" />
                    File Merge
                  </button>
                  <button 
                    onClick={() => setActiveTab('ai_chat')}
                    className={cn("flex-none py-2.5 px-4 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all", activeTab === 'ai_chat' ? "bg-white dark:bg-zinc-800 text-purple-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                     <Sparkles className="w-4 h-4" />
                    Chat
                  </button>
                  <button 
                    onClick={() => setActiveTab('history')}
                    className={cn("flex-none py-2.5 px-4 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all", activeTab === 'history' ? "bg-white dark:bg-zinc-800 text-amber-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <History className="w-4 h-4" />
                    History
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => setYtActiveTab('search')}
                    className={cn("flex-none py-2.5 px-4 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all", ytActiveTab === 'search' ? "bg-white dark:bg-zinc-800 text-red-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Search className="w-4 h-4" />
                    Search
                  </button>
                  <button 
                    onClick={() => setYtActiveTab('analyzer')}
                    className={cn("flex-none py-2.5 px-4 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all", ytActiveTab === 'analyzer' ? "bg-white dark:bg-zinc-800 text-red-600 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200")}
                  >
                    <Youtube className="w-4 h-4" />
                    Analyzer
                  </button>
                </>
              )}
             </div>
             )}
            <div className="hidden md:flex flex-1 justify-end items-center gap-2">
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
                      session={activeSessionId ? activeSession : null} 
                      userId={userId} 
                      onSessionCreated={setActiveSessionId} 
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'smart_crawler' ? "flex flex-col" : "hidden")}>
                    <SmartCrawler 
                      key={`smart-crawler-${sessionKey}`}
                      session={activeSessionId ? activeSession : null} 
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
                      session={activeSessionId ? activeSession : null} 
                      userId={userId} 
                      onSessionCreated={setActiveSessionId} 
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'url_processor' ? "flex flex-col" : "hidden")}>
                    <URLProcessor 
                      key={`processor-${sessionKey}`}
                      session={activeSessionId ? activeSession : null} 
                      userId={userId} 
                      onSessionCreated={setActiveSessionId} 
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'bulk' ? "flex flex-col" : "hidden")}>
                    <BulkFetcher 
                      key={`bulk-${sessionKey}`}
                      session={activeSessionId ? activeSession : null}
                      userId={userId}
                      onSessionCreated={setActiveSessionId}
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'file_merge' ? "flex flex-col" : "hidden")}>
                    <FileMerger 
                      key={`file-merge-${sessionKey}`}
                      session={activeSessionId ? activeSession : null}
                      userId={userId}
                      onSessionCreated={setActiveSessionId}
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'ai_chat' ? "flex flex-col" : "hidden")}>
                    <AIChat 
                      allSessions={sessions} 
                      key={`ai-chat-${sessionKey}`}
                      session={activeSessionId ? activeSession : null}
                      userId={userId}
                      onSessionCreated={setActiveSessionId}
                    />
                  </div>

                  <div className={cn("w-full h-full min-h-0", appMode === 'general' && activeTab === 'history' ? "flex flex-col" : "hidden")}>
                    <HistoryDashboard 
                      userId={userId}
                      onRecovery={handleRecovery}
                      sessions={sessions}
                      onDeleteSession={(id) => {
                        if (confirm('Are you sure you want to delete this session?')) {
                          deleteDoc(doc(db, 'sessions', id)).catch(err => console.error('Failed to delete session', err));
                          if (activeSessionId === id) setActiveSessionId(null);
                        }
                      }}
                      onTogglePinSession={(id, isPinned) => togglePinSession(id, isPinned)}
                      onToggleArchiveSession={(id, isArchived) => toggleArchiveSession(id, isArchived)}
                      onBulkDeleteSessions={async (ids) => {
                        try {
                          await Promise.all(ids.map(id => deleteDoc(doc(db, 'sessions', id))));
                          if (activeSessionId && ids.includes(activeSessionId)) {
                            handleNewSession();
                          }
                        } catch (err) {
                          console.error('Failed to bulk delete sessions', err);
                        }
                      }}
                      onBulkArchiveSessions={async (ids, archive) => {
                        try {
                          await Promise.all(ids.map(id => updateDoc(doc(db, 'sessions', id), { isArchived: archive })));
                          if (activeSessionId && ids.includes(activeSessionId) && archive) {
                            handleNewSession();
                          }
                        } catch (err) {
                          console.error('Failed to bulk archive sessions', err);
                        }
                      }}
                      onReRunSession={(session) => {
                        setActiveSessionId(session.id || null);
                        setActiveTab(session.type as any);
                        setSessionKey(prev => prev + 1);
                      }}
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
    </div>
  );
}
