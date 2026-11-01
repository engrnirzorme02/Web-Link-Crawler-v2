import type { FormEvent } from 'react';
import { ArrowRight, ChevronDown, Globe2, Link2, Loader2, Play, ShieldCheck, Square, SlidersHorizontal } from 'lucide-react';
import { validateCrawlSetup, type CrawlScope } from '../lib/crawlSetup';

interface CrawlSetupFormProps {
  url: string;
  mode: CrawlScope;
  maxPages: string;
  maxDepth: string;
  isCrawling: boolean;
  error?: string;
  attachedFileCount?: number;
  onUrlChange: (value: string) => void;
  onModeChange: (value: CrawlScope) => void;
  onPagesChange: (value: string) => void;
  onDepthChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  onShowResults: () => void;
  onAdvanced: () => void;
}

const scopes: { value: CrawlScope; label: string; description: string }[] = [
  { value: 'single', label: 'Single Page', description: 'Only this page' },
  { value: 'subdir', label: 'Subdirectory', description: 'Pages under this path' },
  { value: 'domain', label: 'Entire Domain', description: 'Within domain crawl boundaries' }
];

/** Touch-first setup for small viewports; the existing advanced UI remains available. */
export function CrawlSetupForm({
  url, mode, maxPages, maxDepth, isCrawling, error, attachedFileCount = 0,
  onUrlChange, onModeChange, onPagesChange, onDepthChange,
  onStart, onStop, onShowResults, onAdvanced
}: CrawlSetupFormProps) {
  const validation = validateCrawlSetup({ url, mode, maxPages, maxDepth });
  const canStart = validation.valid && !isCrawling;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canStart) onStart();
  };

  return (
    <form onSubmit={submit} className="space-y-5" aria-label="Website crawl setup" noValidate>
      <header className="space-y-1">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">New Crawl</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Configure your website scan.</p>
      </header>

      <section className="space-y-2">
        <label htmlFor="mobile-crawl-targets" className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          <Link2 aria-hidden="true" className="w-4 h-4" /> Target website
        </label>
        <textarea
          id="mobile-crawl-targets"
          name="crawl-targets"
          rows={2}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://example.com"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          disabled={isCrawling}
          aria-invalid={Boolean(validation.errors.url)}
          aria-describedby="mobile-url-hint mobile-url-error"
          className="w-full min-h-[64px] resize-y rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-base text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <p id="mobile-url-hint" className="text-xs text-zinc-500 dark:text-zinc-400">One URL per line. You can paste multiple targets.</p>
        {validation.errors.url && url.trim() && (
          <p id="mobile-url-error" role="alert" className="text-sm text-red-600 dark:text-red-400">{validation.errors.url}</p>
        )}
      </section>

      <fieldset className="space-y-2">
        <legend className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          <Globe2 aria-hidden="true" className="w-4 h-4" /> What should we crawl?
        </legend>
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-700">
          {scopes.map((scope, index) => (
            <label
              key={scope.value}
              className={"flex min-h-[64px] cursor-pointer items-center gap-3 px-4 py-3 " +
                (index > 0 ? 'border-t border-zinc-200 dark:border-zinc-700 ' : '') +
                (mode === scope.value ? 'bg-teal-50 dark:bg-teal-950/30' : 'bg-white dark:bg-zinc-900')}
            >
              <input
                type="radio"
                name="mobile-crawl-scope"
                value={scope.value}
                checked={mode === scope.value}
                onChange={() => onModeChange(scope.value)}
                disabled={isCrawling}
                className="h-5 w-5 shrink-0 accent-teal-700"
              />
              <span className="flex-1 space-y-0.5">
                <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{scope.label}</span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">{scope.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="mobile-max-pages" className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">Max pages</label>
          <input
            id="mobile-max-pages" type="number" inputMode="numeric" min={1} max={10000} step={1}
            value={maxPages} onChange={e => onPagesChange(e.target.value)}
            disabled={isCrawling || mode === 'single'}
            aria-invalid={Boolean(validation.errors.maxPages)}
            className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          {validation.errors.maxPages && <p className="text-xs text-red-600" role="alert">{validation.errors.maxPages}</p>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="mobile-max-depth" className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">Max depth</label>
          <input
            id="mobile-max-depth" type="number" inputMode="numeric"
            min={mode === 'single' ? 0 : 1} max={10} step={1}
            value={maxDepth} onChange={e => onDepthChange(e.target.value)}
            disabled={isCrawling || mode === 'single'}
            aria-invalid={Boolean(validation.errors.maxDepth)}
            className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          {validation.errors.maxDepth && <p className="text-xs text-red-600" role="alert">{validation.errors.maxDepth}</p>}
        </div>
      </div>

      <button type="button" onClick={onAdvanced}
        className="flex min-h-12 w-full items-center justify-between rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-zinc-700 dark:text-zinc-200">
        <span className="flex items-center gap-2"><SlidersHorizontal aria-hidden="true" className="h-4 w-4" /> Advanced settings</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4" />
      </button>

      <div className="rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
        <div className="mb-1 flex items-center gap-2 font-semibold text-zinc-800 dark:text-zinc-200">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-teal-700" /> {isCrawling ? 'Crawl in progress' : 'Ready to crawl'}
        </div>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          {mode === 'single' ? 'Single page only' : `Up to ${maxPages} pages, depth ${maxDepth}`}
          {validation.targetCount > 1 ? `, across ${validation.targetCount} seed URLs` : ''}.
          Actual pages may be fewer than the limit.
          {attachedFileCount > 0 && ' Attached URL files are also included.'}
        </p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      {isCrawling ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onShowResults}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 text-sm font-semibold text-white">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Results <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
          <button type="button" onClick={onStop}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-red-300 px-3 text-sm font-semibold text-red-700 dark:text-red-400">
            <Square aria-hidden="true" className="h-4 w-4" /> Stop
          </button>
        </div>
      ) : (
        <button type="submit" disabled={!canStart}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-base font-semibold text-white transition-colors active:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2">
          <Play aria-hidden="true" className="h-5 w-5" /> Start Crawl
        </button>
      )}
    </form>
  );
}
