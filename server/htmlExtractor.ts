import axios from 'axios';
import * as cheerio from 'cheerio';
import dns from 'dns/promises';
import TurndownService from 'turndown';
// @ts-ignore
import { gfm } from 'turndown-plugin-gfm';
import puppeteer, { Browser } from 'puppeteer';

function isRestrictedIP(ip: string): boolean {
  const ipv4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ipv4)) {
    const parts = ipv4.split('.').map(Number);
    const [a, b] = parts;
    if (a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0) {
      return true;
    }
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }
  return false;
}

async function assertSafeUrl(u: string): Promise<void> {
  const parsed = new URL(u);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }
  if (isRestrictedIP(parsed.hostname)) {
    throw new Error(`Restricted IP target: ${parsed.hostname}`);
  }
  const records = await dns.lookup(parsed.hostname, { all: true });
  for (const r of records) {
    if (isRestrictedIP(r.address)) {
      throw new Error(`Restricted resolved IP: ${r.address} for host ${parsed.hostname}`);
    }
  }
}

// Global shared browser instance with lazy instantiation and graceful error recovery
let globalBrowser: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

async function getHeadlessBrowser(): Promise<Browser> {
  if (globalBrowser && (globalBrowser as any).connected) {
    return globalBrowser;
  }
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = (async () => {
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-zygote',
          '--single-process',
          '--disable-extensions',
          '--disable-accelerated-2d-canvas'
        ]
      });
      globalBrowser = browser;
      browser.on('disconnected', () => {
        globalBrowser = null;
        browserLaunchPromise = null;
      });
      return browser;
    } catch (err) {
      browserLaunchPromise = null;
      throw err;
    }
  })();

  return browserLaunchPromise;
}

// Configured Turndown service for converting HTML into clean GitHub-Flavored Markdown
function createTurndownService(): TurndownService {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*'
  });

  // Enable GFM plugin (tables, task lists, strikethrough)
  try {
    turndownService.use(gfm);
  } catch (e) {
    console.warn('[TURNDOWN_GFM] Plugin warning:', e);
  }

  // Custom rule to retain code languages on <pre><code class="language-xyz">
  turndownService.addRule('fencedCodeBlockWithLang', {
    filter: (node) => {
      return (
        node.nodeName === 'PRE' &&
        node.firstChild !== null &&
        node.firstChild.nodeName === 'CODE'
      );
    },
    replacement: (_content, node) => {
      const codeNode = node.firstChild as HTMLElement;
      const className = codeNode.getAttribute('class') || '';
      const langMatch = className.match(/(?:language|lang)-([a-zA-Z0-9_-]+)/i);
      const language = langMatch ? langMatch[1] : '';
      const text = codeNode.textContent || '';
      return `\n\n\`\`\`${language}\n${text.replace(/\n+$/, '')}\n\`\`\`\n\n`;
    }
  });

  return turndownService;
}

const turndown = createTurndownService();

export interface CleanedContentResult {
  markdown: string;
  plainText: string;
  title: string;
  headings: { level: number; text: string }[];
  tablesCount: number;
  codeBlocksCount: number;
  contentCategory: string;
  isSpaRendered?: boolean;
}

/**
 * Strips boilerplate (nav, header, footer, ads, modals, cookie dialogs)
 * Targets primary content containers (<main>, <article>, [role="main"], etc.)
 * Converts to structured GitHub-Flavored Markdown preserving headings, code fences, and tables.
 */
