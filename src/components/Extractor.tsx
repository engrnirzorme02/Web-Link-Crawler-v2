import React, { useState, useEffect, useRef } from 'react';
import { Copy, CheckCircle2, Link as LinkIcon, FileText, Download, ChevronDown, ChevronUp, Trash2, Layers, Upload } from 'lucide-react';
import { Session, db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { cn, truncateForFirestore, cleanAndSanitizeUrl, extractCleanUrlsFromText } from '../lib/utils';

interface ExtractorProps {
  session: Session | null;
  userId: string | null;
  onSessionCreated: (id: string) => void;
}

export default function Extractor({ session, userId, onSessionCreated }: ExtractorProps) {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  
  const [visibleCount, setVisibleCount] = useState(100);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setAttachedFiles(prev => [...prev, ...Array.from(files)]);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };
  const loadedSessionIdRef = useRef<string | null>(null);
  
  const currentSessionRef = useRef<Session | null>(null);
  currentSessionRef.current = session;
  const resultsRef = useRef<string[]>([]);
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

  const handleExport = (format: 'txt' | 'csv' | 'json' | 'md') => {
    const rawData = selectedUrls.size > 0 
      ? results.filter(r => selectedUrls.has(r))
      : results;
    
    const dataToExport = rawData.map(cleanAndSanitizeUrl).filter(Boolean) as string[];
    if (dataToExport.length === 0) return;

    let content = '';
    let type = '';
    let extension = '';

    if (format === 'txt') {
      content = dataToExport.join('\n');
      type = 'text/plain;charset=utf-8;';
      extension = 'txt';
    } else if (format === 'csv') {
      content = 'URL\n' + dataToExport.map(r => `"${r}"`).join('\n');
      type = 'text/csv;charset=utf-8;';
      extension = 'csv';
    } else if (format === 'json') {
      content = JSON.stringify(dataToExport, null, 2);
      type = 'application/json;charset=utf-8;';
      extension = 'json';
    } else if (format === 'md') {
      content = `# Extracted Unique URLs\n\nTotal unique URLs: ${dataToExport.length}\n\n` +
        dataToExport.map((r, i) => `${i + 1}. ${r}`).join('\n');
      type = 'text/markdown;charset=utf-8;';
      extension = 'md';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `clean_extracted_urls_(${dataToExport.length}).${extension}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const handleBulkDelete = async () => {
    if (selectedUrls.size === 0) return;
    const newResults = results.filter(r => !selectedUrls.has(r));
    setResults(newResults);
    setSelectedUrls(new Set());
    
    if (session && session.id) {
      try {
        const dataToUpdate = truncateForFirestore({ results: newResults });
        await updateDoc(doc(db, 'sessions', session.id), {
          ...dataToUpdate,
          updatedAt: serverTimestamp()
        });
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
      setSelectedUrls(new Set(results));
    }
  };

  useEffect(() => {
    if (session && session.id !== loadedSessionIdRef.current) {
      // If we receive a session from props, update our local results
      setResults(session.results || []);
      loadedSessionIdRef.current = session.id;
    } else if (!session && loadedSessionIdRef.current) {
      // If session became null (e.g. clicking New Session)
      setResults([]);
      setInput('');
      setAttachedFiles([]);
      loadedSessionIdRef.current = null;
    }
  }, [session]);

  const extractUrls = async () => {
    if (!input.trim() && attachedFiles.length === 0) return;

    let combinedInput = input;

    // Read all attached files
    if (attachedFiles.length > 0) {
      const fileContents = await Promise.all(
        attachedFiles.map(file => {
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve((event.target?.result as string) || '');
            reader.readAsText(file);
          });
        })
      );
      combinedInput += '\n' + fileContents.join('\n');
    }

    // Cleanly extract all valid URLs from the input text and files
    const newExtracted = extractCleanUrlsFromText(combinedInput);
    const existingCleaned = results.map(cleanAndSanitizeUrl).filter(Boolean) as string[];
    
    // Normalize and remove duplicates, merging with previous results
    const uniqueUrls = Array.from(new Set([...existingCleaned, ...newExtracted]));
    
    setResults(uniqueUrls);
    
    let activeSessionId = currentSessionRef.current?.id;
    
    if (!activeSessionId && userId) {
      try {
        const newSession: Session = truncateForFirestore({
          userId,
          type: 'extractor',
          title: `Extractor: ${new Date().toLocaleString()}`,
          results: uniqueUrls,
          logs: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        const docRef = await addDoc(collection(db, 'sessions'), newSession);
        onSessionCreated(docRef.id);
      } catch (err) {
        console.error("Failed to create session", err);
      }
    } else if (activeSessionId && userId) {
      try {
        const dataToUpdate = truncateForFirestore({ results: uniqueUrls });
        await updateDoc(doc(db, 'sessions', activeSessionId), {
          ...dataToUpdate,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {}
    }
    
    setInput(''); // Clear input after extraction
    setAttachedFiles([]); // Clear attached files
  };

  const copyAll = () => {
    if (results.length === 0) return;
    const cleanList = results.map(cleanAndSanitizeUrl).filter(Boolean) as string[];
    navigator.clipboard.writeText(cleanList.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const removeDuplicates = async () => {
    if (results.length === 0) return;
    const uniqueMap = new Set<string>();
    const uniqueResults: string[] = [];
    for (const item of results) {
      const cleaned = cleanAndSanitizeUrl(item);
      if (cleaned && !uniqueMap.has(cleaned)) {
        uniqueMap.add(cleaned);
        uniqueResults.push(cleaned);
      }
    }

    if (uniqueResults.length !== results.length) {
      setResults(uniqueResults);
      if (currentSessionRef.current?.id) {
        try {
          const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
          const dataToUpdate = truncateForFirestore({ results: uniqueResults });
          await updateDoc(doc(db, 'sessions', currentSessionRef.current.id), {
            ...dataToUpdate,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.error("Failed to update session after removing duplicates", e);
        }
      }
    }
  };

  const downloadTxt = () => {
    if (results.length === 0) return;
    const cleanList = results.map(cleanAndSanitizeUrl).filter(Boolean) as string[];
    const blob = new Blob([cleanList.join('\n')], { type: 'text/plain;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `extracted_clean_urls_(${cleanList.length}).txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  };

  const downloadMD = () => {
    if (results.length === 0) return;
    const cleanList = results.map(cleanAndSanitizeUrl).filter(Boolean) as string[];
    let fileName = `extracted_urls_(${cleanList.length}).md`;

    let content = `# Extracted Unique URLs\n\n`;
    content += `Total unique links found: ${cleanList.length}\n\n`;
    cleanList.forEach((url, index) => {
      content += `${index + 1}. ${url}\n`;
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

  return (
    <div className="flex flex-col h-auto md:h-full pb-6 md:pb-0 w-full bg-zinc-50 dark:bg-zinc-950 md:rounded-[24px] lg:rounded-[32px] md:shadow-2xl md:border border-zinc-200/50 dark:border-zinc-800/50 md:overflow-hidden relative">
      <div className="flex flex-col md:flex-row flex-1 min-h-0 md:overflow-hidden">
        {/* Left: Input */}
        <div className="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 shrink-0 md:h-full">
           <div className="p-4 flex flex-col min-h-[300px] md:h-full">
             <div className="flex items-center justify-between mb-2">
               <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Input Text / Content</label>
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
             <div className="flex-1 flex flex-col gap-2 min-h-[150px]">
               <textarea 
                 value={input}
                 onChange={(e) => setInput(e.target.value)}
                 placeholder="Paste any text, code, or content here to extract URLs..."
                 className="flex-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl p-4 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none custom-scrollbar min-h-[100px]"
               />
               
               {attachedFiles.length > 0 && (
                 <div className="flex flex-wrap gap-2 mt-2">
                   {attachedFiles.map((file, index) => (
                     <div key={index} className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 rounded-lg">
                       <FileText className="w-4 h-4 text-zinc-500" />
                       <span className="text-xs text-zinc-700 dark:text-zinc-300 max-w-[150px] truncate">{file.name}</span>
                       <button 
                         onClick={() => removeFile(index)}
                         className="text-zinc-400 hover:text-red-500 transition-colors ml-1"
                       >
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                     </div>
                   ))}
                 </div>
               )}
             </div>

             <button 
               onClick={extractUrls}
               disabled={!input.trim() && attachedFiles.length === 0}
               className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3.5 rounded-xl transition-all shadow-lg hover:shadow-blue-600/25 active:scale-[0.98] shrink-0"
             >
               Extract Unique URLs
             </button>
           </div>
        </div>

        {/* Right: Results */}
        <div className={`w-full md:w-1/2 flex flex-col bg-white dark:bg-zinc-950 relative md:h-full transition-all ${resultsExpanded ? 'min-h-[400px]' : ''}`}>
          <div 
            className="w-full bg-zinc-100/50 dark:bg-zinc-900/50 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center shrink-0 sticky top-0 z-10 transition-colors"
          >
            <button 
              onClick={() => setResultsExpanded(!resultsExpanded)}
              className="flex items-center gap-2 hover:opacity-80"
            >
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Unique URLs</span>
              {results.length > 0 && (
                <span className="text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                  {results.length} Found
                </span>
              )}
              <div className="md:hidden text-zinc-400 ml-2">
                {resultsExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </div>
            </button>
            
            {results.length > 0 && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={selectAll}
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  {selectedUrls.size === results.length ? 'Deselect All' : 'Select All'}
                </button>
                
                {selectedUrls.size > 0 && (
                  <div className="flex items-center gap-1 border-l border-zinc-300 dark:border-zinc-700 pl-2 ml-1">
                    <button 
                      onClick={handleBulkDelete}
                      className="p-1 text-red-500 hover:text-red-700 transition-colors"
                      title="Delete Selected"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    
                    <div className="relative" ref={exportMenuRef}>
                      <button 
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="p-1 text-blue-600 hover:text-blue-800 dark:hover:text-blue-400 transition-colors"
                        title="Export Selected"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {showExportMenu && (
                        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[140px]">
                          <button 
                            onClick={() => handleExport('txt')}
                            className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                          >
                            Export Clean TXT
                          </button>
                          <button 
                            onClick={() => handleExport('csv')}
                            className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                          >
                            Export CSV
                          </button>
                          <button 
                            onClick={() => handleExport('json')}
                            className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                          >
                            Export JSON
                          </button>
                          <button 
                            onClick={() => handleExport('md')}
                            className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                          >
                            Export Markdown
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className={`flex-1 overflow-y-auto p-4 custom-scrollbar ${resultsExpanded ? 'block' : 'hidden md:block'}`}>
            {results.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600">
                <LinkIcon className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm">No URLs extracted yet.</p>
              </div>
            ) : (
              <div className="space-y-2 pb-32">
                {results.slice(0, visibleCount).map((url, index) => (
                  <div 
                    key={index} 
                    onClick={() => toggleSelection(url)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer",
                      selectedUrls.has(url)
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                        : "bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
                    )}
                  >
                    <input 
                      type="checkbox" 
                      checked={selectedUrls.has(url)}
                      onChange={() => {}} // handled by parent div click
                      className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer pointer-events-none"
                    />
                    <div className="flex-1 truncate text-sm text-zinc-800 dark:text-zinc-300 font-mono">
                      {url}
                    </div>
                  </div>
                ))}
                
                {results.length > visibleCount && (
                  <div className="flex items-center gap-4 justify-center py-4 mt-2 border-t border-zinc-200 dark:border-zinc-800/50">
                    <span className="text-sm text-zinc-500 font-medium">Showing {visibleCount} of {results.length}</span>
                    <button 
                      onClick={() => setVisibleCount(p => p + 200)}
                      className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-sm"
                    >
                      Load More
                    </button>
                    <button 
                      onClick={() => setVisibleCount(results.length)}
                      className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-sm"
                    >
                      Expand All
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {(resultsExpanded || typeof window !== 'undefined' && window.innerWidth >= 768) && results.length > 0 && (
            <div className="absolute bottom-4 right-4 md:bottom-6 md:right-6 z-10 flex flex-col gap-2">
              <button
                onClick={removeDuplicates}
                className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-3 rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all font-medium"
              >
                <Layers className="w-5 h-5" />
                Remove Duplicates
              </button>
              <button
                onClick={downloadTxt}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all font-medium"
                title="Download pure clean URLs, 1 per line (no brackets, no markdown)"
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
                {copied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copied ? 'Copied!' : 'Copy All'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
