import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Save, FileText, Check, AlertCircle, Loader2, Bold, Italic, Strikethrough, 
  Heading1, Heading2, List, ListOrdered, CheckSquare, Code, Quote, Link as LinkIcon, 
  Eye, Edit3, Columns, Copy, Download, Trash2, Sparkles, BookOpen, Clock, Tag
} from 'lucide-react';
import Markdown from 'react-markdown';
import { db, Session } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from '../lib/utils';

interface SessionNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  userId: string | null;
  onNotesSaved?: (updatedSession: Session) => void;
}

export function SessionNotesModal({
  isOpen,
  onClose,
  session,
  userId,
  onNotesSaved,
}: SessionNotesModalProps) {
  const [notes, setNotes] = useState('');
  const [initialNotes, setInitialNotes] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimerRef = useRef<any>(null);

  // Synchronize when session opens or changes
  useEffect(() => {
    if (session && isOpen) {
      const sessionNotes = session.notes || '';
      setNotes(sessionNotes);
      setInitialNotes(sessionNotes);
      setSaveStatus('idle');
      setErrorMessage('');
    }
  }, [session?.id, isOpen]);

  // Clean up auto-save on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  if (!isOpen || !session) return null;

  const hasUnsavedChanges = notes !== initialNotes;

  const handleSaveNotes = async (contentToSave = notes) => {
    if (!session?.id) return;
    
    setSaveStatus('saving');
    setErrorMessage('');
    
    try {
      await updateDoc(doc(db, 'sessions', session.id), {
        notes: contentToSave,
        updatedAt: serverTimestamp()
      });
      
      setInitialNotes(contentToSave);
      setSaveStatus('saved');
      
      if (onNotesSaved) {
        onNotesSaved({
          ...session,
          notes: contentToSave,
        });
      }
      
      setTimeout(() => {
        setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
      }, 2500);
    } catch (err: any) {
      console.error('Failed to save session notes:', err);
      setSaveStatus('error');
      setErrorMessage(err.message || 'Failed to save to cloud database.');
    }
  };

  // Debounced auto-save when user types
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNotes(val);
    
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    autoSaveTimerRef.current = setTimeout(() => {
      if (session?.id && val !== initialNotes) {
        handleSaveNotes(val);
      }
    }, 1800);
  };

  // Helper to insert markdown format at cursor
  const insertFormatting = (before: string, after: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;
    const selectedText = currentText.substring(start, end) || defaultText;

    const replacement = `${before}${selectedText}${after}`;
    const newText = currentText.substring(0, start) + replacement + currentText.substring(end);
    
    setNotes(newText);
    
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selectedText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const insertTemplate = (type: 'audit' | 'findings' | 'todo' | 'summary') => {
    let tpl = '';
    if (type === 'findings') {
      tpl = `\n\n## 🔍 Crawl Key Findings\n- **Target Scope**: ${session.url || 'Multiple targets'}\n- **Total URLs Discovered**: ${session.results?.length || 0}\n- **Key Endpoints Found**:\n  - \n- **Potential Insights**:\n  - \n`;
    } else if (type === 'audit') {
      tpl = `\n\n## 🛡️ Security & Endpoint Audit\n- **Sensitive Paths Observed**:\n  - [ ] /admin or /dashboard\n  - [ ] API keys / env credentials\n- **Status Breakdown**:\n  - Verified public: \n  - Auth protected: \n- **Notes & Risks**:\n  - \n`;
    } else if (type === 'todo') {
      tpl = `\n\n## 📋 Action Items & Follow-ups\n- [ ] Review extracted query parameters\n- [ ] Verify broken or redirected links\n- [ ] Download complete JSON dataset backup\n- [ ] Share session findings with team\n`;
    } else if (type === 'summary') {
      tpl = `\n\n## 📝 Session Summary\n**Objective**: \n**Date**: ${new Date().toLocaleDateString()}\n**Highlights**: \n- \n- \n`;
    }

    setNotes((prev) => (prev ? prev + tpl : tpl.trimStart()));
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(notes);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMarkdown = () => {
    const safeTitle = (session.title || 'session_notes').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const blob = new Blob([notes], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}_notes.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const wordCount = notes.trim() ? notes.trim().split(/\s+/).length : 0;
  const charCount = notes.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            handleSaveNotes();
          }
        }}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-zinc-50/70 dark:bg-zinc-950/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">
                  Session Notes
                </h3>
                <span className="text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  {session.type}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-md">
                {session.title || 'Untitled Session'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Save status badge */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium mr-2">
              {saveStatus === 'saving' && (
                <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Cloud Saved
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-red-500 flex items-center gap-1" title={errorMessage}>
                  <AlertCircle className="w-3.5 h-3.5" /> Save Failed
                </span>
              )}
              {saveStatus === 'idle' && hasUnsavedChanges && (
                <span className="text-amber-500 font-medium">Unsaved</span>
              )}
              {saveStatus === 'idle' && !hasUnsavedChanges && initialNotes && (
                <span className="text-zinc-400">Synced</span>
              )}
            </div>

            <button
              onClick={() => handleSaveNotes()}
              disabled={saveStatus === 'saving' || !hasUnsavedChanges}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-all active:scale-95"
              title="Save changes (Ctrl+S / Cmd+S)"
            >
              {saveStatus === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar: Formatting controls + Mode toggles */}
        <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Markdown formatting actions */}
          <div className="flex items-center flex-wrap gap-1">
            <button
              type="button"
              onClick={() => insertFormatting('**', '**', 'bold text')}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Bold (**text**)"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('*', '*', 'italic text')}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Italic (*text*)"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('~~', '~~', 'strikethrough')}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Strikethrough (~~text~~)"
            >
              <Strikethrough className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />

            <button
              type="button"
              onClick={() => insertFormatting('# ', '', 'Heading 1')}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Heading 1 (#)"
            >
              <Heading1 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('## ', '', 'Heading 2')}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Heading 2 (##)"
            >
              <Heading2 className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />

            <button
              type="button"
              onClick={() => insertFormatting('- ', '', 'List item')}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Bullet List (-)"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('1. ', '', 'Numbered item')}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Numbered List (1.)"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('- [ ] ', '', 'Task item')}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Task Checkbox (- [ ])"
            >
              <CheckSquare className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />

            <button
              type="button"
              onClick={() => insertFormatting('```\n', '\n```', 'code block')}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Code block (```)"
            >
              <Code className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('> ', '', 'Quote text')}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Quote block (>)"
            >
              <Quote className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('[', '](https://example.com)', 'Link text')}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Insert Link [Text](URL)"
            >
              <LinkIcon className="w-4 h-4" />
            </button>

            {/* Quick Templates dropdown/chips */}
            <div className="relative group ml-1">
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors font-medium text-[11px]"
              >
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Templates</span>
              </button>
              <div className="hidden group-hover:flex flex-col absolute left-0 top-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl py-1 z-20 min-w-[170px]">
                <button
                  type="button"
                  onClick={() => insertTemplate('findings')}
                  className="px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                >
                  🔍 Crawl Findings
                </button>
                <button
                  type="button"
                  onClick={() => insertTemplate('audit')}
                  className="px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                >
                  🛡️ Security Audit
                </button>
                <button
                  type="button"
                  onClick={() => insertTemplate('todo')}
                  className="px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                >
                  📋 Action Checklist
                </button>
                <button
                  type="button"
                  onClick={() => insertTemplate('summary')}
                  className="px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                >
                  📝 Quick Summary
                </button>
              </div>
            </div>
          </div>

          {/* Mode Switcher: Edit | Preview | Split */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={cn(
                "px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1",
                viewMode === 'edit' ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={cn(
                "px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1",
                viewMode === 'preview' ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={cn(
                "hidden md:flex px-2.5 py-1 rounded-lg font-medium transition-colors items-center gap-1",
                viewMode === 'split' ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Split</span>
            </button>
          </div>
        </div>

        {/* Notes Editor Body */}
        <div className="flex-1 min-h-[350px] max-h-[58vh] overflow-hidden flex flex-col md:flex-row bg-zinc-50/50 dark:bg-zinc-950/50">
          {/* Write Pane */}
          {(viewMode === 'edit' || viewMode === 'split') && (
            <div className={cn(
              "flex-1 flex flex-col h-full overflow-hidden p-4",
              viewMode === 'split' ? "border-r border-zinc-200 dark:border-zinc-800" : ""
            )}>
              <textarea
                ref={textareaRef}
                value={notes}
                onChange={handleTextChange}
                placeholder="Write rich notes, markdown annotations, discovered API keys, or crawl takeaways for this session...&#10;&#10;Supports Markdown:&#10;# Heading&#10;- Bullet point&#10;- [ ] Task item&#10;**Bold text**&#10;`Code snippet`"
                className="w-full h-full p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono leading-relaxed resize-none custom-scrollbar"
              />
            </div>
          )}

          {/* Rendered Preview Pane */}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className="flex-1 flex flex-col h-full overflow-y-auto p-5 custom-scrollbar bg-white dark:bg-zinc-900">
              {notes.trim() ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 space-y-3">
                  <Markdown>{notes}</Markdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12 text-zinc-400 dark:text-zinc-600">
                  <FileText className="w-10 h-10 mb-2 stroke-1" />
                  <p className="text-sm font-medium">No notes written yet.</p>
                  <p className="text-xs">Type in the editor or insert a template to get started.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer: Statistics & Actions */}
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-zinc-500 dark:text-zinc-400">
            <span><strong>{wordCount}</strong> words</span>
            <span><strong>{charCount}</strong> characters</span>
            {session.updatedAt && (
              <span className="hidden sm:inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Updated {new Date(session.updatedAt?.toDate?.() || Date.now()).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyToClipboard}
              disabled={!notes}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
              title="Copy markdown text"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              type="button"
              onClick={downloadMarkdown}
              disabled={!notes}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
              title="Export as .md file"
            >
              <Download className="w-3.5 h-3.5 text-blue-500" />
              <span>Export .MD</span>
            </button>

            {notes && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Are you sure you want to clear the notes for this session?')) {
                    setNotes('');
                    handleSaveNotes('');
                  }
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                title="Clear all notes"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
