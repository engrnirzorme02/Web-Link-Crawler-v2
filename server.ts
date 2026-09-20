import express from 'express';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import { GoogleGenAI } from '@google/genai';
import https from 'https';

// Lazy-initialize Gemini SDK to prevent startup crashes when GEMINI_API_KEY is not immediately provided
let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY || '';
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Resolve Vertex AI redirect links to actual URLs
function resolveRedirect(url: string): Promise<string> {
  return new Promise((resolve) => {
    if (!url.includes('vertexaisearch')) {
      return resolve(url);
    }
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(res.headers.location);
      } else {
        resolve(url);
      }
      res.resume(); // Consume data to free memory
    }).on('error', () => resolve(url));
    req.end();
  });
}

// Exponential Backoff Axios Wrapper for Server-side Crawling Tasks
async function axiosWithRetry(url: string, config: any = {}, maxRetries = 3, initialDelayMs = 800): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      const startTime = Date.now();
      const response = await axios(url, config);
      const duration = Date.now() - startTime;
      console.log(`[CRAWL_SERVER_LOG] HTTP ${response.status} ${config.method || 'GET'} ${url} (${duration}ms)`);
      if ([429, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
        attempt++;
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200, 8000);
        console.warn(`[CRAWL_SERVER_LOG] Received HTTP ${response.status} from ${url}. Retrying in ${Math.round(delay)}ms (Attempt ${attempt}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return response;
    } catch (error: any) {
      attempt++;
      const statusCode = error.response?.status || 'NETWORK_ERROR';
      console.error(`[CRAWL_SERVER_LOG] Error fetching ${url} - Status: ${statusCode}, Message: ${error.message} (Attempt ${attempt}/${maxRetries + 1})`);
      if (attempt > maxRetries) {
        throw error;
      }
      const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200, 8000);
      console.warn(`[CRAWL_SERVER_LOG] Retrying ${url} in ${Math.round(delay)}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function generateContentWithFallback(aiInstance: GoogleGenAI, params: any): Promise<any> {
  const modelsToTry = [
    'gemini-2.5-flash',
    'gemini-2.0-flash'
  ];
  
  let lastError;
  for (const model of modelsToTry) {
    try {
      const result = await aiInstance.models.generateContent({
        ...params,
        model: model
      });
      return result;
    } catch (err: any) {
      console.error(`Model ${model} failed in fallback wrapper:`, err.message || JSON.stringify(err));
      lastError = err;
      const isRateLimit = err.status === 429 || (err.message && err.message.includes('429')) || (err.message && err.message.includes('Quota exceeded')) || (err.message && err.message.includes('RESOURCE_EXHAUSTED'));
      if (isRateLimit) {
         console.log(`Rate limit hit on ${model}, falling back to next model immediately...`);
      }
    }
  }
  throw lastError || new Error('All fallback models failed.');
}

function isUrlDomainAllowed(candidateUrl: string, startDomain: string, includeDomainsList: string[] = []): boolean {
  try {
    const parsed = new URL(candidateUrl);
    const host = parsed.hostname.toLowerCase();
    
    // Ignore common external / global platforms unless explicitly targeted
    const globalBlocklist = ['facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'google.com', 'github.com', 'pinterest.com', 'tiktok.com', 'reddit.com', 't.co', 'bit.ly', 'doubleclick.net', 'googletagmanager.com', 'google-analytics.com'];
    
    const isTargetingGlobal = (startDomain && globalBlocklist.some(b => startDomain === b || startDomain.endsWith('.' + b))) ||
      includeDomainsList.some(d => globalBlocklist.some(b => d === b || d.endsWith('.' + b)));
      
    if (!isTargetingGlobal) {
      if (globalBlocklist.some(b => host === b || host.endsWith('.' + b))) {
        return false;
      }
    }

    if (includeDomainsList.length > 0) {
      return includeDomainsList.some(d => host === d || host.endsWith('.' + d));
    }
    
    return host === startDomain || host.endsWith('.' + startDomain);
  } catch (e) {
    return false;
  }
}

function validateAndScoreUrlWithInstruction(candidateUrl: string, startDomain: string, instruction: string, includeDomainsList: string[] = []): boolean {
  if (!isUrlDomainAllowed(candidateUrl, startDomain, includeDomainsList)) {
    return false;
  }

  try {
    const parsed = new URL(candidateUrl);
    const lowerPath = (parsed.pathname + parsed.search).toLowerCase();
    
    // Ignore static asset extensions & auth/junk paths
    if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|mp3|mp4|zip|gz)$/i.test(parsed.pathname)) {
      return false;
    }
    
    // Clean instruction tokens
    const stopWords = new Set(['find', 'all', 'the', 'links', 'link', 'about', 'a', 'an', 'for', 'in', 'on', 'page', 'pages', 'website', 'site', 'get', 'crawl', 'extract', 'show', 'list', 'me', 'with', 'from', 'to', 'of', 'and', 'or', 'only', 'relevant', 'urls', 'url']);
    const instructionTokens = (instruction || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-_]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !stopWords.has(t));

    // If instruction has specific keywords, check if URL path/slug matches at least one keyword or if path is a primary content path
    if (instructionTokens.length > 0) {
      const matchesKeyword = instructionTokens.some(token => lowerPath.includes(token));
      if (!matchesKeyword) {
        const isRoot = parsed.pathname === '/' || parsed.pathname === '';
        if (!isRoot) {
          // If the path contains slug separators and tokens don't match, check if any token matches host/subdomain
          const matchesHost = instructionTokens.some(token => parsed.hostname.toLowerCase().includes(token));
          if (!matchesHost) {
             return false;
          }
        }
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

function sanitizeAndDecodeUrl(rawHref: string): string {
  if (!rawHref) return '';
  let str = String(rawHref).trim();
  for (let pass = 0; pass < 10; pass++) {
    if (!str.includes('&') && !str.includes('&#')) break;
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
  try {
    str = str.replace(/%22/gi, '"').replace(/%27/gi, "'").replace(/%7B/gi, '{').replace(/%7D/gi, '}');
  } catch (e) {}

  const match = str.match(/^([^"'\s<>{}\[\]\\]+)/);
  if (match) str = match[1];

  const cutIndices = [
    str.indexOf('",'),
    str.indexOf('"{'),
    str.indexOf('"}'),
    str.indexOf(',"'),
    str.indexOf('&quot;')
  ].filter(idx => idx !== -1);

  if (cutIndices.length > 0) {
    const minCut = Math.min(...cutIndices);
    str = str.substring(0, minCut);
  }

  str = str.replace(/[,;:\\)\]\}&?]+$/, '');
  return str.trim();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Cloud Run and container health check endpoints
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API diagnostic request logger
  app.use('/api', (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[API_SERVER_LOG] ${req.method} ${req.originalUrl} -> Status ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // Chat Endpoint
  app.post('/api/chat', async (req, res) => {
    try {
      const { history, message, context, deepResearch, expertMode } = req.body;
      
      let systemInstruction = "You are an advanced Web Intelligence and Data Analysis assistant. You provide authentic answers with citations and sources. If the user asks for a list of links, ALWAYS output them in a code block at the very end of your response. While you specialize in analyzing the provided context payload, you are ALSO fully capable of general research, coding, and providing external knowledge. Do not artificially limit your capabilities.";
      
      if (deepResearch) {
        systemInstruction += "\n\nDEEP RESEARCH MODE: You have access to Google Search. When asked about 'Antigravity' or 'Google Antigravity', know that this refers to Google's agentic AI framework (often used in AI Studio / Project IDX). Ensure your search queries are highly specific so you don't return results about physical gravity or unrelated Android remote control tutorials. ALWAYS cite your sources using [1], [2] format inline.";
      }
      
      if (expertMode) {
        systemInstruction += "\n\nEXPERT MODE ACTIVE: Focus specifically on CLI tools, Developer documentation, technical API references, and code logic. Prioritize advanced developer-focused sources over general consumer content or introductory tutorials.";
      }

      if (context) {
        systemInstruction += `\n\nContext for this session (crawled data, URLs, etc.):\n${context}`;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Intent Extraction Pre-processing (Chain-of-Thought)
      if (deepResearch) {
         try {
            const intentCheck = await generateContentWithFallback(getAi(), {
               contents: [{ role: 'user', parts: [{ text: `Analyze this user request and determine its intent category: "Technical/CLI Guide", "General Research", or "Tool Usage". Request: "${message}"\nOutput ONLY the category name.` }] }]
            });
            const category = intentCheck.text?.trim() || "General Research";
            systemInstruction += `\n\n[SYSTEM DIRECTIVE - CHAIN OF THOUGHT INTENT PRE-EXTRACTION] This user request has been categorized as: ${category}. Ensure your search queries and synthesized response heavily align with this category type to avoid irrelevant results.`;
         } catch (e) {
            console.error("Intent extraction failed, continuing without it.", e);
         }
      }

      const contents = [];
      if (history && history.length > 0) {
        for (const msg of history) {
          contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] });
        }
      }
      contents.push({ role: 'user', parts: [{ text: message }] });

      const modelsToTry = deepResearch ? ["gemini-2.0-flash", "gemini-1.5-flash"] : ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
      const tools = deepResearch ? [{ googleSearch: {} }] : undefined;
      
      let success = false;
      let lastError: any = null;

      for (const modelToUse of modelsToTry) {
        try {
          const responseStream = await getAi().models.generateContentStream({
            model: modelToUse,
            contents,
            config: {
              systemInstruction,
              temperature: deepResearch ? 0.4 : 0.7,
              maxOutputTokens: 8192,
              tools: tools as any // Use tools if deepResearch is true
            }
          });

          let hasStarted = false;
          res.write(`data: ${JSON.stringify({ type: 'model_used', model: modelToUse, tokens: Math.round(contents.map(c => JSON.stringify(c)).join('').length / 4) })}\n\n`);
          
          let groundingMappingSent = false;

          for await (const chunk of responseStream) {
            hasStarted = true;

            // Handle grounding chunks if present and we haven't sent them yet
            const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (groundingChunks && groundingChunks.length > 0 && !groundingMappingSent) {
              groundingMappingSent = true;
              
              // Resolve all URLs asynchronously without blocking the stream
              Promise.all(groundingChunks.map(async (gc, index) => {
                if (gc.web?.uri) {
                  const realUrl = await resolveRedirect(gc.web.uri);
                  return { index, vertexUrl: gc.web.uri, realUrl, title: gc.web.title };
                }
                return null;
              })).then(resolved => {
                const validResolved = resolved.filter(Boolean);
                if (validResolved.length > 0) {
                   res.write(`data: ${JSON.stringify({ type: 'grounding_mapping', mappings: validResolved })}\n\n`);
                }
              }).catch(err => console.error('Failed to resolve grounding URLs:', err));
            }

            if (chunk.text) {
               res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
            }
          }
          
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          success = true;
          break; // Exit retry loop on success
        } catch (e: any) {
          lastError = e;
          console.error(`Model ${modelToUse} failed:`, e.message);
        }
      }

      if (!success) {
        res.write(`data: ${JSON.stringify({ error: lastError?.message || 'All models failed due to rate limits or errors.' })}\n\n`);
      }
      res.end();
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  });

  app.get('/api/subdomains', async (req, res) => {
    const domain = req.query.domain as string;
    if (!domain) return res.status(400).json({ error: 'Domain is required' });
    
    try {
      const subdomains = new Set<string>();

      // Try crt.sh first
      try {
          const crtShUrl = `https://crt.sh/?q=%25.${domain}&output=json`;
          const response = await axiosWithRetry(crtShUrl, { timeout: 10000 });
          
          if (response.data && Array.isArray(response.data)) {
            response.data.forEach((entry: any) => {
              if (entry.name_value) {
                 const names = entry.name_value.split('\n');
                 names.forEach((name: string) => {
                     name = name.trim().toLowerCase();
                     if (!name.startsWith('*') && name.endsWith(domain)) {
                         subdomains.add(name);
                     }
                 });
              }
            });
          }
      } catch (crtErr: any) {
          console.error('crt.sh failed, trying fallback:', crtErr.message);
          
          // Fallback to HackerTarget API
          try {
             const htUrl = `https://api.hackertarget.com/hostsearch/?q=${domain}`;
             const htRes = await axiosWithRetry(htUrl, { timeout: 10000 });
             if (htRes.data && typeof htRes.data === 'string') {
                 const lines = htRes.data.split('\n');
                 lines.forEach(line => {
                     const parts = line.split(',');
                     if (parts.length > 0 && parts[0].endsWith(domain)) {
                         subdomains.add(parts[0].trim().toLowerCase());
                     }
                 });
             }
          } catch(htErr: any) {
             console.error('HackerTarget failed too:', htErr.message);
          }
      }
      
      return res.json({ subdomains: Array.from(subdomains) });
    } catch (error: any) {
      console.error('Subdomain discovery error:', error.message);
      return res.status(500).json({ error: 'Failed to discover subdomains' });
    }
  });

  // SSE endpoint for crawling
  app.get('/api/crawl', async (req, res) => {
    const targetUrl = req.query.url as string;
    const mode = req.query.mode as 'single' | 'subdir' | 'domain';
    const maxPages = parseInt(req.query.maxPages as string) || 50;
    const maxDepth = parseInt(req.query.maxDepth as string) || 3;
    const maxBreadth = parseInt(req.query.maxBreadth as string) || 1000;
    const extractAll = req.query.extractAll === 'true';
    const fuzzPaths = req.query.fuzzPaths === 'true';
    const subdomainOnly = req.query.subdomainOnly !== 'false'; // true by default
    const verbose = req.query.verbose === 'true';
    
    const fileTypesRaw = (req.query.fileTypes as string) || '';
    const fileTypesList = fileTypesRaw.split(',').map(ext => ext.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);

    const includePatternsRaw = (req.query.includePatterns as string) || '';
    const includePatternsList = includePatternsRaw.split(',').map(p => p.trim()).filter(Boolean).map(p => new RegExp(p, 'i'));

    const excludePatternsRaw = (req.query.excludePatterns as string) || '';
    const excludePatternsList = excludePatternsRaw.split(',').map(p => p.trim()).filter(Boolean).map(p => new RegExp(p, 'i'));

    const excludeExtensionsRaw = (req.query.excludeExtensions as string) || '';
    const excludeExtensionsList = excludeExtensionsRaw.split(',').map(ext => ext.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);

    const excludePathsRaw = (req.query.excludePaths as string) || '';
    const excludePathsList = excludePathsRaw.split(',').map(p => p.trim()).filter(Boolean);

    const includeDomainsRaw = (req.query.includeDomains as string) || '';
    const includeDomainsList = includeDomainsRaw.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);

    const excludeDomainsRaw = (req.query.excludeDomains as string) || '';
    const excludeDomainsList = excludeDomainsRaw.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);

    const includePathPatternRaw = (req.query.includePathPattern as string) || '';
    const includePathPatternsList = includePathPatternRaw.split(',').map(p => p.trim()).filter(Boolean);

    const keywordFiltersRaw = (req.query.keywordFilters as string) || '';
    const keywordFiltersList = keywordFiltersRaw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!targetUrl) {
      res.write(`data: ${JSON.stringify({ error: 'URL is required' })}\n\n`);
      return res.end();
    }

    try {
      const parsedStartUrl = new URL(targetUrl);
      const startDomain = parsedStartUrl.hostname.toLowerCase();
      const baseDomain = startDomain.startsWith('www.') ? startDomain.slice(4) : startDomain;
      let startPath = parsedStartUrl.pathname;
      let cleanStartDir = startPath.endsWith('/') ? startPath.slice(0, -1) : startPath;

      // If start URL has a file name (e.g. /docs/index.html or /page.php), strip to its parent folder
      const lastSegment = cleanStartDir.split('/').pop() || '';
      if (lastSegment.includes('.') && !lastSegment.startsWith('.')) {
        const parts = cleanStartDir.split('/');
        parts.pop();
        cleanStartDir = parts.join('/') || '';
      }

      const isSubdirMatch = (urlPath: string) => {
        if (!cleanStartDir) return true; // root path /
        const decodedPath = decodeURIComponent(urlPath);
        const normalizedUrlPath = urlPath.endsWith('/') ? urlPath.slice(0, -1) : urlPath;
        const normalizedDecoded = decodedPath.endsWith('/') ? decodedPath.slice(0, -1) : decodedPath;

        // If user defined explicit includePathPatterns, test those as well
        if (includePathPatternsList.length > 0) {
          const matchesCustom = includePathPatternsList.some(pat => {
            if (pat.includes('*') || pat.includes('^') || pat.includes('$')) {
              try {
                const regex = new RegExp(pat.replace(/\*/g, '.*'), 'i');
                return regex.test(urlPath) || regex.test(decodedPath);
              } catch {
                return urlPath.includes(pat) || decodedPath.includes(pat);
              }
            }
            const cleanPat = pat.endsWith('/') ? pat.slice(0, -1) : pat;
            return urlPath.startsWith(cleanPat) || decodedPath.startsWith(cleanPat);
          });
          if (matchesCustom) return true;
        }

        return (
          normalizedUrlPath === cleanStartDir ||
          normalizedUrlPath.startsWith(cleanStartDir + '/') ||
          normalizedDecoded === cleanStartDir ||
          normalizedDecoded.startsWith(cleanStartDir + '/')
        );
      };

      const visited = new Set<string>();
      const toVisit = [{ url: targetUrl, depth: 0 }];
      const foundLinks = new Set<string>();
      let pagesCrawled = 0;
      let errorsCount = 0;

      let isClientConnected = true;
      req.on('close', () => {
        isClientConnected = false;
      });

      const heartbeat = setInterval(() => {
        if (isClientConnected) {
          res.write(':\n\n'); // SSE comment for keep-alive
        }
      }, 15000);

      const sendEvent = (type: string, data: any) => {
        if (!isClientConnected) return;
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      };

      const processHref = (href: string, currentUrl: string, source: string, currentDepth: number) => {
        if (!href) return;
        href = sanitizeAndDecodeUrl(href);
        href = href.split('#')[0]; // Remove hash
        if (!href) return;

        try {
          const resolvedUrl = new URL(href, currentUrl);
          const normalizedUrl = resolvedUrl.toString();
          const resolvedHost = resolvedUrl.hostname.toLowerCase();

          // 1. Exclude Domains Filter
          if (excludeDomainsList.length > 0) {
            if (excludeDomainsList.some(d => resolvedHost === d || resolvedHost.endsWith('.' + d))) {
              if (verbose) sendEvent('status', { log: `[SKIP: Excluded Domain] ${normalizedUrl}` });
              return;
            }
          }

          // 2. Include Patterns Filter
          if (includePatternsList.length > 0) {
            if (!includePatternsList.some(p => p.test(normalizedUrl))) {
              if (verbose) sendEvent('status', { log: `[SKIP: Include Pattern Mismatch] ${normalizedUrl}` });
              return;
            }
          }

          // 3. Exclude Patterns Filter
          if (excludePatternsList.length > 0) {
            if (excludePatternsList.some(p => p.test(normalizedUrl))) {
              if (verbose) sendEvent('status', { log: `[SKIP: Excluded Pattern] ${normalizedUrl}` });
              return;
            }
          }

          // 4. Exclude Paths Filter
          if (excludePathsList.length > 0) {
            if (excludePathsList.some(p => resolvedUrl.pathname.includes(p))) {
              if (verbose) sendEvent('status', { log: `[SKIP: Excluded Path] ${normalizedUrl}` });
              return;
            }
          }

          // 5. Exclude Extensions Filter
          const ext = resolvedUrl.pathname.split('.').pop()?.toLowerCase() || '';
          if (excludeExtensionsList.length > 0) {
            if (ext && excludeExtensionsList.includes(ext)) {
              if (verbose) sendEvent('status', { log: `[SKIP: Excluded Extension .${ext}] ${normalizedUrl}` });
              return;
            }
          }

          // 6. Explicit Include Path Pattern (if defined)
          if (includePathPatternsList.length > 0 && mode !== 'single') {
            const decodedPath = decodeURIComponent(resolvedUrl.pathname);
            const matchesPathPattern = includePathPatternsList.some(pat => {
              if (pat.includes('*') || pat.includes('^') || pat.includes('$')) {
                try {
                  const regex = new RegExp(pat.replace(/\*/g, '.*'), 'i');
                  return regex.test(resolvedUrl.pathname) || regex.test(decodedPath);
                } catch {
                  return resolvedUrl.pathname.includes(pat) || decodedPath.includes(pat);
                }
              }
              const cleanPat = pat.endsWith('/') ? pat.slice(0, -1) : pat;
              return resolvedUrl.pathname.startsWith(cleanPat) || decodedPath.startsWith(cleanPat);
            });
            if (!matchesPathPattern && mode === 'subdir') {
              if (verbose) sendEvent('status', { log: `[SKIP: Outside Include Path Pattern] ${normalizedUrl}` });
              return;
            }
          }

          if (!foundLinks.has(normalizedUrl)) {
            let isValid = false;
            let rejectReason = '';
            
            if (mode === 'single') {
              isValid = true;
            } else if (mode === 'subdir') {
              const isStartHost = resolvedHost === startDomain;
              const isIncludedHost = includeDomainsList.some(d => resolvedHost === d || resolvedHost.endsWith('.' + d));
              if ((isStartHost || isIncludedHost) && isSubdirMatch(resolvedUrl.pathname)) {
                isValid = true;
              } else if (!isStartHost && !isIncludedHost) {
                rejectReason = `Domain mismatch (${resolvedHost} != ${startDomain})`;
              } else {
                rejectReason = `Outside directory boundary ${cleanStartDir}`;
              }
            } else if (mode === 'domain') {
              const isIncludedHost = includeDomainsList.some(d => resolvedHost === d || resolvedHost.endsWith('.' + d));
              if (isIncludedHost) {
                isValid = true;
              } else if (subdomainOnly) {
                if (resolvedHost === startDomain) isValid = true;
                else rejectReason = `Subdomain mismatch (${resolvedHost} != ${startDomain})`;
              } else {
                if (resolvedHost === baseDomain || resolvedHost.endsWith('.' + baseDomain)) {
                  isValid = true;
                } else {
                  rejectReason = `External domain (${resolvedHost} not in ${baseDomain})`;
                }
              }
            }

            // Apply fileType filter if provided
            if (fileTypesList.length > 0) {
              if (!ext || !fileTypesList.includes(ext)) {
                isValid = false;
                rejectReason = `File type not in allowed list [${fileTypesList.join(', ')}]`;
              }
            }

            if (isValid) {
              foundLinks.add(normalizedUrl);
              if (verbose) {
                sendEvent('status', { log: `[ACCEPT] ${normalizedUrl} (found in <${source}>)` });
              }
              if (keywordFiltersList.length === 0) {
                sendEvent('link', { url: normalizedUrl, source });
              }
            } else if (verbose && rejectReason) {
              sendEvent('status', { log: `[SKIP] ${normalizedUrl}: ${rejectReason}` });
            }

            // Decide if we should queue it for visiting
            const skipExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'css', 'js', 'woff', 'woff2', 'ttf', 'ico', 'pdf', 'docx', 'zip', 'mp3', 'mp4'];
            
            if (mode !== 'single' && !visited.has(normalizedUrl) && (!ext || !skipExtensions.includes(ext)) && currentDepth < maxDepth) {
              let canCrawl = false;
              const isIncludedHost = includeDomainsList.some(d => resolvedHost === d || resolvedHost.endsWith('.' + d));

              if (mode === 'subdir' && (resolvedHost === startDomain || isIncludedHost) && isSubdirMatch(resolvedUrl.pathname)) {
                canCrawl = true;
              }
              if (mode === 'domain') {
                if (isIncludedHost) canCrawl = true;
                else if (subdomainOnly && resolvedHost === startDomain) canCrawl = true;
                else if (!subdomainOnly && (resolvedHost === baseDomain || resolvedHost.endsWith('.' + baseDomain))) canCrawl = true;
              }
              
              if (canCrawl && !toVisit.some(item => item.url === normalizedUrl)) {
                toVisit.push({ url: normalizedUrl, depth: currentDepth + 1 });
                if (verbose) {
                  sendEvent('status', { log: `[QUEUED] Depth ${currentDepth + 1}: ${normalizedUrl}` });
                }
              }
            }
          }
        } catch (err) {
          // Invalid URL, ignore
        }
      };

      // Check sitemap if domain mode
      if (mode === 'domain') {
        try {
          sendEvent('status', { message: 'Checking robots.txt & sitemap.xml...', log: 'Starting robots/sitemap phase' });
          const robotsUrl = new URL('/robots.txt', targetUrl).toString();
          const robotsRes = await axiosWithRetry(robotsUrl, { timeout: 5000 }).catch(() => null);
          
          let sitemapUrl = new URL('/sitemap.xml', targetUrl).toString();
          if (robotsRes && robotsRes.data) {
            const sitemapMatch = robotsRes.data.match(/Sitemap:\s*(.+)/i);
            if (sitemapMatch) {
              sitemapUrl = sitemapMatch[1].trim();
            }
            
            if (extractAll) {
               const pathRegex = /(?:Allow|Disallow):\s*(\/[^\s]*)/gi;
               let match;
               while ((match = pathRegex.exec(robotsRes.data)) !== null) {
                  processHref(match[1], targetUrl, 'robots.txt', 0);
               }
            }
          }

          const sitemapRes = await axiosWithRetry(sitemapUrl, { timeout: 5000 }).catch(() => null);
          if (sitemapRes && sitemapRes.data) {
            const $sitemap = cheerio.load(sitemapRes.data, { xmlMode: true });
            $sitemap('loc').each((_, el) => {
              const loc = $sitemap(el).text();
              processHref(loc, targetUrl, 'sitemap', 0);
            });
            sendEvent('status', { message: `Found ${foundLinks.size} links from sitemap.`, log: 'Sitemap processed successfully' });
          }
        } catch (e: any) {
          errorsCount++;
          sendEvent('status', { log: `Sitemap notice: ${e.message}` });
        }

        // Fuzz common paths
        if (fuzzPaths) {
          const commonPaths = [
            '/wp-admin/', '/wp-json/', '/wp-json/wp/v2/', '/wp-json/oembed/1.0/',
            '/wp-login.php', '/wp-content/uploads/', '/api/', '/api/v1/',
            '/.env', '/.git/config', '/admin', '/dashboard', '/backup'
          ];
          for (const p of commonPaths) {
             processHref(p, targetUrl, 'fuzzing_guess', 0);
          }
        }
      }

      while (toVisit.length > 0 && pagesCrawled < maxPages && isClientConnected) {
        const { url: currentUrl, depth: currentDepth } = toVisit.shift()!;
        
        if (visited.has(currentUrl)) continue;
        visited.add(currentUrl);
        pagesCrawled++;

        sendEvent('status', { 
           message: `Crawling (${pagesCrawled}/${maxPages}) [Queue: ${toVisit.length}]: ${currentUrl}`,
           stats: { 
             pagesCrawled, 
             totalLinks: foundLinks.size, 
             queueLength: toVisit.length, 
             errors: errorsCount,
             currentUrl,
             currentDepth
           }
        });

        try {
          const response = await axiosWithRetry(currentUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 8000,
            maxRedirects: 5,
            validateStatus: () => true 
          });

          if (response.status >= 400) {
            errorsCount++;
            sendEvent('status', { 
              log: `HTTP ${response.status} (${response.statusText || 'Error'}) encountered on ${currentUrl}`,
              stats: { pagesCrawled, totalLinks: foundLinks.size, queueLength: toVisit.length, errors: errorsCount }
            });
          }

          const contentTypeRaw = response.headers['content-type'] || '';
          const contentType = Array.isArray(contentTypeRaw) ? contentTypeRaw.join(' ') : String(contentTypeRaw);
          
          if (contentType.includes('text/html') || contentType.includes('application/json') || contentType.includes('text/xml') || contentType.includes('application/xml')) {
            if (contentType.includes('text/html')) {
              let htmlData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
              
              if (keywordFiltersList.length > 0) {
                 const pageText = htmlData.toLowerCase();
                 const hasKeyword = keywordFiltersList.some(kw => pageText.includes(kw));
                 if (hasKeyword) {
                    sendEvent('link', { url: currentUrl, source: 'keyword_match' });
                 }
              }

              const $ = cheerio.load(htmlData);
              const anchorCount = $('a[href]').length;
              if (anchorCount === 0 && verbose) {
                sendEvent('status', { 
                  log: `ℹ️ 0 anchor links found in HTML for ${currentUrl} (Page may rely on JavaScript/SPA rendering).` 
                });
              }
              
              let processedLinksCount = 0;
              const elements = $('a, link, form, script, img, iframe').toArray();
              for (const el of elements) {
                if (processedLinksCount >= maxBreadth) {
                  sendEvent('status', { log: `Reached max breadth (${maxBreadth}) for ${currentUrl}` });
                  break;
                }
                const href = $(el).attr('href') || $(el).attr('action') || $(el).attr('src');
                if (href) {
                  processHref(href, currentUrl, el.tagName, currentDepth);
                  processedLinksCount++;
                }
              }
            } else if (contentType.includes('text/xml') || contentType.includes('application/xml')) {
              let xmlData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
              const $sitemap = cheerio.load(xmlData, { xmlMode: true });
              $sitemap('loc, link').each((_, el) => {
                const loc = $sitemap(el).text();
                if (loc) processHref(loc, currentUrl, 'sitemap_xml', currentDepth);
              });
            }

            if (extractAll) {
               let rawText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
               rawText = rawText.replace(/\\\//g, '/');

               let processedRegexCount = 0;
               const domainRegex = new RegExp(`https?://${startDomain.replace(/\./g, '\\.')}[^\\s"'<>\`\\[\\]]+`, 'gi');
               const absMatches = rawText.match(domainRegex) || [];
               for (const match of absMatches) {
                 if (processedRegexCount >= maxBreadth) break;
                 processHref(match, currentUrl, 'deep_regex', currentDepth);
                 processedRegexCount++;
               }

               const relRegex = /["'](\/[a-zA-Z0-9_/-][^"'\s<>\`]*?)["']/g;
               let relMatch;
               while ((relMatch = relRegex.exec(rawText)) !== null) {
                  if (processedRegexCount >= maxBreadth) break;
                  processHref(relMatch[1], currentUrl, 'deep_regex', currentDepth);
                  processedRegexCount++;
               }
            }
          }
        } catch (error: any) {
          errorsCount++;
          sendEvent('status', { 
            log: `Failed to fetch ${currentUrl}: ${error.message}`,
            stats: { pagesCrawled, totalLinks: foundLinks.size, queueLength: toVisit.length, errors: errorsCount }
          });
        }
        
        if (mode === 'single') break;
      }

      if (pagesCrawled >= maxPages) {
         sendEvent('status', { log: `Crawl stopped: Reached max pages limit (${maxPages}).` });
      } else if (toVisit.length === 0 && mode !== 'single') {
         sendEvent('status', { log: `Crawl finished: Exhausted all links within depth limit (${maxDepth}).` });
      }

      sendEvent('done', { total: foundLinks.size, pagesCrawled, errors: errorsCount });
      clearInterval(heartbeat);
      setTimeout(() => res.end(), 250);
      
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    }
  });

  // SSE endpoint for AI Smart Crawler
  app.get('/api/smart-crawl', async (req, res) => {
    const targetUrl = req.query.url as string;
    const instruction = req.query.instruction as string;
    const maxPages = parseInt(req.query.maxPages as string) || 20;
    const maxDepth = parseInt(req.query.maxDepth as string) || 2;
    
    const includePatternsRaw = (req.query.includePatterns as string) || '';
    const includePatternsList = includePatternsRaw.split(',').map(p => p.trim()).filter(Boolean).map(p => new RegExp(p, 'i'));

    const excludePatternsRaw = (req.query.excludePatterns as string) || '';
    const excludePatternsList = excludePatternsRaw.split(',').map(p => p.trim()).filter(Boolean).map(p => new RegExp(p, 'i'));

    const includeDomainsRaw = (req.query.includeDomains as string) || '';
    const includeDomainsList = includeDomainsRaw.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);

    const excludeExtensionsRaw = (req.query.excludeExtensions as string) || '';
    const excludeExtensionsList = excludeExtensionsRaw.split(',').map(ext => ext.trim().toLowerCase()).filter(Boolean);
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!targetUrl || !instruction) {
      res.write(`data: ${JSON.stringify({ error: 'URL and Instruction are required' })}\n\n`);
      return res.end();
    }

    try {
      const parsedStartUrl = new URL(targetUrl);
      const startDomain = parsedStartUrl.hostname;
      
      const visited = new Set<string>();
      const toVisit = [{ url: targetUrl, depth: 0 }];
      const foundLinks = new Set<string>([targetUrl]);
      let pagesCrawled = 0;
      let errorsCount = 0;

      let isClientConnected = true;
      req.on('close', () => {
        isClientConnected = false;
      });

      const heartbeat = setInterval(() => {
        if (isClientConnected) {
          res.write(':\n\n'); 
        }
      }, 15000);

      const sendEvent = (type: string, data: any) => {
        if (!isClientConnected) return;
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      };
      
      // Always emit the start URL
      sendEvent('link', { url: targetUrl, source: 'seed' });

      while (toVisit.length > 0 && pagesCrawled < maxPages) {
        if (!isClientConnected) break;
        
        const { url: currentUrl, depth: currentDepth } = toVisit.shift()!;
        if (visited.has(currentUrl)) continue;
        visited.add(currentUrl);

        pagesCrawled++;
        sendEvent('status', { 
           message: `Crawling (${pagesCrawled}/${maxPages}): ${currentUrl}`,
           stats: { pagesCrawled, totalLinks: foundLinks.size, errors: errorsCount }
        });

        try {
          const response = await axiosWithRetry(currentUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 8000,
            maxRedirects: 5,
            validateStatus: () => true 
          });

          const contentType = String(response.headers['content-type'] || '');
          if (!contentType.includes('text/html')) continue;

          let htmlData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          const $ = cheerio.load(htmlData);
          
          let pageLinks = new Set<string>();
          $('a').each((_, el) => {
            let href = $(el).attr('href');
            if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
               try {
                  href = sanitizeAndDecodeUrl(href);
                  if (!href) return;

                  const resolvedUrl = new URL(href, currentUrl);
                  const normalizedUrl = resolvedUrl.toString().split('#')[0];
                  
                  let allowed = isUrlDomainAllowed(normalizedUrl, startDomain, includeDomainsList);

                  if (allowed) {
                    if (includePatternsList.length > 0 && !includePatternsList.some(p => p.test(normalizedUrl))) {
                      allowed = false;
                    }
                    if (excludePatternsList.length > 0 && excludePatternsList.some(p => p.test(normalizedUrl))) {
                      allowed = false;
                    }
                    if (excludeExtensionsList.length > 0) {
                      const ext = normalizedUrl.split('.').pop()?.toLowerCase() || '';
                      if (excludeExtensionsList.includes(ext)) {
                        allowed = false;
                      }
                    }
                  }

                  if (allowed) {
                     pageLinks.add(normalizedUrl);
                  }
               } catch(e) {}
            }
          });

          const uniqueLinks = Array.from(pageLinks).filter(link => !visited.has(link) && !foundLinks.has(link));
          
          if (uniqueLinks.length > 0) {
             sendEvent('status', { log: `Analyzing ${uniqueLinks.length} domain links with AI & instruction cross-reference...` });
             
             // Chunk links if there are too many (limit to 150 to save tokens/time)
             const linksToAnalyze = uniqueLinks.slice(0, 150);
             
             const prompt = `
You are an intelligent URL filter.
The user's instruction is: "${instruction}"
Target Domain: ${startDomain}
Current context page: ${currentUrl}

Here is a list of discovered URLs from ${startDomain}:
${linksToAnalyze.map((l, i) => `${i+1}. ${l}`).join('\n')}

Based ONLY on the URL paths, slugs, and domain names, filter this list and return ONLY the URLs that are highly relevant to the user's instruction and belong to ${startDomain}.
CRITICAL RULES:
1. Be extremely strict and highly selective.
2. If a URL does not clearly and specifically indicate relevance to the instruction through its text/slug, EXCLUDE it.
3. Exclude external global platforms, top-level homepages, /about, /contact, /login, /terms, unless explicitly requested.
4. If none are definitively relevant, return an empty array [].

Return your answer as a valid JSON array of strings. Example: ["https://example.com/specific-topic-page"]
Do NOT include any markdown formatting, backticks, or explanation. Just the raw JSON array.
`;

              try {
                let text: string | null = null;
                try {
                  const aiResult = await generateContentWithFallback(getAi(), {
                    contents: prompt,
                    config: {
                      temperature: 0.1,
                      responseMimeType: "application/json",
                      responseSchema: {
                        type: "array",
                        items: { type: "string" }
                      }
                    }
                  });
                  if (aiResult.text) {
                    text = aiResult.text;
                  }
                } catch (fallbackErr: any) {
                  sendEvent('status', { log: `AI filtering unavailable/rate-limited. Applying instruction cross-referencing heuristic.` });
                }
                
                let filteredUrls: string[] = [];
                if (text === null) {
                   filteredUrls = linksToAnalyze.filter(l => validateAndScoreUrlWithInstruction(l, startDomain, instruction, includeDomainsList));
                } else {
                  try {
                    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
                    const firstBracket = cleaned.indexOf('[');
                    const lastBracket = cleaned.lastIndexOf(']');
                    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
                      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
                    }
                    filteredUrls = JSON.parse(cleaned);
                    if (!Array.isArray(filteredUrls)) filteredUrls = [];
                  } catch(e) {
                    filteredUrls = linksToAnalyze.filter(l => validateAndScoreUrlWithInstruction(l, startDomain, instruction, includeDomainsList));
                  }
                }
                
                // Cross-reference validation step: ensure every link is from target domain and valid
                const validatedUrls = filteredUrls.filter(furl => 
                  typeof furl === 'string' && 
                  furl.startsWith('http') && 
                  isUrlDomainAllowed(furl, startDomain, includeDomainsList)
                );

                if (Array.isArray(validatedUrls) && validatedUrls.length > 0) {
                   for (const furl of validatedUrls) {
                      if (!foundLinks.has(furl)) {
                         foundLinks.add(furl);
                         sendEvent('link', { url: furl, source: text !== null ? 'ai_filtered' : 'instruction_validated' });
                         if (currentDepth < maxDepth) {
                            toVisit.push({ url: furl, depth: currentDepth + 1 });
                         }
                      }
                   }
                   sendEvent('status', { log: `Validated ${validatedUrls.length} relevant links for target domain.` });
                } else {
                   sendEvent('status', { log: `No links passed target domain & instruction relevance check for ${currentUrl}.` });
                }
             } catch(e: any) {
                sendEvent('status', { log: `URL validation error: ${e.message}` });
             }
          }
        } catch (error: any) {
          errorsCount++;
          sendEvent('status', { log: `Failed to fetch ${currentUrl}: ${error.message}` });
        }
      }

      sendEvent('status', { log: `Smart crawl finished. Analyzed ${pagesCrawled} pages.` });

      // Generate AI Summary/Guide
      if (foundLinks.size > 0) {
        sendEvent('status', { log: `Generating AI guide based on found links...` });
        try {
          const linksArray = Array.from(foundLinks);
          const summaryPrompt = `
The user asked for: "${instruction}"

You have crawled the website and found the following relevant links:
${linksArray.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Based on the user's instruction and these links, write a helpful guideline, suggestion, or tutorial. 
IMPORTANT: 
- You MUST reference the links in your response using their serial numbers (e.g., [1], [2]).
- Explain when and how to use the information from these links.
- Keep the response professional, well-structured, and easy to read.
- DO NOT list the links again at the end; the system will append the "Source References" section automatically.
`;

          const summaryResult = await generateContentWithFallback(getAi(), {
            contents: summaryPrompt,
          });

          sendEvent('summary', { text: summaryResult.text });
          sendEvent('status', { log: `AI guide generated successfully.` });
        } catch (e: any) {
          sendEvent('status', { log: `Failed to generate AI guide: ${e.message}` });
        }
      }

      sendEvent('done', { total: foundLinks.size, pagesCrawled, errors: errorsCount });
      clearInterval(heartbeat);
      setTimeout(() => res.end(), 250);
      
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    }
  });

  // POST endpoint for one-shot AI filtering of a list of URLs
  app.post('/api/smart-filter', async (req, res) => {
    const { urls, instruction } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Array of URLs is required' });
    }
    if (!instruction) {
      return res.status(400).json({ error: 'Instruction is required' });
    }

    try {
      let startDomain = '';
      try {
        if (urls[0]) startDomain = new URL(urls[0]).hostname;
      } catch (e) {}

      const prompt = `You are a URL filtering AI. 
The user has provided a list of URLs and a specific instruction on what they are looking for.
Target Domain: ${startDomain}
Your task is to analyze the URLs (their paths, domains, and structure) and select ONLY the ones that match the instruction and belong to ${startDomain}.

CRITICAL RULES:
1. Be extremely strict and highly selective.
2. If a URL does not clearly and specifically indicate relevance to the instruction through its text/slug, EXCLUDE it.
3. Exclude general top-level domains, homepages, /about, /contact, /login, /terms, and generic blog indexes unless the user explicitly asks for them.
4. Exclude external platform or third-party links.
5. If none are definitively relevant, return an empty array [].

User Instruction: "${instruction}"

URLs to analyze:
${urls.map((u, i) => `[${i}] ${u}`).join('\n')}

Return ONLY a valid JSON array of the matching URL strings.
If none are relevant, return an empty array [].
Do NOT include any markdown formatting, backticks, or explanation. Just the raw JSON array.`;

      let text: string | null = null;
      try {
        const aiResult = await generateContentWithFallback(getAi(), {
          contents: prompt,
          config: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: "array",
              items: { type: "string" }
            }
          }
        });
        if (aiResult.text) {
          text = aiResult.text;
        }
      } catch (fallbackErr: any) {
        console.error(`AI filtering failed:`, fallbackErr.message);
      }
      
      let filteredUrls: string[] = [];
      if (text === null) {
        filteredUrls = urls.filter(u => validateAndScoreUrlWithInstruction(u, startDomain, instruction));
      } else {
        try {
          let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
          const firstBracket = cleaned.indexOf('[');
          const lastBracket = cleaned.lastIndexOf(']');
          if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            cleaned = cleaned.substring(firstBracket, lastBracket + 1);
          }
          filteredUrls = JSON.parse(cleaned);
          if (!Array.isArray(filteredUrls)) filteredUrls = [];
        } catch (e) {
          filteredUrls = urls.filter(u => validateAndScoreUrlWithInstruction(u, startDomain, instruction));
        }
      }

      // Final validation cross-reference against domain and instruction
      const finalUrls = filteredUrls.filter(u => 
        typeof u === 'string' && 
        u.startsWith('http') && 
        isUrlDomainAllowed(u, startDomain)
      );

      res.json({ urls: finalUrls });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // SSE endpoint for bulk fetching content from URLs
  app.post('/api/fetch-bulk', async (req, res) => {
    const { urls, customHeaders = {} } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Array of URLs is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let isClientConnected = true;
    res.on('close', () => {
      isClientConnected = false;
    });

    const sendEvent = (type: string, data: any) => {
      if (!isClientConnected) return;
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    let processedCount = 0;
    const maxConcurrency = 5;

    // A helper to process a single URL
    const fetchUrl = async (url: string) => {
      if (!isClientConnected) return;
      try {
        const response = await axiosWithRetry(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml,application/json,text/plain;q=0.9,*/*;q=0.8',
            ...customHeaders
          },
          timeout: 10000,
          maxRedirects: 5,
          validateStatus: () => true // Allow handling 401/403/404 manually
        });

        const status = response.status;
        
        if (status === 401 || status === 403) {
            sendEvent('auth_required', { url, status });
            return;
        }
        
        if (status >= 400) {
            sendEvent('error', { url, error: `Status ${status}`, success: false });
            return;
        }

        // Determine content type
        const rawContentType = response.headers['content-type'] || '';
        const contentTypeHeader = Array.isArray(rawContentType) ? rawContentType.join(' ') : String(rawContentType);
        let category = 'Unknown';
        if (contentTypeHeader.includes('application/json')) category = 'JSON';
        else if (contentTypeHeader.includes('text/html') || contentTypeHeader.includes('application/xhtml+xml')) category = 'HTML';
        else if (contentTypeHeader.includes('text/css')) category = 'CSS';
        else if (contentTypeHeader.includes('application/javascript') || contentTypeHeader.includes('text/javascript')) category = 'JS';
        else if (contentTypeHeader.includes('text/xml') || contentTypeHeader.includes('application/xml')) category = 'XML';
        else if (contentTypeHeader.includes('text/plain')) category = 'Text';
        else category = 'Other';

        let content = '';
        let isUseless = false;
        let uselessReason = '';

        if (category === 'JSON') {
          const data = response.data;
          content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
          
          if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
              isUseless = true;
              uselessReason = 'Empty JSON';
          } else if (data.code === 'rest_no_route' || data.code === 'rest_forbidden' || data.code === 'rest_invalid_param') {
              isUseless = true;
              uselessReason = 'Error Message JSON';
          } else if (data.namespace && data.routes) {
              isUseless = true;
              uselessReason = 'API Schema/Routes';
          }
        } else if (category === 'HTML') {
          const $ = cheerio.load(response.data);
          $('script, style, nav, footer, iframe, noscript').remove();
          content = $('body').text().replace(/\s+/g, ' ').trim();
          if (!content) content = $.text().replace(/\s+/g, ' ').trim(); // fallback
        } else {
          // Plain text or XML or others
          content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        }

        if (isUseless) {
             sendEvent('ignored', { url, reason: uselessReason });
        } else if (content && content.length > 0) {
             sendEvent('content', { url, content, category, success: true });
        } else {
             sendEvent('ignored', { url, reason: 'Empty content' });
        }
      } catch (e: any) {
         sendEvent('error', { url, error: e.message, success: false });
      } finally {
        processedCount++;
        sendEvent('progress', { processed: processedCount, total: urls.length });
      }
    };

    // Run with concurrency limit
    const queue = [...urls];
    const workers = Array(maxConcurrency).fill(null).map(async () => {
      while (queue.length > 0 && isClientConnected) {
        const url = queue.shift();
        if (url) {
          await fetchUrl(url);
        }
      }
    });

    await Promise.all(workers);

    sendEvent('done', { message: 'Finished processing all URLs' });
    res.end();
  });

  // YouTube Endpoints
  app.get('/api/yt/search', async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) return res.status(400).json({ error: 'Query is required' });
      const { Innertube, UniversalCache } = await import('youtubei.js');
      const yt = await Innertube.create({ cache: new UniversalCache(false) });
      const searchRes = await yt.search(query, { type: 'video' });
      const videos = searchRes.videos.slice(0, 50);
      
      res.json(videos.map((v: any) => ({
        id: v.id,
        title: v.title?.text || v.title,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        duration: v.duration?.text || 'N/A',
        thumbnail: v.best_thumbnail?.url || v.thumbnails?.[0]?.url,
        channel: v.author?.name,
        views: v.view_count?.text ? parseInt(v.view_count.text.replace(/[^0-9]/g, '')) || 0 : 0
      })));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/yt/analyze', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required' });
      const { Innertube, UniversalCache } = await import('youtubei.js');
      const yt = await Innertube.create({ cache: new UniversalCache(false) });
      
      let resolvedUrl: string = url;
      try {
        const urlObj = new URL(url);
        // Strip out si parameter to avoid tracking issues
        urlObj.searchParams.delete('si');
        resolvedUrl = urlObj.toString();
      } catch(e) {}

      if (resolvedUrl.includes('playlist?list=')) {
        const plId = new URL(resolvedUrl).searchParams.get('list');
        if (!plId) throw new Error('Invalid playlist URL');
        
        const playlist = await yt.getPlaylist(plId);
        const videos = playlist.items.map((v: any) => {
          let title = '';
          if (v.title?.text) title = v.title.text;
          else if (v.metadata?.title?.text) title = v.metadata.title.text;
          
          let id = v.id || v.content_id;
          
          let duration = 'N/A';
          if (v.duration?.text) duration = v.duration.text;
          else if (v.renderer_context?.accessibility_context?.label) {
            const label = v.renderer_context.accessibility_context.label;
            const parts = label.split(' ');
            if (parts.length > 2 && parts[parts.length-1].includes('second') || parts[parts.length-1].includes('minute') || parts[parts.length-1].includes('hour')) {
              duration = parts.slice(-2).join(' ');
            }
          }

          let thumb = '';
          if (v.thumbnails?.[0]?.url) thumb = v.thumbnails[0].url;
          else if (v.content_image?.image?.[0]?.url) thumb = v.content_image.image[0].url;

          return {
            id,
            title,
            url: `https://www.youtube.com/watch?v=${id}`,
            duration,
            thumbnail: thumb,
          };
        }).filter(v => !!v.id);
        
        res.json({ type: 'playlist', name: playlist.info.title, url: resolvedUrl, videos });
        
      } else if (resolvedUrl.includes('@') || resolvedUrl.includes('/channel/') || resolvedUrl.includes('/c/')) {
        const resolved = await yt.resolveURL(resolvedUrl);
        if (!resolved.payload?.browseId) throw new Error('Could not resolve channel ID');
        
        const channel = await yt.getChannel(resolved.payload.browseId);
        
        const videosRes = await channel.getVideos();
        const videos = videosRes.videos.map((v: any) => {
           let title = v.title?.text || v.metadata?.title?.text || '';
           let id = v.id || v.content_id;
           let duration = v.duration?.text || 'N/A';
           return { id, title, url: `https://www.youtube.com/watch?v=${id}`, duration };
        });
        
        const playlistsRes = await channel.getPlaylists();
        const playlists = playlistsRes.playlists.map((p: any) => {
           let title = p.title?.text || p.metadata?.title?.text || '';
           let id = p.id || p.content_id;
           let videoCount = p.video_count?.text ? parseInt(p.video_count.text.replace(/[^0-9]/g, '')) || 0 : 0;
           return { title, url: `https://www.youtube.com/playlist?list=${id}`, videoCount };
        });

        res.json({ 
          type: 'channel', 
          name: channel.metadata.title, 
          url: resolvedUrl, 
          videos, 
          playlists 
        });
      } else if (resolvedUrl.includes('/watch') || resolvedUrl.includes('youtu.be/')) {
         const videoId = resolvedUrl.includes('youtu.be/') ? resolvedUrl.split('youtu.be/')[1].split('?')[0] : new URL(resolvedUrl).searchParams.get('v');
         if (!videoId) throw new Error('Invalid video URL');
         const video = await yt.getBasicInfo(videoId);
         res.json({ type: 'video', name: video.basic_info.title, url: resolvedUrl, videos: [{
           id: video.basic_info.id,
           title: video.basic_info.title,
           url: `https://www.youtube.com/watch?v=${video.basic_info.id}`,
           duration: 'N/A', // getBasicInfo might not have duration formatted cleanly
         }] });
      } else {
        res.status(400).json({ error: 'Unsupported URL type' });
      }
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || 'An error occurred' });
    }
  });

  // Vite middleware for development vs static asset serving for production
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const candidatePaths = [
      path.join(process.cwd(), 'dist'),
      path.resolve(__dirname, '../dist'),
      path.resolve(__dirname, '.'),
      process.cwd()
    ];
    const distPath = candidatePaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || path.join(process.cwd(), 'dist');
    
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).send('<!doctype html><html><body><div id="root"></div></body></html>');
      }
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
  server.keepAliveTimeout = 120000; // 2 minutes
  server.headersTimeout = 120000;
}

startServer();
