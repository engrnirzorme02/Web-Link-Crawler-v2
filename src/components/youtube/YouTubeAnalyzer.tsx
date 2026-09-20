import React, { useState } from 'react';
import { Search, Loader2, ListVideo, Video, PlaySquare, Copy, DownloadCloud, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';

interface YTVideo {
  id: string;
  title: string;
  url: string;
}

interface YTPlaylist {
  title: string;
  url: string;
  videoCount: number;
}

interface AnalyzeResult {
  type: 'channel' | 'playlist' | 'video';
  name: string;
  url: string;
  videos: YTVideo[];
  playlists?: YTPlaylist[];
}

export default function YouTubeAnalyzer() {
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [activeView, setActiveView] = useState<'videos' | 'playlists'>('videos');
  const [error, setError] = useState('');
  const [extractedPlaylists, setExtractedPlaylists] = useState<Record<string, YTVideo[]>>({});
  const [isExtractingAll, setIsExtractingAll] = useState(false);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsAnalyzing(true);
    setError('');
    setResult(null);
    setExtractedPlaylists({});
    
    try {
      const res = await fetch('/api/yt/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to analyze');
      setResult(data);
      if (data.type === 'channel') {
        setActiveView('playlists'); // Default to playlists view for channel
      } else {
        setActiveView('videos');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const extractPlaylistVideos = async (playlistUrl: string, title: string) => {
    try {
      const res = await fetch('/api/yt/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: playlistUrl })
      });
      const data = await res.json();
      if (data.videos) {
        setExtractedPlaylists(prev => ({ ...prev, [title]: data.videos }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const extractAllPlaylists = async () => {
    if (!result?.playlists) return;
    setIsExtractingAll(true);
    const newExtracted: Record<string, YTVideo[]> = {};
    for (const pl of result.playlists) {
      try {
        const res = await fetch('/api/yt/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: pl.url })
        });
        const data = await res.json();
        if (data.videos) {
          newExtracted[pl.title] = data.videos;
        }
      } catch (err) {
        console.error(err);
      }
    }
    setExtractedPlaylists(prev => ({ ...prev, ...newExtracted }));
    setIsExtractingAll(false);
  };

  const copyPlaylistLinks = () => {
    if (!result?.playlists) return;
    const text = result.playlists.map(p => p.url).join('\n');
    navigator.clipboard.writeText(text);
    alert('Playlist links copied');
  };

  const downloadPlaylistLinks = () => {
    if (!result?.playlists) return;
    const text = result.playlists.map(p => p.url).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'playlist_links.txt';
    a.click();
  };

  const downloadExtractedVideosText = () => {
    let text = '';
    Object.entries(extractedPlaylists).forEach(([title, videos]) => {
      text += `## ${title}\n`;
      videos.forEach(v => text += `${v.url}\n`);
      text += `\n`;
    });
    const blob = new Blob([text], { type: 'text/plain' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'extracted_videos.txt';
    a.click();
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 rounded-[24px] lg:rounded-[32px] md:shadow-xl md:border border-zinc-200 dark:border-zinc-800 p-4 md:p-6 overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        
        {/* Input Section */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <form onSubmit={handleAnalyze} className="flex flex-col md:flex-row gap-3">
            <input 
              type="text" 
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Enter YouTube Channel or Playlist URL..."
              className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button 
              type="submit"
              disabled={isAnalyzing || !url.trim()}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              Analyze
            </button>
          </form>
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
        </div>

        {/* Results Section */}
        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="p-2.5 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-lg">
                {result.type === 'channel' ? <PlaySquare className="w-6 h-6" /> : <ListVideo className="w-6 h-6" />}
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{result.name}</h2>
                <p className="text-sm text-zinc-500">{result.type.charAt(0).toUpperCase() + result.type.slice(1)} Target</p>
              </div>
            </div>

            {/* Scope Buttons for Channel */}
            {result.type === 'channel' && (
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => setActiveView('videos')}
                  className={cn("px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border", activeView === 'videos' ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800")}
                >
                  <Video className="w-4 h-4" /> Full Research (Videos)
                </button>
                <button 
                  onClick={() => setActiveView('playlists')}
                  className={cn("px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border", activeView === 'playlists' ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800")}
                >
                  <ListVideo className="w-4 h-4" /> Playlists
                </button>
              </div>
            )}

            {/* Content Display */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
              {activeView === 'playlists' && result.playlists ? (
                <div>
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <span className="font-semibold text-sm text-zinc-700 dark:text-zinc-300">Found {result.playlists.length} Playlists</span>
                    <div className="flex gap-2">
                      <button onClick={copyPlaylistLinks} className="text-xs font-medium text-zinc-600 hover:text-red-600 flex items-center gap-1 bg-white dark:bg-zinc-900 px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700">
                        <Copy className="w-3.5 h-3.5" /> Copy Links
                      </button>
                      <button onClick={downloadPlaylistLinks} className="text-xs font-medium text-zinc-600 hover:text-red-600 flex items-center gap-1 bg-white dark:bg-zinc-900 px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700">
                        <DownloadCloud className="w-3.5 h-3.5" /> Download
                      </button>
                      <button 
                        onClick={extractAllPlaylists} 
                        disabled={isExtractingAll}
                        className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-1 px-2.5 py-1.5 rounded-md shadow-sm"
                      >
                        {isExtractingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                        Extract All Videos
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[400px] overflow-y-auto">
                    {result.playlists.map((pl, i) => (
                      <div key={i} className="p-4 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{pl.title}</h4>
                          <a href={pl.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline block truncate mt-1">{pl.url}</a>
                          <span className="text-xs text-zinc-500 mt-1 inline-block bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">{pl.videoCount} videos</span>
                        </div>
                        <button 
                          onClick={() => extractPlaylistVideos(pl.url, pl.title)}
                          className="shrink-0 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg text-xs font-medium transition-colors"
                        >
                          Extract
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto p-4 space-y-2">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-medium text-sm text-zinc-700 dark:text-zinc-300">Extracted {result.videos.length} Videos</span>
                    <button 
                      onClick={() => {
                        const text = result.videos.map(v => v.url).join('\n');
                        navigator.clipboard.writeText(text);
                        alert('Copied video links!');
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Copy All Links
                    </button>
                  </div>
                  {result.videos.map((v, i) => (
                    <div key={i} className="text-xs text-zinc-600 dark:text-zinc-400 truncate bg-zinc-50 dark:bg-zinc-950 p-2 rounded">
                      <a href={v.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{v.url}</a>
                      <span className="ml-2 text-zinc-500">- {v.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Extracted Playlists Section */}
            {Object.keys(extractedPlaylists).length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden mt-6">
                 <div className="bg-zinc-50 dark:bg-zinc-950 p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <h3 className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-red-500" />
                      Extracted Videos Collection
                    </h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          let text = '';
                          Object.entries(extractedPlaylists).forEach(([t, v]) => {
                            text += `## ${t}\n` + v.map(vi => vi.url).join('\n') + '\n\n';
                          });
                          navigator.clipboard.writeText(text);
                          alert('Copied formatted lists!');
                        }}
                        className="text-xs font-medium text-zinc-600 hover:text-red-600 flex items-center gap-1 bg-white dark:bg-zinc-900 px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy Format
                      </button>
                      <button 
                        onClick={downloadExtractedVideosText}
                        className="text-xs font-medium text-zinc-600 hover:text-red-600 flex items-center gap-1 bg-white dark:bg-zinc-900 px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700"
                      >
                        <DownloadCloud className="w-3.5 h-3.5" /> Download
                      </button>
                    </div>
                 </div>
                 <div className="p-4 max-h-[500px] overflow-y-auto space-y-6">
                    {Object.entries(extractedPlaylists).map(([title, videos], i) => (
                      <div key={i}>
                        <h4 className="font-bold text-zinc-800 dark:text-zinc-200 mb-2 border-b border-zinc-100 dark:border-zinc-800 pb-1">## {title}</h4>
                        <div className="space-y-1.5">
                          {videos.map((v, j) => (
                            <div key={j} className="text-xs truncate">
                               <a href={v.url} className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noreferrer">{v.url}</a>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                 </div>
              </div>
            )}
            
          </div>
        )}
      </div>
    </div>
  );
}
