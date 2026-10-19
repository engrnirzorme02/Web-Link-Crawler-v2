import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Copy, CheckCircle2, AlertCircle, Link as LinkIcon, Globe, FileText, Settings, Loader2, ChevronDown, ChevronUp, Terminal, Download, Save, Zap, Trash2, Layers, Upload, Search, Cloud, CloudOff, Check, X, Edit2, Info, FolderOpen, Shield, Mail, Phone, Share2, Network, CalendarClock, Code2, Sparkles, RotateCcw, Minus, Plus, BarChart3 } from 'lucide-react';
import { cn, truncateForFirestore, cleanAndSanitizeUrl, extractSafeHostname } from '../lib/utils';
import { createEventSourceConnection, fetchWithRetry, logNetworkEvent } from '../lib/api';
import { Session, db, ParsedPageData } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { CrawlVisualizer } from './CrawlVisualizer';
import { CrawlerSessionManagerModal } from './CrawlerSessionManagerModal';
import { SessionNotesModal } from './SessionNotesModal';
import { SitemapVisualizer } from './SitemapVisualizer';
import { ContentEntitiesViewer } from './ContentEntitiesViewer';
import { usePersistedConfig } from '../hooks/usePersistedConfig';

type CrawlMode = 'single' | 'subdir' | 'domain';

interface CrawlResult {
  url: string;
  source: string;
}

interface LogEntry {
  time: string;
  message: string;
}

interface CrawlerProps {
  session: Session | null;
  userId: string | null;
  allSessions?: Session[];
  onSelectSession?: (session: Session) => void;
  onSessionCreated: (id: string) => void;
}

const STATIC_MEDIA_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'pdf', 'zip', 'css', 'js', 'mp4', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'avi', 'mov', 'mp3', 'wav', 'tar', 'gz'];