export function cleanAndExtractStructuredContent(html: string, pageUrl: string = ''): CleanedContentResult {
  if (!html || typeof html !== 'string') {
    return {
      markdown: '',
      plainText: '',
      title: '',
      headings: [],
      tablesCount: 0,
      codeBlocksCount: 0,
      contentCategory: 'Text'
    };
  }

  const $ = cheerio.load(html);

  // 1. Extract Page Title
  const title = (
    $('title').first().text() ||
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text() ||
    ''
  ).trim();

  // 2. Unconditional Noise Removal
  $(
    'script, style, noscript, iframe, svg, canvas, embed, object, param, template'
  ).remove();

  // 3. Boilerplate Chrome & Navigation Removal
  $(
    'header, nav, footer, aside, menu, dialog, ' +
    '[role="banner"], [role="navigation"], [role="complementary"], [role="contentinfo"], ' +
    '[role="search"], [role="dialog"], [role="alertdialog"], ' +
    // Cookie & Consent Banners
    '#cookie-banner, #cookie-consent, #onetrust-consent-sdk, #CybotCookiebotDialog, ' +
    '.cookie-notice, .cookie-banner, .gdpr-banner, .consent-banner, ' +
    // Modals, Overlays & Popups
    '.modal, .modal-backdrop, .overlay, .popup, .newsletter-popup, .newsletter-signup, ' +
    // Chrome Navigation & Utilities
    '.site-header, .site-footer, .global-nav, .top-nav, .sidebar-nav, .breadcrumbs, .pagination, ' +
    '.social-share, .share-buttons, .author-bio, .advertisement, .ad, .ads, .ad-banner'
  ).remove();

  // 4. Primary Content Targeting
  // Look for semantic main content containers with substantive text
  const candidateSelectors = [
    'main',
    'article',
    '[role="main"]',
    '#main-content',
    '#content',
    '.main-content',
    '.article-content',
    '.post-content',
    '.entry-content',
    '.documentation-content',
    '.docs-content',
    '.markdown-body',
    '.content-area',
    '.page-content',
    '#main'
  ];

  let selectedContainer: cheerio.Cheerio<any> | null = null;
  let maxTextLength = 0;

  for (const selector of candidateSelectors) {
    const candidate = $(selector);
    if (candidate.length > 0) {
      const textLen = candidate.text().replace(/\s+/g, ' ').trim().length;
      if (textLen > maxTextLength) {
        maxTextLength = textLen;
        selectedContainer = candidate.first();
      }
    }
  }

  // Fallback to <body> if no suitable container has > 120 chars
  const targetElement = (selectedContainer && maxTextLength > 120) ? selectedContainer : $('body');

  // Count tables and code blocks for telemetry
  const tablesCount = targetElement.find('table').length;
  const codeBlocksCount = targetElement.find('pre, code').length;

  // Extract hierarchical headings from content
  const headings: { level: number; text: string }[] = [];
  targetElement.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tagName = el.tagName.toLowerCase();
    const level = parseInt(tagName.replace('h', '')) || 1;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text) {
      headings.push({ level, text });
    }
  });

  // Convert relative URLs to absolute if pageUrl is given
  if (pageUrl) {
    try {
      targetElement.find('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:')) {
          try {
            const absolute = new URL(href, pageUrl).toString();
            $(el).attr('href', absolute);
          } catch {}
        }
      });
      targetElement.find('img[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src && !src.startsWith('data:')) {
          try {
            const absolute = new URL(src, pageUrl).toString();
            $(el).attr('src', absolute);
          } catch {}
        }
      });
    } catch {}
  }

  // Get raw inner HTML of target
  const containerHtml = targetElement.html() || '';

  // 5. Convert to clean Structured Markdown
  let markdown = '';
  try {
    markdown = turndown.turndown(containerHtml);
    // Normalize excessive multiple newlines (keep max 2 newlines)
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
  } catch (err) {
    // Graceful fallback to formatted text if Turndown encounters malformed markup
    markdown = targetElement.text().replace(/\s+/g, ' ').trim();
  }

  const plainText = targetElement.text().replace(/\s+/g, ' ').trim();

  return {
    markdown,
    plainText,
    title,
    headings,
    tablesCount,
    codeBlocksCount,
    contentCategory: tablesCount > 0 || codeBlocksCount > 0 ? 'Documentation/Code' : 'Article'
  };
}

/**
 * Follows HTTP 3xx redirects, HTML meta-refresh tags, and JS client-side redirects
 * ensuring the crawler extracts the actual destination rather than "Redirecting to..." stubs.
 */
