import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getMillis = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  if (typeof ts.getTime === 'function') return ts.getTime();
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (typeof ts === 'number') return ts;
  return 0;
};

// Thoroughly sanitizes and cleans a single raw URL or markdown/bracketed string,
// stripping markdown brackets [..](..), trailing punctuation, quotes, entity codes, etc.
export function cleanAndSanitizeUrl(rawUrl: any): string {
  if (!rawUrl) return '';
  let str = '';
  if (typeof rawUrl === 'string') {
    str = rawUrl.trim();
  } else if (rawUrl && typeof rawUrl === 'object') {
    str = String(rawUrl.url || rawUrl.link || rawUrl.href || '').trim();
    if (!str) return '';
  } else {
    str = String(rawUrl).trim();
  }

  // 1. Detect Markdown link syntax: [label](https://...) or [label](http://...)
  const mdMatch = str.match(/\[.*?\]\(\s*(https?:\/\/[^\s\)\"\'>]+)\s*\)/i);
  if (mdMatch) {
    str = mdMatch[1];
  } else {
    // 2. Detect [https://...] or [http://...]
    const bracketMatch = str.match(/\[\s*(https?:\/\/[^\s\]\"\'>]+)\s*\]/i);
    if (bracketMatch) {
      str = bracketMatch[1];
    } else {
      // 3. Detect (https://...)
      const parenMatch = str.match(/\(\s*(https?:\/\/[^\s\)\"\'>]+)\s*\)/i);
      if (parenMatch) {
        str = parenMatch[1];
      } else {
        // Strip leading numbered list / bullet prefixes like "1. ", "1) ", "- ", "* "
        str = str.replace(/^[\d+\.\-\*\)\s]+/, '');
        // Find where http(s) begins if preceded by text or labels
        const httpIdx = str.search(/https?:\/\//i);
        if (httpIdx !== -1) {
          str = str.substring(httpIdx);
        }
      }
    }
  }

  // Multi-pass HTML Entity Decoding (handles deeply nested encoding like &amp;amp;quot;)
  for (let pass = 0; pass < 5; pass++) {
    if (!str.includes('&')) break;
    const prev = str;
    str = str
      .replace(/&quot;/gi, '"')
      .replace(/&#0*34;/g, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#0*39;/g, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&#0*60;/g, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#0*62;/g, '>')
      .replace(/&amp;/gi, '&');
    if (str === prev) break;
  }

  // Decode URI encoded quotes / braces
  try {
    str = str.replace(/%22/gi, '"').replace(/%27/gi, "'").replace(/%7B/gi, '{').replace(/%7D/gi, '}');
  } catch (e) {}

  // Strip leading punctuation/brackets/quotes: <, (, [, ", ', {
  str = str.replace(/^[<(\["'{\s]+/, '');

  // Truncate at first delimiter or invalid URL boundary (quotes, whitespace, brackets, JSON chars)
  const match = str.match(/^([^"'\s<>{}\[\]\\]+)/);
  if (match) {
    str = match[1];
  }

  // If there are lingering JSON or markdown artifacts
  const cutIndices = [
    str.indexOf('",'),
    str.indexOf('"{'),
    str.indexOf('"}'),
    str.indexOf(',"'),
    str.indexOf('&quot;'),
    str.indexOf('](')
  ].filter(idx => idx !== -1);

  if (cutIndices.length > 0) {
    const minCut = Math.min(...cutIndices);
    str = str.substring(0, minCut);
  }

  // Strip trailing punctuation & delimiters: ) ] } > , ; : " ' . ? &
  str = str.replace(/[)\]}>,;:"'\\.]+$/, '');
  str = str.replace(/[?&]+$/, '');

  // Must start with http:// or https:// and have a valid host
  if (!/^https?:\/\/[a-zA-Z0-9]/i.test(str)) {
    return '';
  }

  return str.trim();
}

/**
 * Extracts and sanitizes ALL valid HTTP/HTTPS URLs from any arbitrary text block
 * (including Markdown, HTML, JSON, CSV, plain text, numbered lists, etc.)
 */
export function extractCleanUrlsFromText(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 1. Check for markdown links: [label](url)
    const mdRegex = /\[.*?\]\(\s*(https?:\/\/[^\s\)\"\'>]+)\s*\)/gi;
    let mdMatch;
    let lineHasMd = false;
    while ((mdMatch = mdRegex.exec(trimmed)) !== null) {
      const clean = cleanAndSanitizeUrl(mdMatch[1]);
      if (clean) {
        found.push(clean);
        lineHasMd = true;
      }
    }

    if (!lineHasMd) {
      // 2. Standard URL extraction
      const rawRegex = /(https?:\/\/[^\s"'<>\]\[\)\{\}]+)/gi;
      const matches = trimmed.match(rawRegex);
      if (matches) {
        for (const m of matches) {
          const clean = cleanAndSanitizeUrl(m);
          if (clean) found.push(clean);
        }
      } else {
        // 3. Line without protocol: e.g. www.example.com or domain.com/page
        if (/^(?:www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})[^\s]*$/i.test(trimmed)) {
          const clean = cleanAndSanitizeUrl('https://' + trimmed);
          if (clean) found.push(clean);
        }
      }
    }
  }

  // Return unique, ordered clean URLs
  return Array.from(new Set(found));
}

function getByteSize(str: string): number {
  try {
    if (typeof Blob !== 'undefined') {
      return new Blob([str]).size;
    }
  } catch {}
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.byteLength(str, 'utf8');
  }
  return str.length;
}

export function truncateForFirestore(data: any): any {
  if (!data || typeof data !== 'object') return data;
  
  const jsonStr = JSON.stringify(data);
  const size = getByteSize(jsonStr);
  
  // Under 900KB -> keep 100% untouched
  if (size < 900000) {
    return data;
  }
  
  // Clone object
  let truncated = JSON.parse(jsonStr);

  // 1. Trim verbose runtime logs first (keep last 30 logs)
  if (truncated.logs && Array.isArray(truncated.logs) && truncated.logs.length > 30) {
    truncated.logs = truncated.logs.slice(-30);
  }
  if (getByteSize(JSON.stringify(truncated)) < 900000) return truncated;

  // 2. Proportionally trim large content / text / markdown fields in results WITHOUT dropping items
  if (truncated.results && Array.isArray(truncated.results)) {
    const totalResults = truncated.results.length;
    // Calculate adaptive per-item content length cap so ALL items fit
    const adaptiveCap = Math.max(1200, Math.floor(750000 / Math.max(1, totalResults)));

    truncated.results = truncated.results.map((r: any) => {
      if (typeof r === 'string') return r;
      if (!r || typeof r !== 'object') return r;
      const item = { ...r };
      
      const fieldsToTrim = ['content', 'text', 'markdown', 'html', 'plainText'];
      for (const field of fieldsToTrim) {
        if (typeof item[field] === 'string' && item[field].length > adaptiveCap) {
          item[field] = item[field].substring(0, adaptiveCap) + '\n\n[truncated for storage]';
          item.isTruncatedForStorage = true;
        }
      }
      return item;
    });
  }
  if (getByteSize(JSON.stringify(truncated)) < 900000) return truncated;

  // 3. Second pass if still over 900KB: tighter trim on content without dropping any URLs/items
  if (truncated.results && Array.isArray(truncated.results)) {
    const tightCap = Math.max(400, Math.floor(500000 / Math.max(1, truncated.results.length)));
    truncated.results = truncated.results.map((r: any) => {
      if (typeof r === 'string') return r;
      if (!r || typeof r !== 'object') return r;
      const item = { ...r };
      const fieldsToTrim = ['content', 'text', 'markdown', 'html', 'plainText'];
      for (const field of fieldsToTrim) {
        if (typeof item[field] === 'string' && item[field].length > tightCap) {
          item[field] = item[field].substring(0, tightCap) + '\n\n[truncated for storage]';
          item.isTruncatedForStorage = true;
        }
      }
      return item;
    });
  }

  return truncated;
}

/**
 * Safely extracts hostname from any raw, partial, multiline, or unformatted URL string
 * without throwing TypeError: Invalid URL.
 */
export function extractSafeHostname(rawUrl: string, fallback = ''): string {
  if (!rawUrl || typeof rawUrl !== 'string') return fallback;
  const first = rawUrl.split('\n')[0].trim();
  if (!first) return fallback;
  try {
    const formatted = first.startsWith('http://') || first.startsWith('https://')
      ? first
      : `https://${first}`;
    const parsed = new URL(formatted);
    return parsed.hostname || fallback;
  } catch {
    // Fallback: strip protocol and extract domain/path root safely
    const clean = first.replace(/^[a-z]+:\/\//i, '').split('/')[0].split('?')[0].trim();
    return clean.slice(0, 50) || fallback;
  }
}

