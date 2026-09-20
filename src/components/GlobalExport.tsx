import React, { useState, useRef, useEffect } from 'react';
import { DownloadCloud, FileText, FileJson, File, ChevronDown } from 'lucide-react';
import { Session } from '../lib/firebase';
import { cn, cleanAndSanitizeUrl } from '../lib/utils';

interface GlobalExportProps {
  session: Session | null;
}

export function GlobalExport({ session }: GlobalExportProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!session || !session.results || session.results.length === 0) return null;

  const handleExport = (format: 'csv' | 'json' | 'txt') => {
    const dataToExport = session.results;
    if (dataToExport.length === 0) return;

    let content = '';
    let type = '';
    let extension = '';

    if (format === 'csv') {
      // Assuming results have 'url' and 'source' for crawlers, or are just strings for extractors
      const isStringArr = typeof dataToExport[0] === 'string';
      if (isStringArr) {
        content = 'Result\n' + dataToExport.map(r => `"${cleanAndSanitizeUrl(String(r))}"`).join('\n');
      } else {
        content = 'URL,Source\n' + dataToExport.map(r => `"${cleanAndSanitizeUrl(r.url || '')}","${r.source || ''}"`).join('\n');
      }
      type = 'text/csv;charset=utf-8;';
      extension = 'csv';
    } else if (format === 'json') {
      const sanitized = dataToExport.map(r => {
        if (typeof r === 'string') return cleanAndSanitizeUrl(r);
        if (r && typeof r === 'object' && r.url) return { ...r, url: cleanAndSanitizeUrl(r.url) };
        return r;
      });
      content = JSON.stringify(sanitized, null, 2);
      type = 'application/json;charset=utf-8;';
      extension = 'json';
    } else if (format === 'txt') {
      const isStringArr = typeof dataToExport[0] === 'string';
      if (isStringArr) {
        content = dataToExport.map(r => cleanAndSanitizeUrl(String(r))).join('\n');
      } else {
        content = dataToExport.map(r => cleanAndSanitizeUrl(r.url || JSON.stringify(r))).join('\n');
      }
      type = 'text/plain;charset=utf-8;';
      extension = 'txt';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-export-${session.id || 'data'}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  return (
    <div className="relative" ref={exportMenuRef}>
      <button
        onClick={() => setShowExportMenu(!showExportMenu)}
        className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 px-3 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-sm font-medium"
        title="Export Session Data"
      >
        <DownloadCloud className="w-4 h-4" />
        <span className="hidden sm:inline">Export Results</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {showExportMenu && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2">
          <div className="p-1">
            <button
              onClick={() => handleExport('csv')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-left"
            >
              <FileText className="w-4 h-4 text-emerald-500" />
              Export as CSV
            </button>
            <button
              onClick={() => handleExport('json')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-left"
            >
              <FileJson className="w-4 h-4 text-blue-500" />
              Export as JSON
            </button>
            <button
              onClick={() => handleExport('txt')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-left"
            >
              <File className="w-4 h-4 text-zinc-500" />
              Export as TXT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
