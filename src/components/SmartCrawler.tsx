import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Copy, CheckCircle2, AlertCircle, Link as LinkIcon, Download, Layers, Upload, Brain, Terminal, Trash2, FileText } from 'lucide-react';
import { cn, truncateForFirestore, cleanAndSanitizeUrl } from '../lib/utils';
import { createEventSourceConnection, fetchWithRetry } from '../lib/api';
import { Session, db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import Markdown from 'react-markdown';

interface CrawlResult {
  url: string;
  source: string;
}

interface LogEntry {
  time: string;
  message: string;
}

interface SmartCrawlerProps {
  session: Session | null;
  userId: string | null;
  onSessionCreated: (id: string) => void;
}

export function SmartCrawler({ session, userId, onSessionCreated }: SmartCrawlerProps) {
  const [url, setUrl] = useState('');
  const [instruction, setInstruction] = useState('');
  const [maxPages, setMaxPages] = useState('20');
  const [maxDepth, setMaxDepth] = useState('2');
  const [crawlMode, setCrawlMode] = useState<'deep' | 'filter'>('deep');
  const [includePatterns, setIncludePatterns] = useState('');
  const [excludePatterns, setExcludePatterns] = useState('');
  const [includeDomains, setIncludeDomains] = useState('');
  const [excludeExtensions, setExcludeExtensions] = useState('');
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [results, setResults] = useState<CrawlResult[]>([]);
  const [statusMessage, setStatusMessage] = useState('Ready to crawl');
  const [error, setError] = useState('');
  const [copiedCategory, setCopiedCategory] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string>('');
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ pagesCrawled: 0, totalLinks: 0, errors: 0 });
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  const handleLogsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    setIsAutoScrollEnabled(isAtBottom);
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  const eventSourceRef = useRef<{ close: () => void } | null>(null);
  const currentSessionRef = useRef<Session | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const isCrawlingRef = useRef(false);

  useEffect(() => {
    if (session && session.id !== currentSessionRef.current?.id) {
      currentSessionRef.current = session;
      if (isCrawlingRef.current) {
        return;
      }
      if (session.url) setUrl(session.url);
      if (session.instruction) setInstruction(session.instruction);
      if (session.results) setResults(session.results);
      if (session.logs) setLogs(session.logs);
      if (session.aiSummary) setAiSummary(session.aiSummary);
      setError('');
    } else if (!session) {
      if (isCrawlingRef.current) {
        return;
      }
      currentSessionRef.current = null;
      setUrl('');
      setInstruction('');
      setResults([]);
      setAiSummary('');
      setLogs([]);
      setError('');
      setStats({ pagesCrawled: 0, totalLinks: 0, errors: 0 });
      setStatusMessage('Ready to crawl');
    }
  }, [session]);

  const resultsRef = useRef(results);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  const logsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAutoScrollEnabled && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, isAutoScrollEnabled]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message }]);
  };

  const aiSummaryRef = useRef(aiSummary);
  useEffect(() => {
    aiSummaryRef.current = aiSummary;
  }, [aiSummary]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const newFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      newFiles.push(files[i]);
    }
    
    setAttachedFiles(prev => [...prev, ...newFiles]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleStart = async () => {
    if (!url.trim() && attachedFiles.length === 0) {
      setError('Please enter at least one URL or attach a file');
      return;
    }
    
    if (!instruction.trim()) {
      setError('Please provide an instruction for the AI');
      return;
    }

    setError('');
    setIsCrawling(true);
    isCrawlingRef.current = true;

    if (!session?.results) {
      setResults([]);
      setAiSummary('');
      setLogs([]);
      setStats({ pagesCrawled: 0, totalLinks: 0, errors: 0 });
    }

    addLog('Starting input processing and link purification...');

    let combinedText = url;

    // Read all attached files
    if (attachedFiles.length > 0) {
      addLog(`Reading ${attachedFiles.length} attached file(s)...`);
      try {
        const fileContents = await Promise.all(
          attachedFiles.map(file => {
            return new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = (event) => resolve((event.target?.result as string) || '');
              reader.readAsText(file);
            });
          })
        );
        combinedText += '\n' + fileContents.join('\n');
      } catch (err: any) {
        setError(`Failed to read attached files: ${err.message}`);
        setIsCrawling(false);
        isCrawlingRef.current = false;
        return;
      }
    }

    // Run robust URL extraction and MHTML/Garbage filtering
    const urlRegex = /https?:\/\/[^\s"'<>\]\[\)\{\}]+/gi;
    const matches: string[] = combinedText.match(urlRegex) || [];
    
    let extractedUrls: string[] = [];
    matches.forEach((match: string) => {
      let cleanUrl = match.trim();
      
      // Granular cleanup of common wrappers and trailing punctuation:
      while (cleanUrl) {
        const lastChar = cleanUrl.charAt(cleanUrl.length - 1);
        if (['.', ',', ')', ']', '}', '>', '*', '\\', '"', "'"].includes(lastChar)) {
          cleanUrl = cleanUrl.slice(0, -1);
        } else {
          break;
        }
      }
      
      // Clean up any leading characters that might be attached
      while (cleanUrl) {
        const firstChar = cleanUrl.charAt(0);
        if (['(', '[', '{', '<', '*', '"', "'"].includes(firstChar)) {
          cleanUrl = cleanUrl.slice(1);
        } else {
          break;
        }
      }
      
      if (cleanUrl) {
        const lowerClean = cleanUrl.toLowerCase();
        // Check for obvious non-web, local, virtual, or system links (case-insensitive)
        const isInternalOrGarbage = 
          lowerClean.includes('mhtml') || 
          lowerClean.includes('blink') || 
          lowerClean.includes('cid:') || 
          lowerClean.includes('chrome-extension') || 
          lowerClean.includes('localhost') || 
          lowerClean.includes('127.0.0.1') || 
          lowerClean.includes('frame-') || 
          lowerClean.includes('android-app') || 
          lowerClean.includes('ios-app') || 
          lowerClean.includes('data:') ||
          lowerClean.includes('css-') ||
          (lowerClean.includes('@') && (lowerClean.includes('mhtml') || lowerClean.includes('blink') || lowerClean.includes('cid') || lowerClean.includes('frame') || lowerClean.includes('css'))) ||
          lowerClean.endsWith('.css') ||
          lowerClean.endsWith('.js');
          
        if (!isInternalOrGarbage && lowerClean.startsWith('http')) {
          extractedUrls.push(cleanUrl);
        }
      }
    });

    const validUrls = Array.from(new Set(extractedUrls));

    if (validUrls.length === 0) {
      setError('Could not extract any valid, purified live web URLs (HTTP/HTTPS) from your input or files. Please provide standard web URLs.');
      setIsCrawling(false);
      isCrawlingRef.current = false;
      return;
    }

    // Clear files upon processing
    setAttachedFiles([]);

    addLog(`Successfully extracted and purified ${validUrls.length} live web URL(s) automatically:`);
    validUrls.forEach((vu, idx) => addLog(` - [Seed #${idx + 1}] ${vu}`));

    addLog(`AI Smart Crawl started for ${validUrls.length} URL(s).`);
    
    let activeSessionId = currentSessionRef.current?.id;
    let newSessionObj: Session | null = currentSessionRef.current;
    
    if (!activeSessionId && userId) {
      try {
        const domain = new URL(validUrls[0]).hostname;
        const newSession: Session = truncateForFirestore({
          userId,
          type: 'smart_crawler',
          title: `Smart Crawl: ${domain}`,
          url: validUrls.join('\n'),
          instruction,
          aiSummary: '',
          results: resultsRef.current,
          logs: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        const docRef = await addDoc(collection(db, 'sessions'), newSession);
        activeSessionId = docRef.id;
        onSessionCreated(docRef.id);
        newSessionObj = { id: docRef.id, ...newSession };
      } catch (err) {
        console.error("Failed to create session", err);
      }
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    if (crawlMode === 'filter') {
      addLog(`Sending ${validUrls.length} URL(s) to AI for one-shot filtering...`);
      setStatusMessage('Analyzing URLs with AI...');
      try {
        const res = await fetchWithRetry('/api/smart-filter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: validUrls, instruction })
        });
        
        if (!res.ok) {
          throw new Error(`API Error: ${res.status}`);
        }
        
        const data = await res.json();
        const filtered = data.urls || [];
        
        addLog(`AI returned ${filtered.length} relevant URL(s).`);
        
        const finalResults = filtered.map((u: string) => ({ url: cleanAndSanitizeUrl(u), source: 'ai_filtered' })).filter(r => Boolean(r.url));
        setResults(finalResults);
        resultsRef.current = finalResults;
        setStats(prev => ({ ...prev, totalLinks: filtered.length }));
        setStatusMessage('AI filtering complete.');
      } catch (err: any) {
        setError(`Filtering failed: ${err.message}`);
        addLog(`Error: ${err.message}`);
      }
    } else {
      for (let i = 0; i < validUrls.length; i++) {
        if (!isCrawlingRef.current) break;
        
        const targetUrl = validUrls[i];
        addLog(`[${i+1}/${validUrls.length}] Starting smart crawl for: ${targetUrl}`);
        setStatusMessage(`[${i+1}/${validUrls.length}] Smart crawling: ${new URL(targetUrl).hostname}...`);

        const query = new URLSearchParams({
          url: targetUrl,
          instruction: instruction,
          maxPages: maxPages,
          maxDepth: maxDepth,
          includePatterns: includePatterns,
          excludePatterns: excludePatterns,
          includeDomains: includeDomains,
          excludeExtensions: excludeExtensions
        });

        await new Promise<void>((resolve) => {
          let isResolved = false;
          const finish = () => {
            if (!isResolved) {
              isResolved = true;
              if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
              }
              resolve();
            }
          };

          const sseConnection = createEventSourceConnection({
            url: `/api/smart-crawl?${query.toString()}`,
            onLog: (msg) => addLog(msg),
            onMessage: (data) => {
              if (!isCrawlingRef.current) {
                finish();
                return;
              }

              if (data.type === 'status') {
                if (data.message) setStatusMessage(`[${i+1}/${validUrls.length}] ` + data.message);
                if (data.log) addLog(data.log);
                if (data.stats) setStats(prev => ({ ...prev, pagesCrawled: prev.pagesCrawled + (data.stats.pagesCrawled > 0 ? 1 : 0), errors: prev.errors + data.stats.errors }));
              } else if (data.type === 'summary') {
                setAiSummary(data.text);
              } else if (data.type === 'link') {
                const cleanedUrl = cleanAndSanitizeUrl(data.url);
                if (!cleanedUrl) return;
                setResults(prev => {
                  if (prev.some(r => r.url === cleanedUrl)) return prev;
                  return [...prev, { url: cleanedUrl, source: data.source }];
                });
                setStats(prev => ({ ...prev, totalLinks: prev.totalLinks + 1 }));
              } else if (data.type === 'done') {
                finish();
              } else if (data.type === 'error') {
                setError(data.message);
                addLog(`Error: ${data.message}`);
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
    }

    setIsCrawling(false);
    isCrawlingRef.current = false;
    setStatusMessage('Crawl complete');
    addLog('AI Smart Crawl finished successfully.');

    if (activeSessionId && userId) {
      try {
        await updateDoc(doc(db, 'sessions', activeSessionId), {
          results: resultsRef.current,
          logs: logs,
          url: url,
          instruction: instruction,
          aiSummary: aiSummaryRef.current,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Failed to update session with final results", err);
      }
    }
  };

  const handleStop = () => {
    isCrawlingRef.current = false;
    setIsCrawling(false);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setStatusMessage('Stopped by user');
    addLog('Crawl stopped by user');
  };

  const copyContent = (full: boolean) => {
    let textToCopy = '';
    
    if (full) {
      textToCopy = `# AI Smart Crawl Results\n\n**Seed URLs:**\n${url}\n\n**Instruction:**\n${instruction}\n\n`;
      if (aiSummary) {
        textToCopy += `**AI Guide & Insights:**\n\n${aiSummary}\n\n`;
      }
      textToCopy += `**Source References (Filtered Links):**\n\n` + 
        results.map(r => cleanAndSanitizeUrl(r.url)).filter(Boolean).map((cleanUrl, i) => `${i + 1}. ${cleanUrl}`).join('\n');
    } else {
      textToCopy = results.map(r => cleanAndSanitizeUrl(r.url)).filter(Boolean).join('\n');
    }

    navigator.clipboard.writeText(textToCopy);
    setCopiedCategory(full ? 'full' : 'links');
    setTimeout(() => setCopiedCategory(null), 2000);
  };

  const downloadMD = (full: boolean) => {
    let content = '';
    let filename = '';

    if (full) {
      content = `# AI Smart Crawl Results\n\n**Seed URLs:**\n${url}\n\n**Instruction:**\n${instruction}\n\n`;
      if (aiSummary) {
        content += `**AI Guide & Insights:**\n\n${aiSummary}\n\n`;
      }
      content += `**Source References (Filtered Links):**\n\n` + 
        results.map(r => cleanAndSanitizeUrl(r.url)).filter(Boolean).map((cleanUrl, i) => `${i + 1}. ${cleanUrl}`).join('\n');
      filename = `smart-crawl-full-${new Date().toISOString().split('T')[0]}.md`;
    } else {
      content = results.map(r => cleanAndSanitizeUrl(r.url)).filter(Boolean).join('\n');
      filename = `smart-crawl-links-${new Date().toISOString().split('T')[0]}.txt`;
    }

    const blob = new Blob([content], { type: full ? 'text/markdown' : 'text/plain' });
    const urlObj = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = urlObj;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(urlObj);
  };

  return (
    <div className="flex flex-col h-auto md:h-full pb-16 md:pb-0 w-full bg-zinc-50 dark:bg-zinc-950 md:rounded-[24px] lg:rounded-[32px] md:shadow-2xl md:border border-zinc-200/50 dark:border-zinc-800/50 md:overflow-hidden relative">
      <div className="flex flex-col md:flex-row flex-1 md:min-h-0 md:overflow-hidden">
        
        {/* Left Column: Configuration */}
        <div className="w-full md:w-[380px] flex-none flex-shrink-0 bg-white dark:bg-zinc-900 md:border-r border-zinc-200 dark:border-zinc-800 flex flex-col md:min-h-0">
          <div className="flex-1 md:overflow-y-auto p-5 md:p-6 space-y-6 custom-scrollbar">
            
            {/* Target URL */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Seed URL(s)</label>
                <div className="relative">
                  <input 
                    type="file" 
                    id="smart-crawler-file-upload"
                    multiple 
                    className="hidden" 
                    onChange={handleFileUpload} 
                    ref={fileInputRef}
                  />
                  <label 
                    htmlFor="smart-crawler-file-upload"
                    className="cursor-pointer flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload File(s)</span>
                  </label>
                </div>
              </div>
              <textarea 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/blog&#10;https://example.com/docs"
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-mono resize-none"
                rows={3}
                disabled={isCrawling}
              />
              
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {attachedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 rounded-lg">
                      <FileText className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-xs text-zinc-700 dark:text-zinc-300 max-w-[120px] truncate">{file.name}</span>
                      <button 
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-zinc-400 hover:text-red-500 transition-colors ml-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* AI Instruction */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">AI Filter Instruction</label>
              <textarea 
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. 'Collect all pages related to artificial intelligence' or 'Find profiles of team members'"
                className="w-full bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                rows={3}
                disabled={isCrawling}
              />
            </div>

            {/* Crawl Mode */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Processing Mode</label>
              <select
                value={crawlMode}
                onChange={(e) => setCrawlMode(e.target.value as 'deep' | 'filter')}
                disabled={isCrawling}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="filter">One-Shot AI Filter (Analyze URLs Only)</option>
                <option value="deep">Deep Crawl (Follows links in pages)</option>
              </select>
            </div>

            {/* Depth & Pages (Only relevant for Deep Crawl) */}
            {crawlMode === 'deep' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Max Pages</label>
                  <input 
                    type="number" 
                    value={maxPages}
                    onChange={(e) => setMaxPages(e.target.value)}
                    disabled={isCrawling}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    min="1" max="1000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Max Depth</label>
                  <input 
                    type="number" 
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(e.target.value)}
                    disabled={isCrawling}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    min="1" max="5"
                  />
                </div>
              </div>
            )}

            {/* Advanced Filters Toggle */}
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button 
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              >
                <span>Advanced Filters</span>
                <Layers className="w-4 h-4" />
              </button>
              
              {showAdvanced && (
                <div className="pt-4 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Include Patterns (Regex)</label>
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
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Exclude Patterns (Regex)</label>
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
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Include Domains (comma separated)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. docs.example.com"
                      value={includeDomains}
                      onChange={(e) => setIncludeDomains(e.target.value)}
                      disabled={isCrawling}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Exclude Extensions (comma separated)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. pdf, jpg, png"
                      value={excludeExtensions}
                      onChange={(e) => setExcludeExtensions(e.target.value)}
                      disabled={isCrawling}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
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
          
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
            {!isCrawling ? (
              <button 
                onClick={handleStart}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-rose-600 hover:from-purple-700 hover:to-rose-700 text-white font-medium py-3.5 rounded-xl transition-all shadow-lg hover:shadow-purple-600/25 active:scale-[0.98]"
              >
                <Brain className="w-5 h-5 fill-current" />
                Start AI Crawl
              </button>
            ) : (
              <button 
                onClick={handleStop}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium py-3.5 rounded-xl transition-all shadow-lg hover:shadow-red-600/25 active:scale-[0.98]"
              >
                <Square className="w-5 h-5 fill-current" />
                Stop Crawling
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Output & Monitoring */}
        <div className="flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
          
          {/* Live Progress Stats */}
          <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-4 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 shrink-0">
            <div className="flex flex-col">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Status</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{statusMessage}</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Pages Visited</span>
              <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">{stats.pagesCrawled}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Filtered Links</span>
              <span className="text-lg font-semibold text-purple-600 dark:text-purple-400 mt-0.5">{stats.totalLinks}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Errors</span>
              <span className="text-lg font-semibold text-red-600 dark:text-red-400 mt-0.5">{stats.errors}</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Links & Guide Results */}
            <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 overflow-hidden relative">
              <div className="bg-zinc-100/50 dark:bg-zinc-900/50 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">AI Guide & Source References</span>
                  {results.length > 0 && (
                    <span className="text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full">
                      {results.length} Found
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                {results.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600">
                    <Brain className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-sm">Awaiting AI filtered URLs and Guide...</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* AI Summary Section */}
                    {aiSummary && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                          <Brain className="w-5 h-5 text-purple-500" /> AI Guideline
                        </h3>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-zinc-700 dark:text-zinc-300">
                          <div className="markdown-body bg-purple-50/30 dark:bg-purple-900/10 p-5 rounded-2xl border border-purple-100 dark:border-purple-800/30">
                            <Markdown>{aiSummary}</Markdown>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Source References Section */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <LinkIcon className="w-5 h-5 text-blue-500" /> Source References
                      </h3>
                      <div className="space-y-2">
                        {results.map((result, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-semibold text-xs shrink-0">
                              {idx + 1}
                            </div>
                            <a 
                              href={result.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="flex-1 truncate text-sm text-zinc-800 dark:text-zinc-300 font-mono hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              {result.url}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Floating Action Button for Copy & Download */}
              {results.length > 0 && (
                <div className="absolute bottom-4 right-4 md:bottom-6 md:right-6 z-10 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => downloadMD(false)}
                      className="flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 rounded-full shadow-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:scale-105 active:scale-95 transition-all text-sm font-medium"
                      title="Download Source References only"
                    >
                      <Download className="w-4 h-4" />
                      Links Only
                    </button>
                    {aiSummary && (
                      <button
                        onClick={() => downloadMD(true)}
                        className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all text-sm font-medium"
                        title="Download AI Guide and Source References"
                      >
                        <Download className="w-4 h-4" />
                        Full Download
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyContent(false)}
                      className="flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 rounded-full shadow-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:scale-105 active:scale-95 transition-all text-sm font-medium"
                      title="Copy Source References only"
                    >
                      {copiedCategory === 'links' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedCategory === 'links' ? 'Copied!' : 'Copy Links'}
                    </button>
                    {aiSummary && (
                      <button
                        onClick={() => copyContent(true)}
                        className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all text-sm font-medium"
                        title="Copy AI Guide and Source References"
                      >
                        {copiedCategory === 'full' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiedCategory === 'full' ? 'Copied!' : 'Copy Full'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Terminal / Live Logs */}
            <div className="h-48 md:h-auto md:w-[300px] flex-shrink-0 flex flex-col bg-zinc-950 text-zinc-300 font-mono text-xs relative">
              <div className="bg-zinc-900 px-4 py-2 flex items-center gap-2 border-b border-zinc-800 shrink-0">
                <Terminal className="w-4 h-4 text-zinc-500" />
                <span className="font-semibold text-zinc-400">Live Logs</span>
              </div>
              <div 
                className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar"
                onScroll={handleLogsScroll}
                ref={logsContainerRef}
              >
                {logs.length === 0 ? (
                  <div className="text-zinc-600 italic">System ready. Waiting for task...</div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="flex gap-2 leading-relaxed">
                      <span className="text-zinc-600 shrink-0">[{log.time}]</span>
                      <span className={log.message.toLowerCase().includes('error') || log.message.toLowerCase().includes('fail') ? 'text-red-400' : (log.message.includes('AI') ? 'text-purple-400' : 'text-zinc-300')}>
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
      </div>
    </div>
  );
}
