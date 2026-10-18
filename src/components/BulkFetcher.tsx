import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Play, Square, Download, Globe, Loader2, Key, AlertTriangle, CheckCircle, FileX, Filter, Settings2, Save, Layers, Upload, X, FileText } from 'lucide-react';
import { cn, truncateForFirestore } from '../lib/utils';
import { fetchWithRetry } from '../lib/api';
import { db, Session } from '../lib/firebase';
import { doc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { SessionNotesModal } from './SessionNotesModal';

interface BulkFetcherProps {
  session?: Session | null;
  userId: string | null;
  onSessionCreated?: (id: string) => void;
}

export default function BulkFetcher({ session, userId, onSessionCreated }: BulkFetcherProps) {
  const [inputUrls, setInputUrls] = useState('');
  const [customHeadersText, setCustomHeadersText] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [results, setResults] = useState<{ url: string; content: string; category: string }[]>([]);
  const [authRequired, setAuthRequired] = useState<{ url: string; status: number }[]>([]);
  const [ignored, setIgnored] = useState<{ url: string; reason: string }[]>([]);
  
  const [logs, setLogs] = useState<{ time: string; message: string; type?: 'error' | 'success' | 'info' | 'warning' }[]>([]);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [currentProcessingUrl, setCurrentProcessingUrl] = useState('');
  const [fetchStartTime, setFetchStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

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

  const abortControllerRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const resultsRef = useRef<{ url: string; content: string; category: string }[]>([]);
  const logsRef = useRef<{ time: string; message: string; type?: 'error' | 'success' | 'info' | 'warning' }[]>([]);

  const isFetchingRef = useRef(false);
  isFetchingRef.current = isFetching;

  const loadedSessionIdRef = useRef<string | null>(null);

  // Load session data if available with hydration protection
  useEffect(() => {
    if (isFetchingRef.current) {
      return;
    }
    if (session) {
      if (!session.type || session.type === 'bulk') {
        const rawResults = Array.isArray(session.results) ? session.results : [];
        
        // If this session is already loaded in-memory, protect complete in-memory crawl results
        // from being overwritten by a stale or truncated Firestore onSnapshot
        if (loadedSessionIdRef.current === session.id && resultsRef.current.length > 0) {
          return;
        }

        loadedSessionIdRef.current = session.id || null;

        const sanitizedResults = rawResults.map((r: any) => {
          if (typeof r === 'string') {
            return { url: r, content: '', category: 'General' };
          }
          return {
            url: typeof r?.url === 'string' ? r.url : String(r?.url || ''),
            content: typeof r?.content === 'string' ? r.content : String(r?.content || ''),
            category: typeof r?.category === 'string' ? r.category : 'General'
          };
        }).filter((r: any) => Boolean(r.url));

        setResults(sanitizedResults);
        setLogs(session.logs || []);
        resultsRef.current = sanitizedResults;
        logsRef.current = session.logs || [];
      } else {
        loadedSessionIdRef.current = null;
        setResults([]);
        setLogs([]);
        resultsRef.current = [];
        logsRef.current = [];
      }
    } else {
      loadedSessionIdRef.current = null;
      setResults([]);
      setLogs([]);
      resultsRef.current = [];
      logsRef.current = [];
      setInputUrls('');
    }
  }, [session]);

  // Track elapsed time during fetching
  useEffect(() => {
    let interval: any = null;
    if (isFetching && fetchStartTime) {
      interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - fetchStartTime) / 1000));
      }, 500);
    } else if (!isFetching) {
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isFetching, fetchStartTime]);

  const saveToFirebase = async (currentResults: any[], currentLogs: any[]) => {
    if (!userId) return;
    
    setSaveStatus('saving');
    try {
      if (session?.id) {
        // Update existing session
        const dataToUpdate = truncateForFirestore({
          results: currentResults,
          logs: currentLogs,
        });
        await updateDoc(doc(db, 'sessions', session.id), {
          ...dataToUpdate,
          updatedAt: serverTimestamp()
        });
        setSaveStatus('saved');
      } else if (currentResults.length > 0 && onSessionCreated) {
        // Create new session
        const newSessionId = `session_${Date.now()}`;
        const firstCategory = currentResults[0]?.category || 'Bulk';
        
        const dataToSave = truncateForFirestore({
          userId,
          type: 'bulk',
          title: `Bulk Fetch: ${firstCategory}`,
          results: currentResults,
          logs: currentLogs,
        });
        
        await setDoc(doc(db, 'sessions', newSessionId), {
          ...dataToSave,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        loadedSessionIdRef.current = newSessionId;
        onSessionCreated(newSessionId);
        setSaveStatus('saved');
      } else {
        setSaveStatus('idle');
      }
    } catch (err) {
      console.error('Failed to save session:', err);
      setSaveStatus('error');
    }
    
    setTimeout(() => {
      if (saveStatus !== 'error') setSaveStatus('idle');
    }, 3000);
  };


  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  const handleLogsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    setIsAutoScrollEnabled(isAtBottom);
  };

  const logsContainerRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isAutoScrollEnabled && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, isAutoScrollEnabled]);

  const addLog = (message: string, type: 'error' | 'success' | 'info' | 'warning' = 'info') => {
    const newLog = { time: new Date().toLocaleTimeString(), message, type };
    setLogs(prev => [...prev, newLog]);
    logsRef.current.push(newLog);
  };

  const handleStart = async () => {
    // Extract URLs from input by line
    let combinedText = inputUrls;
    if (attachedFiles.length > 0) {
      combinedText += '\n' + attachedFiles.map(f => f.content).join('\n');
      setAttachedFiles([]); // Clear after starting
    }

    const lines = combinedText.split('\n');
    let urlsToFetch = Array.from(new Set(lines
      .map(u => u.trim())
      .filter(u => u.length > 0)
      .map(u => {
        let url = u;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        return url;
      })
    ));

    if (urlsToFetch.length === 0) {
      setError('No valid URLs found in the input.');
      return;
    }

    // Parse custom headers
    let customHeaders: Record<string, string> = {};
    if (customHeadersText.trim()) {
      const lines = customHeadersText.split('\n');
      for (const line of lines) {
        const separatorIdx = line.indexOf(':');
        if (separatorIdx > 0) {
          const key = line.slice(0, separatorIdx).trim();
          const val = line.slice(separatorIdx + 1).trim();
          if (key && val) customHeaders[key] = val;
        }
      }
    }

    setError('');
    setResults([]);
    setAuthRequired([]);
    setIgnored([]);
    setLogs([]);
    resultsRef.current = [];
    logsRef.current = [];
    setProgress({ processed: 0, total: urlsToFetch.length });
    setFetchStartTime(Date.now());
    setElapsedSeconds(0);
    setCurrentProcessingUrl(urlsToFetch[0] || '');
    setIsFetching(true);
    addLog(`Starting extraction for ${urlsToFetch.length} URLs...`, 'info');

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetchWithRetry('/api/fetch-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlsToFetch, customHeaders }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.body) throw new Error('ReadableStream not yet supported in this browser.');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep the incomplete line in the buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (!dataStr) continue;
            
            try {
              const data = JSON.parse(dataStr);
              
              if (data.type === 'progress') {
                setProgress({ processed: data.processed, total: data.total });
                if (data.currentUrl) setCurrentProcessingUrl(data.currentUrl);
              } else if (data.type === 'content') {
                setCurrentProcessingUrl(data.url);
                const newResult = { url: data.url, content: data.content, category: data.category };
                setResults(prev => [...prev, newResult]);
                resultsRef.current.push(newResult);
                addLog(`Success (${data.category}): ${data.url}`, 'success');
              } else if (data.type === 'auth_required') {
                setCurrentProcessingUrl(data.url);
                setAuthRequired(prev => [...prev, { url: data.url, status: data.status }]);
                addLog(`Auth Required (${data.status}): ${data.url}`, 'warning');
              } else if (data.type === 'ignored') {
                setCurrentProcessingUrl(data.url);
                setIgnored(prev => [...prev, { url: data.url, reason: data.reason }]);
                addLog(`Ignored: ${data.url} - ${data.reason}`, 'info');
              } else if (data.type === 'error') {
                if (data.url) setCurrentProcessingUrl(data.url);
                setIgnored(prev => [...prev, { url: data.url, reason: data.error }]);
                addLog(`Failed: ${data.url} - ${data.error}`, 'error');
              } else if (data.type === 'done') {
                setCurrentProcessingUrl('');
                addLog('Extraction completed.', 'info');
              }
            } catch (err) {
              console.error('Failed to parse SSE data', err);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        addLog('Extraction stopped by user.', 'info');
      } else {
        addLog(`Connection error: ${err.message}`, 'error');
        setError('Connection lost or server error occurred.');
      }
    } finally {
      setIsFetching(false);
      abortControllerRef.current = null;
      if (resultsRef.current.length > 0) {
        saveToFirebase(resultsRef.current, logsRef.current);
      }
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const removeDuplicates = async () => {
    if (results.length === 0) return;
    const uniqueMap = new Map<string, { url: string; content: string; category: string }>();
    results.forEach(r => {
      if (!uniqueMap.has(r.url)) {
        uniqueMap.set(r.url, r);
      }
    });
    
    const uniqueResults = Array.from(uniqueMap.values());
    const duplicatesRemoved = results.length - uniqueResults.length;
    
    if (duplicatesRemoved > 0) {
      setResults(uniqueResults);
      resultsRef.current = uniqueResults;
      addLog(`Removed ${duplicatesRemoved} duplicate URL(s).`, 'info');
      
      if (session?.id) {
        try {
          const dataToUpdate = truncateForFirestore({ results: uniqueResults });
          await updateDoc(doc(db, 'sessions', session.id), {
            ...dataToUpdate,
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          console.error("Failed to update session after removing duplicates", e);
        }
      }
    } else {
      addLog('No duplicates found.', 'info');
    }
  };

  const downloadCategory = (category: string) => {
    const categoryResults = results.filter(r => (r.category || 'General') === category);
    if (categoryResults.length === 0) return;
    
    let fileName = `extracted_${category.toLowerCase()}_data.txt`;

    let content = ``;
    categoryResults.forEach((item) => {
      content += `${item.url}\n`;
      content += `${item.content}\n\n`;
      content += `========================================\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  };

  const categories = useMemo(() => {
    return Array.from(new Set(results.map(r => r.category || 'General'))).sort();
  }, [results]);

  return (
    <div className="w-full h-full flex flex-col md:flex-row md:overflow-hidden min-h-0 bg-transparent">
      
      {/* Left Column: Input Config */}
      <div className="w-full md:w-[320px] lg:w-[360px] border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col shrink-0 min-h-0">
        <div className="p-4 md:p-5 border-b border-zinc-200 dark:border-zinc-800 flex-none flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Bulk Extractor
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Process multiple URLs. Bypasses protections if headers are provided. Merges data by category.
            </p>
          </div>
          {session && (
            <button
              type="button"
              onClick={() => setNotesModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold transition-colors shadow-2xs shrink-0"
              title="Session Rich-Text Notes"
            >
              <FileText className={cn("w-3.5 h-3.5", session.notes ? "text-amber-500" : "text-zinc-400")} />
              <span>Notes</span>
              {session.notes && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
            </button>
          )}
        </div>

        <div className="flex-1 p-4 md:p-5 overflow-y-auto space-y-4 custom-scrollbar">
          <div>
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-2">
              <Key className="w-3.5 h-3.5 text-zinc-400" />
              Header Injection (Optional)
            </label>
            <p className="text-[11px] text-zinc-500 mb-2">
              Use this to pass authentication tokens or custom headers when fetching protected URLs. 
              Write one header per line in the format <code>Header-Name: Value</code>.
            </p>
            <textarea 
              placeholder="Example:&#10;Authorization: Bearer my-secret-token&#10;Cookie: session_id=123456789&#10;User-Agent: CustomApp/1.0"
              value={customHeadersText}
              onChange={(e) => setCustomHeadersText(e.target.value)}
              disabled={isFetching}
              className="w-full h-24 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono custom-scrollbar"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-zinc-400" />
                Target URLs (One per line)
              </label>
              <label className="cursor-pointer flex items-center gap-1.5 text-[11px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium">
                <Upload className="w-3.5 h-3.5" />
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
                  <div key={`bulk-file-${file.name}-${idx}`} className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800/30 text-xs">
                    <FileText className="w-3 h-3" />
                    <span className="max-w-[120px] truncate">{file.name}</span>
                    <button 
                      type="button" 
                      onClick={() => removeAttachedFile(idx)}
                      className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea 
              placeholder="https://example.com/api/data&#10;https://example.com/posts&#10;..."
              value={inputUrls}
              onChange={(e) => setInputUrls(e.target.value)}
              disabled={isFetching}
              className="w-full h-40 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono custom-scrollbar"
            />
            {error && <p className="text-red-500 text-xs mt-1.5">{error}</p>}
          </div>

          {!isFetching ? (
            <button 
              onClick={handleStart}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold py-2.5 rounded-xl transition-all shadow-md hover:shadow-indigo-600/15 active:scale-[0.98]"
            >
              <Play className="w-4 h-4 fill-current" />
              Start Extraction
            </button>
          ) : (
            <button 
              onClick={handleStop}
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-2.5 rounded-xl transition-all shadow-md hover:shadow-red-600/15 active:scale-[0.98]"
            >
              <Square className="w-4 h-4 fill-current" />
              Stop Processing
            </button>
          )}

          {/* Visual Progress Bar (Left Column) */}
          {(progress.total > 0 || isFetching) && (
            <div className="p-3.5 bg-gradient-to-br from-indigo-50/90 to-purple-50/50 dark:from-indigo-950/40 dark:to-purple-950/20 border border-indigo-200/80 dark:border-indigo-800/40 rounded-2xl space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-indigo-900 dark:text-indigo-200">
                  {isFetching ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-spin" />
                      <span>Fetching URLs...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Batch Completed</span>
                    </>
                  )}
                </div>
                <span className="font-bold text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-[11px]">
                  {progress.total > 0 ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : 0}%
                </span>
              </div>

              {/* Progress Track */}
              <div className="h-2.5 w-full bg-indigo-100 dark:bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-indigo-200/50 dark:border-zinc-700/50">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-300 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-500",
                    isFetching ? "animate-pulse" : ""
                  )}
                  style={{ width: `${progress.total > 0 ? Math.max(isFetching ? 4 : 0, Math.min(100, (progress.processed / progress.total) * 100)) : 0}%` }}
                />
              </div>

              {/* Stats & Current Target */}
              <div className="flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">
                <span>{progress.processed} of {progress.total} URLs</span>
                {elapsedSeconds > 0 && (
                  <span>
                    {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}s
                    {progress.processed > 0 && ` (${(progress.processed / Math.max(1, elapsedSeconds)).toFixed(1)}/s)`}
                  </span>
                )}
              </div>

              {currentProcessingUrl && isFetching && (
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate font-mono bg-white/70 dark:bg-zinc-900/70 px-2 py-1 rounded-lg border border-indigo-100 dark:border-zinc-800">
                  <span className="text-indigo-500 font-semibold mr-1">Active:</span>
                  {currentProcessingUrl}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: 4 Panels */}
      <div className="flex-1 flex flex-col bg-zinc-50/50 dark:bg-zinc-950/50 md:overflow-hidden relative p-4 md:p-5 lg:p-6 min-h-0">
        
        {/* Visual Progress Bar (Right Column - Real-time Status Card) */}
        {(isFetching || progress.total > 0) && (
          <div className="mb-4 bg-white dark:bg-zinc-900 border border-indigo-200/90 dark:border-indigo-900/60 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs",
                  isFetching ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400" : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
                )}>
                  {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      {isFetching ? 'Processing Bulk URL Batch' : 'Batch Extraction Completed'}
                    </h4>
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
                      {progress.processed} / {progress.total} URLs
                    </span>
                  </div>
                  {currentProcessingUrl && isFetching ? (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-md font-mono mt-0.5">
                      Fetching: {currentProcessingUrl}
                    </p>
                  ) : (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Extracted {results.length} valid items across {categories.length} categories
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Metrics Breakdown Pills */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1" title="Valid Links">
                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                    <span>{results.length}</span>
                  </span>
                  {authRequired.length > 0 && (
                    <span className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1" title="Auth Required (401/403)">
                      <Key className="w-3 h-3 text-amber-500" />
                      <span>{authRequired.length}</span>
                    </span>
                  )}
                  {ignored.length > 0 && (
                    <span className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1" title="Ignored / Errors">
                      <FileX className="w-3 h-3 text-zinc-400" />
                      <span>{ignored.length}</span>
                    </span>
                  )}
                </div>

                <div className="text-right pl-2 border-l border-zinc-200 dark:border-zinc-800">
                  <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                    {progress.total > 0 ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : 0}%
                  </span>
                  {elapsedSeconds > 0 && (
                    <div className="text-[10px] text-zinc-400">
                      {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}s
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Visual Progress Bar with gradient */}
            <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden p-0.5 border border-zinc-200/60 dark:border-zinc-700/60">
              <div 
                className={cn(
                  "bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 h-full rounded-full transition-all duration-300",
                  isFetching ? "animate-pulse" : ""
                )}
                style={{ width: `${progress.total > 0 ? Math.max(isFetching ? 3 : 0, Math.min(100, (progress.processed / progress.total) * 100)) : 0}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Valid Data Links (Top Half) */}
        <div className="flex-1 min-h-[220px] flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 mb-4 md:mb-5 shadow-sm">
          <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center gap-2 flex-none">
             <CheckCircle className="w-4 h-4 text-green-500" />
             <h3 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Valid Data Links ({results.length})</h3>
             {results.length > 0 && (
               <button 
                 onClick={removeDuplicates}
                 disabled={isFetching}
                 className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-2.5 py-1 rounded-lg transition-colors border border-zinc-200/50 dark:border-zinc-700/50 disabled:opacity-50"
               >
                 <Layers className="w-3.5 h-3.5" />
                 Remove Duplicates
               </button>
             )}
             {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500 ml-2" />}
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
             {categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                  <p className="text-zinc-400 dark:text-zinc-500 text-sm">No valid data extracted yet.</p>
                  <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">Enter target URLs on the left and click "Start Extraction"</p>
                </div>
             ) : (
                categories.map((cat, catIdx) => (
                  <div key={`bulk-cat-${cat}-${catIdx}`} className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 px-2.5 py-1 rounded-lg w-fit border border-indigo-100/30">
                        {cat} ({results.filter(r => (r.category || 'General') === cat).length})
                      </h4>
                      <button
                        onClick={() => downloadCategory(cat)}
                        className="flex items-center gap-1.5 text-[11px] font-semibold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-2.5 py-1 rounded-lg transition-colors border border-zinc-200/50 dark:border-zinc-700/50"
                      >
                        <Download className="w-3.5 h-3.5 text-zinc-500" />
                        Download Merged File
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                       {results.filter(r => (r.category || 'General') === cat).slice(0, visibleResultCount).map((item, idx) => (
                         <div key={`bulk-res-${cat}-${item.url || idx}-${idx}`} className="flex flex-col bg-zinc-50 dark:bg-zinc-900/40 p-2.5 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm">
                           <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 truncate">{item.url}</span>
                           <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-1 bg-white dark:bg-zinc-900 px-1.5 py-1 rounded border border-zinc-100 dark:border-zinc-800/50 font-mono">
                             {(item.content || '').substring(0, 120)}...
                           </span>
                         </div>
                       ))}
                    </div>
                    {results.filter(r => (r.category || 'General') === cat).length > visibleResultCount && (
                      <div className="flex items-center justify-center gap-4 py-2 mt-2">
                        <button 
                          onClick={() => setVisibleResultCount(p => p + 50)}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                        >
                          Load More
                        </button>
                        <button 
                          onClick={() => setVisibleResultCount(results.length)}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                        >
                          Expand All
                        </button>
                      </div>
                    )}
                  </div>
                ))
             )}
          </div>
        </div>

        {/* Bottom Half: Auth Required, Ignored, Logs */}
        <div className="flex-none md:h-[220px] lg:h-[260px] grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 min-h-0">
          
          {/* Auth Required Links */}
          <div className="flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm min-h-[150px] md:min-h-0">
             <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-amber-50/50 dark:bg-amber-950/10 flex items-center gap-2 flex-none">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-bold text-amber-800 dark:text-amber-400">Auth Required ({authRequired.length})</h3>
             </div>
             <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                {authRequired.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-zinc-400 dark:text-zinc-500 text-xs">No pending auth actions</p>
                  </div>
                ) : (
                  authRequired.map((item, idx) => (
                    <div key={`bulk-auth-${item.url}-${item.status}-${idx}`} className="text-xs flex items-center gap-2 bg-amber-50/30 dark:bg-amber-950/5 p-1.5 rounded-lg border border-amber-100/20">
                      <span className="text-amber-600 dark:text-amber-400 font-bold font-mono text-[10px] bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 rounded shrink-0">{item.status}</span>
                      <span className="text-zinc-600 dark:text-zinc-400 truncate text-[11px] font-medium">{item.url}</span>
                    </div>
                  ))
                )}
             </div>
          </div>

          {/* Ignored/Empty Links */}
          <div className="flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm min-h-[150px] md:min-h-0">
             <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-2 flex-none">
                <FileX className="w-4 h-4 text-zinc-500" />
                <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Ignored / Dead ({ignored.length})</h3>
             </div>
             <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                {ignored.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-zinc-400 dark:text-zinc-500 text-xs">No ignored URLs</p>
                  </div>
                ) : (
                  ignored.map((item, idx) => (
                    <div key={`bulk-ignored-${item.url}-${idx}`} className="text-xs flex flex-col p-1.5 bg-zinc-50 dark:bg-zinc-900/40 rounded-lg border border-zinc-100 dark:border-zinc-800/30">
                      <span className="text-zinc-700 dark:text-zinc-300 truncate text-[11px] font-medium">{item.url}</span>
                      <span className="text-red-500 dark:text-red-400 text-[9px] mt-0.5 font-mono">{item.reason}</span>
                    </div>
                  ))
                )}
             </div>
          </div>

          {/* Live Logs */}
          <div className="flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm min-h-[150px] md:min-h-0">
             <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-2 flex-none">
                <Settings2 className="w-4 h-4 text-zinc-500" />
                <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Activity Logs</h3>
             </div>
             <div 
               className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar font-mono text-[10px] bg-zinc-950 text-zinc-100"
               onScroll={handleLogsScroll}
               ref={logsContainerRef}
             >
                {logs.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-zinc-500 text-xs">Waiting for events...</p>
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <div key={`bulk-log-${log.time}-${i}`} className="flex gap-2">
                      <span className="text-zinc-500 shrink-0">{log.time.split(' ')[0]}</span>
                      <span className={cn(
                        "break-all",
                        log.type === 'error' ? 'text-rose-400' :
                        log.type === 'warning' ? 'text-amber-400' :
                        log.type === 'success' ? 'text-emerald-400' :
                        'text-zinc-300'
                      )}>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
             </div>
          </div>

        </div>

      </div>

      {/* Session Notes Modal */}
      <SessionNotesModal
        isOpen={notesModalOpen}
        onClose={() => setNotesModalOpen(false)}
        session={session || null}
        userId={userId}
      />
    </div>
  );
}
