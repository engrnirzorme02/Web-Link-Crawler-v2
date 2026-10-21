import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Download, FileText, CheckCircle2, AlertCircle, Layers, 
  Scissors, Files, FileSpreadsheet, ArrowRight, Loader2, Sparkles, 
  Hash, AlignLeft, ShieldCheck, Eye, ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface SplitDatasetItem {
  url: string;
  content?: string;
  category?: string;
  [key: string]: any;
}

export interface SplitDataset {
  name: string;
  label: string;
  items: Array<SplitDatasetItem | string>;
}

interface SplitExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  defaultDatasetName?: string;
  datasets: SplitDataset[];
}

export interface PartInfo {
  partNum: number;
  startIndex: number;
  endIndex: number;
  count: number;
  charCount: number;
  wordCount: number;
  sizeFormatted: string;
  firstUrl: string;
  lastUrl: string;
}

export const SplitExportModal: React.FC<SplitExportModalProps> = ({
  isOpen,
  onClose,
  title = 'Split & Export Download (স্প্লিট ডেটা এক্সপোর্ট)',
  defaultDatasetName,
  datasets = []
}) => {
  const [selectedDatasetIndex, setSelectedDatasetIndex] = useState(0);

  // Set default dataset if provided
  useEffect(() => {
    if (defaultDatasetName) {
      const idx = datasets.findIndex(d => d.name === defaultDatasetName);
      if (idx !== -1) setSelectedDatasetIndex(idx);
    }
  }, [defaultDatasetName, datasets]);

  const currentDataset = datasets[selectedDatasetIndex] || datasets[0] || { name: 'all', label: 'Dataset', items: [] };
  const rawItems = currentDataset.items || [];
  const totalItems = rawItems.length;

  // Two-way interactive split inputs
  const [linksInput, setLinksInput] = useState<string>('500');
  const [filesInput, setFilesInput] = useState<string>('1');
  const [format, setFormat] = useState<'txt' | 'md' | 'csv' | 'json'>('txt');
  const [selectedPartIndex, setSelectedPartIndex] = useState<number | null>(null);

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
  const [downloadCompleted, setDownloadCompleted] = useState(false);
  const [singleDownloadingPart, setSingleDownloadingPart] = useState<number | null>(null);

  // Auto-initialize inputs when dataset changes
  useEffect(() => {
    if (totalItems > 0) {
      if (totalItems <= 500) {
        setLinksInput(String(totalItems));
        setFilesInput('1');
      } else {
        const defaultLinks = totalItems > 10000 ? 5000 : 500;
        setLinksInput(String(defaultLinks));
        setFilesInput(String(Math.ceil(totalItems / defaultLinks)));
      }
    } else {
      setLinksInput('0');
      setFilesInput('1');
    }
    setDownloadCompleted(false);
    setDownloadProgress(null);
    setSelectedPartIndex(null);
  }, [selectedDatasetIndex, totalItems]);

  // Handle Links input change -> auto calculate Files
  const handleLinksChange = (val: string) => {
    setLinksInput(val);
    setDownloadCompleted(false);
    const numLinks = parseInt(val, 10);
    if (!isNaN(numLinks) && numLinks > 0 && totalItems > 0) {
      const calculatedFiles = Math.max(1, Math.ceil(totalItems / numLinks));
      setFilesInput(String(calculatedFiles));
    }
  };

  // Handle Files input change -> auto calculate Links per file
  const handleFilesChange = (val: string) => {
    setFilesInput(val);
    setDownloadCompleted(false);
    const numFiles = parseInt(val, 10);
    if (!isNaN(numFiles) && numFiles > 0 && totalItems > 0) {
      const calculatedLinks = Math.max(1, Math.ceil(totalItems / numFiles));
      setLinksInput(String(calculatedLinks));
    }
  };

  // Quick Presets
  const applyPreset = (presetType: 'files' | 'links', value: number) => {
    if (totalItems <= 0) return;
    setDownloadCompleted(false);
    if (presetType === 'files') {
      const safeFiles = Math.max(1, Math.min(totalItems, value));
      setFilesInput(String(safeFiles));
      setLinksInput(String(Math.max(1, Math.ceil(totalItems / safeFiles))));
    } else {
      const safeLinks = Math.max(1, value);
      setLinksInput(String(safeLinks));
      setFilesInput(String(Math.max(1, Math.ceil(totalItems / safeLinks))));
    }
  };

  const parsedLinksPerFile = Math.max(1, parseInt(linksInput, 10) || 1);

  // Total extracted dataset analytics
  const { totalDatasetChars, totalDatasetWords, totalDatasetSizeFormatted } = useMemo(() => {
    let chars = 0;
    let words = 0;
    for (const it of rawItems) {
      if (typeof it === 'string') {
        chars += it.length;
        words += 1;
      } else {
        const text = it.content || '';
        chars += text.length + (it.url?.length || 0);
        words += text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
      }
    }
    const formatted = chars > 1024 * 1024
      ? `${(chars / (1024 * 1024)).toFixed(2)} MB`
      : `${(chars / 1024).toFixed(1)} KB`;
    return {
      totalDatasetChars: chars,
      totalDatasetWords: words,
      totalDatasetSizeFormatted: formatted
    };
  }, [rawItems]);

  // Compute calculated parts and their exact per-page text measurements
  const partsPreview: PartInfo[] = useMemo(() => {
    if (totalItems <= 0) return [];
    const parts: PartInfo[] = [];
    const calculatedTotalParts = Math.ceil(totalItems / parsedLinksPerFile);

    for (let i = 0; i < calculatedTotalParts; i++) {
      const start = i * parsedLinksPerFile;
      if (start >= totalItems) break;
      const end = Math.min(start + parsedLinksPerFile, totalItems);
      const chunk = rawItems.slice(start, end);

      let charCount = 0;
      let wordCount = 0;
      for (const item of chunk) {
        if (typeof item === 'string') {
          charCount += item.length;
          wordCount += 1;
        } else {
          const content = item.content || '';
          charCount += content.length + (item.url?.length || 0);
          wordCount += content ? content.trim().split(/\s+/).filter(Boolean).length : 0;
        }
      }

      const sizeFormatted = charCount > 1024 * 1024
        ? `${(charCount / (1024 * 1024)).toFixed(2)} MB`
        : `${(charCount / 1024).toFixed(1)} KB`;

      const firstItem = chunk[0];
      const lastItem = chunk[chunk.length - 1];
      const firstUrl = typeof firstItem === 'string' ? firstItem : firstItem?.url || '';
      const lastUrl = typeof lastItem === 'string' ? lastItem : lastItem?.url || '';

      parts.push({
        partNum: i + 1,
        startIndex: start,
        endIndex: end,
        count: end - start,
        charCount,
        wordCount,
        sizeFormatted,
        firstUrl,
        lastUrl
      });
    }
    return parts;
  }, [totalItems, parsedLinksPerFile, rawItems]);

  // Helper to serialize chunk without ANY truncation
  const serializeChunk = (chunk: Array<SplitDatasetItem | string>, startIndex: number): { content: string; mimeType: string; ext: string } => {
    let content = '';
    let mimeType = 'text/plain;charset=utf-8';
    let ext = format;

    if (format === 'txt') {
      content = chunk.map((item, idx) => {
        if (typeof item === 'string') {
          return item;
        }
        const itemUrl = item.url || '';
        // 100% UNTRUNCATED TEXT
        const itemContent = item.content || '';
        const itemCat = item.category ? ` [Category: ${item.category}]` : '';
        return `[#${startIndex + idx + 1}] ${itemUrl}${itemCat}\n${itemContent}\n========================================\n`;
      }).join('\n');
      mimeType = 'text/plain;charset=utf-8';
      ext = 'txt';
    } else if (format === 'md') {
      const header = `# Extracted Content Export (Part Range: #${startIndex + 1} - #${startIndex + chunk.length})\n\n`;
      const sections = chunk.map((item, idx) => {
        if (typeof item === 'string') {
          return `### ${startIndex + idx + 1}. [${item}](${item})\n`;
        }
        const itemUrl = item.url || '';
        const itemContent = item.content || '';
        const itemCat = item.category ? ` \`${item.category}\`` : '';
        return `## ${startIndex + idx + 1}. ${itemUrl}${itemCat}\n\n${itemContent}\n\n---\n`;
      }).join('\n');
      content = header + sections;
      mimeType = 'text/markdown;charset=utf-8';
      ext = 'md';
    } else if (format === 'csv') {
      const header = 'Index,URL,Category,Content\n';
      const rows = chunk.map((item, idx) => {
        const u = typeof item === 'string' ? item : item.url || '';
        const cat = typeof item === 'string' ? 'General' : item.category || 'General';
        // Fully escape quotes without cutting length
        const cont = typeof item === 'string' ? '' : (item.content || '').replace(/"/g, '""');
        return `"${startIndex + idx + 1}","${u}","${cat}","${cont}"`;
      }).join('\n');
      content = header + rows;
      mimeType = 'text/csv;charset=utf-8';
      ext = 'csv';
    } else if (format === 'json') {
      const formatted = chunk.map((item, idx) => {
        if (typeof item === 'string') {
          return { index: startIndex + idx + 1, url: item };
        }
        return {
          index: startIndex + idx + 1,
          url: item.url,
          category: item.category || 'General',
          content: item.content || ''
        };
      });
      content = JSON.stringify(formatted, null, 2);
      mimeType = 'application/json;charset=utf-8';
      ext = 'json';
    }

    return { content, mimeType, ext };
  };

  // Download a single specific part
  const handleDownloadSinglePart = (part: PartInfo) => {
    setSingleDownloadingPart(part.partNum);
    try {
      const safeDatasetName = (currentDataset.label || 'bulk_data')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_');

      const chunk = rawItems.slice(part.startIndex, part.endIndex);
      const { content, mimeType, ext } = serializeChunk(chunk, part.startIndex);

      const blob = new Blob([content], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${safeDatasetName}_part_${part.partNum}_of_${partsPreview.length}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Failed to download single part:', err);
    } finally {
      setTimeout(() => setSingleDownloadingPart(null), 800);
    }
  };

  // Execute multi-part split download for all parts
  const handleDownloadAll = async () => {
    if (totalItems === 0 || isDownloading || partsPreview.length === 0) return;
    setIsDownloading(true);
    setDownloadCompleted(false);

    try {
      const safeDatasetName = (currentDataset.label || 'bulk_data')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_');

      for (let i = 0; i < partsPreview.length; i++) {
        const part = partsPreview[i];
        setDownloadProgress({
          current: i + 1,
          total: partsPreview.length,
          percent: Math.round(((i + 1) / partsPreview.length) * 100)
        });

        const chunk = rawItems.slice(part.startIndex, part.endIndex);
        if (chunk.length === 0) continue;

        const { content, mimeType, ext } = serializeChunk(chunk, part.startIndex);

        const blob = new Blob([content], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${safeDatasetName}_part_${part.partNum}_of_${partsPreview.length}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);

        // 250ms spacing between file downloads to ensure smooth browser download manager queuing
        if (i < partsPreview.length - 1) {
          await new Promise(r => setTimeout(r, 250));
        }
      }

      setDownloadCompleted(true);
    } catch (err) {
      console.error('Error during split download:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-3xl bg-white dark:bg-[#1C201D] border border-[#DCE2DC] dark:border-[#3A443D] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#DCE2DC] dark:border-[#3A443D] flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#287653]/10 text-[#287653] dark:text-[#75B992] flex items-center justify-center shrink-0">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <span>{title}</span>
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                বড় URL ও এক্সট্রাক্ট করা টেক্সট ছোট ছোট ফাইল বা পার্টে ভাগ করে ১০০% সম্পূর্ণ কন্টেন্ট ডাউনলোড করুন
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4.5 custom-scrollbar text-xs">
          
          {/* Dataset Selector (if multiple available) */}
          {datasets.length > 1 && (
            <div className="space-y-1.5">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                ১. এক্সপোর্ট সোর্স / ডেটাসেট নির্বাচন করুন:
              </label>
              <div className="flex flex-wrap gap-2">
                {datasets.map((d, idx) => (
                  <button
                    key={d.name + idx}
                    type="button"
                    onClick={() => {
                      setSelectedDatasetIndex(idx);
                      setSelectedPartIndex(null);
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-xl font-medium border text-xs transition-all flex items-center gap-1.5",
                      selectedDatasetIndex === idx
                        ? "bg-[#287653] text-white border-[#287653] shadow-xs font-semibold"
                        : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100"
                    )}
                  >
                    <span>{d.label}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10">
                      {d.items.length.toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Extracted Content & Text Volume Summary Bar */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2 bg-white dark:bg-zinc-800/80 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block font-medium">মোট লিঙ্ক (URLs)</span>
              <strong className="text-sm font-mono font-bold text-zinc-900 dark:text-zinc-100">
                {totalItems.toLocaleString()}
              </strong>
            </div>

            <div className="p-2 bg-white dark:bg-zinc-800/80 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block font-medium">মোট টেক্সট ভলিউম</span>
              <strong className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {totalDatasetSizeFormatted}
              </strong>
            </div>

            <div className="p-2 bg-white dark:bg-zinc-800/80 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block font-medium">মোট শব্দ (Words)</span>
              <strong className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400">
                ~{totalDatasetWords.toLocaleString()}
              </strong>
            </div>

            <div className="p-2 bg-white dark:bg-zinc-800/80 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block font-medium">স্প্লিট ফাইল প্রস্তুত</span>
              <strong className="text-sm font-mono font-bold text-[#287653] dark:text-[#75B992]">
                {partsPreview.length}টি ফাইল
              </strong>
            </div>
          </div>

          {/* Two-way Linked Splitter Inputs */}
          <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 rounded-2xl space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                <Files className="w-4 h-4 text-[#287653]" />
                <span>২. লিঙ্ক ও ফাইল সংখ্যা নির্ধারণ (যেকোনো একটি পরিবর্তন করুন — একে অপরকে সঠিক হিসাব দেখাবে):</span>
              </span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono font-semibold px-2 py-0.5 rounded-md bg-emerald-100/80 dark:bg-emerald-900/50">
                Mutual Live Sync
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Input 1: Links per File */}
              <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-emerald-200/60 dark:border-zinc-800 space-y-1.5 shadow-2xs">
                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  প্রতি ফাইলে লিঙ্ক সংখ্যা (Links Per File)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="1"
                    max={Math.max(1, totalItems)}
                    value={linksInput}
                    onChange={(e) => handleLinksChange(e.target.value)}
                    disabled={isDownloading || totalItems === 0}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#287653]"
                    placeholder="e.g. 500"
                  />
                  <span className="absolute right-3 text-[11px] text-zinc-400 font-medium pointer-events-none">
                    URLs
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500">
                  যেমন: ১০০০ লিঙ্কে ৫০০ লিখলে ফাইল সংখ্যা স্বয়ংক্রিয়ভাবে ২ হবে।
                </p>
              </div>

              {/* Input 2: Total Files */}
              <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-emerald-200/60 dark:border-zinc-800 space-y-1.5 shadow-2xs">
                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  মোট ফাইল সংখ্যা (Total Split Files)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="1"
                    max={Math.max(1, totalItems)}
                    value={filesInput}
                    onChange={(e) => handleFilesChange(e.target.value)}
                    disabled={isDownloading || totalItems === 0}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#287653]"
                    placeholder="e.g. 2"
                  />
                  <span className="absolute right-3 text-[11px] text-zinc-400 font-medium pointer-events-none">
                    ফাইল
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500">
                  যেমন: ১০০০ লিঙ্কে ৪ লিখলে প্রতি ফাইলে স্বয়ংক্রিয়ভাবে ২৫০টি করে লিঙ্ক যাবে।
                </p>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="pt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-zinc-500 font-medium mr-1">কুইক প্রিসেট:</span>
              <button
                type="button"
                onClick={() => applyPreset('files', 1)}
                className="px-2 py-0.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-[10px] font-semibold active:scale-95 transition-all"
              >
                ১ ফাইল (No Split)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('files', 2)}
                className="px-2 py-0.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-[10px] font-semibold active:scale-95 transition-all"
              >
                ২ ফাইল (~৫০%)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('files', 4)}
                className="px-2 py-0.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-[10px] font-semibold active:scale-95 transition-all"
              >
                ৪ ফাইল (~২৫%)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('links', 250)}
                className="px-2 py-0.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-[10px] font-semibold active:scale-95 transition-all"
              >
                ২৫০/ফাইল
              </button>
              <button
                type="button"
                onClick={() => applyPreset('links', 500)}
                className="px-2 py-0.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-[10px] font-semibold active:scale-95 transition-all"
              >
                ৫০০/ফাইল
              </button>
              <button
                type="button"
                onClick={() => applyPreset('links', 1000)}
                className="px-2 py-0.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-[10px] font-semibold active:scale-95 transition-all"
              >
                ১০০০/ফাইল
              </button>
              {totalItems > 5000 && (
                <button
                  type="button"
                  onClick={() => applyPreset('links', 5000)}
                  className="px-2 py-0.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-[10px] font-semibold active:scale-95 transition-all"
                >
                  ৫০০০/ফাইল
                </button>
              )}
            </div>
          </div>

          {/* Zero Truncation Assurance Banner */}
          <div className="p-2.5 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-300/80 dark:border-emerald-800/60 rounded-xl flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[11px] font-medium leading-tight">
              <strong>১০০% সম্পূর্ণ টেক্সট অক্ষুণ্ণ থাকবে:</strong> প্রতিটি লিঙ্কের ফুল পেইজের কন্টেন্ট স্প্লিট ফাইলে সংরক্ষিত হবে, কোনো টেক্সট বা কোড কাটা বা ট্রাঙ্কেট হবে না।
            </span>
          </div>

          {/* Export Format Selector */}
          <div className="space-y-1.5">
            <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">
              ৩. ফাইল ফরম্যাট নির্বাচন করুন:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setFormat('txt')}
                className={cn(
                  "p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all",
                  format === 'txt'
                    ? "border-[#287653] bg-[#287653]/10 text-[#287653] dark:text-[#75B992] font-bold"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50"
                )}
              >
                <FileText className="w-4 h-4" />
                <span>Text (.txt)</span>
                <span className="text-[10px] text-zinc-400 font-normal">URL + Dividers</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('md')}
                className={cn(
                  "p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all",
                  format === 'md'
                    ? "border-[#287653] bg-[#287653]/10 text-[#287653] dark:text-[#75B992] font-bold"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50"
                )}
              >
                <AlignLeft className="w-4 h-4" />
                <span>Markdown (.md)</span>
                <span className="text-[10px] text-zinc-400 font-normal">Formatted Docs</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={cn(
                  "p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all",
                  format === 'csv'
                    ? "border-[#287653] bg-[#287653]/10 text-[#287653] dark:text-[#75B992] font-bold"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50"
                )}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Spreadsheet (.csv)</span>
                <span className="text-[10px] text-zinc-400 font-normal">Excel / Sheets</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('json')}
                className={cn(
                  "p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all",
                  format === 'json'
                    ? "border-[#287653] bg-[#287653]/10 text-[#287653] dark:text-[#75B992] font-bold"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50"
                )}
              >
                <Layers className="w-4 h-4" />
                <span>JSON (.json)</span>
                <span className="text-[10px] text-zinc-400 font-normal">Structured Data</span>
              </button>
            </div>
          </div>

          {/* Live Split Parts & Exact Calculated Text Measurement List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Hash className="w-4 h-4 text-[#287653]" />
                <span>৪. প্রতিটি ফাইলের সঠিক টেক্সট ও লিঙ্ক পরিমাপ (Per-File Text Metrics):</span>
              </span>
              <span className="text-[11px] font-mono font-medium text-zinc-500">
                {partsPreview.length} Files × ~{parsedLinksPerFile} URLs
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/40 custom-scrollbar">
              {partsPreview.map((part) => {
                const isSelected = selectedPartIndex === part.partNum;
                const isPartDownloading = singleDownloadingPart === part.partNum;

                return (
                  <div 
                    key={part.partNum} 
                    className={cn(
                      "p-3 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5",
                      isSelected ? "bg-emerald-50/60 dark:bg-emerald-950/30" : "hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
                    )}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200/80 dark:border-zinc-700">
                          ফাইল / পার্ট {part.partNum} of {partsPreview.length}
                        </span>
                        <span className="text-zinc-600 dark:text-zinc-400 font-mono text-[11px]">
                          লিঙ্ক #{part.startIndex + 1} – #{part.endIndex} ({part.count.toLocaleString()}টি লিঙ্ক)
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                        <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                          মোট টেক্সট: {part.sizeFormatted} ({part.charCount.toLocaleString()} অক্ষর)
                        </span>
                        <span>•</span>
                        <span>~{part.wordCount.toLocaleString()} শব্দ</span>
                      </div>

                      {/* Truncated sample of first and last URL */}
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-md">
                        সোর্স: {part.firstUrl ? part.firstUrl.replace(/^https?:\/\//, '') : '...'}
                        {part.count > 1 && ` ➔ ${part.lastUrl ? part.lastUrl.replace(/^https?:\/\//, '') : '...'}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleDownloadSinglePart(part)}
                        disabled={isDownloading || isPartDownloading}
                        className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-1 active:scale-95 transition-all"
                        title="শুধু এই একটি পার্ট ডাউনলোড করুন"
                      >
                        {isPartDownloading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5 text-[#287653]" />
                        )}
                        <span>শুধু পার্ট {part.partNum} ডাউনলোড</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Download Progress Bar */}
          {isDownloading && downloadProgress && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>ডাউনলোড হচ্ছে: পার্ট {downloadProgress.current} of {downloadProgress.total}...</span>
                </span>
                <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                  {downloadProgress.percent}%
                </span>
              </div>
              <div className="w-full bg-blue-200/60 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Success Message */}
          {downloadCompleted && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-medium text-xs">
                সকল {partsPreview.length}টি স্প্লিট ফাইল সফলভাবে আপনার ডিভাইসে ডাউনলোড হয়েছে! কোনো টেক্সট কাটা যায়নি।
              </span>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-[#DCE2DC] dark:border-[#3A443D] bg-zinc-50/70 dark:bg-zinc-900/50 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-100 transition-colors"
          >
            বাতিল / বন্ধ করুন
          </button>

          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={isDownloading || totalItems === 0}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#287653] hover:bg-[#216345] text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-98 disabled:opacity-50"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>ডাউনলোড চলছে ({downloadProgress?.current || 1}/{partsPreview.length})...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>সকল {partsPreview.length}টি ফাইল ডাউনলোড করুন ({format.toUpperCase()})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
