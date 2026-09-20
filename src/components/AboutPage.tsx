import React, { useState, useEffect } from 'react';
import { Download, Lock, AlertCircle, CheckCircle2, ArrowLeft, History, Boxes, Layout } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { UI_BLUEPRINT, DEV_BLUEPRINT, BLUEPRINT_VERSION } from '../config/blueprints';
import { BlueprintHistoryModal } from './BlueprintHistoryModal';
import { BlueprintDashboardModal } from './BlueprintDashboardModal';

interface AboutPageProps {
  onBack?: () => void;
}

export function AboutPage({ onBack }: AboutPageProps) {
  const [selectedBlueprint, setSelectedBlueprint] = useState<'ui' | 'dev' | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  useEffect(() => {
    const syncBlueprintVersion = async () => {
      try {
        const historyRef = collection(db, 'blueprint_history');
        const q = query(historyRef, orderBy('createdAt', 'desc'), limit(1));
        const snapshot = await getDocs(q);
        
        let latestVersion = "0.0.0";
        if (!snapshot.empty) {
          latestVersion = snapshot.docs[0].data().version;
        }

        // Simple check to see if we need to push a new version
        if (BLUEPRINT_VERSION !== latestVersion) {
          await addDoc(historyRef, {
            version: BLUEPRINT_VERSION,
            uiBlueprint: UI_BLUEPRINT,
            devBlueprint: DEV_BLUEPRINT,
            createdAt: serverTimestamp()
          });
          console.log(`Blueprint updated to version ${BLUEPRINT_VERSION} in Firestore`);
        }
      } catch (err) {
        console.error("Failed to sync blueprint version to Firestore:", err);
      }
    };

    syncBlueprintVersion();
  }, []);

  const closeModal = () => {
    setSelectedBlueprint(null);
    setPassword('');
    setError('');
    setLoading(false);
    setSuccess(false);
  };

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

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== '10076') {
      setError('Invalid Password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Generate blob dynamically instead of fetching from Firebase Storage
      const content = selectedBlueprint === 'ui' ? UI_BLUEPRINT : DEV_BLUEPRINT;
      const filename = selectedBlueprint === 'ui' ? `ui-blueprint-${BLUEPRINT_VERSION}.md` : `dev-blueprint-${BLUEPRINT_VERSION}.md`;
      
      // Log to Firestore (fire-and-forget to prevent blocking)
      addDoc(collection(db, 'blueprint_access_logs'), {
        blueprint: selectedBlueprint,
        version: BLUEPRINT_VERSION,
        accessedAt: serverTimestamp(),
        userId: auth.currentUser?.uid || 'anonymous',
        status: 'success'
      }).catch(logErr => console.warn("Logging warning:", logErr.message));

      setSuccess(true);
      
      // Trigger download
      downloadBlob(content, filename);
      
      setTimeout(() => {
        closeModal();
      }, 2000);
    } catch (err: any) {
      console.warn("Download handling warning:", err.message);
      setError('An error occurred during verification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center p-8 max-w-4xl mx-auto w-full h-full relative">
      <div className="w-full flex justify-between items-center mb-6">
        {onBack ? (
          <button 
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors font-medium text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Tools
          </button>
        ) : <div />}
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowDashboard(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-full transition-all font-medium text-sm shadow-md shadow-indigo-500/20 active:scale-95"
          >
            <Boxes className="w-4 h-4" />
            Blueprint Dashboard
          </button>

          <button 
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors font-medium text-sm border border-indigo-200 dark:border-indigo-800/50"
          >
            <History className="w-4 h-4" />
            Update History
          </button>
        </div>
      </div>
      
      <div className="bg-white dark:bg-zinc-950 p-8 sm:p-10 rounded-3xl shadow-xl w-full border border-zinc-200 dark:border-zinc-800 text-center relative overflow-hidden">
        
        <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-4">About Nirzor Magic Crawler</h1>
        <p className="text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto mb-8">
          An advanced web intelligence and data extraction platform designed for structural analysis, content gathering, and vulnerability auditing.
        </p>

        {/* Visual Blueprint Dashboard Hero Card */}
        <div className="mb-10 p-6 rounded-2xl bg-gradient-to-r from-indigo-900/10 via-purple-900/10 to-blue-900/10 border border-indigo-200/80 dark:border-indigo-800/50 flex flex-col sm:flex-row items-center justify-between gap-6 text-left relative overflow-hidden">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/30">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-lg text-zinc-900 dark:text-white">Architecture Blueprint Dashboard</h3>
                <span className="text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                  Live Technical Overview
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Explore an interactive visual map linking React components, Express API proxies, state buffers, and the Firebase Firestore data layer.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowDashboard(true)}
            className="w-full sm:w-auto px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Layout className="w-4 h-4" />
            Launch Visual Dashboard
          </button>
        </div>

        <div className="flex items-center justify-between mb-6 border-b border-zinc-100 dark:border-zinc-800 pb-2">
          <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200 text-left">Architecture Blueprints</h2>
          <span className="text-xs font-mono bg-zinc-100 dark:bg-zinc-900 px-2.5 py-1 rounded-full text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
            v{BLUEPRINT_VERSION}
          </span>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* UI Blueprint Card */}
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center transition-transform hover:-translate-y-1">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
              <Download className="w-8 h-8" />
            </div>
            <h3 className="font-semibold text-lg text-zinc-900 dark:text-white mb-2">UI Blueprint</h3>
            <p className="text-sm text-zinc-500 text-center mb-6">User Interface & Experience Guidelines</p>
            <button 
              onClick={() => { setSelectedBlueprint('ui'); setPassword(''); setError(''); setSuccess(false); }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" /> Secure Download
            </button>
          </div>

          {/* Dev Blueprint Card */}
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center transition-transform hover:-translate-y-1">
            <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/40 text-purple-600 rounded-2xl flex items-center justify-center mb-4">
              <Download className="w-8 h-8" />
            </div>
            <h3 className="font-semibold text-lg text-zinc-900 dark:text-white mb-2">Developer Blueprint</h3>
            <p className="text-sm text-zinc-500 text-center mb-6">System Architecture & APIs</p>
            <button 
              onClick={() => { setSelectedBlueprint('dev'); setPassword(''); setError(''); setSuccess(false); }}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" /> Secure Download
            </button>
          </div>
        </div>
      </div>

      {/* Security Gate Modal */}
      {selectedBlueprint && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-950 p-6 rounded-2xl max-w-md w-full shadow-2xl border border-zinc-200 dark:border-zinc-800 transform transition-all scale-100 opacity-100 relative">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-full flex items-center justify-center mb-3">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Security Check</h3>
              <p className="text-sm text-zinc-500 mt-1">Please enter the access code for the {selectedBlueprint === 'ui' ? 'UI' : 'Developer'} Blueprint.</p>
            </div>

            <form onSubmit={handleDownload} className="space-y-4">
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter Password"
                  className="w-full px-4 py-3 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white text-center tracking-widest text-lg"
                  autoFocus
                />
              </div>

              {error && (
                <div className="flex items-center justify-center gap-2 text-rose-600 text-sm font-medium bg-rose-50 dark:bg-rose-900/20 p-2.5 rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              {success && (
                <div className="flex items-center justify-center gap-2 text-emerald-600 text-sm font-medium bg-emerald-50 dark:bg-emerald-900/20 p-2.5 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                  Access Granted. Downloading...
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !password || success}
                  className="flex-1 px-4 py-2.5 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? 'Verifying...' : success ? 'Unlocked' : 'Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showHistory && <BlueprintHistoryModal onClose={() => setShowHistory(false)} />}
      {showDashboard && <BlueprintDashboardModal onClose={() => setShowDashboard(false)} />}
    </div>
  );
}
