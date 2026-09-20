import React, { useState } from 'react';
import { Search, Loader2, Filter, Copy, Download, CheckSquare, Square, DownloadCloud } from 'lucide-react';
import { cn } from '../../lib/utils';

interface YTVideo {
  id: string;
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  channel: string;
  views: number;
}

export default function YouTubeSearch() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<YTVideo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportedVideos, setExportedVideos] = useState<YTVideo[]>([]);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError('');
    
    try {
      const res = await fetch(`/api/yt/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === results.length) {
      setSelectedIds(newSet => new Set());
    } else {
      setSelectedIds(new Set(results.map(r => r.id)));
    }
  };

  const handleExport = () => {
    const selected = results.filter(r => selectedIds.has(r.id));
    setExportedVideos(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const newVids = selected.filter(s => !existingIds.has(s.id));
      return [...prev, ...newVids];
    });
    setSelectedIds(new Set()); // Clear selection after export
  };

  const copyExportedLinks = () => {
    const text = exportedVideos.map(v => v.url).join('\n');
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard');
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 rounded-[24px] lg:rounded-[32px] md:shadow-xl md:border border-zinc-200 dark:border-zinc-800 md:overflow-hidden relative">
      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        {/* Left column: Search & Results */}
        <div className="flex-1 flex flex-col border-r border-zinc-200 dark:border-zinc-800 min-w-0">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input 
                  type="text" 
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search YouTube..."
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <button 
                type="submit"
                disabled={isSearching || !query.trim()}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors flex items-center gap-2"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span className="hidden sm:inline">Search</span>
              </button>
            </form>
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {results.length > 0 && (
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{results.length} Results</span>
                <div className="flex items-center gap-2">
                  <button onClick={selectAll} className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 px-2 py-1">
                    {selectedIds.size === results.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button 
                    onClick={handleExport}
                    disabled={selectedIds.size === 0}
                    className="flex items-center gap-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                  >
                    <DownloadCloud className="w-3.5 h-3.5" />
                    Export Selected ({selectedIds.size})
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-3">
              {results.map((video) => (
                <div 
                  key={video.id} 
                  onClick={() => toggleSelect(video.id)}
                  className={cn(
                    "flex gap-3 p-2 rounded-xl border transition-colors cursor-pointer",
                    selectedIds.has(video.id) 
                      ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800" 
                      : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-red-300 dark:hover:border-red-700/50"
                  )}
                >
                  <div className="flex items-center justify-center pl-2">
                    {selectedIds.has(video.id) ? (
                      <CheckSquare className="w-5 h-5 text-red-600" />
                    ) : (
                      <Square className="w-5 h-5 text-zinc-300 dark:text-zinc-600" />
                    )}
                  </div>
                  <img src={video.thumbnail} alt="" className="w-32 h-20 object-cover rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                  <div className="flex-1 min-w-0 py-1">
                    <h4 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-tight">{video.title}</h4>
                    <p className="text-xs text-zinc-500 mt-1 truncate">{video.channel}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-400">
                        {video.duration}
                      </span>
                      {video.views > 0 && (
                        <span className="text-[10px] text-zinc-500">
                          {new Intl.NumberFormat('en-US', { notation: 'compact' }).format(video.views)} views
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {results.length === 0 && !isSearching && !error && (
                 <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 py-12">
                   <Search className="w-12 h-12 mb-3 opacity-20" />
                   <p>Search to find videos</p>
                 </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Exported List */}
        <div className="w-full md:w-1/3 flex flex-col bg-white dark:bg-zinc-950 border-t md:border-t-0 border-zinc-200 dark:border-zinc-800">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">Exported Links ({exportedVideos.length})</h3>
            <div className="flex items-center gap-1">
              <button 
                onClick={copyExportedLinks}
                disabled={exportedVideos.length === 0}
                className="p-1.5 text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded disabled:opacity-50 transition-colors"
                title="Copy All"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {exportedVideos.length === 0 ? (
              <div className="text-center text-sm text-zinc-400 dark:text-zinc-500 mt-10">
                Select and export videos to build your list.
              </div>
            ) : (
              <div className="space-y-2">
                {exportedVideos.map((v, i) => (
                  <div key={i} className="text-xs bg-zinc-50 dark:bg-zinc-900 p-2 rounded border border-zinc-200 dark:border-zinc-800 truncate">
                    <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                      {v.url}
                    </a>
                    <div className="text-zinc-500 mt-0.5 truncate">{v.title}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
