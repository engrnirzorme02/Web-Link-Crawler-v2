import React, { useState } from 'react';
import { Session, db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { X, Hash, Plus, Sparkles, Loader2, Check, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface TagEditModalProps {
  session: Session;
  onClose: () => void;
  onTagsUpdated?: (sessionId: string, newTags: string[]) => void;
}

export function TagEditModal({ session, onClose, onTagsUpdated }: TagEditModalProps) {
  const [tags, setTags] = useState<string[]>(session.tags || []);
  const [newTagInput, setNewTagInput] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleAddTag = (rawTag: string) => {
    const cleaned = rawTag.trim().replace(/^#+/, '').toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!cleaned) return;
    if (tags.includes(cleaned)) {
      setFeedbackMsg({ type: 'error', text: `Tag #${cleaned} already exists` });
      return;
    }
    setTags(prev => [...prev, cleaned]);
    setNewTagInput('');
    setFeedbackMsg(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag(newTagInput);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(prev => prev.filter(t => t !== tagToRemove));
  };

  const handleGenerateAiTags = async () => {
    setIsAiGenerating(true);
    setFeedbackMsg(null);
    try {
      const sampleUrls = (session.results || []).slice(0, 25).map((r: any) => 
        typeof r === 'string' ? r : (r.url || r.title || '')
      ).filter(Boolean);

      const res = await fetch('/api/generate-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: session.title,
          url: session.url,
          type: session.type,
          sampleUrls,
          existingTags: tags
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      if (Array.isArray(data.tags) && data.tags.length > 0) {
        const merged = Array.from(new Set([...tags, ...data.tags]));
        setTags(merged);
        setFeedbackMsg({ 
          type: 'success', 
          text: `Gemini suggested ${data.tags.length} new tag(s)! Review and click Save.` 
        });
      } else {
        setFeedbackMsg({ 
          type: 'error', 
          text: 'No new tags could be identified for this session content.' 
        });
      }
    } catch (err: any) {
      console.error('AI tag generation failed:', err);
      setFeedbackMsg({ 
        type: 'error', 
        text: err.message || 'Failed to generate tags. Check network/API key.' 
      });
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!session.id) return;
    setIsSaving(true);
    setFeedbackMsg(null);
    try {
      await updateDoc(doc(db, 'sessions', session.id), {
        tags,
        updatedAt: serverTimestamp()
      });
      if (onTagsUpdated) {
        onTagsUpdated(session.id, tags);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to update session tags:', err);
      setFeedbackMsg({ type: 'error', text: `Failed to save: ${err.message}` });
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Manage Session Tags
              </h3>
              <p className="text-xs text-zinc-400 truncate max-w-[240px]" title={session.title}>
                {session.title || 'Untitled Session'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* AI Generate Button */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 p-3.5 rounded-xl border border-blue-200/80 dark:border-blue-900/50 flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Gemini AI Auto-Tagging
            </span>
            <p className="text-[11px] text-blue-700/80 dark:text-blue-300/70 mt-0.5">
              Analyze session URLs and domain to generate smart tags on-demand.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateAiTags}
            disabled={isAiGenerating}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
          >
            {isAiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{isAiGenerating ? 'Analyzing...' : 'AI Generate'}</span>
          </button>
        </div>

        {/* Feedback message */}
        {feedbackMsg && (
          <div className={cn(
            "p-2.5 rounded-xl text-xs flex items-center gap-2",
            feedbackMsg.type === 'success'
              ? "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
              : "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"
          )}>
            {feedbackMsg.type === 'success' ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Active Tags List */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block">
            Current Tags ({tags.length}):
          </label>
          {tags.length === 0 ? (
            <p className="text-xs text-zinc-400 italic py-2">No tags assigned to this session yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto custom-scrollbar p-2 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-zinc-800">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-lg shadow-2xs font-medium"
                >
                  <Hash className="w-3 h-3 opacity-60" />
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 text-zinc-400 hover:text-red-500 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 p-0.5"
                    title="Remove tag"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Add Tag Manually */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
            Add Tag Manually:
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Hash className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={newTagInput}
                onChange={e => setNewTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type tag (e.g. ecommerce, blog) and hit Enter"
                className="w-full text-xs pl-7 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => handleAddTag(newTagInput)}
              className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-all"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span>{isSaving ? 'Saving...' : 'Save Tags'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
