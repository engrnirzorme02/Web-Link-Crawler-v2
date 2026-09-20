import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Trash2, Link as LinkIcon, AlignLeft, CheckCircle2, Upload, X, FileText, Download } from 'lucide-react';
import { cn, cleanAndSanitizeUrl, extractCleanUrlsFromText } from '../lib/utils';

export function DataExtractor() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [showOutput, setShowOutput] = useState(false);
  const [outputLabel, setOutputLabel] = useState('Output');
  
  // Live Counters
  const [inputLinksCount, setInputLinksCount] = useState(0);
  const [inputParagraphsCount, setInputParagraphsCount] = useState(0);

  // Toast State
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

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

  const urlRegex = /(https?:\/\/[^\s<>"]+)/g;

  // Live tracking logic
  useEffect(() => {
    let combinedText = input;
    if (attachedFiles.length > 0) {
      combinedText += '\n' + attachedFiles.map(f => f.content).join('\n');
    }

    // Count links
    const matches = combinedText.match(urlRegex);
    setInputLinksCount(matches ? matches.length : 0);

    // Count paragraphs
    const lines = combinedText.split('\n');
    let pCount = 0;
    for (const line of lines) {
      const lineWithoutUrls = line.replace(urlRegex, '');
      const cleanLine = lineWithoutUrls.replace(/^[.\s]+|[.\s]+$/g, '').trim();
      if (cleanLine.length > 0) {
        pCount++;
      }
    }
    setInputParagraphsCount(pCount);
  }, [input, attachedFiles]);

  const showToastMessage = useCallback((message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 2500);
  }, []);

  const handleClear = () => {
    setInput('');
    setOutput('');
    setShowOutput(false);
    setInputLinksCount(0);
    setInputParagraphsCount(0);
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    showToastMessage('Copied!');
  };

  const handleDownload = (format: 'txt' | 'csv' | 'json') => {
    if (!output.trim()) return;
    const lines = output.split('\n').filter(Boolean);
    let content = '';
    let type = '';
    let ext = '';

    if (format === 'txt') {
      content = output;
      type = 'text/plain;charset=utf-8;';
      ext = 'txt';
    } else if (format === 'csv') {
      content = 'Item\n' + lines.map(l => `"${l.replace(/"/g, '""')}"`).join('\n');
      type = 'text/csv;charset=utf-8;';
      ext = 'csv';
    } else if (format === 'json') {
      content = JSON.stringify(lines, null, 2);
      type = 'application/json;charset=utf-8;';
      ext = 'json';
    }

    const blob = new Blob([content], { type });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `extracted_data_(${lines.length}).${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
    showToastMessage(`Downloaded .${ext}`);
  };

  const getCombinedInput = () => {
    let combinedText = input;
    if (attachedFiles.length > 0) {
      combinedText += '\n' + attachedFiles.map(f => f.content).join('\n');
      // Intentionally not clearing attachedFiles here so user can run multiple actions on them
    }
    return combinedText;
  };

  const handleFilterLinks = () => {
    const combinedInput = getCombinedInput();
    const cleanUrls = extractCleanUrlsFromText(combinedInput);
    if (cleanUrls.length === 0) {
      setOutput('');
      setShowOutput(true);
      setOutputLabel('Output: 0 Links');
      showToastMessage('No links found');
      return;
    }

    setOutput(cleanUrls.join('\n'));
    setShowOutput(true);
    setOutputLabel(`Output: ${cleanUrls.length} Unique Links`);
    showToastMessage('Links Filtered Cleanly!');
  };

  const handleSanitizeParagraphs = () => {
    const combinedInput = getCombinedInput();
    const lines = combinedInput.split('\n');
    const cleanLines: string[] = [];

    for (const line of lines) {
      const lineWithoutUrls = line.replace(urlRegex, '');
      const cleanLine = lineWithoutUrls.replace(/^[.\s]+|[.\s]+$/g, '').trim();
      if (cleanLine.length > 0) {
        cleanLines.push(cleanLine);
      }
    }

    setOutput(cleanLines.join('\n\n'));
    setShowOutput(true);
    setOutputLabel(`Output: ${cleanLines.length} Paragraphs`);
    showToastMessage('Paragraphs Sanitized!');
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-950 p-4 md:p-8 overflow-y-auto custom-scrollbar relative">
      {/* Toast Notification - Mobile First Fixed Positioning */}
      <div 
        className={cn(
          "fixed top-4 left-4 right-4 md:left-auto md:w-auto z-[100] flex items-center justify-center gap-2 bg-emerald-500 text-white px-4 py-3 rounded-lg shadow-xl transition-all duration-300 ease-in-out transform",
          showToast ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none md:-translate-y-0 md:translate-x-full"
        )}
      >
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <span className="font-medium text-sm">{toastMessage}</span>
      </div>

      <div className="max-w-4xl w-full mx-auto space-y-4 md:space-y-6 pb-20 md:pb-0">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">Data Extractor & Filtering Tool</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
            A local sandboxed text parser to instantly extract links and sanitize raw text dumps without any backend dependency.
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
          <div className="bg-slate-100 dark:bg-slate-800/50 px-3 md:px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 justify-between items-center">
            <div className="flex flex-wrap gap-3 md:gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 px-2 py-1 rounded-md shadow-sm border border-slate-200 dark:border-slate-700">
                <LinkIcon className="w-3.5 h-3.5 text-indigo-500" />
                <span>Input Links: {inputLinksCount}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 px-2 py-1 rounded-md shadow-sm border border-slate-200 dark:border-slate-700">
                <AlignLeft className="w-3.5 h-3.5 text-cyan-500" />
                <span>Input Paragraphs: {inputParagraphsCount}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer flex items-center gap-1 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors px-2 py-1 rounded-md text-xs font-medium">
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Upload File(s)</span>
                <span className="sm:hidden">Upload</span>
                <input 
                  type="file" 
                  multiple 
                  className="hidden" 
                  onChange={handleFileUpload} 
                />
              </label>
              <button 
                onClick={handleClear}
                className="flex items-center gap-1 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors px-2 py-1 rounded-md text-xs font-medium"
                title="Clear Input"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            </div>
          </div>
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 md:px-4 pb-2 border-b border-slate-200 dark:border-slate-800">
              {attachedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800/30 text-xs">
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste your raw data here..."
            className="w-full h-48 md:h-64 p-3 md:p-4 bg-transparent resize-none focus:outline-none text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-600 font-mono text-sm custom-scrollbar"
          />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          <button
            onClick={handleFilterLinks}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-medium py-3.5 px-4 md:px-6 rounded-xl transition-all shadow-md hover:shadow-indigo-500/25 active:scale-[0.98] text-sm md:text-base"
          >
            <LinkIcon className="w-5 h-5" />
            Filter Links
          </button>
          <button
            onClick={handleSanitizeParagraphs}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-medium py-3.5 px-4 md:px-6 rounded-xl transition-all shadow-md hover:shadow-cyan-500/25 active:scale-[0.98] text-sm md:text-base"
          >
            <AlignLeft className="w-5 h-5" />
            Sanitize Paragraphs
          </button>
        </div>

        {/* Output Section */}
        {showOutput && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col mt-2 md:mt-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 px-3 md:px-4 py-3 border-b border-emerald-100 dark:border-emerald-800/30 flex justify-between items-center">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider truncate mr-2">
                {outputLabel}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button 
                  onClick={() => handleDownload('txt')}
                  className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 transition-colors bg-emerald-100 dark:bg-emerald-800/50 hover:bg-emerald-200 dark:hover:bg-emerald-800/80 px-2.5 py-1.5 rounded-md shadow-sm"
                  title="Download clean text file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>TXT</span>
                </button>
                <button 
                  onClick={() => handleDownload('csv')}
                  className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 transition-colors bg-emerald-100 dark:bg-emerald-800/50 hover:bg-emerald-200 dark:hover:bg-emerald-800/80 px-2.5 py-1.5 rounded-md shadow-sm"
                  title="Download CSV spreadsheet"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
                <button 
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 transition-colors bg-emerald-100 dark:bg-emerald-800/50 hover:bg-emerald-200 dark:hover:bg-emerald-800/80 px-2.5 py-1.5 rounded-md shadow-sm"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
              </div>
            </div>
            <textarea
              readOnly
              value={output}
              className="w-full h-48 md:h-64 p-3 md:p-4 bg-slate-50/50 dark:bg-slate-950/50 resize-none focus:outline-none text-slate-800 dark:text-slate-200 font-mono text-sm custom-scrollbar"
            />
          </div>
        )}
      </div>
    </div>
  );
}