export async function resolveAndFetchUrl(
  initialUrl: string,
  options: {
    headers?: Record<string, string>;
    timeout?: number;
    maxHops?: number;
  } = {}
): Promise<{
  data: any;
  finalUrl: string;
  status: number;
  headers: Record<string, any>;
  redirectCount: number;
}> {
  let currentUrl = initialUrl;
  const maxHops = options.maxHops || 6;
  let hops = 0;
  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml,application/json,text/plain;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    ...options.headers
  };

  while (hops < maxHops) {
    await assertSafeUrl(currentUrl);
    const res = await axios(currentUrl, {
      headers: defaultHeaders,
      timeout: options.timeout || 12000,
      maxRedirects: 0,
      validateStatus: () => true
    });

    const status = res.status;

    // 1. Follow HTTP 301, 302, 303, 307, 308 manually if not already followed
    if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
      hops++;
      const nextUrl = new URL(res.headers.location, currentUrl).toString();
      console.log(`[REDIRECT_RESOLVER] Following HTTP ${status} to: ${nextUrl}`);
      currentUrl = nextUrl;
      continue;
    }

    // Determine final URL from axios if available
    const axiosFinalUrl = (res.request as any)?.res?.responseUrl;
    if (axiosFinalUrl && axiosFinalUrl !== currentUrl) {
      currentUrl = axiosFinalUrl;
    }

    // 2. Check for HTML Meta Refresh or Client-Side JS Redirects
    const contentType = String(res.headers['content-type'] || '');
    if (contentType.includes('text/html') && typeof res.data === 'string') {
      const html = res.data;

      // Meta refresh: <meta http-equiv="refresh" content="0; url=https://example.com/dest">
      const metaRefreshMatch = html.match(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?[0-9]*;\s*url=([^"'>\s]+)["']?/i);
      if (metaRefreshMatch && metaRefreshMatch[1]) {
        hops++;
        const target = metaRefreshMatch[1].replace(/^url=/i, '').trim();
        const nextUrl = new URL(target, currentUrl).toString();
        if (nextUrl !== currentUrl) {
          console.log(`[REDIRECT_RESOLVER] Following Meta Refresh redirect to: ${nextUrl}`);
          currentUrl = nextUrl;
          continue;
        }
      }

      // JavaScript window.location or location.replace redirects in short stub pages (< 2000 chars)
      if (html.length < 2500) {
        const jsRedirectMatch = html.match(/(?:window\.)?location(?:\.href|\.replace)?\s*=\s*['"]([^'"]+)['"]/i) ||
                                html.match(/location\.assign\(['"]([^'"]+)['"]\)/i) ||
                                html.match(/Redirecting to\s*<a[^>]*href=["']([^"']+)["']/i);
        if (jsRedirectMatch && jsRedirectMatch[1]) {
          hops++;
          const target = jsRedirectMatch[1].trim();
          try {
            const nextUrl = new URL(target, currentUrl).toString();
            if (nextUrl !== currentUrl) {
              console.log(`[REDIRECT_RESOLVER] Following Client-side JS redirect to: ${nextUrl}`);
              currentUrl = nextUrl;
              continue;
            }
          } catch {}
        }
      }
    }

    // No further redirects found, return final response
    return {
      data: res.data,
      finalUrl: currentUrl,
      status: res.status,
      headers: res.headers,
      redirectCount: hops
    };
  }

  // Fallback after exceeding hops
  return {
    data: '',
    finalUrl: currentUrl,
    status: 310,
    headers: {},
    redirectCount: hops
  };
}

/**
 * Headless Browser (Puppeteer) Rendering for Single Page Applications (SPAs)
 * and Client-Side Hydrated websites (React, Vue, Angular, Svelte, Next.js).
 * Waits for network idle and hydration to ensure dynamic data tables & tab state are rendered.
 */
export async function renderWithHeadlessBrowser(
  url: string,
  options: {
    timeout?: number;
    waitForSelector?: string;
    settleWaitMs?: number;
  } = {}
): Promise<{
  html: string;
  finalUrl: string;
  status: number;
}> {
  const browser = await getHeadlessBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    // Block heavy video and font assets to optimize execution speed
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'media', 'font'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    let navResponse: any = null;
    const timeout = options.timeout || 16000;

    try {
      navResponse = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout
      });
    } catch (e: any) {
      console.warn(`[PUPPETEER_NAV] networkidle2 timed out for ${url}, continuing with loaded DOM...`);
    }

    // Wait for target selector if specified
    if (options.waitForSelector) {
      try {
        await page.waitForSelector(options.waitForSelector, { timeout: 4000 });
      } catch {}
    } else {
      // Automatic SPA hydration detection:
      // If common SPA root elements exist, give a brief moment for hydration
      try {
        await page.waitForFunction(
          () => {
            const body = document.body;
            if (!body) return false;
            const text = body.innerText || '';
            const isPlaceholder = text.includes('Loading...') || text.includes('Please wait') || text.trim().length < 50;
            return !isPlaceholder;
          },
          { timeout: 3500 }
        );
      } catch {}
    }

    if (options.settleWaitMs) {
      await new Promise(r => setTimeout(r, options.settleWaitMs));
    }

    const finalUrl = page.url();
    const html = await page.content();
    const status = navResponse ? navResponse.status() : 200;

    return {
      html,
      finalUrl,
      status
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Checks if an HTML string indicates a Single Page Application or unhydrated CSR shell
 */
export function isClientSideSpaShell(html: string): boolean {
  if (!html || typeof html !== 'string') return false;
  
  // Common SPA container patterns with little or no pre-rendered inner text
  const hasSpaRoot = /<div[^>]+id=["'](?:root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i.test(html) ||
                     /<app-root>\s*<\/app-root>/i.test(html);
  
  const hasSpaNotice = html.includes('You need to enable JavaScript to run this app') ||
                       html.includes('JavaScript is required to use this') ||
                       html.includes('Loading...') && html.length < 3000;

  // Very short body with multiple script bundles
  const scriptCount = (html.match(/<script/gi) || []).length;
  const isMinimalHtml = html.length < 1500 && scriptCount >= 2;

  return hasSpaRoot || hasSpaNotice || isMinimalHtml;
}

/**
 * Unified high-level extractor function:
 * 1. Follows all redirects (HTTP + Meta Refresh + Client-side JS)
 * 2. Detects SPAs / CSR shells and uses headless browser rendering when needed
 * 3. Overhauls boilerplate (strips nav, footer, headers, ads, overlays, targeting main content)
 * 4. Formats clean, structured Markdown preserving headings, code fences, and tables
 * 5. Returns full text without arbitrary character truncation
 */
export async function smartExtractPageContent(
  url: string,
  options: {
    forceHeadless?: boolean;
    customHeaders?: Record<string, string>;
  } = {}
): Promise<{
  url: string;
  finalUrl: string;
  statusCode: number;
  markdown: string;
  plainText: string;
  title: string;
  headings: { level: number; text: string }[];
  tablesCount: number;
  codeBlocksCount: number;
  isSpaRendered: boolean;
  category: string;
}> {
  let effectiveHtml = '';
  let finalUrl = url;
  let statusCode = 200;
  let isSpaRendered = false;

  if (options.forceHeadless) {
    try {
      console.log(`[SMART_EXTRACT] Using Headless Browser for: ${url}`);
      const rendered = await renderWithHeadlessBrowser(url);
      effectiveHtml = rendered.html;
      finalUrl = rendered.finalUrl;
      statusCode = rendered.status;
      isSpaRendered = true;
    } catch (headlessErr: any) {
      console.warn(`[SMART_EXTRACT] Headless rendering fallback for ${url}:`, headlessErr.message);
    }
  }

  // If not forced or if headless failed, resolve via HTTP redirect resolver
  if (!effectiveHtml) {
    const resolved = await resolveAndFetchUrl(url, { headers: options.customHeaders });
    effectiveHtml = typeof resolved.data === 'string' ? resolved.data : JSON.stringify(resolved.data);
    finalUrl = resolved.finalUrl;
    statusCode = resolved.status;

    // Check if the returned HTML is an unhydrated SPA shell
    if (isClientSideSpaShell(effectiveHtml)) {
      console.log(`[SMART_EXTRACT] Detected SPA / CSR shell for ${finalUrl}. Elevating to Headless Browser...`);
      try {
        const rendered = await renderWithHeadlessBrowser(finalUrl);
        effectiveHtml = rendered.html;
        finalUrl = rendered.finalUrl;
        statusCode = rendered.status;
        isSpaRendered = true;
      } catch (spaErr: any) {
        console.warn(`[SMART_EXTRACT] SPA Headless elevation failed for ${finalUrl}:`, spaErr.message);
      }
    }
  }

  // Clean boilerplate, target primary content, and convert to structured Markdown
  const cleaned = cleanAndExtractStructuredContent(effectiveHtml, finalUrl);

  return {
    url,
    finalUrl,
    statusCode,
    markdown: cleaned.markdown,
    plainText: cleaned.plainText,
    title: cleaned.title,
    headings: cleaned.headings,
    tablesCount: cleaned.tablesCount,
    codeBlocksCount: cleaned.codeBlocksCount,
    isSpaRendered,
    category: cleaned.contentCategory
  };
}
