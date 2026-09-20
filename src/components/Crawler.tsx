import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Copy, CheckCircle2, AlertCircle, Link as LinkIcon, Globe, FileText, Settings, Loader2, ChevronDown, ChevronUp, Terminal, Download, Save, Zap, Trash2, Layers, Upload, Search, Cloud, CloudOff, Check, X, Edit2, Info } from 'lucide-react';
import { cn, truncateForFirestore, cleanAndSanitizeUrl } from '../lib/utils';
import { createEventSourceConnection, fetchWithRetry, logNetworkEvent } from '../lib/api';
import { Session, db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { CrawlVisualizer } from './CrawlVisualizer';

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
  onSessionCreated: (id: string) => void;
}

export default function Crawler({ session, userId, onSessionCreated }: CrawlerProps) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<CrawlMode>('domain');
  const [maxPages, setMaxPages] = useState('50');
  const [maxDepth, setMaxDepth] = useState('3');
  const [maxBreadth, setMaxBreadth] = useState('100');
  const [fileTypes, setFileTypes] = useState('');
  const [includePatterns, setIncludePatterns] = useState('');
  const [excludePatterns, setExcludePatterns] = useState('');
  const [excludeExtensions, setExcludeExtensions] = useState('');
  const [excludePaths, setExcludePaths] = useState('');
  const [includeDomains, setIncludeDomains] = useState('');
  const [excludeDomains, setExcludeDomains] = useState('');
  const [includePathPattern, setIncludePathPattern] = useState('');
  const [verboseMode, setVerboseMode] = useState(false);
  const [keywordFilters, setKeywordFilters] = useState('');
  const [subdomainOnly, setSubdomainOnly] = useState(true);
  const [extractAll, setExtractAll] = useState(true);
  const [fuzzPaths, setFuzzPaths] = useState(true);
  
  const [isCrawling, setIsCrawling] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [results, setResults] = useState<CrawlResult[]>([]);
  const [statusMessage, setStatusMessage] = useState('Ready to crawl');
  const [error, setError] = useState('');
  const [copiedCategory, setCopiedCategory] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
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

      const sanitizedSessionResults = (session.results || []).map(r => ({
        ...r,
        url: cleanAndSanitizeUrl(r.url)
      })).filter(r => Boolean(r.url));
      setResults(sanitizedSessionResults);
      setStats(prev => ({ ...prev, totalLinks: sanitizedSessionResults.length }));
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
    keywordFilters?: string 
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
    
    if (validUrls.length === 0) {
      setError('Could not find any valid URLs. Please check your input.');
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
    setIsCrawling(true);
    isCrawlingRef.current = true;
    
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

    // Auto-create session if it doesn't exist and user is logged in
    if (!activeSessionId && userId) {
      try {
        const domain = new URL(validUrls[0]).hostname;
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
        const domain = new URL(validUrls[0]).hostname;
        setSaveStatus("saving"); await updateDoc(doc(db, 'sessions', activeSessionId), {
          title: sessionTitle || `Crawl: ${domain}${validUrls.length > 1 ? ` +${validUrls.length - 1} more` : ''} (Merged)`,
          url: url,
          settings: {
            mode: currentMode,
            maxPages: currentMaxPages,
            maxDepth: currentMaxDepth,
            maxBreadth: currentMaxBreadth,
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
      addLog(`[${i+1}/${validUrls.length}] Starting crawl for: ${targetUrl}`);
      setStatusMessage(`[${i+1}/${validUrls.length}] Crawling: ${new URL(targetUrl).hostname}...`);

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
        excludeExtensions: currentExcludeExtensions.trim(),
        excludePaths: currentExcludePaths.trim(),
        includeDomains: currentIncludeDomains.trim(),
        excludeDomains: currentExcludeDomains.trim(),
        includePathPattern: currentIncludePathPattern.trim(),
        keywordFilters: currentKeywordFilters.trim()
      });

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
            } else if (data.type === 'link') {
              const cleanedUrl = cleanAndSanitizeUrl(data.url);
              if (!cleanedUrl) return;
              setResults(prev => {
                if (prev.some(r => r.url === cleanedUrl)) return prev;
                return [{ url: cleanedUrl, source: data.source }, ...prev];
              });
              totalGlobalLinks++;
              setStats(s => ({ ...s, totalLinks: totalGlobalLinks }));
            } else if (data.type === 'done') {
              addLog(`[${i+1}/${validUrls.length}] Finished. Pages: ${data.pagesCrawled}, New Links: ${data.total}, Errors: ${data.errors}`);
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
      
      const startHostnames = rawUrls.map(u => {
        let t = u;
        if (!t.startsWith('http')) t = 'https://' + t;
        try { return new URL(t).hostname; } catch { return null; }
      }).filter(Boolean) as string[];
      
      if (startHostnames.length === 0) return { internal: results, subdomain: [], external: [] };
      
      const baseDomains = startHostnames.map(h => h.startsWith('www.') ? h.slice(4) : h);

      return {
        internal: results.filter(r => {
          try { 
            const h = new URL(r.url).hostname; 
            return startHostnames.includes(h);
          } catch { return false; }
        }),
        subdomain: results.filter(r => {
          try { 
            const h = new URL(r.url).hostname; 
            return !startHostnames.includes(h) && baseDomains.some(base => h.endsWith('.' + base)); 
          } catch { return false; }
        }),
        external: results.filter(r => {
          try {
            const h = new URL(r.url).hostname;
            return !startHostnames.includes(h) && !baseDomains.some(base => h.endsWith('.' + base));
          } catch { return false; }
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

      <div className="flex flex-col md:flex-row flex-1 md:min-h-0 md:overflow-hidden">
        {/* Left Column: Configuration */}
        <div className={cn(
          "w-full md:w-[380px] flex-none md:flex-1 flex-shrink-0 bg-white dark:bg-zinc-900 md:border-r border-zinc-200 dark:border-zinc-800 flex flex-col md:min-h-0",
          mobileTab === 'config' ? 'flex' : 'hidden md:flex'
        )}>
          <div className="flex-1 md:overflow-y-auto p-5 md:p-6 space-y-6 custom-scrollbar">
            
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

            {/* Mode Selection */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Crawl Boundary</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('single')}
                  disabled={isCrawling}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-xl text-xs font-medium transition-all border",
                    mode === 'single' ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  )}
                >
                  <FileText className="w-5 h-5 mb-1.5" />
                  Single Page
                </button>
                <button
                  type="button"
                  onClick={() => setMode('subdir')}
                  disabled={isCrawling}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-xl text-xs font-medium transition-all border",
                    mode === 'subdir' ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  )}
                >
                  <LinkIcon className="w-5 h-5 mb-1.5" />
                  Directory
                </button>
                <button
                  type="button"
                  onClick={() => setMode('domain')}
                  disabled={isCrawling}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-xl text-xs font-medium transition-all border",
                    mode === 'domain' ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  )}
                >
                  <Globe className="w-5 h-5 mb-1.5" />
                  Domain
                </button>
              </div>
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

            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl border border-red-200 dark:border-red-800/30 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>
          
          {/* Fixed Bottom Action Button */}
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-[0_-4px_15px_rgba(0,0,0,0.03)] dark:shadow-none z-10 shrink-0">
            {!isCrawling ? (
              <div className="flex flex-col gap-3">
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
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium py-3.5 rounded-xl transition-all shadow-lg hover:shadow-purple-600/25 active:scale-[0.98]"
                >
                  <Zap className="w-5 h-5 fill-current" />
                  All-in-One Deep Extract
                </button>
                <div className="flex gap-3">
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      handleStart();
                    }}
                    className="flex-1 flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium py-3 rounded-xl transition-all active:scale-[0.98]"
                  >
                    <Play className="w-5 h-5 fill-current opacity-70" />
                    Start Crawl
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
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium py-3.5 rounded-xl transition-all shadow-lg hover:shadow-red-600/25 active:scale-[0.98]"
              >
                <Square className="w-5 h-5 fill-current" />
                Stop Extraction
              </button>
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
                    {sessionTitle || (url ? `Crawl: ${new URL(url).hostname}` : 'Active Crawl Workspace')}
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
              {saveStatus === 'saving' && <span className="flex items-center gap-1 text-blue-500"><Loader2 className="w-3 h-3 animate-spin" /> Syncing</span>}
              {saveStatus === 'saved' && <span className="flex items-center gap-1 text-emerald-500"><Cloud className="w-3 h-3" /> Saved</span>}
              {saveStatus === 'error' && <span className="flex items-center gap-1 text-red-500"><CloudOff className="w-3 h-3" /> Sync Failed</span>}
              {saveStatus === 'idle' && <span className="flex items-center gap-1 text-zinc-400"><Cloud className="w-3 h-3" /> Cloud Synced</span>}
            </div>
          </div>

          {/* Visual Progress Bar when crawling */}
          {isCrawling && (
            <div className="bg-blue-50/80 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900/50 px-4 py-2.5 shrink-0">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1.5 shrink-0">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Crawling target
                  </span>
                  {stats.currentUrl && (
                    <span className="text-zinc-500 dark:text-zinc-400 truncate max-w-xs md:max-w-md font-mono text-[11px]">
                      {stats.currentUrl}
                    </span>
                  )}
                </div>
                <span className="font-semibold text-blue-700 dark:text-blue-300 shrink-0 pl-2">
                  {Math.min(100, Math.round((stats.pagesCrawled / Math.max(1, Number(maxPages) || 50)) * 100))}%
                </span>
              </div>
              <div className="w-full bg-blue-200 dark:bg-blue-900/60 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300 animate-pulse"
                  style={{ width: `${Math.min(100, Math.max(5, Math.round((stats.pagesCrawled / Math.max(1, Number(maxPages) || 50)) * 100)))}%` }}
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

              {/* Floating Action Button for Copy & Download */}
              {results.length > 0 && (
                <div className="absolute bottom-4 right-4 md:bottom-6 md:right-6 z-10 flex flex-col gap-2">
                  <button
                    onClick={removeDuplicates}
                    className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-3 rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all font-medium"
                  >
                    <Layers className="w-5 h-5" />
                    Remove Duplicates
                  </button>
                  <button
                    onClick={downloadCleanTxt}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all font-medium"
                    title="Download pure clean URLs (.txt) - no brackets, no markdown"
                  >
                    <Download className="w-5 h-5" />
                    Download .txt (Clean)
                  </button>
                  <button
                    onClick={downloadMD}
                    className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all font-medium"
                  >
                    <Download className="w-5 h-5" />
                    Download .md
                  </button>
                  <button
                    onClick={copyAll}
                    className="flex items-center justify-center gap-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-5 py-3 rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all font-medium"
                  >
                    {copiedCategory === 'all' ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    {copiedCategory === 'all' ? 'Copied!' : 'Copy All'}
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
        </div>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 flex border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <button 
          onClick={() => setMobileTab('config')}
          className={cn("flex-1 py-3 flex flex-col items-center justify-center gap-1 transition-colors", mobileTab === 'config' ? "text-blue-600" : "text-zinc-500 dark:text-zinc-400")}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Config</span>
        </button>
        <button 
          onClick={() => setMobileTab('results')}
          className={cn("flex-1 py-3 flex flex-col items-center justify-center gap-1 transition-colors", mobileTab === 'results' ? "text-blue-600" : "text-zinc-500 dark:text-zinc-400")}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Results</span>
        </button>
      </div>
    </div>
  );
}
