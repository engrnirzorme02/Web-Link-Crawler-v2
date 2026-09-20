import React, { useState, useEffect } from 'react';
import { db, Session } from '../lib/firebase';
import { doc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Settings2, Play, CheckCircle2, Copy, FileX, Scissors, Filter, Upload, ChevronDown, Download, X, FileText } from 'lucide-react';
import { cn, truncateForFirestore, cleanAndSanitizeUrl } from '../lib/utils';

interface URLProcessorProps {
  session?: Session | null;
  userId: string | null;
  onSessionCreated?: (id: string) => void;
}

export default function URLProcessor({ session, userId, onSessionCreated }: URLProcessorProps) {
  const [inputUrls, setInputUrls] = useState('');
  const [processType, setProcessType] = useState<'remove_duplicates' | 'purify' | 'polish' | 'filter' | 'exclude'>('remove_duplicates');
  const [polishMatchStr, setPolishMatchStr] = useState('');
  const [filterMatchStr, setFilterMatchStr] = useState('');
  const [excludeMatchStr, setExcludeMatchStr] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  
  const [successList, setSuccessList] = useState<string[]>([]);
  const [unmodifiedList, setUnmodifiedList] = useState<string[]>([]);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [copiedUnmodified, setCopiedUnmodified] = useState(false);
  
  const [visibleSuccessCount, setVisibleSuccessCount] = useState(100);
  const [visibleUnmodifiedCount, setVisibleUnmodifiedCount] = useState(100);

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
    // Reset input so the same file can be uploaded again if needed
    e.target.value = '';
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (session) {
      if (session.results) {
        setSuccessList(session.results.map(r => typeof r === 'string' ? r : r.url));
      }
      if (session.logs) {
        setUnmodifiedList(session.logs.map(l => typeof l === 'string' ? l : l.message));
      }
    } else {
      setSuccessList([]);
      setUnmodifiedList([]);
      setInputUrls('');
    }
  }, [session]);

  const saveToFirebase = async (success: string[], unmodified: string[]) => {
    if (!userId) return;
    try {
      if (session?.id) {
        const dataToUpdate = truncateForFirestore({
          results: success,
          logs: unmodified,
        });
        await updateDoc(doc(db, 'sessions', session.id), {
          ...dataToUpdate,
          updatedAt: serverTimestamp()
        });
      } else if (success.length > 0 || unmodified.length > 0) {
        if (onSessionCreated) {
          const newSessionId = `urlproc_${Date.now()}`;
          const dataToSave = truncateForFirestore({
            userId,
            type: 'url_processor',
            title: `URL Processing`,
            results: success,
            logs: unmodified,
          });
          await setDoc(doc(db, 'sessions', newSessionId), {
            ...dataToSave,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          onSessionCreated(newSessionId);
        }
      }
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  };

  const handleProcess = () => {
    let combinedText = inputUrls;
    if (attachedFiles.length > 0) {
      combinedText += '\n' + attachedFiles.map(f => f.content).join('\n');
      setAttachedFiles([]);
    }

    const urls = combinedText.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;

    let success: string[] = [];
    let unmodified: string[] = [];
    
    setVisibleSuccessCount(100);
    setVisibleUnmodifiedCount(100);

    if (processType === 'remove_duplicates') {
      const unique = Array.from(new Set(urls.map(u => cleanAndSanitizeUrl(u)).filter(Boolean)));
      success = unique;
    } else if (processType === 'purify') {
      const extracted: string[] = [];
      const fullText = urls.join('\n');
      
      const urlRegex = /https?:\/\/[^\s"'<>\]\[\)\{\}]+/gi;
      const matches = fullText.match(urlRegex);
      
      if (matches) {
        matches.forEach(match => {
          let cleanUrl = cleanAndSanitizeUrl(match);
          if (cleanUrl) {
            const lowerClean = cleanUrl.toLowerCase();
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
              lowerClean.endsWith('.css') ||
              lowerClean.endsWith('.js');
              
            if (!isInternalOrGarbage && lowerClean.startsWith('http')) {
              extracted.push(cleanUrl);
            }
          }
        });
      }
      
      // Find rows that did not contain any valid HTTP/HTTPS URLs so we can classify them as unmodified
      urls.forEach(line => {
        const lineMatches = line.match(urlRegex);
        let hasValidWebUrl = false;
        if (lineMatches) {
          for (const m of lineMatches) {
            let clean = m.trim();
            while (clean && ['.', ',', ')', ']', '}', '>', '*', '\\', '"', "'"].includes(clean.charAt(clean.length - 1))) {
              clean = clean.slice(0, -1);
            }
            const lowerClean = clean.toLowerCase();
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
              hasValidWebUrl = true;
              break;
            }
          }
        }
        if (!hasValidWebUrl) {
          unmodified.push(line);
        }
      });
      success = Array.from(new Set(extracted));
    } else if (processType === 'polish') {
      if (!polishMatchStr) {
        alert('Please enter a string to match for polishing.');
        return;
      }
      urls.forEach(url => {
        const idx = url.indexOf(polishMatchStr);
        if (idx !== -1) {
          success.push(url.substring(0, idx));
        } else {
          unmodified.push(url);
        }
      });
    } else if (processType === 'filter') {
      if (!filterMatchStr) {
        alert('Please enter a string/regex to filter by.');
        return;
      }
      
      try {
        const filterStrs = filterMatchStr.split(',').map(s => s.trim()).filter(Boolean);
        const regexes = useRegex ? filterStrs.map(s => new RegExp(s, 'i')) : [];
        
        urls.forEach(url => {
          let matches = false;
          if (useRegex) {
            matches = regexes.some(r => r.test(url));
          } else {
            matches = filterStrs.some(str => url.includes(str));
          }
          
          if (matches) {
            success.push(url);
          } else {
            unmodified.push(url);
          }
        });
      } catch (e: any) {
        alert(`Invalid regex: ${e.message}`);
        return;
      }
    } else if (processType === 'exclude') {
      if (!excludeMatchStr) {
        alert('Please enter a string/regex to exclude by.');
        return;
      }
      
      try {
        const excludeStrs = excludeMatchStr.split(',').map(s => s.trim()).filter(Boolean);
        const regexes = useRegex ? excludeStrs.map(s => new RegExp(s, 'i')) : [];
        
        urls.forEach(url => {
          let matches = false;
          if (useRegex) {
            matches = regexes.some(r => r.test(url));
          } else {
            matches = excludeStrs.some(str => url.includes(str));
          }
          
          if (matches) {
            unmodified.push(url); // Excluded items go here
          } else {
            success.push(url); // Clean items go here
          }
        });
      } catch (e: any) {
        alert(`Invalid regex: ${e.message}`);
        return;
      }
    }

    setSuccessList(success);
    setUnmodifiedList(unmodified);
    saveToFirebase(success, unmodified);
  };

  const copyList = (list: string[], type: 'success' | 'unmodified') => {
    if (list.length === 0) return;
    navigator.clipboard.writeText(list.join('\n'));
    if (type === 'success') {
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2000);
    } else {
      setCopiedUnmodified(true);
      setTimeout(() => setCopiedUnmodified(false), 2000);
    }
  };

  const downloadList = (list: string[], type: 'success' | 'unmodified') => {
    if (list.length === 0) return;
    const content = list.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type === 'success' ? 'processed_success' : 'processed_unmodified'}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col md:flex-row h-auto md:h-full gap-4 w-full">
      <div className="w-full md:w-1/3 flex flex-col gap-4">
        <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm flex flex-col flex-1">
          <div className="flex items-center gap-2 mb-4 text-zinc-800 dark:text-zinc-200 font-semibold">
            <Settings2 className="w-5 h-5 text-blue-500" />
            URL Processor
          </div>
          
          <div className="space-y-4 flex-1 flex flex-col">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">URLs to Process</label>
                <label className="cursor-pointer flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
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
                value={inputUrls}
                onChange={(e) => setInputUrls(e.target.value)}
                placeholder="Paste URLs here, one per line..."
                className="w-full h-32 md:h-48 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Action</label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="radio" 
                    name="processType" 
                    checked={processType === 'remove_duplicates'} 
                    onChange={() => setProcessType('remove_duplicates')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  Remove Duplicates Only
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer font-medium text-emerald-600 dark:text-emerald-400">
                  <input 
                    type="radio" 
                    name="processType" 
                    checked={processType === 'purify'} 
                    onChange={() => setProcessType('purify')}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  ✨ Purify Web Links (HTTP/HTTPS only)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="radio" 
                    name="processType" 
                    checked={processType === 'polish'} 
                    onChange={() => setProcessType('polish')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  Polish URL (Remove part after match)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="radio" 
                    name="processType" 
                    checked={processType === 'filter'} 
                    onChange={() => setProcessType('filter')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  Filter URLs (Keep matching)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="radio" 
                    name="processType" 
                    checked={processType === 'exclude'} 
                    onChange={() => setProcessType('exclude')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  Exclude URLs (Remove matching)
                </label>
              </div>
            </div>

            {(processType === 'filter' || processType === 'exclude') && (
              <div className="mb-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer text-zinc-700 dark:text-zinc-300">
                  <input 
                    type="checkbox" 
                    checked={useRegex} 
                    onChange={(e) => setUseRegex(e.target.checked)}
                    className="text-blue-600 focus:ring-blue-500 rounded border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
                  />
                  Use Regular Expressions
                </label>
              </div>
            )}

            {processType === 'polish' && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Match String to Remove After (e.g. "?", "#", "id=")</label>
                <input 
                  type="text" 
                  value={polishMatchStr}
                  onChange={(e) => setPolishMatchStr(e.target.value)}
                  placeholder="String to match..."
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            )}

            {processType === 'filter' && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Filter String (Comma separated, keep URLs containing any)</label>
                <input 
                  type="text" 
                  value={filterMatchStr}
                  onChange={(e) => setFilterMatchStr(e.target.value)}
                  placeholder="e.g. blog, news..."
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            )}

            {processType === 'exclude' && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Exclude String (Comma separated, remove URLs containing any)</label>
                <input 
                  type="text" 
                  value={excludeMatchStr}
                  onChange={(e) => setExcludeMatchStr(e.target.value)}
                  placeholder="e.g. .jpg, .mp4, admin..."
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            )}

            <button 
              onClick={handleProcess}
              className="mt-auto w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              Process URLs
            </button>
          </div>
        </div>
      </div>

      <div className="w-full md:w-2/3 flex flex-col gap-4 overflow-hidden">
        <div className="flex-1 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Success / Matches ({successList.length})
            </h3>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => copyList(successList, 'success')}
                disabled={successList.length === 0}
                className="text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors flex items-center gap-1.5 disabled:opacity-50 font-medium"
              >
                {copiedSuccess ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedSuccess ? 'Copied' : 'Copy'}
              </button>
              <button 
                onClick={() => downloadList(successList, 'success')}
                disabled={successList.length === 0}
                className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1.5 disabled:opacity-50 font-medium"
                title="Download as TXT file"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 custom-scrollbar text-sm font-mono whitespace-pre-wrap flex flex-col gap-2">
            {successList.length > 0 ? (
              <>
                <div>{successList.slice(0, visibleSuccessCount).join('\n')}</div>
                {successList.length > visibleSuccessCount && (
                  <div className="flex items-center gap-3 pt-2 pb-1 border-t border-zinc-200 dark:border-zinc-800/50 mt-auto">
                    <span className="text-xs text-zinc-500">Showing {visibleSuccessCount} of {successList.length}</span>
                    <button 
                      onClick={() => setVisibleSuccessCount(p => p + 500)}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    >
                      Load More
                    </button>
                    <button 
                      onClick={() => setVisibleSuccessCount(successList.length)}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    >
                      Expand All
                    </button>
                  </div>
                )}
              </>
            ) : <span className="text-zinc-400">No results yet...</span>}
          </div>
        </div>

        {processType !== 'remove_duplicates' && (
          <div className="flex-1 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                <FileX className="w-4 h-4 text-amber-500" />
                Unmodified / No Match ({unmodifiedList.length})
              </h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => copyList(unmodifiedList, 'unmodified')}
                  disabled={unmodifiedList.length === 0}
                  className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors flex items-center gap-1.5 disabled:opacity-50 font-medium"
                >
                  {copiedUnmodified ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedUnmodified ? 'Copied' : 'Copy'}
                </button>
                <button 
                  onClick={() => downloadList(unmodifiedList, 'unmodified')}
                  disabled={unmodifiedList.length === 0}
                  className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1.5 disabled:opacity-50 font-medium"
                  title="Download as TXT file"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 custom-scrollbar text-sm font-mono whitespace-pre-wrap flex flex-col gap-2">
              {unmodifiedList.length > 0 ? (
                <>
                  <div>{unmodifiedList.slice(0, visibleUnmodifiedCount).join('\n')}</div>
                  {unmodifiedList.length > visibleUnmodifiedCount && (
                    <div className="flex items-center gap-3 pt-2 pb-1 border-t border-zinc-200 dark:border-zinc-800/50 mt-auto">
                      <span className="text-xs text-zinc-500">Showing {visibleUnmodifiedCount} of {unmodifiedList.length}</span>
                      <button 
                        onClick={() => setVisibleUnmodifiedCount(p => p + 500)}
                        className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
                      >
                        Load More
                      </button>
                      <button 
                        onClick={() => setVisibleUnmodifiedCount(unmodifiedList.length)}
                        className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
                      >
                        Expand All
                      </button>
                    </div>
                  )}
                </>
              ) : <span className="text-zinc-400">No results yet...</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
