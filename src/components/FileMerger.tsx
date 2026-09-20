import React, { useState, useRef } from 'react';
import { Upload, Trash2, Download, Merge, FileText, File as FileIcon, X, Layers, Globe } from 'lucide-react';
import { Session } from '../lib/firebase';
import * as pdfjsLib from 'pdfjs-dist';

// Setting up pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface FileMergerProps {
  session: Session | null;
  userId: string | null;
  onSessionCreated: (id: string) => void;
}

interface ParsedFile {
  id: string;
  name: string;
  type: string;
  category: string;
  content: string;
  originalFile: File;
}

export function FileMerger({ session, userId, onSessionCreated }: FileMergerProps) {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; message: string }>({ current: 0, total: 0, message: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getCategory = (type: string, name: string) => {
    if (type.includes('pdf')) return 'PDF';
    if (type.includes('html')) return 'HTML';
    if (type.includes('markdown') || name.endsWith('.md')) return 'Markdown';
    if (type.includes('text') || name.endsWith('.txt')) return 'Text';
    if (type.includes('json')) return 'JSON';
    return 'Other';
  };

  const processFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        const result = e.target?.result;
        if (!result) return resolve('');

        const category = getCategory(file.type, file.name);
        
        if (category === 'PDF') {
          try {
            const typedarray = new Uint8Array(result as ArrayBuffer);
            const pdf = await (pdfjsLib as any).getDocument({ data: typedarray }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items.map((item: any) => item.str).join(' ');
              fullText += pageText + '\n\n';
            }
            resolve(fullText);
          } catch (err) {
            console.error('Error parsing PDF:', err);
            resolve(`[Error parsing PDF: ${file.name}]`);
          }
        } else if (category === 'HTML') {
            const text = result as string;
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            resolve(doc.body.textContent || '');
        } else {
            resolve(result as string);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));

      if (file.type.includes('pdf')) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: selectedFiles.length, message: 'Processing files...' });

    const newParsedFiles: ParsedFile[] = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setProgress({ current: i + 1, total: selectedFiles.length, message: `Processing ${file.name}...` });
      
      try {
        const content = await processFile(file);
        newParsedFiles.push({
          id: Math.random().toString(36).substring(7),
          name: file.name,
          type: file.type,
          category: getCategory(file.type, file.name),
          content: content,
          originalFile: file
        });
      } catch (err) {
        console.error(`Failed to process ${file.name}:`, err);
      }
    }

    setFiles(prev => [...prev, ...newParsedFiles]);
    setIsProcessing(false);
    setProgress({ current: 0, total: 0, message: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setFiles(files.filter(f => f.id !== id));
  };

  const generateMarkdown = (categorize: boolean) => {
    let md = '# Merged Files\n\n';
    
    if (categorize) {
      const categories = [...new Set(files.map(f => f.category))];
      categories.forEach(category => {
        md += `## Category: ${category}\n\n`;
        const categoryFiles = files.filter(f => f.category === category);
        categoryFiles.forEach(file => {
          md += `### File: ${file.name}\n\n`;
          md += `${file.content.trim()}\n\n`;
          md += `---\n\n`;
        });
      });
    } else {
      files.forEach(file => {
        md += `### File: ${file.name}\n\n`;
        md += `${file.content.trim()}\n\n`;
        md += `---\n\n`;
      });
    }
    
    return md;
  };

  const downloadMarkdown = (categorize: boolean) => {
    const md = generateMarkdown(categorize);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merged-files-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = async () => {
    setIsProcessing(true);
    setProgress({ current: 0, total: 1, message: 'Generating PDF...' });
    
    try {
        // Dynamically import html2pdf
        const html2pdf = (await import('html2pdf.js')).default;
        
        // Convert Markdown-like structure to HTML for PDF rendering
        const container = document.createElement('div');
        container.style.padding = '20px';
        container.style.fontFamily = 'sans-serif';
        container.style.lineHeight = '1.6';
        
        let htmlContent = '<h1>Merged Files</h1>';
        files.forEach(file => {
            htmlContent += `<h2>File: ${file.name}</h2>`;
            htmlContent += `<pre style="white-space: pre-wrap; font-family: monospace; background: #f4f4f5; padding: 10px; border-radius: 8px;">${file.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre><hr/>`;
        });
        
        container.innerHTML = htmlContent;
        
        const opt = {
          margin:       10,
          filename:     `merged-files-${new Date().toISOString().split('T')[0]}.pdf`,
          image:        { type: 'jpeg' as const, quality: 0.98 },
          html2canvas:  { scale: 2 },
          jsPDF:        { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
        };
        
        await html2pdf().set(opt).from(container).save();
    } catch (err) {
        console.error("Error generating PDF:", err);
        alert("Failed to generate PDF. Please try again.");
    } finally {
        setIsProcessing(false);
        setProgress({ current: 0, total: 0, message: '' });
    }
  };

  return (
    <div className="flex flex-col h-auto md:h-full pb-16 md:pb-0 w-full bg-zinc-50 dark:bg-zinc-950 md:rounded-[24px] lg:rounded-[32px] md:shadow-2xl md:border border-zinc-200/50 dark:border-zinc-800/50 md:overflow-hidden relative">
      <div className="flex flex-col md:flex-row flex-1 md:min-h-0 md:overflow-hidden">
        
        {/* Left Column: Input */}
        <div className="w-full md:w-[380px] flex-none flex-shrink-0 bg-white dark:bg-zinc-900 md:border-r border-zinc-200 dark:border-zinc-800 flex flex-col md:min-h-0">
          <div className="flex-1 md:overflow-y-auto p-5 md:p-6 space-y-6 custom-scrollbar">
            <div>
              <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-400 dark:to-blue-400 flex items-center gap-2 mb-2">
                <Merge className="w-6 h-6 text-cyan-500" />
                File Merger
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Upload files (PDF, HTML, MD, TXT, JSON) to extract their contents and merge them into a single Markdown or PDF file.
              </p>
            </div>

            <div className="space-y-4">
              <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-8 h-8 text-zinc-400 mb-3" />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Click to upload files</p>
                <p className="text-xs text-zinc-500 mt-1">Supports PDF, MD, HTML, TXT, JSON</p>
                <input 
                  type="file" 
                  multiple 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".pdf,.md,.txt,.html,.json,text/*,application/pdf"
                />
              </div>

              {isProcessing && (
                <div className="bg-cyan-50 dark:bg-cyan-900/20 p-4 rounded-xl border border-cyan-100 dark:border-cyan-800/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-cyan-700 dark:text-cyan-400">{progress.message}</span>
                    <span className="text-xs text-cyan-600 dark:text-cyan-500">{progress.current} / {progress.total}</span>
                  </div>
                  <div className="h-1.5 w-full bg-cyan-200 dark:bg-cyan-900/50 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-600 dark:bg-cyan-500 transition-all duration-300 ease-out rounded-full"
                      style={{ width: `${Math.max(5, (progress.current / progress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Files & Actions */}
        <div className="flex-1 flex flex-col min-w-0 bg-zinc-50 dark:bg-zinc-950/50 relative">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm flex justify-between items-center shrink-0">
             <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-zinc-500" />
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Uploaded Files ({files.length})
                </h3>
             </div>
             
             {files.length > 0 && (
                <button onClick={() => setFiles([])} className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 font-medium bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-full transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear All
                </button>
             )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {files.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-400 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    <FileIcon className="w-8 h-8 text-zinc-400" />
                  </div>
                  <p>No files uploaded yet.</p>
               </div>
            ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-3 content-start">
                  {files.map((file) => (
                    <div key={file.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow group relative">
                       <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                          {file.category === 'PDF' && <FileText className="w-5 h-5 text-red-500" />}
                          {file.category === 'Markdown' && <FileText className="w-5 h-5 text-blue-500" />}
                          {file.category === 'HTML' && <Globe className="w-5 h-5 text-orange-500" />}
                          {file.category === 'JSON' && <FileIcon className="w-5 h-5 text-yellow-500" />}
                          {file.category === 'Text' && <FileText className="w-5 h-5 text-zinc-500" />}
                          {file.category === 'Other' && <FileIcon className="w-5 h-5 text-zinc-500" />}
                       </div>
                       <div className="flex-1 min-w-0 pr-8">
                          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate" title={file.name}>
                            {file.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-full font-medium">
                              {file.category}
                            </span>
                            <span className="text-xs text-zinc-500 truncate">
                              {(file.content.length).toLocaleString()} chars
                            </span>
                          </div>
                       </div>
                       <button 
                         onClick={() => removeFile(file.id)}
                         className="absolute top-3 right-3 p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                       >
                          <X className="w-4 h-4" />
                       </button>
                    </div>
                  ))}
               </div>
            )}
          </div>
          
          {files.length > 0 && (
             <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md shrink-0 flex flex-wrap gap-3">
                <button
                  onClick={() => downloadMarkdown(false)}
                  disabled={isProcessing}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 px-5 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Download className="w-4 h-4" />
                  Merge as Single MD
                </button>
                <button
                  onClick={() => downloadMarkdown(true)}
                  disabled={isProcessing}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Layers className="w-4 h-4" />
                  Merge Categorized MD
                </button>
                <button
                  onClick={downloadPDF}
                  disabled={isProcessing}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  <FileText className="w-4 h-4" />
                  Merge as PDF
                </button>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
