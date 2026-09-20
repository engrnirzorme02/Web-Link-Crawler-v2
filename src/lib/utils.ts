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
// Always returns a clean, valid URL starting with http:// or https://.
export function cleanAndSanitizeUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let str = String(rawUrl).trim();

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

export function truncateForFirestore(data: any): any {
  const jsonStr = JSON.stringify(data);
  const size = new Blob([jsonStr]).size;
  
  // Firestore hard limit per document is 1,048,576 bytes (1 MiB).
  // If data is under 900KB, keep 100% of all items without any truncation!
  if (size < 900000) {
    return data;
  }
  
  // If document exceeds 900KB, create a copy and perform progressive trimming
  let truncated = JSON.parse(jsonStr);

  // 1. First trim large text/content bodies in results (e.g. raw HTML or large dumps)
  if (truncated.results && Array.isArray(truncated.results)) {
    truncated.results = truncated.results.map((r: any) => {
      if (typeof r === 'string') return r;
      const copy = { ...r };
      if (copy && typeof copy.content === 'string' && copy.content.length > 2000) {
        copy.content = copy.content.substring(0, 2000) + '... (truncated for storage)';
      }
      if (copy && typeof copy.text === 'string' && copy.text.length > 2000) {
        copy.text = copy.text.substring(0, 2000) + '... (truncated for storage)';
      }
      return copy;
    });
  }

  // Check size again after trimming huge text
  let recheckSize = new Blob([JSON.stringify(truncated)]).size;
  if (recheckSize < 900000) {
    return truncated;
  }

  // 2. Trim excess logs
  if (truncated.logs && Array.isArray(truncated.logs)) {
    if (truncated.logs.length > 200) {
      truncated.logs = truncated.logs.slice(-200);
    }
  }

  // 3. Trim AI chat messages
  if (truncated.messages && Array.isArray(truncated.messages)) {
    if (truncated.messages.length > 100) {
      truncated.messages = truncated.messages.slice(-100);
    }
  }

  // 4. Only if still exceeding 900KB, progressively reduce results up to thousands of clean URLs
  if (truncated.results && Array.isArray(truncated.results)) {
    while (truncated.results.length > 200 && new Blob([JSON.stringify(truncated)]).size >= 900000) {
      truncated.results = truncated.results.slice(0, Math.floor(truncated.results.length * 0.8));
    }
  }
  
  return truncated;
}
