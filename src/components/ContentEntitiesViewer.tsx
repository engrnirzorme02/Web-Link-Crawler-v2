import {
  Check,
  Copy,
  Database,
  Download,
  ExternalLink,
  Globe,
  Loader2,
  Mail, Phone,
  Search,
  Send,
  Share2,
  Sparkles
} from 'lucide-react';
import React, { useState } from 'react';
import { ParsedPageData } from '../lib/firebase';
import { cn } from '../lib/utils';

interface ContentEntitiesViewerProps {
  pageDataMap: Map<string, ParsedPageData>;
  results?: any[];
  onInspectUrl?: (url: string) => void;
}

export function ContentEntitiesViewer({ pageDataMap, onInspectUrl }: ContentEntitiesViewerProps) {
  const [activeSubTab, setActiveSubTab] = useState<'emails' | 'phones' | 'metadata' | 'social' | 'single_test'>('emails');
  const [searchFilter, setSearchFilter] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Single page test analyzer state
  const [testUrl, setTestUrl] = useState('');
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [testResult, setTestResult] = useState<ParsedPageData | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Aggregated unique entities
  const allParsedPages = Array.from(pageDataMap.values());

  const allEmails = React.useMemo(() => {
    const map = new Map<string, Set<string>>(); // email -> sources
    allParsedPages.forEach(p => {
      p.entities?.emails?.forEach(email => {
        if (!map.has(email)) map.set(email, new Set());
        map.get(email)!.add(p.url);
      });
    });
    return Array.from(map.entries()).map(([email, sources]) => ({
      email,
      sources: Array.from(sources)
    }));
  }, [allParsedPages]);

  const allPhones = React.useMemo(() => {
    const map = new Map<string, Set<string>>(); // phone -> sources
    allParsedPages.forEach(p => {
      p.entities?.phones?.forEach(phone => {
        if (!map.has(phone)) map.set(phone, new Set());
        map.get(phone)!.add(p.url);
      });
    });
    return Array.from(map.entries()).map(([phone, sources]) => ({
      phone,
      sources: Array.from(sources)
    }));
  }, [allParsedPages]);

  const allSocialLinks = React.useMemo(() => {
    const seen = new Set<string>();
    const list: { platform: string; url: string; source: string }[] = [];
    allParsedPages.forEach(p => {
      p.entities?.socialLinks?.forEach(s => {
        const key = `${s.platform}:${s.url}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ ...s, source: p.url });
        }
      });
    });
    return list;
  }, [allParsedPages]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const exportEmailsCsv = () => {
    let csv = "Email,Source Pages\n";
    allEmails.forEach(e => {
      csv += `"${e.email}","${e.sources.join('; ')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `extracted-emails-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const exportPhonesCsv = () => {
    let csv = "Phone Number,Source Pages\n";
    allPhones.forEach(p => {
      csv += `"${p.phone}","${p.sources.join('; ')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `extracted-phones-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const exportMetadataCsv = () => {
    let csv = "URL,Title,Description,Canonical,H1\n";
    allParsedPages.forEach(p => {
      const m = p.metadata;
      const cleanTitle = (m?.title || '').replace(/"/g, '""');
      const cleanDesc = (m?.description || '').replace(/"/g, '""');
      const cleanCanon = (m?.canonical || '').replace(/"/g, '""');
      const cleanH1 = (m?.h1?.join('; ') || '').replace(/"/g, '""');
      csv += `"${p.url}","${cleanTitle}","${cleanDesc}","${cleanCanon}","${cleanH1}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pages-metadata-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  // Run on-demand single page test
  const handleRunSingleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUrl.trim()) return;

    let formattedUrl = testUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    setIsTestingUrl(true);
    setTestError(null);
    setTestResult(null);

    try {
      const res = await fetch('/api/parse-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: formattedUrl })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestError(err.message || 'Failed to analyze page');
    } finally {
      setIsTestingUrl(false);
    }
  };

  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden flex flex-col">
      {/* Top Header */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Extracted Content & Entities
              <span className="text-xs font-normal text-zinc-500 bg-zinc-200/80 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                {allParsedPages.length} Pages Parsed
              </span>
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Emails, telephone numbers, OpenGraph metadata, and social links discovered across crawled pages
            </p>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex items-center gap-1 bg-zinc-200/60 dark:bg-zinc-800/80 p-1 rounded-xl text-xs flex-wrap">
          <button
            onClick={() => setActiveSubTab('emails')}
            className={cn(
              "px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5",
              activeSubTab === 'emails' ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-2xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
            )}
          >
            <Mail className="w-3.5 h-3.5" />
            Emails ({allEmails.length})
          </button>
          <button
            onClick={() => setActiveSubTab('phones')}
            className={cn(
              "px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5",
              activeSubTab === 'phones' ? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-2xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
            )}
          >
            <Phone className="w-3.5 h-3.5" />
            Phones ({allPhones.length})
          </button>
          <button
            onClick={() => setActiveSubTab('social')}
            className={cn(
              "px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5",
              activeSubTab === 'social' ? "bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-400 shadow-2xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
            )}
          >
            <Share2 className="w-3.5 h-3.5" />
            Socials ({allSocialLinks.length})
          </button>
          <button
            onClick={() => setActiveSubTab('metadata')}
            className={cn(
              "px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5",
              activeSubTab === 'metadata' ? "bg-white dark:bg-zinc-700 text-amber-600 dark:text-amber-400 shadow-2xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
            )}
          >
            <Globe className="w-3.5 h-3.5" />
            Page Metadata ({allParsedPages.length})
          </button>
          <button
            onClick={() => setActiveSubTab('single_test')}
            className={cn(
              "px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5",
              activeSubTab === 'single_test' ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-2xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Live URL Tester
          </button>
        </div>
      </div>

      {/* Main Content Sections */}
      <div className="p-4 flex-1">
        {/* EMAILS TAB */}
        {activeSubTab === 'emails' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter emails..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                />
              </div>

              {allEmails.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(allEmails.map(e => e.email).join('\n'), 'all_emails')}
                    className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs flex items-center gap-1.5"
                  >
                    {copiedKey === 'all_emails' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy All
                  </button>
                  <button
                    onClick={exportEmailsCsv}
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                </div>
              )}
            </div>

            {allEmails.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 space-y-1">
                <Mail className="w-8 h-8 mx-auto opacity-30 text-zinc-400" />
                <p>No email addresses found in the crawled pages yet.</p>
                <p className="text-[11px] text-zinc-500">Emails in &lt;a href="mailto:..."&gt; or plain-text patterns will appear here automatically.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="p-3">Email Address</th>
                      <th className="p-3">Discovered On</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                    {allEmails
                      .filter(e => !searchFilter || e.email.toLowerCase().includes(searchFilter.toLowerCase()))
                      .map(e => (
                        <tr key={e.email} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                          <td className="p-3 text-zinc-900 dark:text-zinc-100 font-medium">
                            {e.email}
                          </td>
                          <td className="p-3 text-zinc-500 max-w-md truncate">
                            <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-[11px]">
                              {e.sources.length} page(s)
                            </span>
                            <span className="ml-2 text-[10px] text-zinc-400 truncate">
                              {e.sources[0]}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => copyToClipboard(e.email, e.email)}
                              className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-700"
                              title="Copy email"
                            >
                              {copiedKey === e.email ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PHONES TAB */}
        {activeSubTab === 'phones' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter phone numbers..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                />
              </div>

              {allPhones.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(allPhones.map(p => p.phone).join('\n'), 'all_phones')}
                    className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs flex items-center gap-1.5"
                  >
                    {copiedKey === 'all_phones' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy All
                  </button>
                  <button
                    onClick={exportPhonesCsv}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                </div>
              )}
            </div>

            {allPhones.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 space-y-1">
                <Phone className="w-8 h-8 mx-auto opacity-30 text-zinc-400" />
                <p>No contact phone numbers detected in crawled pages.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="p-3">Phone Number</th>
                      <th className="p-3">Found On</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                    {allPhones
                      .filter(p => !searchFilter || p.phone.includes(searchFilter))
                      .map(p => (
                        <tr key={p.phone} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                          <td className="p-3 text-zinc-900 dark:text-zinc-100 font-medium">
                            {p.phone}
                          </td>
                          <td className="p-3 text-zinc-500 max-w-md truncate">
                            <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-[11px]">
                              {p.sources.length} page(s)
                            </span>
                            <span className="ml-2 text-[10px] text-zinc-400 truncate">
                              {p.sources[0]}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => copyToClipboard(p.phone, p.phone)}
                              className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-700"
                              title="Copy phone"
                            >
                              {copiedKey === p.phone ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SOCIAL LINKS TAB */}
        {activeSubTab === 'social' && (
          <div className="space-y-3">
            {allSocialLinks.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 space-y-1">
                <Share2 className="w-8 h-8 mx-auto opacity-30 text-zinc-400" />
                <p>No social profile links found yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {allSocialLinks.map((s, idx) => (
                  <div key={idx} className="p-3 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold rounded text-[10px] uppercase">
                        {s.platform}
                      </span>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-blue-600 dark:text-blue-400"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-mono text-zinc-800 dark:text-zinc-200 hover:underline break-all block"
                    >
                      {s.url}
                    </a>
                    <div className="text-[10px] text-zinc-400 truncate">
                      Source: {s.source}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PAGE METADATA TAB */}
        {activeSubTab === 'metadata' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search page title, description or URL..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                />
              </div>

              {allParsedPages.length > 0 && (
                <button
                  onClick={exportMetadataCsv}
                  className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Metadata CSV
                </button>
              )}
            </div>

            {allParsedPages.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 space-y-1">
                <Globe className="w-8 h-8 mx-auto opacity-30 text-zinc-400" />
                <p>No page metadata recorded yet. Start a crawl to populate.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allParsedPages
                  .filter(p => {
                    if (!searchFilter) return true;
                    const q = searchFilter.toLowerCase();
                    return p.url.toLowerCase().includes(q) ||
                      (p.metadata?.title && p.metadata.title.toLowerCase().includes(q)) ||
                      (p.metadata?.description && p.metadata.description.toLowerCase().includes(q));
                  })
                  .slice(0, 50)
                  .map((p, idx) => (
                    <div key={idx} className="p-3.5 bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline truncate"
                        >
                          {p.url}
                        </a>
                        <span className="text-[10px] text-zinc-400 shrink-0">
                          {p.metadata?.canonical ? 'Canonical Verified' : ''}
                        </span>
                      </div>

                      {p.metadata?.title && (
                        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {p.metadata.title}
                        </h4>
                      )}

                      {p.metadata?.description && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                          {p.metadata.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-zinc-500">
                        {p.metadata?.h1 && p.metadata.h1.length > 0 && (
                          <span className="bg-zinc-200/80 dark:bg-zinc-700 px-2 py-0.5 rounded text-zinc-700 dark:text-zinc-300">
                            H1: {p.metadata.h1[0]}
                          </span>
                        )}
                        {p.metadata?.keywords && p.metadata.keywords.length > 0 && (
                          <span className="bg-zinc-200/80 dark:bg-zinc-700 px-2 py-0.5 rounded text-zinc-700 dark:text-zinc-300">
                            {p.metadata.keywords.length} Keywords
                          </span>
                        )}
                        {p.entities?.emails && p.entities.emails.length > 0 && (
                          <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                            {p.entities.emails.length} Emails
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* LIVE URL TESTER TAB */}
        {activeSubTab === 'single_test' && (
          <div className="space-y-4 max-w-2xl mx-auto py-2">
            <div className="text-center space-y-1">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Single Page Live Content & Entity Inspector
              </h4>
              <p className="text-xs text-zinc-500">
                Enter any web page URL to immediately fetch its metadata, contacts, and structured tags.
              </p>
            </div>

            <form onSubmit={handleRunSingleTest} className="flex gap-2">
              <input
                type="text"
                placeholder="https://example.com/about or domain.com/contact"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-mono"
              />
              <button
                type="submit"
                disabled={isTestingUrl || !testUrl.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                {isTestingUrl ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Inspecting...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Inspect Page
                  </>
                )}
              </button>
            </form>

            {testError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 dark:text-red-400">
                {testError}
              </div>
            )}

            {testResult && (
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Inspection Result (HTTP {testResult.statusCode || 200})
                  </span>
                  <a
                    href={testResult.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1"
                  >
                    Visit Page <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-zinc-400 text-[11px] block">Title:</span>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {testResult.metadata?.title || 'No title tag found'}
                    </p>
                  </div>

                  <div>
                    <span className="text-zinc-400 text-[11px] block">Meta Description:</span>
                    <p className="text-zinc-600 dark:text-zinc-300">
                      {testResult.metadata?.description || 'No description tag'}
                    </p>
                  </div>

                  {testResult.entities?.emails && testResult.entities.emails.length > 0 && (
                    <div>
                      <span className="text-zinc-400 text-[11px] block">Found Emails:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {testResult.entities.emails.map(e => (
                          <span key={e} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded font-mono text-[11px]">
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {testResult.entities?.phones && testResult.entities.phones.length > 0 && (
                    <div>
                      <span className="text-zinc-400 text-[11px] block">Found Phone Numbers:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {testResult.entities.phones.map(p => (
                          <span key={p} className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded font-mono text-[11px]">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {testResult.entities?.socialLinks && testResult.entities.socialLinks.length > 0 && (
                    <div>
                      <span className="text-zinc-400 text-[11px] block">Social Profiles:</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {testResult.entities.socialLinks.map((s, idx) => (
                          <a
                            key={idx}
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded text-[11px] hover:underline"
                          >
                            {s.platform}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
