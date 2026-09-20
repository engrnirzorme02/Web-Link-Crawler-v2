import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Download, X, Clock, FileText } from 'lucide-react';

interface BlueprintHistoryModalProps {
  onClose: () => void;
}

interface HistoryEntry {
  id: string;
  version: string;
  uiBlueprint: string;
  devBlueprint: string;
  createdAt: Date | null;
}

export function BlueprintHistoryModal({ onClose }: BlueprintHistoryModalProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const historyRef = collection(db, 'blueprint_history');
        const q = query(historyRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        
        const entries = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || null
        })) as HistoryEntry[];
        
        setHistory(entries);
      } catch (err) {
        console.error("Failed to fetch blueprint history:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const downloadBlob = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-950 p-6 rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl border border-zinc-200 dark:border-zinc-800 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Update History</h3>
            <p className="text-sm text-zinc-500">Blueprint Checkpoints</p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 pr-2 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-zinc-500">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">No history found.</div>
          ) : (
            history.map((entry) => (
              <div key={entry.id} className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-zinc-900 dark:text-white">Version {entry.version}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {entry.createdAt ? entry.createdAt.toLocaleString() : 'Unknown date'}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> Checkpoint
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => downloadBlob(entry.uiBlueprint, `ui-blueprint-${entry.version}.md`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" /> UI
                  </button>
                  <button 
                    onClick={() => downloadBlob(entry.devBlueprint, `dev-blueprint-${entry.version}.md`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-400 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" /> Dev
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
