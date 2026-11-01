export type CrawlScope = 'single' | 'subdir' | 'domain';

export interface CrawlSetupValues {
  url: string;
  mode: CrawlScope;
  maxPages: string;
  maxDepth: string;
}

export interface CrawlSetupValidation {
  valid: boolean;
  errors: Partial<Record<'url' | 'maxPages' | 'maxDepth', string>>;
  targetCount: number;
}

/**
 * Client-side UX validation only: the server remains responsible for
 * access control, URL safety, resource limits and crawl boundaries.
 * Matches the existing crawler's whitespace-delimited seed URL input.
 */
export function validateCrawlSetup(values: CrawlSetupValues): CrawlSetupValidation {
  const errors: CrawlSetupValidation['errors'] = {};
  const targets = values.url.trim().split(/\s+/).filter(Boolean);

  if (targets.length === 0) {
    errors.url = 'Enter at least one website URL.';
  } else {
    const invalidTarget = targets.find((target) => {
      try {
        const normalized = /^https?:\/\//i.test(target) ? target : `https://${target}`;
        const parsed = new URL(normalized);
        return !['http:', 'https:'].includes(parsed.protocol) ||
          !parsed.hostname || Boolean(parsed.username || parsed.password);
      } catch {
        return true;
      }
    });
    if (invalidTarget) errors.url = 'Use a valid HTTP or HTTPS website URL without credentials.';
  }

  const pages = Number(values.maxPages);
  if (!Number.isSafeInteger(pages) || pages < 1 || pages > 10000) {
    errors.maxPages = 'Enter a page limit from 1 to 10,000.';
  }

  const depth = Number(values.maxDepth);
  const minDepth = values.mode === 'single' ? 0 : 1;
  if (!Number.isSafeInteger(depth) || depth < minDepth || depth > 10) {
    errors.maxDepth = values.mode === 'single'
      ? 'Single page uses depth 0.'
      : 'Enter a depth from 1 to 10.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    targetCount: targets.length
  };
}
