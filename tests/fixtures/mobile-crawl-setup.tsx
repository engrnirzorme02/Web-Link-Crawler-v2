import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { CrawlSetupForm } from '../../src/components/CrawlSetupForm';
import type { CrawlScope } from '../../src/lib/crawlSetup';
import { resolveCrawlPreset } from '../../src/lib/crawlSetup';

function Fixture() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<CrawlScope>('domain');
  const [maxPages, setMaxPages] = useState('50');
  const [maxDepth, setMaxDepth] = useState('2');
  const [advanced, setAdvanced] = useState(false);
  const [started, setStarted] = useState(false);

  const changeMode = (next: CrawlScope) => {
    const preset = resolveCrawlPreset(next === 'subdir' ? 'depth' : next, maxDepth);
    setMode(preset.mode);
    setMaxDepth(preset.maxDepth);
  };

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[440px] bg-white p-4 dark:bg-zinc-900">
      {advanced ? (
        <button className="min-h-12 rounded-xl border px-4" onClick={() => setAdvanced(false)}>
          Simple setup
        </button>
      ) : (
        <CrawlSetupForm
          url={url}
          mode={mode}
          maxPages={maxPages}
          maxDepth={maxDepth}
          isCrawling={started}
          onUrlChange={setUrl}
          onModeChange={changeMode}
          onPagesChange={setMaxPages}
          onDepthChange={setMaxDepth}
          onAdvanced={() => setAdvanced(true)}
          onStart={() => setStarted(true)}
          onStop={() => setStarted(false)}
          onShowResults={() => undefined}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
