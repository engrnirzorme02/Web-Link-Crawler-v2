import React, { useState, useEffect } from 'react';
import { X, Download, Info, Database, CheckCircle2, ShieldCheck } from 'lucide-react';
import { cn, getMillis } from '../lib/utils';
import { Session } from '../lib/firebase';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions?: Session[];
}

export function InfoModal({ isOpen, onClose, sessions = [] }: InfoModalProps) {
  if (!isOpen) return null;

  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(() => {
    return localStorage.getItem('nexus_auto_backup_enabled') !== 'false';
  });

  const toggleAutoBackup = () => {
    const next = !autoBackupEnabled;
    setAutoBackupEnabled(next);
    localStorage.setItem('nexus_auto_backup_enabled', String(next));
  };

  // Perform automated daily snapshot to localStorage if enabled
  useEffect(() => {
    if (!autoBackupEnabled || sessions.length === 0) return;
    try {
      const lastBackupDate = localStorage.getItem('nexus_last_daily_backup');
      const today = new Date().toISOString().split('T')[0];
      if (lastBackupDate !== today) {
        const miniBackup = {
          date: new Date().toISOString(),
          total: sessions.length,
          sessions: sessions.slice(0, 200).map(s => ({
            id: s.id,
            title: s.title,
            type: s.type,
            resultsCount: s.results?.length || 0,
            createdAt: s.createdAt ? new Date(getMillis(s.createdAt)).toISOString() : null
          }))
        };
        localStorage.setItem('nexus_daily_backup_snapshot', JSON.stringify(miniBackup));
        localStorage.setItem('nexus_last_daily_backup', today);
      }
    } catch (e) {
      console.warn("Auto-backup storage error:", e);
    }
  }, [sessions, autoBackupEnabled]);

  const handleBackupAllJSON = () => {
    if (sessions.length === 0) {
      alert('No sessions available to backup.');
      return;
    }

    const backupData = {
      app: "Nirzor Web Tools & Crawler",
      version: "2.0",
      backupDate: new Date().toISOString(),
      totalSessions: sessions.length,
      sessions: sessions.map(s => ({
        id: s.id,
        title: s.title || 'Untitled Session',
        type: s.type,
        url: s.url || '',
        settings: s.settings || {},
        tags: s.tags || [],
        isPinned: !!s.isPinned,
        isArchived: !!s.isArchived,
        results: s.results || [],
        logs: s.logs || [],
        createdAt: s.createdAt ? new Date(getMillis(s.createdAt)).toISOString() : new Date().toISOString(),
        updatedAt: s.updatedAt ? new Date(getMillis(s.updatedAt)).toISOString() : new Date().toISOString(),
      }))
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `webtools-full-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    setBackupDownloaded(true);
    setTimeout(() => setBackupDownloaded(false), 3000);
  };

  const blueprintText = `# Developer Blueprint

## Architecture
The application is built using React, Vite, and Tailwind CSS.
State management is handled primarily via React Hooks and Firebase Firestore.

## Features
- Web Crawler & Live Link Extraction
- Smart Crawler with Gemini AI Filtering
- Data Extractor & Sanitize Paragraphs
- URL Processor & Slug Generator
- Bulk Fetcher & File Merger
- YouTube Content Analyzer & Search

## Data Integrity
- Pure URL sanitization (no Markdown brackets or broken prefixes)
- Full JSON session backup and instant recovery
`;

  const handleDownloadBlueprint = () => {
    const blob = new Blob([blueprintText], { type: 'text/markdown' });
    const urlObj = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = urlObj;
    a.download = `developer-blueprint.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(urlObj);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-lg border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-500" />
            Application Settings & Info
          </h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-4 text-zinc-700 dark:text-zinc-300 overflow-y-auto custom-scrollbar">
          {/* Backup All Section */}
          <div className="bg-blue-50/60 dark:bg-blue-950/30 p-4 rounded-xl border border-blue-200 dark:border-blue-900/50">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-1.5 text-sm">
                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Full Data Backup
              </h3>
              <span className="text-xs bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                {sessions.length} Sessions
              </span>
            </div>
            <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mb-3">
              Export all sessions, crawler results, logs, and settings into a single JSON file for offline backup and restoration.
            </p>
            
            <button
              onClick={handleBackupAllJSON}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-all shadow-sm text-sm"
            >
              {backupDownloaded ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Download className="w-4 h-4" />}
              {backupDownloaded ? 'Backup Downloaded!' : 'Backup All (JSON)'}
            </button>

            {/* Daily Auto-Backup Toggle */}
            <div className="mt-3 pt-3 border-t border-blue-200/60 dark:border-blue-800/40 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-blue-800 dark:text-blue-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Daily local snapshot auto-save</span>
              </div>
              <button
                onClick={toggleAutoBackup}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-semibold transition-colors",
                  autoBackupEnabled 
                    ? "bg-emerald-600 text-white" 
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                )}
              >
                {autoBackupEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <p className="text-sm leading-relaxed">
            Welcome to the Web Tools Suite. This platform offers high-speed URL extraction, deep crawling, and real-time data sanitation.
          </p>

          <div className="bg-zinc-100 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-1 text-sm">Developer Resources</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              Get access to the architectural blueprint and guidelines to understand how this suite is structured.
            </p>
            <button
              onClick={handleDownloadBlueprint}
              className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-medium py-2 rounded-lg transition-all shadow-sm text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Download Developer Blueprint (.md)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