export default function Crawler({ session, userId, allSessions = [], onSelectSession, onSessionCreated }: CrawlerProps) {
  const [url, setUrl] = useState('');
  
  // Persisted configurations with usePersistedConfig
  const [crawlPreset, setCrawlPreset, resetCrawlPreset] = usePersistedConfig<'single' | 'depth' | 'domain'>('crawler_preset', 'domain');
  const [mode, setMode, resetMode] = usePersistedConfig<CrawlMode>('crawler_mode', 'domain');
  const [maxPages, setMaxPages, resetMaxPages] = usePersistedConfig<string>('crawler_maxPages', '50');
  const [maxDepth, setMaxDepth, resetMaxDepth] = usePersistedConfig<string>('crawler_maxDepth', '2');
  const [maxBreadth, setMaxBreadth, resetMaxBreadth] = usePersistedConfig<string>('crawler_maxBreadth', '100');
  const [skipStaticAssets, setSkipStaticAssets, resetSkipStaticAssets] = usePersistedConfig<boolean>('crawler_skipStaticAssets', true);
  const [fileTypes, setFileTypes, resetFileTypes] = usePersistedConfig<string>('crawler_fileTypes', '');
  const [includePatterns, setIncludePatterns, resetIncludePatterns] = usePersistedConfig<string>('crawler_includePatterns', '');
  const [excludePatterns, setExcludePatterns, resetExcludePatterns] = usePersistedConfig<string>('crawler_excludePatterns', '');
  const [excludeExtensions, setExcludeExtensions, resetExcludeExtensions] = usePersistedConfig<string>('crawler_excludeExtensions', '');
  const [excludePaths, setExcludePaths, resetExcludePaths] = usePersistedConfig<string>('crawler_excludePaths', '');
  const [includeDomains, setIncludeDomains, resetIncludeDomains] = usePersistedConfig<string>('crawler_includeDomains', '');
  const [excludeDomains, setExcludeDomains, resetExcludeDomains] = usePersistedConfig<string>('crawler_excludeDomains', '');
  const [includePathPattern, setIncludePathPattern, resetIncludePathPattern] = usePersistedConfig<string>('crawler_includePathPattern', '');
  const [verboseMode, setVerboseMode, resetVerboseMode] = usePersistedConfig<boolean>('crawler_verboseMode', false);
  const [keywordFilters, setKeywordFilters, resetKeywordFilters] = usePersistedConfig<string>('crawler_keywordFilters', '');
  const [subdomainOnly, setSubdomainOnly, resetSubdomainOnly] = usePersistedConfig<boolean>('crawler_subdomainOnly', true);
  const [restrictDomain, setRestrictDomain, resetRestrictDomain] = usePersistedConfig<string>('crawler_restrictDomain', '');
  const [crawlDelay, setCrawlDelay, resetCrawlDelay] = usePersistedConfig<string>('crawler_crawlDelay', '0');
  const [extractAll, setExtractAll, resetExtractAll] = usePersistedConfig<boolean>('crawler_extractAll', true);
  const [fuzzPaths, setFuzzPaths, resetFuzzPaths] = usePersistedConfig<boolean>('crawler_fuzzPaths', true);
  const [customRegex, setCustomRegex, resetCustomRegex] = usePersistedConfig<string>('crawler_customRegex', '');
  
  const [resetFeedback, setResetFeedback] = useState(false);
  const [copiedCleanUrls, setCopiedCleanUrls] = useState(false);

  const handleResetToFactoryDefaults = () => {
    resetCrawlPreset();
    resetMode();
    resetMaxPages();
    resetMaxDepth();
    resetMaxBreadth();
    resetSkipStaticAssets();
    resetFileTypes();
    resetIncludePatterns();
    resetExcludePatterns();
    resetExcludeExtensions();
    resetExcludePaths();
    resetIncludeDomains();
    resetExcludeDomains();
    resetIncludePathPattern();
    resetVerboseMode();
    resetKeywordFilters();
    resetSubdomainOnly();
    resetRestrictDomain();
    resetCrawlDelay();
    resetExtractAll();
    resetFuzzPaths();
    resetCustomRegex();
    setResetFeedback(true);
    setTimeout(() => setResetFeedback(false), 2000);
  };

  const handleSelectPreset = (preset: 'single' | 'depth' | 'domain') => {
    setCrawlPreset(preset);
    if (preset === 'single') {
      setMode('single');
      setMaxDepth('0');
    } else if (preset === 'depth') {
      setMode('subdir');
      const d = parseInt(maxDepth, 10);
      if (isNaN(d) || d < 1 || d > 5) {
        setMaxDepth('2');
      }
    } else if (preset === 'domain') {
      setMode('domain');
      setMaxDepth('5');
      setSubdomainOnly(true);
    }
  };

  const handleStepDepth = (delta: number) => {
    const current = parseInt(maxDepth, 10) || 2;
    const next = Math.max(1, Math.min(5, current + delta));
    setMaxDepth(next.toString());
  };

  const handleCopyCleanUrls = () => {
    if (results.length === 0) return;
    const cleanList = Array.from(new Set(results.map(r => cleanAndSanitizeUrl(r.url)).filter(Boolean)));
    navigator.clipboard.writeText(cleanList.join('\n'));
    setCopiedCleanUrls(true);
    setTimeout(() => setCopiedCleanUrls(false), 2200);
  };

  const [pageDataMap, setPageDataMap] = useState<Map<string, ParsedPageData>>(new Map());
  const [resultsViewTab, setResultsViewTab] = useState<'urls' | 'sitemap' | 'entities' | 'graph'>('urls');
  
  const [isCrawling, setIsCrawling] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [results, setResults] = useState<CrawlResult[]>([]);
  const [statusMessage, setStatusMessage] = useState('Ready to crawl');
  const [error, setError] = useState('');
  const [copiedCategory, setCopiedCategory] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'config' | 'results' | 'visualize'>('config');
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ 
    pagesCrawled: 0, 
    totalLinks: 0, 
    errors: 0,
    queueLength: 0,
    currentUrl: '',
    currentDepth: 0
  });
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sessionTitle, setSessionTitle] = useState(session?.title || '');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  
  // Real-time Crawl Progress & Performance Tracking
  const [crawlStartTime, setCrawlStartTime] = useState<number | null>(null);
  const [crawlElapsedSeconds, setCrawlElapsedSeconds] = useState(0);
  const [batchTargetIndex, setBatchTargetIndex] = useState(0);
  const [batchTotalTargets, setBatchTotalTargets] = useState(0);
  const [crawlDone, setCrawlDone] = useState(false);
  const [terminalReason, setTerminalReason] = useState<string | null>(null);

  useEffect(() => {
    let interval: any = null;
    if (isCrawling && crawlStartTime) {
      interval = setInterval(() => {
        setCrawlElapsedSeconds(Math.floor((Date.now() - crawlStartTime) / 1000));
      }, 500);
    } else if (!isCrawling && interval) {
      clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCrawling, crawlStartTime]);
  
  const [visibleResultCount, setVisibleResultCount] = useState(100);

  const [attachedFiles, setAttachedFiles] = useState<{name: string, content: string}[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          setAttachedFiles(prev => [...prev, { name: file.name, content: text }]);
        }
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };
  
  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  const eventSourceRef = useRef<{ close: () => void } | null>(null);
  const resultsEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  
  const loadedSessionIdRef = useRef<string | null>(null);
  
  const currentSessionRef = useRef<Session | null>(null);
  currentSessionRef.current = session;
  const resultsRef = useRef<CrawlResult[]>([]);
  resultsRef.current = results;

  // Handle clicking outside export menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExport = (format: 'csv' | 'json' | 'txt' | 'md') => {
    const rawData = selectedUrls.size > 0 
      ? results.filter(r => selectedUrls.has(r.url))
      : results;
    
    const dataToExport = rawData.map(r => ({
      ...r,
      url: cleanAndSanitizeUrl(r.url)
    })).filter(r => Boolean(r.url));
    
    if (dataToExport.length === 0) return;

    let content = '';
    let type = '';
    let extension = '';

    if (format === 'csv') {
      content = 'URL,Source\n' + dataToExport.map(r => {
        const u = cleanAndSanitizeUrl(r.url) || r.url;
        return `"${u}","${r.source}"`;
      }).join('\n');
      type = 'text/csv;charset=utf-8;';
      extension = 'csv';
    } else if (format === 'json') {
      content = JSON.stringify(dataToExport.map(r => cleanAndSanitizeUrl(r.url) || r.url), null, 2);
      type = 'application/json;charset=utf-8;';
      extension = 'json';
    } else if (format === 'txt') {
      content = dataToExport.map(r => cleanAndSanitizeUrl(r.url) || r.url).join('\n');
      type = 'text/plain;charset=utf-8;';
      extension = 'txt';
    } else if (format === 'md') {
      content = `# Crawled URLs Report\nDate: ${new Date().toLocaleString()}\nTotal URLs: ${dataToExport.length}\n\n` +
        dataToExport.map(r => {
          const u = cleanAndSanitizeUrl(r.url) || r.url;
          return `- ${u} (${r.source})`;
        }).join('\n');
      type = 'text/markdown;charset=utf-8;';
      extension = 'md';
    }

    const blob = new Blob([content], { type });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    const safeTitle = (sessionTitle || 'nexus_crawler_results').replace(/[^a-z0-9_-]/gi, '_');
    link.setAttribute('download', `${safeTitle}_${selectedUrls.size > 0 ? 'selected' : 'all'}.${extension}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const handleRenameSession = async () => {
    if (!session?.id || !sessionTitle.trim()) return;
    try {
      setSaveStatus("saving");
      await updateDoc(doc(db, 'sessions', session.id), {
        title: sessionTitle.trim(),
        updatedAt: serverTimestamp()
      });
      setSaveStatus("saved");
      setIsEditingTitle(false);
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e) {
      console.error("Failed to rename session:", e);
      setSaveStatus("error");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUrls.size === 0) return;
    const newResults = results.filter(r => !selectedUrls.has(r.url));
    setResults(newResults);
    setSelectedUrls(new Set());
    
    if (session && session.id) {
      try {
        const dataToUpdate = truncateForFirestore({ results: newResults });
        setSaveStatus("saving"); await updateDoc(doc(db, 'sessions', session.id), {
          ...dataToUpdate,
          updatedAt: serverTimestamp()
        }); setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 3000);
      } catch (e) {
        console.error("Failed to update firestore:", e);
      }
    }
  };

  const toggleSelection = (urlStr: string) => {
    const newSet = new Set(selectedUrls);
    if (newSet.has(urlStr)) {
      newSet.delete(urlStr);
    } else {
      newSet.add(urlStr);
    }
    setSelectedUrls(newSet);
  };

  const selectAll = () => {
    if (selectedUrls.size === results.length) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(results.map(r => r.url)));
    }
  };

  // Load session data when session changes
  useEffect(() => {
    if (session && session.id !== loadedSessionIdRef.current) {
      // If we are currently actively crawling, do NOT interrupt or reset UI state!
      if (isCrawlingRef.current) {
        loadedSessionIdRef.current = session.id;
        return;
      }

      if (!session.type || session.type === 'crawler') {
        const rawResults = Array.isArray(session.results) ? session.results : [];
        const sanitizedSessionResults = rawResults.map((r: any) => {
          if (typeof r === 'string') {
            const u = cleanAndSanitizeUrl(r);
            return { url: u, status: 200, depth: 0, source: 'seed' };
          }
          return {
            ...r,
            url: cleanAndSanitizeUrl(r?.url || '')
          };
        }).filter(r => Boolean(r.url));
        setResults(sanitizedSessionResults);
        setStats(prev => ({ ...prev, totalLinks: sanitizedSessionResults.length }));
      } else {
        setResults([]);
        setStats(prev => ({ ...prev, totalLinks: 0 }));
      }
      if (session.title) {
        setSessionTitle(session.title);
      }
      if (session.url) {
        setUrl(session.url);
      }
      if (session.settings) {
        setMode(session.settings.mode || 'domain');
        setMaxPages(session.settings.maxPages || '50');
        setMaxDepth(session.settings.maxDepth || '3');
        if (session.settings.maxBreadth) setMaxBreadth(session.settings.maxBreadth);
        setFileTypes(session.settings.fileTypes || '');
        setIncludePatterns(session.settings.includePatterns || '');
        setExcludePatterns(session.settings.excludePatterns || '');
        setExcludeExtensions(session.settings.excludeExtensions || '');
        setExcludePaths(session.settings.excludePaths || '');
        setIncludeDomains(session.settings.includeDomains || '');
        setExcludeDomains(session.settings.excludeDomains || '');
        setIncludePathPattern(session.settings.includePathPattern || '');
        setVerboseMode(session.settings.verboseMode ?? false);
        setSubdomainOnly(session.settings.subdomainOnly ?? true);
        setRestrictDomain(session.settings.restrictDomain || '');
        setCrawlDelay(session.settings.crawlDelay?.toString() || '0');
        setExtractAll(session.settings.extractAll ?? true);
        setFuzzPaths(session.settings.fuzzPaths ?? true);
      }
      setIsCrawling(false);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      loadedSessionIdRef.current = session.id;
    } else if (!session && loadedSessionIdRef.current) {
      if (isCrawlingRef.current) {
        return;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsCrawling(false);
      setResults([]);
      setLogs([]);
      setStats({ pagesCrawled: 0, totalLinks: 0, errors: 0, queueLength: 0, currentUrl: '', currentDepth: 0 });
      setUrl('');
      setSessionTitle('');
      setStatusMessage('Ready to crawl');
      loadedSessionIdRef.current = null;
    }
  }, [session]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const [logsAutoScroll, setLogsAutoScroll] = useState(true);

  const handleLogsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setLogsAutoScroll(isAtBottom);
  };

  const logsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsAutoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, logsAutoScroll]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message }]);
  };

  const isCrawlingRef = useRef(false);

  const handleSubdomainDiscovery = async () => {
    let targetUrls = url.split('\n').map(u => u.trim()).filter(Boolean);
    if (targetUrls.length === 0) {
      setError('Please enter at least one URL');
      return;
    }
    setError('');
    
    // Use the first valid URL to get the hostname
    let targetDomain = '';
    try {
        const u = new URL(targetUrls[0].startsWith('http') ? targetUrls[0] : 'https://' + targetUrls[0]);
        targetDomain = u.hostname;
    } catch(e) {
        setError('Invalid URL format');
        return;
    }

    setIsDiscovering(true);
    setStatusMessage(`Discovering subdomains for ${targetDomain}...`);
    addLog(`Starting subdomain discovery for ${targetDomain}...`);

    try {
        const response = await fetch(`/api/subdomains?domain=${encodeURIComponent(targetDomain)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch subdomains');
        }
        
        const data = await response.json();
        const foundSubdomains: string[] = data.subdomains || [];
        
        if (foundSubdomains.length > 0) {
             const newResults = foundSubdomains.map(sub => ({
                 url: `https://${sub}`,
                 source: 'subdomain_discovery'
             }));
             
             setResults(prev => {
                const existingUrls = new Set(prev.map(r => r.url));
                const uniqueNew = newResults.filter(r => !existingUrls.has(r.url));
                return [...uniqueNew, ...prev];
             });
             addLog(`Discovered ${foundSubdomains.length} subdomains.`);
             setStatusMessage(`Discovered ${foundSubdomains.length} subdomains.`);
             setStats(prev => ({ ...prev, totalLinks: prev.totalLinks + foundSubdomains.length }));
        } else {
             addLog(`No subdomains found via active discovery.`);
             setStatusMessage('Discovery complete. No new subdomains found.');
        }

    } catch (err: any) {
        console.error(err);
        addLog(`Subdomain discovery failed: ${err.message}`);
        setError('Subdomain discovery failed');
        setStatusMessage('Error during discovery');
    } finally {
        setIsDiscovering(false);
    }
  };

  const handleStart = async (overrides?: { 
    mode: 'single'|'subdir'|'domain', 
    maxPages: string, 
    maxDepth: string, 
    maxBreadth?: string, 
    extractAll: boolean, 
    fuzzPaths: boolean, 
    subdomainOnly: boolean, 
    fileTypes: string, 
    includePatterns?: string, 
    excludePatterns?: string, 
    excludeExtensions?: string, 
    excludePaths?: string, 
    includeDomains?: string, 
    excludeDomains?: string, 
    includePathPattern?: string, 
    verboseMode?: boolean, 
    keywordFilters?: string,
    restrictDomain?: string,
    crawlDelay?: string
  }) => {
    let combinedText = url;
    if (attachedFiles.length > 0) {
      combinedText += '\n' + attachedFiles.map(f => f.content).join('\n');
    }

    const urlRegex = /(?:https?:\/\/)[^\s"'<>\]\[\)\{\}]+/gi;
    let rawUrls = combinedText.split(/\s+/).map(u => u.trim()).filter(Boolean);
    
    // Check if there are no URLs at all
    if (rawUrls.length === 0) {
      setError('Please enter at least one URL or attach a file with URLs');
      return;
    }
    
    let validUrls: string[] = [];
    for (let targetUrl of rawUrls) {
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }
      try {
        new URL(targetUrl);
        validUrls.push(targetUrl);
      } catch {
        // Skip invalid formats silently instead of failing the whole batch
      }
    }

    // Static Assets & Media filter before dispatching network requests
    const STATIC_ASSET_EXT_REGEX = /\.(jpe?g|png|gif|svg|webp|pdf|zip|css|js|mp4)(\?.*)?$/i;
    if (skipStaticAssets) {
      const originalCount = validUrls.length;
      validUrls = validUrls.filter(u => {
        try {
          const pathname = new URL(u).pathname;
          return !STATIC_ASSET_EXT_REGEX.test(pathname);
        } catch {
          return true;
        }
      });
      if (validUrls.length < originalCount) {
        addLog(`[Skip Static Assets] Filtered out ${originalCount - validUrls.length} media/asset seed URL(s) before network request.`);
      }
    }
    
    if (validUrls.length === 0) {
      setError('Could not find any valid HTML page URLs. (Static assets were skipped by filter).');
      return;
    }
    
    // Only clear attached files after we have valid URLs
    setAttachedFiles([]);

    if (overrides) {
      setMode(overrides.mode);
      setMaxPages(overrides.maxPages);
      setMaxDepth(overrides.maxDepth);
      if (overrides.maxBreadth) setMaxBreadth(overrides.maxBreadth);
      setExtractAll(overrides.extractAll);
      setFuzzPaths(overrides.fuzzPaths);
      setSubdomainOnly(overrides.subdomainOnly);
      setFileTypes(overrides.fileTypes);
      if (overrides.includePatterns) setIncludePatterns(overrides.includePatterns);
      if (overrides.excludePatterns) setExcludePatterns(overrides.excludePatterns);
      if (overrides.excludeExtensions) setExcludeExtensions(overrides.excludeExtensions);
      if (overrides.excludePaths) setExcludePaths(overrides.excludePaths);
      if (overrides.includeDomains) setIncludeDomains(overrides.includeDomains);
      if (overrides.excludeDomains) setExcludeDomains(overrides.excludeDomains);
      if (overrides.includePathPattern) setIncludePathPattern(overrides.includePathPattern);
      if (overrides.verboseMode !== undefined) setVerboseMode(overrides.verboseMode);
    }

    let finalMode = overrides ? overrides.mode : mode;
    let autoSwitched = false;

    // Auto-detect massive platforms to prevent infinite crawling
    const massiveDomains = ['github.com', 'twitter.com', 'x.com', 'linkedin.com', 'facebook.com', 'instagram.com', 'reddit.com', 'youtube.com', 'medium.com', 'pinterest.com', 'tiktok.com', 'amazon.com'];
    for (const u of validUrls) {
      try {
        const hostname = new URL(u).hostname;
        const isMassive = massiveDomains.some(d => hostname === d || hostname.endsWith('.' + d));
        // If it's a massive domain and mode is 'domain', we switch to 'subdir'
        if (isMassive && finalMode === 'domain') {
          finalMode = 'subdir';
          autoSwitched = true;
          break;
        }
      } catch {}
    }

    if (autoSwitched) {
      setMode('subdir');
      if (overrides) overrides.mode = 'subdir';
      addLog('Warning: Target is a massive platform (e.g. GitHub, Twitter). Auto-switched boundary to "Directory" to prevent infinite crawling and focus on the specific profile/path.');
    }

    setError('');
    // DO NOT clear results here to allow merging multiple runs in the same session
    // We clear logs and stats for the CURRENT run only.
    setLogs([]);
    setStats({ pagesCrawled: 0, totalLinks: results.length, errors: 0, queueLength: 0, currentUrl: '', currentDepth: 0 });
    setCrawlStartTime(Date.now());
    setCrawlElapsedSeconds(0);
    setCrawlDone(false);
    setBatchTargetIndex(1);
    setBatchTotalTargets(validUrls.length);
    setIsCrawling(true);
    isCrawlingRef.current = true;
    setCrawlDone(false);
    setTerminalReason(null);
    
    setStatusMessage(overrides ? 'Starting Deep All-in-One Extract...' : 'Starting crawl...');
    setMobileTab('results');
    addLog(overrides ? `Deep Extract Initialization started for ${validUrls.length} URL(s).` : `Initialization started for ${validUrls.length} URL(s).`);
    
    let activeSessionId = currentSessionRef.current?.id;
    let newSessionObj: Session | null = currentSessionRef.current;
    
    const currentMode = overrides?.mode ?? mode;
    const currentMaxPages = overrides?.maxPages ?? maxPages;
    const currentMaxDepth = overrides?.maxDepth ?? maxDepth;
    const currentMaxBreadth = overrides?.maxBreadth ?? maxBreadth;
    const currentExtractAll = overrides?.extractAll ?? extractAll;
    const currentFuzzPaths = overrides?.fuzzPaths ?? fuzzPaths;
    const currentSubdomainOnly = overrides?.subdomainOnly ?? subdomainOnly;
    const currentFileTypes = overrides?.fileTypes ?? fileTypes;
    const currentIncludePatterns = overrides?.includePatterns ?? includePatterns;
    const currentExcludePatterns = overrides?.excludePatterns ?? excludePatterns;
    const currentExcludeExtensions = overrides?.excludeExtensions ?? excludeExtensions;
    const currentExcludePaths = overrides?.excludePaths ?? excludePaths;
    const currentIncludeDomains = overrides?.includeDomains ?? includeDomains;
    const currentExcludeDomains = overrides?.excludeDomains ?? excludeDomains;
    const currentIncludePathPattern = overrides?.includePathPattern ?? includePathPattern;
    const currentVerboseMode = overrides?.verboseMode ?? verboseMode;
    const currentKeywordFilters = overrides?.keywordFilters ?? keywordFilters;
    const currentRestrictDomain = overrides?.restrictDomain ?? restrictDomain;
    const currentCrawlDelay = overrides?.crawlDelay ?? crawlDelay;

    // Auto-create session if it doesn't exist and user is logged in
    if (!activeSessionId && userId) {
      try {
        const domain = extractSafeHostname(validUrls[0], 'Website');
        const newSession: Session = truncateForFirestore({
          userId,
          type: 'crawler',
          title: `Crawl: ${domain}${validUrls.length > 1 ? ` +${validUrls.length - 1} more` : ''}`,
          results: resultsRef.current,
          logs: [],
          url: url,
          settings: {
            mode: currentMode,
            maxPages: currentMaxPages,
            maxDepth: currentMaxDepth,
            maxBreadth: currentMaxBreadth,
            crawlDelay: currentCrawlDelay,
            restrictDomain: currentRestrictDomain,
            fileTypes: currentFileTypes,
            includePatterns: currentIncludePatterns,
            excludePatterns: currentExcludePatterns,
            excludeExtensions: currentExcludeExtensions,
            excludePaths: currentExcludePaths,
            includeDomains: currentIncludeDomains,
            excludeDomains: currentExcludeDomains,
            includePathPattern: currentIncludePathPattern,
            verboseMode: currentVerboseMode,
            subdomainOnly: currentSubdomainOnly,
            extractAll: currentExtractAll,
            fuzzPaths: currentFuzzPaths,
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setSaveStatus("saving"); const docRef = await addDoc(collection(db, 'sessions'), newSession);
        activeSessionId = docRef.id;
        loadedSessionIdRef.current = docRef.id;
        onSessionCreated(docRef.id);
        newSessionObj = { id: docRef.id, ...newSession };
      } catch (err) {
        console.error("Failed to create session", err);
      }
    } else if (activeSessionId && userId) {
      // Update title and settings
      try {
        const domain = extractSafeHostname(validUrls[0], 'Website');
        setSaveStatus("saving"); await updateDoc(doc(db, 'sessions', activeSessionId), {
          title: sessionTitle || `Crawl: ${domain}${validUrls.length > 1 ? ` +${validUrls.length - 1} more` : ''} (Merged)`,
          url: url,
          settings: {
            mode: currentMode,
            maxPages: currentMaxPages,
            maxDepth: currentMaxDepth,
            maxBreadth: currentMaxBreadth,
            crawlDelay: currentCrawlDelay,
            restrictDomain: currentRestrictDomain,
            fileTypes: currentFileTypes,
            includePatterns: currentIncludePatterns,
            excludePatterns: currentExcludePatterns,
            excludeExtensions: currentExcludeExtensions,
            excludePaths: currentExcludePaths,
            includeDomains: currentIncludeDomains,
            excludeDomains: currentExcludeDomains,
            includePathPattern: currentIncludePathPattern,
            verboseMode: currentVerboseMode,
            subdomainOnly: currentSubdomainOnly,
            extractAll: currentExtractAll,
            fuzzPaths: currentFuzzPaths,
          },
          updatedAt: serverTimestamp(),
        }); setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 3000);
      } catch (e) {}
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    let totalGlobalLinks = resultsRef.current.length;
    let basePagesCrawled = 0;
    let baseErrors = 0;

    for (let i = 0; i < validUrls.length; i++) {
      if (!isCrawlingRef.current) break;
      
      const targetUrl = validUrls[i];
      setBatchTargetIndex(i + 1);
      addLog(`[${i+1}/${validUrls.length}] Starting crawl for: ${targetUrl}`);
      setStatusMessage(`[${i+1}/${validUrls.length}] Crawling: ${extractSafeHostname(targetUrl)}...`);

      let effectiveExcludeExtensions = currentExcludeExtensions.trim();
      if (skipStaticAssets) {
        const staticExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'pdf', 'zip', 'css', 'js', 'mp4'];
        const userExts = effectiveExcludeExtensions ? effectiveExcludeExtensions.split(',').map(s => s.trim().replace(/^\./, '')) : [];
        effectiveExcludeExtensions = Array.from(new Set([...userExts, ...staticExts])).filter(Boolean).join(',');
      }

      const query = new URLSearchParams({
        url: targetUrl,
        mode: currentMode,
        maxPages: currentMaxPages,
        maxDepth: currentMaxDepth,
        maxBreadth: currentMaxBreadth,
        extractAll: currentExtractAll.toString(),
        fuzzPaths: currentFuzzPaths.toString(),
        subdomainOnly: currentSubdomainOnly.toString(),
        verbose: currentVerboseMode.toString(),
        fileTypes: currentFileTypes.trim(),
        includePatterns: currentIncludePatterns.trim(),
        excludePatterns: currentExcludePatterns.trim(),
        excludeExtensions: effectiveExcludeExtensions,
        excludePaths: currentExcludePaths.trim(),
        includeDomains: currentIncludeDomains.trim(),
        excludeDomains: currentExcludeDomains.trim(),
        includePathPattern: currentIncludePathPattern.trim(),
        keywordFilters: currentKeywordFilters.trim(),
        restrictDomain: currentRestrictDomain.trim(),
        crawlDelay: currentCrawlDelay.trim()
      });

      if (customRegex.trim()) {
        query.append('customRegex', customRegex.trim());
      }

      let urlPagesCount = 0;
      let urlErrorsCount = 0;

      await new Promise<void>((resolve) => {
        let isResolved = false;
        const finish = () => {
          if (!isResolved) {
            isResolved = true;
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              eventSourceRef.current = null;
            }
            basePagesCrawled += urlPagesCount;
            baseErrors += urlErrorsCount;
            resolve();
          }
        };

        const sseConnection = createEventSourceConnection({
          url: `/api/crawl?${query.toString()}`,
          onLog: (msg) => addLog(msg),
          onMessage: (data) => {
            if (!isCrawlingRef.current) {
              finish();
              return;
            }

            if (data.type === 'status') {
              if (data.message) setStatusMessage(`[${i+1}/${validUrls.length}] ` + data.message);
              if (data.log) addLog(data.log);
              if (data.stats) {
                urlPagesCount = data.stats.pagesCrawled ?? urlPagesCount;
                urlErrorsCount = data.stats.errors ?? urlErrorsCount;
                setStats(prev => ({
                  ...prev,
                  pagesCrawled: basePagesCrawled + (data.stats.pagesCrawled ?? 0),
                  errors: baseErrors + (data.stats.errors ?? 0),
                  queueLength: data.stats.queueLength ?? prev.queueLength,
                  currentUrl: data.stats.currentUrl ?? prev.currentUrl,
                  currentDepth: data.stats.currentDepth ?? prev.currentDepth,
                  totalLinks: totalGlobalLinks
                }));
              }
            } else if (data.type === 'page_data') {
              setPageDataMap(prev => {
                const next = new Map(prev);
                next.set(data.url, {
                  url: data.url,
                  metadata: data.metadata,
                  entities: data.entities
                });
                return next;
              });
            } else if (data.type === 'link') {
              const cleanedUrl = cleanAndSanitizeUrl(data.url);
              if (!cleanedUrl) return;
              if (skipStaticAssets) {
                try {
                  const pathname = new URL(cleanedUrl).pathname;
                  if (STATIC_ASSET_EXT_REGEX.test(pathname)) return;
                } catch {}
              }
              setResults(prev => {
                if (prev.some(r => r.url === cleanedUrl)) return prev;
                return [{ url: cleanedUrl, source: data.source }, ...prev];
              });
              totalGlobalLinks++;
              setStats(s => ({ ...s, totalLinks: totalGlobalLinks }));
            } else if (data.type === 'done') {
              if (data.terminalReason) {
                setTerminalReason(data.terminalReason);
              }
              addLog(`[${i+1}/${validUrls.length}] Finished (${data.terminalReason || 'done'}). Pages: ${data.pagesCrawled}, New Links: ${data.total}, Errors: ${data.errors}`);
              finish();
            } else if (data.type === 'error') {
              setError(`Error on ${targetUrl}: ${data.message}`);
              addLog(`Fatal Error on ${targetUrl}: ${data.message}`);
              finish();
            }
          },
          onError: (fatalError) => {
            setError(`Connection error on ${targetUrl}: ${fatalError}`);
            addLog(`Skipping ${targetUrl} after connection failures.`);
            finish();
          }
        });

        eventSourceRef.current = sseConnection;
      });
    }

    if (isCrawlingRef.current) {
      setStatusMessage(`Completed processing ${validUrls.length} URL(s).`);
      addLog(`Bulk crawl finished.`);
      setIsCrawling(false);
      setCrawlDone(true);
      isCrawlingRef.current = false;
      
      if (activeSessionId && userId) {
        const dataToUpdate = truncateForFirestore({ results: resultsRef.current });
        updateDoc(doc(db, 'sessions', activeSessionId), {
          ...dataToUpdate,
          updatedAt: serverTimestamp(),
        }).then(() => { setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 3000); }).catch((e) => { console.error(e); setSaveStatus("error"); setTimeout(() => setSaveStatus("idle"), 3000); });
      }
    }
  };

  const handleStop = () => {
    isCrawlingRef.current = false;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setIsCrawling(false);
    setStatusMessage('Crawling stopped manually.');
    addLog('User aborted the crawl.');
  };

  const copyAll = () => {
    if (results.length === 0) return;
    const textToCopy = results.map(r => cleanAndSanitizeUrl(r.url)).filter(Boolean).join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopiedCategory('all');
    setTimeout(() => setCopiedCategory(null), 2000);
  };

  const removeDuplicates = async () => {
    if (results.length === 0) return;
    
    // Create a Map to keep only unique sanitized URLs
    const uniqueMap = new Map<string, CrawlResult>();
    
    for (const result of results) {
      const cleaned = cleanAndSanitizeUrl(result.url);
      if (cleaned && !uniqueMap.has(cleaned)) {
        uniqueMap.set(cleaned, { ...result, url: cleaned });
      }
    }
    
    const uniqueResults = Array.from(uniqueMap.values());
    
    setResults(uniqueResults);
    setStats(prev => ({ ...prev, totalLinks: uniqueResults.length }));
    
    // Update session if active
    if (currentSessionRef.current?.id) {
      try {
        const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
        const dataToUpdate = truncateForFirestore({ results: uniqueResults });
        setSaveStatus("saving"); await updateDoc(doc(db, 'sessions', currentSessionRef.current.id), {
          ...dataToUpdate,
          updatedAt: serverTimestamp(),
        }); setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 3000);
      } catch (e) {
        console.error("Failed to update session after removing duplicates", e);
      }
    }
  };

  const downloadCleanTxt = () => {
    if (results.length === 0) return;
    let fileName = 'crawler_clean_urls';
    try {
      const rawUrls = url.split('\n').map(u => u.trim()).filter(Boolean);
      if (rawUrls.length > 0) {
        let firstUrl = rawUrls[0];
        if (!firstUrl.startsWith('http')) firstUrl = 'https://' + firstUrl;
        const parsedUrl = new URL(firstUrl);
        const pathStr = parsedUrl.pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '_');
        fileName = parsedUrl.hostname + (pathStr ? '_' + pathStr : '');
        if (rawUrls.length > 1) {
          fileName += `_and_${rawUrls.length - 1}_more`;
        }
      }
    } catch (e) {}
    fileName = `${fileName} (${results.length}).txt`;

    const cleanUrls = results.map(r => cleanAndSanitizeUrl(r.url)).filter(Boolean) as string[];
    const blob = new Blob([cleanUrls.join('\n')], { type: 'text/plain;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  };

  const downloadMD = () => {
    if (results.length === 0) return;
    
    let fileName = 'crawler_results';
    try {
      const rawUrls = url.split('\n').map(u => u.trim()).filter(Boolean);
      if (rawUrls.length > 0) {
        let firstUrl = rawUrls[0];
        if (!firstUrl.startsWith('http')) firstUrl = 'https://' + firstUrl;
        const parsedUrl = new URL(firstUrl);
        const pathStr = parsedUrl.pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '_');
        fileName = parsedUrl.hostname + (pathStr ? '_' + pathStr : '');
        if (rawUrls.length > 1) {
          fileName += `_and_${rawUrls.length - 1}_more`;
        }
      }
    } catch (e) {}
    fileName = `${fileName} (${results.length}).md`;

    let content = `# Crawl Results\n\n`;
    content += `Total links found: ${results.length}\n\n`;
    results.forEach((r, index) => {
      const cleaned = cleanAndSanitizeUrl(r.url);
      if (cleaned) {
        content += `${index + 1}. ${cleaned} (Source: ${r.source})\n`;
      }
    });

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  };

  const categorizedResults = React.useMemo(() => {
    if (!url) return { internal: results, subdomain: [], external: [] };
    try {
      const rawUrls = url.split('\n').map(u => u.trim()).filter(Boolean);
      if (rawUrls.length === 0) return { internal: results, subdomain: [], external: [] };
      
      const startHostnames = rawUrls.map(u => extractSafeHostname(u)).filter(Boolean) as string[];
      
      if (startHostnames.length === 0) return { internal: results, subdomain: [], external: [] };
      
      const baseDomains = startHostnames.map(h => h.startsWith('www.') ? h.slice(4) : h);

      return {
        internal: results.filter(r => {
          const h = extractSafeHostname(r.url);
          return Boolean(h && startHostnames.includes(h));
        }),
        subdomain: results.filter(r => {
          const h = extractSafeHostname(r.url);
          return Boolean(h && !startHostnames.includes(h) && baseDomains.some(base => h.endsWith('.' + base)));
        }),
        external: results.filter(r => {
          const h = extractSafeHostname(r.url);
          return Boolean(h && !startHostnames.includes(h) && !baseDomains.some(base => h.endsWith('.' + base)));
        })
      };
    } catch {
      return { internal: results, subdomain: [], external: [] };
    }
  }, [results, url]);

  const copyCategory = (categoryResults: CrawlResult[], categoryName: string) => {
    if (categoryResults.length === 0) return;
    const textToCopy = categoryResults.map(r => cleanAndSanitizeUrl(r.url)).filter(Boolean).join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopiedCategory(categoryName);
    setTimeout(() => setCopiedCategory(null), 2000);
  };

  const renderResultItem = (result: CrawlResult, index: number) => (
    <div 
      key={result.url + index} 
      onClick={() => toggleSelection(result.url)}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors group cursor-pointer",
        selectedUrls.has(result.url) 
          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" 
          : "bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
      )}
    >
      <input 
        type="checkbox" 
        checked={selectedUrls.has(result.url)}
        onChange={() => {}} // handled by parent div click
        className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer pointer-events-none shrink-0"
      />
      <div className="flex-1 truncate text-sm text-zinc-800 dark:text-zinc-300 font-mono">
        {result.url}
      </div>
      <div className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 uppercase font-medium hidden md:block shrink-0">
        {result.source}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-auto md:h-full pb-16 md:pb-0 w-full bg-zinc-50 dark:bg-zinc-950 md:rounded-[24px] lg:rounded-[32px] md:shadow-2xl md:border border-zinc-200/50 dark:border-zinc-800/50 md:overflow-hidden relative">

      {/* Sticky Android View Controller (Settings & Targets vs Live Results & Logs) */}
      <div className="md:hidden sticky top-0 z-20 flex items-center p-1.5 bg-white/95 dark:bg-[#1F2420]/95 backdrop-blur-md border-b border-[#DCE2DC] dark:border-[#3A443D] gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('config')}
          className={cn(
            "flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98]",
            mobileTab === 'config'
              ? "bg-[#287653] text-white shadow-xs"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          )}
        >
          <Settings className="w-4 h-4" />
          <span>Config & Targets</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('results')}
          className={cn(
            "flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98]",
            mobileTab === 'results'
              ? "bg-[#287653] text-white shadow-xs"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          )}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Results & Logs</span>
          {results.length > 0 && (
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[10px] font-mono",
              mobileTab === 'results' ? "bg-white/20 text-white" : "bg-[#287653] text-white"
            )}>
              {results.length}
            </span>
          )}
          {isCrawling && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
          )}
        </button>
      </div>

      <div className="flex flex-col md:flex-row flex-1 md:min-h-0 md:overflow-hidden">
        {/* Left Column: Configuration */}
        <div className={cn(
          "w-full md:w-[380px] flex-none md:flex-1 flex-shrink-0 bg-white dark:bg-zinc-900 md:border-r border-zinc-200 dark:border-zinc-800 flex flex-col md:min-h-0",
          mobileTab === 'config' ? 'flex' : 'hidden md:flex'
        )}>
          <div className="flex-1 md:overflow-y-auto p-5 md:p-6 space-y-6 custom-scrollbar">
            
            {/* Quick Session Manager & Export Action Bar (Material Design 3 card style) */}
            <div className="flex items-center justify-between p-2.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 rounded-2xl">
              <div className="flex items-center gap-2 pl-1">
                <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Session & Data</span>
              </div>
              <button
                type="button"
                onClick={() => setSessionManagerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Save / Load / Export</span>
              </button>
            </div>

            {/* Target URL */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Target URL(s)</label>
                <label className="cursor-pointer flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                  <Upload className="w-4 h-4" />
                  <span>Upload File(s)</span>
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                </label>
              </div>
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {attachedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800/30 text-xs">
                      <FileText className="w-3 h-3" />
                      <span className="max-w-[120px] truncate">{file.name}</span>
                      <button 
                        type="button" 
                        onClick={() => removeAttachedFile(idx)}
                        className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-200"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea 
                placeholder="https://example.com&#10;https://another.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isCrawling}
                rows={3}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 disabled:opacity-60 transition-colors rounded-lg resize-y custom-scrollbar"
              />
              <p className="text-[10px] text-zinc-400 mt-1">Enter multiple URLs (one per line) for bulk processing.</p>
            </div>

            {/* Mobile 3-Mode Segmented Pill Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Crawl Scope
                </label>
                <span className="text-[11px] text-zinc-400 font-medium">
                  {crawlPreset === 'single' ? 'Direct page links (depth 0)' : crawlPreset === 'depth' ? `Depth limited (${maxDepth} level${Number(maxDepth) > 1 ? 's' : ''})` : 'Full domain boundary'}
                </span>
              </div>

              <div className="grid grid-cols-3 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 gap-1">
                <button
                  type="button"
                  onClick={() => handleSelectPreset('single')}
                  disabled={isCrawling}
                  className={cn(
                    "min-h-[44px] flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-semibold transition-all active:scale-[0.98]",
                    crawlPreset === 'single'
                      ? "bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  )}
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="truncate">Single Page</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPreset('depth')}
                  disabled={isCrawling}
                  className={cn(
                    "min-h-[44px] flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-semibold transition-all active:scale-[0.98]",
                    crawlPreset === 'depth'
                      ? "bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-400 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  )}
                >
                  <Layers className="w-4 h-4 shrink-0" />
                  <span className="truncate">Depth Limited</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPreset('domain')}
                  disabled={isCrawling}
                  className={cn(
                    "min-h-[44px] flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-semibold transition-all active:scale-[0.98]",
                    crawlPreset === 'domain'
                      ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  )}
                >
                  <Globe className="w-4 h-4 shrink-0" />
                  <span className="truncate">Entire Domain</span>
                </button>
              </div>

              {/* Depth Stepper for Depth Limited mode */}
              {crawlPreset === 'depth' && (
                <div className="p-3 bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 rounded-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div>
                    <span className="text-xs font-semibold text-purple-950 dark:text-purple-200 block">
                      Crawl Depth Limit
                    </span>
                    <span className="text-[11px] text-purple-700/80 dark:text-purple-400/80">
                      Follow links up to {maxDepth} level{Number(maxDepth) > 1 ? 's' : ''} deep
                    </span>
                  </div>

                  <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-purple-200 dark:border-purple-800/80 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleStepDepth(-1)}
                      disabled={isCrawling || Number(maxDepth) <= 1}
                      className="w-10 h-10 min-h-[40px] rounded-lg bg-zinc-100 hover:bg-purple-100 dark:bg-zinc-800 dark:hover:bg-purple-900/40 text-zinc-700 dark:text-zinc-300 disabled:opacity-40 flex items-center justify-center transition-colors active:scale-95"
                      title="Decrease Depth"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center font-bold text-sm text-purple-700 dark:text-purple-300 font-mono">
                      {maxDepth}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStepDepth(1)}
                      disabled={isCrawling || Number(maxDepth) >= 5}
                      className="w-10 h-10 min-h-[40px] rounded-lg bg-zinc-100 hover:bg-purple-100 dark:bg-zinc-800 dark:hover:bg-purple-900/40 text-zinc-700 dark:text-zinc-300 disabled:opacity-40 flex items-center justify-center transition-colors active:scale-95"
                      title="Increase Depth"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Toggle: Skip Static Assets & Media */}
              <label className="min-h-[44px] flex items-center justify-between p-3 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/80 transition-colors cursor-pointer group">
                <div className="pr-3">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">
                    Skip Static Assets & Media
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Purges .jpg, .png, .gif, .svg, .webp, .pdf, .zip, .css, .js, .mp4 before proxy
                  </span>
                </div>
                <div className="relative flex items-center shrink-0">
                  <input
                    type="checkbox"
                    checked={skipStaticAssets}
                    onChange={(e) => setSkipStaticAssets(e.target.checked)}
                    disabled={isCrawling}
                    className="peer sr-only"
                  />
                  <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 disabled:opacity-50"></div>
                </div>
              </label>
            </div>

            {/* Advanced Settings Accordion */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-950">
              <button 
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  <Settings className="w-4 h-4" />
                  Advanced Settings
                </div>
                {showAdvanced ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
              </button>
              
              {showAdvanced && (
                <div className="p-4 space-y-5">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Max Pages</label>
                      <input 
                        type="number" 
                        min="1"
                        value={maxPages}
                        onChange={(e) => setMaxPages(e.target.value)}
                        disabled={isCrawling || mode === 'single'}
                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Max Depth</label>
                      <input 
                        type="number" 
                        min="1"
                        max="10"
                        value={maxDepth}
                        onChange={(e) => setMaxDepth(e.target.value)}
                        disabled={isCrawling || mode === 'single'}
                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Max Breadth</label>
                      <input 
                        type="number" 
                        min="1"
                        value={maxBreadth}
                        onChange={(e) => setMaxBreadth(e.target.value)}
                        disabled={isCrawling || mode === 'single'}
                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Filter File Extensions (comma separated)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. pdf, docx, json"
                      value={fileTypes}
                      onChange={(e) => setFileTypes(e.target.value)}
                      disabled={isCrawling}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-[10px] text-zinc-400 mt-1">Leave empty to collect all links. These are INCLUDED extensions.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Include Patterns (Regex, comma separated)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. /blog, .*article.*"
                      value={includePatterns}
                      onChange={(e) => setIncludePatterns(e.target.value)}
                      disabled={isCrawling}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 flex items-center gap-1.5">
                      <span>Include Path Pattern (Prefix or Wildcard/Regex)</span>
                      <span className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold">Subdir Focus</span>
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. /docs/*, /blog/, ^/api/v1/.*"
                      value={includePathPattern}
                      onChange={(e) => setIncludePathPattern(e.target.value)}
                      disabled={isCrawling}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-[10px] text-zinc-400 mt-1">Locks the crawl strictly within this subdirectory or folder path (prevents escaping to other site areas).</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Include Additional Domains</label>
                      <input 
                        type="text" 
                        placeholder="e.g. cdn.site.com, api.site.com"
                        value={includeDomains}
                        onChange={(e) => setIncludeDomains(e.target.value)}
                        disabled={isCrawling}
                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[10px] text-zinc-400 mt-1">Comma-separated extra domains to traverse.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Exclude Domains</label>
                      <input 
                        type="text" 
                        placeholder="e.g. youtube.com, twitter.com"
                        value={excludeDomains}
                        onChange={(e) => setExcludeDomains(e.target.value)}
                        disabled={isCrawling}
                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[10px] text-zinc-400 mt-1">Skip crawling any links on these domains.</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Exclude Patterns (Regex, comma separated)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. /login, .*admin.*"
                      value={excludePatterns}
                      onChange={(e) => setExcludePatterns(e.target.value)}
                      disabled={isCrawling}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Exclude Extensions (comma separated)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. pdf, jpg, png, zip, mp4"
                      value={excludeExtensions}
                      onChange={(e) => setExcludeExtensions(e.target.value)}
                      disabled={isCrawling}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Exclude Paths (comma separated)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. /wp-content/, /assets/, /api/"
                      value={excludePaths}
                      onChange={(e) => setExcludePaths(e.target.value)}
                      disabled={isCrawling}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-blue-500" />
                        <span>Restrict to Specific Domain / Subdomain</span>
                      </label>
                      <input 
                        type="text" 
                        placeholder="e.g. blog.example.com or example.com"
                        value={restrictDomain}
                        onChange={(e) => setRestrictDomain(e.target.value)}
                        disabled={isCrawling}
                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[10px] text-zinc-400 mt-1">Strict boundary: Discards discovered links that don't match this exact host.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                        Polite Crawl Delay (ms)
                      </label>
                      <input 
                        type="number" 
                        min="0"
                        max="10000"
                        step="100"
                        placeholder="0"
                        value={crawlDelay}
                        onChange={(e) => setCrawlDelay(e.target.value)}
                        disabled={isCrawling}
                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[10px] text-zinc-400 mt-1">Delay between consecutive requests (e.g. 500ms to avoid rate limits).</p>
                    </div>
                  </div>

                  <div className="p-3 bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 rounded-xl">
                    <label className="block text-xs font-semibold text-purple-900 dark:text-purple-300 mb-1 flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Custom Path Filter Regex</span>
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. ^https://example\.com/blog/.*"
                      value={customRegex}
                      onChange={(e) => setCustomRegex(e.target.value)}
                      disabled={isCrawling}
                      className="w-full bg-white dark:bg-zinc-900 border border-purple-200 dark:border-purple-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                    <p className="text-[10px] text-purple-700/70 dark:text-purple-400/80 mt-1">
                      Real-time crawler filter: Only links matching this regular expression will be queued and parsed.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Keyword Filters (Page Content - comma separated)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. pricing, contact, documentation"
                      value={keywordFilters}
                      onChange={(e) => setKeywordFilters(e.target.value)}
                      disabled={isCrawling}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-3 pt-2">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input type="checkbox" checked={subdomainOnly} onChange={(e) => setSubdomainOnly(e.target.checked)} disabled={isCrawling || mode !== 'domain'} className="peer sr-only" />
                        <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 disabled:opacity-50"></div>
                      </div>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">Strict Subdomain Only</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input type="checkbox" checked={extractAll} onChange={(e) => setExtractAll(e.target.checked)} disabled={isCrawling} className="peer sr-only" />
                        <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 disabled:opacity-50"></div>
                      </div>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">Deep JS/JSON Extraction</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input type="checkbox" checked={fuzzPaths} onChange={(e) => setFuzzPaths(e.target.checked)} disabled={isCrawling} className="peer sr-only" />
                        <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 disabled:opacity-50"></div>
                      </div>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">Fuzz Common API Paths</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input type="checkbox" checked={verboseMode} onChange={(e) => setVerboseMode(e.target.checked)} disabled={isCrawling} className="peer sr-only" />
                        <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 disabled:opacity-50"></div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                          Verbose Decision Logging
                          <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.2 rounded font-mono font-normal">Inspector</span>
                        </span>
                        <span className="text-[11px] text-zinc-400">Prints skip/accept reasons for every URL in the live terminal.</span>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Tactile Reset to Factory Defaults Action */}
            <button
              type="button"
              onClick={handleResetToFactoryDefaults}
              className="w-full min-h-[44px] py-2.5 px-3 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-900/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all text-xs font-medium flex items-center justify-center gap-2 active:scale-[0.98]"
              title="Reset all crawler parameters to pristine initial defaults"
            >
              <RotateCcw className={cn("w-3.5 h-3.5", resetFeedback && "animate-spin text-emerald-500")} />
              <span>{resetFeedback ? "Defaults Restored!" : "Reset to Factory Defaults"}</span>
            </button>

            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl border border-red-200 dark:border-red-800/30 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>
          
          {/* Fixed Bottom Action Button */}
          <div className="p-4 border-t border-[#DCE2DC] dark:border-[#3A443D] bg-white dark:bg-[#1F2420] shadow-[0_-4px_15px_rgba(0,0,0,0.03)] dark:shadow-none z-10 shrink-0">
            {!isCrawling ? (
              <div className="flex flex-col gap-2.5">
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    handleStart();
                  }}
                  className="w-full min-h-[48px] flex items-center justify-center gap-2 bg-[#287653] hover:bg-[#216345] dark:bg-[#287653] dark:hover:bg-[#216345] text-white font-semibold py-3.5 rounded-xl transition-all shadow-sm active:scale-[0.98] text-sm"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>Start Crawl</span>
                </button>

                <div className="flex gap-2">
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      handleStart({
                        mode: 'domain',
                        maxPages: '1000',
                        maxDepth: '10',
                        extractAll: true,
                        fuzzPaths: true,
                        subdomainOnly: false,
                        fileTypes: ''
                      });
                    }}
                    className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium py-2.5 rounded-xl transition-all text-xs active:scale-[0.98]"
                    title="Deep recursive multi-page extraction"
                  >
                    <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 fill-current" />
                    <span>Deep Extract</span>
                  </button>
                  {results.length > 0 && (
                    <button 
                      onClick={async (e) => {
                        e.preventDefault();
                        if (confirm('This will clear the current results. Continue?')) {
                          setResults([]);
                          resultsRef.current = [];
                          setSelectedUrls(new Set());
                          if (currentSessionRef.current?.id) {
                            try {
                              const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
                              setSaveStatus("saving"); await updateDoc(doc(db, 'sessions', currentSessionRef.current.id), {
                                results: [],
                                updatedAt: serverTimestamp()
                              }); setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 3000);
                            } catch (e) {}
                          }
                          handleStart();
                        }
                      }}
                      className="flex items-center justify-center gap-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 font-medium px-4 py-3 rounded-xl transition-all active:scale-[0.98]"
                      title="Clear results and re-run"
                    >
                      <Trash2 className="w-5 h-5 fill-current opacity-70" />
                      Re-run
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button 
                onClick={handleStop}
                className="w-full min-h-[48px] flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium py-3.5 rounded-xl transition-all shadow-sm active:scale-[0.98]"
              >
                <Square className="w-5 h-5 fill-current" />
                Stop Extraction
              </button>
            )}

            {/* Visual Progress Bar (Left Column) - Honest Telemetry */}
            {(isCrawling || crawlDone) && (
              <div className="mt-3 p-3.5 bg-[#F0F2EF] dark:bg-[#262D28] border border-[#DCE2DC] dark:border-[#3A443D] rounded-xl space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
                    {isCrawling ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 text-[#287653] dark:text-[#75B992] animate-spin" />
                        <span>Crawling in progress...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Crawl Completed</span>
                      </>
                    )}
                  </div>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200 px-2 py-0.5 rounded bg-white dark:bg-[#1F2420] border border-[#DCE2DC] dark:border-[#3A443D] text-[11px] font-mono tabular-nums">
                    {crawlDone ? "100%" : `${Math.min(99, Math.round((stats.pagesCrawled / Math.max(1, (batchTotalTargets || 1) * (Number(maxPages) || 50))) * 100))}%`}
                  </span>
                </div>

                {/* Progress Track */}
                <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden p-0.5">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      crawlDone 
                        ? "bg-[#287653] dark:bg-[#75B992]" 
                        : "bg-[#287653] dark:bg-[#75B992] opacity-80"
                    )}
                    style={{ width: `${crawlDone ? 100 : Math.min(99, Math.round((stats.pagesCrawled / Math.max(1, (batchTotalTargets || 1) * (Number(maxPages) || 50))) * 100))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">
                  <span className="font-mono tabular-nums">
                    {stats.pagesCrawled} crawled / {(batchTotalTargets || 1) * (Number(maxPages) || 50)} cap · Queue: {stats.queueLength}
                    {batchTotalTargets > 1 && ` (URL ${batchTargetIndex}/${batchTotalTargets})`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {terminalReason && (
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
                        terminalReason === 'queue_exhausted' ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" :
                        terminalReason === 'max_pages_reached' ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" :
                        terminalReason === 'stopped' ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" :
                        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                      )}>
                        {terminalReason.replace(/_/g, ' ')}
                      </span>
                    )}
                    {crawlElapsedSeconds > 0 && (
                      <span className="font-mono tabular-nums">
                        {Math.floor(crawlElapsedSeconds / 60)}:{(crawlElapsedSeconds % 60).toString().padStart(2, '0')}s
                        {stats.pagesCrawled > 0 && ` (${(stats.pagesCrawled / Math.max(1, crawlElapsedSeconds)).toFixed(1)}/s)`}
                      </span>
                    )}
                  </div>
                </div>

                {stats.currentUrl && isCrawling && (
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate font-mono bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded-lg border border-blue-100 dark:border-zinc-800">
                    <span className="text-blue-500 font-semibold mr-1">URL:</span>
                    {stats.currentUrl}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Output & Monitoring */}
        <div className={cn(
          "flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden",
          mobileTab === 'results' ? 'flex' : 'hidden md:flex'
        )}>
          
          {/* Session Title & Cloud Sync Header */}
          <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isEditingTitle ? (
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <input
                    type="text"
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    placeholder="Session title..."
                    className="bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-700 w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSession();
                      if (e.key === 'Escape') { setIsEditingTitle(false); setSessionTitle(session?.title || ''); }
                    }}
                    autoFocus
                  />
                  <button onClick={handleRenameSession} className="p-1 text-emerald-600 hover:text-emerald-700" title="Save Title"><Check className="w-4 h-4" /></button>
                  <button onClick={() => { setIsEditingTitle(false); setSessionTitle(session?.title || ''); }} className="p-1 text-zinc-400 hover:text-zinc-600" title="Cancel"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0 group">
                  <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200 truncate">
                    {sessionTitle || (url ? `Crawl: ${extractSafeHostname(url, 'Active Crawl Workspace')}` : 'Active Crawl Workspace')}
                  </span>
                  {session?.id && (
                    <button onClick={() => setIsEditingTitle(true)} className="opacity-60 hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-600 transition-opacity" title="Rename Session">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 shrink-0">
              <button
                type="button"
                onClick={() => setNotesModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-xs"
                title="Session Rich-Text Notes"
              >
                <FileText className={cn("w-3.5 h-3.5", session?.notes ? "text-amber-500" : "text-zinc-400")} />
                <span>Notes</span>
                {session?.notes && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
              </button>
              <button
                type="button"
                onClick={() => setSessionManagerOpen(true)}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-xs"
                title="Manage Sessions and Export"
              >
                <FolderOpen className="w-3.5 h-3.5 text-blue-500" />
                <span>Sessions & Export</span>
              </button>
              {saveStatus === 'saving' && <span className="flex items-center gap-1 text-blue-500"><Loader2 className="w-3 h-3 animate-spin" /> Syncing</span>}
              {saveStatus === 'saved' && <span className="flex items-center gap-1 text-emerald-500"><Cloud className="w-3 h-3" /> Saved</span>}
              {saveStatus === 'error' && <span className="flex items-center gap-1 text-red-500"><CloudOff className="w-3 h-3" /> Sync Failed</span>}
              {saveStatus === 'idle' && <span className="flex items-center gap-1 text-zinc-400"><Cloud className="w-3 h-3" /> Cloud Synced</span>}
            </div>
          </div>

          {/* Visual Progress Bar (Right Column - Real-time Progress Status Card) */}
          {(isCrawling || crawlDone) && (
            <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-white dark:from-blue-950/40 dark:via-zinc-900 dark:to-zinc-900 border-b border-blue-200/80 dark:border-blue-900/50 p-3.5 md:p-4 shrink-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs",
                    isCrawling ? "bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400" : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
                  )}>
                    {isCrawling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        {isCrawling ? 'Crawling Target Stream' : 'Crawl Batch Finished'}
                      </h4>
                      {batchTotalTargets > 0 && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                          Target {batchTargetIndex} / {batchTotalTargets}
                        </span>
                      )}
                    </div>
                    {stats.currentUrl && isCrawling ? (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-sm md:max-w-xl font-mono mt-0.5">
                        Active URL: {stats.currentUrl}
                      </p>
                    ) : (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {statusMessage}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-medium">
                      {stats.pagesCrawled} / {(batchTotalTargets || 1) * (Number(maxPages) || 50)} pgs
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1">
                      <LinkIcon className="w-3 h-3 text-emerald-500" />
                      <span>{stats.totalLinks} links</span>
                    </span>
                    {stats.errors > 0 && (
                      <span className="px-2 py-1 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-red-500" />
                        <span>{stats.errors}</span>
                      </span>
                    )}
                  </div>

                  <div className="text-right pl-2 border-l border-zinc-200 dark:border-zinc-800">
                    <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                      {Math.min(100, Math.round((stats.pagesCrawled / Math.max(1, (batchTotalTargets || 1) * (Number(maxPages) || 50))) * 100))}%
                    </span>
                    {crawlElapsedSeconds > 0 && (
                      <div className="text-[10px] text-zinc-400">
                        {Math.floor(crawlElapsedSeconds / 60)}:{(crawlElapsedSeconds % 60).toString().padStart(2, '0')}s
                        {stats.pagesCrawled > 0 && ` (${(stats.pagesCrawled / Math.max(1, crawlElapsedSeconds)).toFixed(1)}/s)`}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Real-time Visual Progress Track */}
              <div className="w-full bg-blue-100 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden p-0.5 border border-blue-200/60 dark:border-zinc-700/60">
                <div 
                  className={cn(
                    "bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 h-full rounded-full transition-all duration-300",
                    isCrawling ? "animate-pulse" : ""
                  )}
                  style={{ width: `${Math.min(100, Math.max(isCrawling ? 3 : 0, Math.round((stats.pagesCrawled / Math.max(1, (batchTotalTargets || 1) * (Number(maxPages) || 50))) * 100)))}%` }}
                />
              </div>
            </div>
          )}

          {/* Live Progress Stats */}
          <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-3.5 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 shrink-0">
            <div className="flex flex-col">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Status</span>
              <div className="flex items-center gap-1.5 mt-1">
                {isCrawling ? <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> : <span className="w-2 h-2 rounded-full bg-zinc-400" />}
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{statusMessage}</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Pages Visited</span>
              <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                {stats.pagesCrawled} <span className="text-xs font-normal text-zinc-400">/ {maxPages}</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">In Queue</span>
              <span className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">{stats.queueLength}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Links Found</span>
              <span className="text-lg font-semibold text-blue-600 dark:text-blue-400 mt-0.5">{stats.totalLinks}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Errors</span>
              <span className="text-lg font-semibold text-red-600 dark:text-red-400 mt-0.5">{stats.errors}</span>
            </div>
          </div>

          {/* Results View Switcher Tab Bar */}
          <div className="bg-zinc-100/80 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700/60 text-xs">
              <button
                type="button"
                onClick={() => setResultsViewTab('urls')}
                className={cn(
                  "px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5",
                  resultsViewTab === 'urls' 
                    ? "bg-blue-600 text-white shadow-2xs" 
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                )}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                URLs List ({results.length})
              </button>

              <button
                type="button"
                onClick={() => setResultsViewTab('sitemap')}
                className={cn(
                  "px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5",
                  resultsViewTab === 'sitemap' 
                    ? "bg-blue-600 text-white shadow-2xs" 
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                Sitemap & Hierarchy
              </button>

              <button
                type="button"
                onClick={() => setResultsViewTab('entities')}
                className={cn(
                  "px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5",
                  resultsViewTab === 'entities' 
                    ? "bg-blue-600 text-white shadow-2xs" 
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Entities & Metadata {pageDataMap.size > 0 && `(${pageDataMap.size})`}
              </button>

              <button
                type="button"
                onClick={() => setResultsViewTab('graph')}
                className={cn(
                  "px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5",
                  resultsViewTab === 'graph' 
                    ? "bg-blue-600 text-white shadow-2xs" 
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                )}
              >
                <Network className="w-3.5 h-3.5" />
                Link Network Graph
              </button>
            </div>
          </div>

          {resultsViewTab === 'sitemap' && (
            <div className="flex-1 p-4 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
              <SitemapVisualizer 
                results={results} 
                initialUrl={url.split('\n')[0] || undefined} 
              />
            </div>
          )}

          {resultsViewTab === 'entities' && (
            <div className="flex-1 p-4 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
              <ContentEntitiesViewer 
                pageDataMap={pageDataMap} 
                results={results} 
              />
            </div>
          )}

          {resultsViewTab === 'graph' && (
            <div className="flex-1 overflow-hidden relative bg-white dark:bg-zinc-950">
              <CrawlVisualizer results={results} isCrawling={isCrawling} />
            </div>
          )}

          {resultsViewTab === 'urls' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Links Results */}
            <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 overflow-hidden relative">
              <div className="bg-zinc-100/50 dark:bg-zinc-900/50 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Extracted URLs</span>
                  {results.length > 0 && (
                    <span className="text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                      {results.length} Total
                    </span>
                  )}
                </div>
                
                {results.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={selectAll}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      {selectedUrls.size === results.length ? 'Deselect All' : `Select All (${results.length})`}
                    </button>
                    
                    {selectedUrls.size > 0 && (
                      <button 
                        onClick={handleBulkDelete}
                        className="p-1 text-red-500 hover:text-red-700 transition-colors"
                        title="Delete Selected"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    
                    <div className="relative" ref={exportMenuRef}>
                      <button 
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="flex items-center gap-1 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                        title="Export links"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{selectedUrls.size > 0 ? `Export (${selectedUrls.size})` : 'Export All'}</span>
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {showExportMenu && (
                        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[160px]">
                          <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-700">
                            {selectedUrls.size > 0 ? `Exporting ${selectedUrls.size} URLs` : `Exporting All ${results.length} URLs`}
                          </div>
                          <button 
                            onClick={() => handleExport('csv')}
                            className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                          >
                            Export as CSV (.csv)
                          </button>
                          <button 
                            onClick={() => handleExport('json')}
                            className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                          >
                            Export as JSON (.json)
                          </button>
                          <button 
                            onClick={() => handleExport('txt')}
                            className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                          >
                            Export as TXT (.txt)
                          </button>
                          <button 
                            onClick={() => handleExport('md')}
                            className="w-full text-left px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 border-t border-zinc-100 dark:border-zinc-700"
                          >
                            Export as Markdown (.md)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 md:p-4">
                {results.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600">
                    <LinkIcon className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-sm">Awaiting URLs...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {categorizedResults.internal.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between sticky top-0 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur py-2 z-10">
                          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Same Domain ({categorizedResults.internal.length})</h3>
                          <button onClick={() => copyCategory(categorizedResults.internal, 'internal')} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-md transition-colors font-medium">
                            {copiedCategory === 'internal' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedCategory === 'internal' ? 'Copied' : 'Copy All'}
                          </button>
                        </div>
                        <div className="space-y-1">
                          {categorizedResults.internal.slice(0, visibleResultCount).map(renderResultItem)}
                        </div>
                      </div>
                    )}
                    
                    {categorizedResults.subdomain.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between sticky top-0 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur py-2 z-10">
                          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Subdomains ({categorizedResults.subdomain.length})</h3>
                          <button onClick={() => copyCategory(categorizedResults.subdomain, 'subdomain')} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-md transition-colors font-medium">
                            {copiedCategory === 'subdomain' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedCategory === 'subdomain' ? 'Copied' : 'Copy All'}
                          </button>
                        </div>
                        <div className="space-y-1">
                          {categorizedResults.subdomain.slice(0, Math.max(0, visibleResultCount - categorizedResults.internal.length)).map(renderResultItem)}
                        </div>
                      </div>
                    )}
                    
                    {categorizedResults.external.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between sticky top-0 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur py-2 z-10">
                          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">External Links ({categorizedResults.external.length})</h3>
                          <button onClick={() => copyCategory(categorizedResults.external, 'external')} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-md transition-colors font-medium">
                            {copiedCategory === 'external' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedCategory === 'external' ? 'Copied' : 'Copy All'}
                          </button>
                        </div>
                        <div className="space-y-1">
                          {categorizedResults.external.slice(0, Math.max(0, visibleResultCount - categorizedResults.internal.length - categorizedResults.subdomain.length)).map(renderResultItem)}
                        </div>
                      </div>
                    )}
                    
                    {results.length > visibleResultCount && (
                      <div className="flex items-center justify-center gap-4 py-4 mt-6 border-t border-zinc-200 dark:border-zinc-800/50">
                        <span className="text-sm text-zinc-500 font-medium">Showing {visibleResultCount} of {results.length}</span>
                        <button 
                          onClick={() => setVisibleResultCount(p => p + 200)}
                          className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-sm"
                        >
                          Load More
                        </button>
                        <button 
                          onClick={() => setVisibleResultCount(results.length)}
                          className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-sm"
                        >
                          Expand All
                        </button>
                      </div>
                    )}

                    <div ref={resultsEndRef} />
                  </div>
                )}
              </div>

              {/* Sticky Mobile Bottom Action Bar over Crawl Results */}
              {results.length > 0 && (
                <div className="sticky bottom-0 left-0 right-0 p-3 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200/90 dark:border-zinc-800 z-20 flex items-center gap-2 pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
                  <button
                    onClick={handleCopyCleanUrls}
                    className="flex-1 min-h-[48px] bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs sm:text-sm"
                    title="1-Tap Copy all clean deduplicated URLs to Android clipboard"
                  >
                    {copiedCleanUrls ? <CheckCircle2 className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedCleanUrls ? `Copied ${results.length} URLs!` : `Copy Clean URLs (${results.length})`}</span>
                  </button>

                  <button
                    onClick={downloadCleanTxt}
                    className="min-h-[48px] px-3.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-semibold rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all shrink-0"
                    title="Download pure clean URLs (.txt)"
                  >
                    <Download className="w-4 h-4" />
                    <span>.TXT</span>
                  </button>

                  <button
                    onClick={removeDuplicates}
                    className="min-h-[48px] px-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all shrink-0"
                    title="Deduplicate URLs"
                  >
                    <Layers className="w-4 h-4 text-purple-500" />
                    <span className="hidden sm:inline">Dedup</span>
                  </button>
                </div>
              )}
            </div>

            {/* Terminal / Live Logs */}
            <div className="h-56 md:h-auto md:w-[320px] flex-shrink-0 flex flex-col bg-zinc-950 text-zinc-300 font-mono text-xs relative border-t md:border-t-0 md:border-l border-zinc-800">
              <div className="bg-zinc-900 px-3 py-2 flex items-center justify-between border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="font-semibold text-zinc-300 text-xs">Live Console</span>
                  {logs.length > 0 && (
                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.2 rounded">
                      {logs.length}
                    </span>
                  )}
                </div>
                {logs.length > 0 && (
                  <button
                    onClick={() => setLogs([])}
                    className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors text-[10px] flex items-center gap-1"
                    title="Clear live console"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar" onScroll={handleLogsScroll} ref={logsContainerRef}>
                {logs.length === 0 ? (
                  <div className="text-zinc-600 italic py-4 text-center">System ready. Waiting for task...</div>
                ) : (
                  logs.map((log, i) => {
                    const msg = log.message;
                    const lower = msg.toLowerCase();
                    let color = 'text-zinc-300';
                    if (lower.includes('error') || lower.includes('fail') || lower.includes('fatal') || msg.includes('404') || msg.includes('500')) {
                      color = 'text-red-400 font-semibold';
                    } else if (msg.startsWith('[ACCEPT') || lower.includes('finished') || lower.includes('success')) {
                      color = 'text-emerald-400 font-medium';
                    } else if (msg.startsWith('[SKIP')) {
                      color = 'text-amber-300/80';
                    } else if (msg.startsWith('[QUEUED') || msg.startsWith('[HTTP') || msg.startsWith('[FETCH')) {
                      color = 'text-sky-300';
                    } else if (msg.includes('Starting crawl') || msg.includes('Initialization started')) {
                      color = 'text-blue-400 font-semibold';
                    }

                    return (
                      <div key={i} className="flex items-start gap-1.5 leading-relaxed break-all font-mono text-[11px]">
                        <span className="text-zinc-600 shrink-0 select-none">[{log.time}]</span>
                        <span className={color}>
                          {msg}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
      
      {/* Mobile Bottom Navigation with Android Gesture Inset Safety */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 flex border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md z-50 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-safe">
        <button 
          onClick={() => setMobileTab('config')}
          className={cn("flex-1 min-h-[48px] py-2 flex flex-col items-center justify-center gap-0.5 transition-colors", mobileTab === 'config' ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400")}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Config</span>
        </button>
        <button 
          onClick={() => setSessionManagerOpen(true)}
          className="flex-1 min-h-[48px] py-2 flex flex-col items-center justify-center gap-0.5 transition-colors text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400"
        >
          <FolderOpen className="w-5 h-5" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Sessions</span>
        </button>
        <button 
          onClick={() => setMobileTab('results')}
          className={cn("flex-1 min-h-[48px] py-2 flex flex-col items-center justify-center gap-0.5 transition-colors", mobileTab === 'results' ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400")}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Results</span>
        </button>
      </div>

      {/* Crawler Session Manager Modal for Android UI/UX */}
      <CrawlerSessionManagerModal
        isOpen={sessionManagerOpen}
        onClose={() => setSessionManagerOpen(false)}
        userId={userId}
        sessions={allSessions}
        activeSession={session}
        currentSettings={{
          url,
          mode,
          maxPages,
          maxDepth,
          maxBreadth,
          crawlDelay,
          restrictDomain,
          includePatterns,
          excludePatterns,
          fileTypes,
          subdomainOnly,
          extractAll,
          fuzzPaths,
          verboseMode,
        }}
        currentResults={results}
        onLoadSession={(loadedSession) => {
          if (onSelectSession) {
            onSelectSession(loadedSession);
          }
          setSessionManagerOpen(false);
        }}
        onExportCurrent={(format) => {
          handleExport(format);
        }}
      />

      {/* Session Notes Modal */}
      <SessionNotesModal
        isOpen={notesModalOpen}
        onClose={() => setNotesModalOpen(false)}
        session={session}
        userId={userId}
      />
    </div>
  );
}
