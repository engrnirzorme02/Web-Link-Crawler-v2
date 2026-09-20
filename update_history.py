import re

with open('src/components/HistoryDashboard.tsx', 'r') as f:
    content = f.read()

# Update imports
content = content.replace("History, Play, FileText, Globe, Brain, ListOrdered, Calendar, Layers } from 'lucide-react'", "History, Play, FileText, Globe, Brain, ListOrdered, Calendar, Layers, Download, RefreshCw } from 'lucide-react'")

# Update props interface
props_old = """interface HistoryDashboardProps {
  sessions: Session[];
  onReRunSession: (session: Session) => void;
}"""
props_new = """interface HistoryDashboardProps {
  sessions: Session[];
  onReRunSession: (session: Session) => void;
  onRecovery?: () => void;
}"""
content = content.replace(props_old, props_new)

# Update component signature
sig_old = "export function HistoryDashboard({ sessions, onReRunSession }: HistoryDashboardProps) {"
sig_new = "export function HistoryDashboard({ sessions, onReRunSession, onRecovery }: HistoryDashboardProps) {"
content = content.replace(sig_old, sig_new)

# Add export handler
export_logic = """
  const handleExportAll = (format: 'json' | 'csv') => {
    let content = '';
    let type = '';
    let extension = format;
    
    // Combine all results from all sessions
    const allResults = historySessions.flatMap(s => {
      if (!s.results) return [];
      return s.results.map(r => {
        // Normalize string results to objects for consistency
        if (typeof r === 'string') return { url: r, source: s.url, sessionTitle: s.title, date: s.createdAt ? new Date(getMillis(s.createdAt)).toISOString() : '' };
        return { ...r, sessionTitle: s.title, date: s.createdAt ? new Date(getMillis(s.createdAt)).toISOString() : '' };
      });
    });

    if (allResults.length === 0) return;

    if (format === 'json') {
      content = JSON.stringify(allResults, null, 2);
      type = 'application/json;charset=utf-8;';
    } else {
      const keys = ['url', 'source', 'sessionTitle', 'date', 'status'];
      content = keys.join(',') + '\\n' + allResults.map((r: any) => 
        keys.map(k => `"${(r[k] || '').toString().replace(/"/g, '""')}"`).join(',')
      ).join('\\n');
      type = 'text/csv;charset=utf-8;';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `global-export-${new Date().toISOString().split('T')[0]}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
"""
content = content.replace("  const stats = useMemo(() => {", export_logic.strip() + "\n\n  const stats = useMemo(() => {")

# Update Header UI
header_old = """        <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">History & Reports</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">View past sessions, aggregate statistics, and export previous work.</p>
          </div>
        </div>"""

header_new = """        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg shrink-0">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">History & Reports</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">View past sessions, aggregate statistics, and export previous work.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleExportAll('csv')}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800/50 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button
              onClick={() => handleExportAll('json')}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800/50 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              JSON
            </button>
            {onRecovery && (
              <button
                onClick={onRecovery}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800/50 rounded-lg transition-colors"
                title="Force sync with server and clear cache"
              >
                <RefreshCw className="w-4 h-4" />
                Recover
              </button>
            )}
          </div>
        </div>"""

content = content.replace(header_old, header_new)

with open('src/components/HistoryDashboard.tsx', 'w') as f:
    f.write(content)

