import express from 'express';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import { GoogleGenAI } from '@google/genai';
import https from 'https';
import {
  smartExtractPageContent,
  cleanAndExtractStructuredContent,
  resolveAndFetchUrl,
  renderWithHeadlessBrowser,
  isClientSideSpaShell
} from './server/htmlExtractor';

// ==============================================================================
// GEMINI MULTI-KEY ROTATION & AUTO-FAILOVER POOL
// Supports GEMINI_API_KEY, GEMINI_API_KEY_engrikdev, GEMINI_API_KEY_engrikdev2
// Rotates keys randomly / round-robin and automatically falls back on rate limit (429),
// quota exhaustion, invalid keys (400), or temporary 503 high demand spikes.
// ==============================================================================

export interface GeminiKeyItem {
  name: string;
  key: string;
  status: 'active' | 'rate_limited' | 'invalid' | 'cooldown';
  failCount: number;
  totalCalls: number;
  successCalls: number;
  cooldownUntil: number;
  lastUsedAt?: string;
  lastError?: string;
}

export interface FallbackEvent {
  id: string;
  timestamp: string;
  fromKey: string;
  toKey: string;
  fromKeyLabel: string;
  toKeyLabel: string;
  reason: string;
  model: string;
}

export class GeminiKeyRotationManager {
  private keys: GeminiKeyItem[] = [];
  public candidateModels = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
  public preferredModel = 'gemini-3.5-flash';
  private roundRobinIndex = 0;
  private fallbackEvents: FallbackEvent[] = [];
  public currentActiveKeyName: string | null = null;

  constructor() {
    this.refreshKeys();
  }

  public getKeyFriendlyLabel(name?: string | null): string {
    if (!name) return 'Key #1';
    const index = this.keys.findIndex(k => k.name === name);
    if (index >= 0) {
      return `Key #${index + 1}`;
    }
    if (name.includes('engrikdev2')) return 'Key #3';
    if (name.includes('engrikdev')) return 'Key #2';
    return 'Key #1';
  }

  public recordFallbackEvent(fromKey: string, toKey: string, reason: string, model: string): FallbackEvent {
    const fromLabel = this.getKeyFriendlyLabel(fromKey);
    const toLabel = this.getKeyFriendlyLabel(toKey);
    const event: FallbackEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      fromKey,
      toKey,
      fromKeyLabel: fromLabel,
      toKeyLabel: toLabel,
      reason,
      model,
    };
    this.fallbackEvents.unshift(event);
    if (this.fallbackEvents.length > 25) {
      this.fallbackEvents.pop();
    }
    console.warn(`[GEMINI_ROTATION_EVENT] ⚠️ Automatic fallback: ${fromLabel} (${fromKey}) ➔ ${toLabel} (${toKey}) [Reason: ${reason}]`);
    return event;
  }

  public refreshKeys() {
    const keyConfigs = [
      { name: 'GEMINI_API_KEY', val: process.env.GEMINI_API_KEY },
      { name: 'GEMINI_API_KEY_engrikdev', val: process.env.GEMINI_API_KEY_engrikdev },
      { name: 'GEMINI_API_KEY_engrikdev2', val: process.env.GEMINI_API_KEY_engrikdev2 },
    ];

    for (const item of keyConfigs) {
      if (!item.val || item.val.trim().length === 0) continue;
      const existing = this.keys.find(k => k.name === item.name);
      if (!existing) {
        this.keys.push({
          name: item.name,
          key: item.val.trim(),
          status: 'active',
          failCount: 0,
          totalCalls: 0,
          successCalls: 0,
          cooldownUntil: 0,
        });
      } else {
        existing.key = item.val.trim();
      }
    }

    if (!this.currentActiveKeyName && this.keys.length > 0) {
      this.currentActiveKeyName = this.keys[0].name;
    }
  }

  public getAvailableKeys(): GeminiKeyItem[] {
    const now = Date.now();
    return this.keys.filter(k => k.status !== 'invalid' && k.cooldownUntil <= now);
  }

  public pickNextKey(): GeminiKeyItem | null {
    const available = this.getAvailableKeys();
    if (available.length === 0) {
      // If all healthy keys are in cooldown, pick the one whose cooldown expires soonest
      const candidates = this.keys.filter(k => k.status !== 'invalid');
      if (candidates.length === 0) return null;
      return candidates.sort((a, b) => a.cooldownUntil - b.cooldownUntil)[0];
    }

    // Hybrid: randomly choose or round-robin to distribute load evenly
    if (Math.random() > 0.5) {
      const randIdx = Math.floor(Math.random() * available.length);
      return available[randIdx];
    } else {
      this.roundRobinIndex = (this.roundRobinIndex + 1) % available.length;
      return available[this.roundRobinIndex];
    }
  }

  public markKeyFailure(keyItem: GeminiKeyItem, err: any): string {
    const errMsg = err?.message || String(err);
    const status = err?.status || err?.response?.status;
    keyItem.failCount++;
    keyItem.lastError = errMsg.substring(0, 160);

    let reason = 'API Error';

    // If key is structurally invalid (400 API_KEY_INVALID)
    if (status === 400 && (errMsg.includes('API_KEY_INVALID') || errMsg.includes('not valid'))) {
      keyItem.status = 'invalid';
      reason = 'Invalid API Key (400)';
      console.error(`[GEMINI_ROTATION] Marking key "${keyItem.name}" as INVALID (Excluded from pool). Auto-switching to next key...`);
      return reason;
    }

    // If Rate Limit or Quota Exceeded (429 / RESOURCE_EXHAUSTED)
    if (status === 429 || errMsg.includes('429') || errMsg.includes('Quota exceeded') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      keyItem.status = 'rate_limited';
      // 90 seconds cooldown
      keyItem.cooldownUntil = Date.now() + 90000;
      reason = 'Quota Limit Reached (429)';
      console.warn(`[GEMINI_ROTATION] Rate limit/quota exceeded on key "${keyItem.name}". Cooldown 90s. Auto-falling back to next key in pool...`);
      return reason;
    }

    // If High Demand spike / 503
    if (status === 503 || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE')) {
      keyItem.cooldownUntil = Date.now() + 20000; // 20s cooldown
      reason = 'High Demand Spike (503)';
      console.warn(`[GEMINI_ROTATION] Key "${keyItem.name}" hit 503 high demand spike. Cooldown 20s. Auto-switching...`);
      return reason;
    }

    // Other transient error: brief cooldown
    keyItem.cooldownUntil = Date.now() + 10000;
    reason = `Temporary Error (${status || 'Network'})`;
    return reason;
  }

  public markKeySuccess(keyItem: GeminiKeyItem) {
    keyItem.status = 'active';
    keyItem.successCalls++;
    keyItem.lastUsedAt = new Date().toISOString();
    keyItem.failCount = 0;
    keyItem.cooldownUntil = 0;
    this.currentActiveKeyName = keyItem.name;
  }

  // Unary generation with key and model fallback
  public async generateContentWithFallback(params: {
    contents: any;
    config?: any;
    preferredModel?: string;
  }): Promise<{ text: string; keyUsed: string; modelUsed: string; rawResponse?: any; fallbackOccurred?: boolean; fallbackEvent?: FallbackEvent }> {
    this.refreshKeys();
    const modelToTry = params.preferredModel || this.preferredModel;
    const models = [modelToTry, ...this.candidateModels.filter(m => m !== modelToTry)];

    const maxAttempts = Math.max(3, this.keys.length * 2);
    let lastError: any = null;
    let previousFailedKey: string | null = null;
    let previousFailedReason = '';
    let fallbackEventResult: FallbackEvent | undefined = undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const keyObj = this.pickNextKey();
      if (!keyObj) {
        throw new Error('No available healthy Gemini API keys in pool.');
      }
      keyObj.totalCalls++;

      if (attempt > 0 && previousFailedKey && previousFailedKey !== keyObj.name) {
        fallbackEventResult = this.recordFallbackEvent(
          previousFailedKey,
          keyObj.name,
          previousFailedReason || 'Quota Limit / Rate Limit',
          modelToTry
        );
      }

      for (const currentModel of models) {
        try {
          console.log(`[GEMINI_ROTATION] Invoking ${currentModel} via key "${keyObj.name}" (${this.getKeyFriendlyLabel(keyObj.name)}) (Attempt ${attempt + 1})...`);
          const ai = new GoogleGenAI({
            apiKey: keyObj.key,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
          });

          const response = await ai.models.generateContent({
            model: currentModel,
            contents: params.contents,
            config: params.config,
          });

          this.markKeySuccess(keyObj);
          return {
            text: response.text || '',
            keyUsed: keyObj.name,
            modelUsed: currentModel,
            rawResponse: response,
            fallbackOccurred: attempt > 0,
            fallbackEvent: fallbackEventResult
          };
        } catch (err: any) {
          lastError = err;
          const status = err?.status || err?.response?.status;
          const msg = err?.message || '';

          // If 503 or 404, try alternative model first before discarding key
          if (status === 503 || status === 404 || msg.includes('high demand') || msg.includes('not found')) {
            console.warn(`[GEMINI_ROTATION] Model ${currentModel} failed on "${keyObj.name}" with status ${status}. Trying backup model...`);
            continue;
          }

          // If rate limit or invalid key, mark failure and switch keys immediately!
          previousFailedKey = keyObj.name;
          previousFailedReason = this.markKeyFailure(keyObj, err);
          break; // Switch to next key
        }
      }
    }

    throw lastError || new Error('All Gemini API keys in rotation pool failed.');
  }

  // Streaming generation with key and model fallback on init
  public async generateContentStreamWithFallback(params: {
    contents: any;
    config?: any;
    preferredModel?: string;
  }): Promise<{ stream: any; keyUsed: string; keyLabel: string; modelUsed: string; fallbackOccurred: boolean; fallbackEvent?: FallbackEvent }> {
    this.refreshKeys();
    const modelToTry = params.preferredModel || this.preferredModel;
    const models = [modelToTry, ...this.candidateModels.filter(m => m !== modelToTry)];

    const maxAttempts = Math.max(3, this.keys.length * 2);
    let lastError: any = null;
    let previousFailedKey: string | null = null;
    let previousFailedReason = '';
    let fallbackEventResult: FallbackEvent | undefined = undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const keyObj = this.pickNextKey();
      if (!keyObj) {
        throw new Error('No available healthy Gemini API keys in pool.');
      }
      keyObj.totalCalls++;

      if (attempt > 0 && previousFailedKey && previousFailedKey !== keyObj.name) {
        fallbackEventResult = this.recordFallbackEvent(
          previousFailedKey,
          keyObj.name,
          previousFailedReason || 'Quota Limit Reached (429)',
          modelToTry
        );
      }

      for (const currentModel of models) {
        try {
          console.log(`[GEMINI_STREAM] Starting stream with ${currentModel} via key "${keyObj.name}" (${this.getKeyFriendlyLabel(keyObj.name)}) (Attempt ${attempt + 1})...`);
          const ai = new GoogleGenAI({
            apiKey: keyObj.key,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
          });

          const stream = await ai.models.generateContentStream({
            model: currentModel,
            contents: params.contents,
            config: params.config,
          });

          this.markKeySuccess(keyObj);
          return {
            stream,
            keyUsed: keyObj.name,
            keyLabel: this.getKeyFriendlyLabel(keyObj.name),
            modelUsed: currentModel,
            fallbackOccurred: attempt > 0,
            fallbackEvent: fallbackEventResult
          };
        } catch (err: any) {
          lastError = err;
          const status = err?.status || err?.response?.status;
          const msg = err?.message || '';

          if (status === 503 || status === 404 || msg.includes('high demand') || msg.includes('not found')) {
            console.warn(`[GEMINI_STREAM] Model ${currentModel} failed on "${keyObj.name}" (status ${status}). Trying backup model...`);
            continue;
          }

          previousFailedKey = keyObj.name;
          previousFailedReason = this.markKeyFailure(keyObj, err);
          break; // Switch to next key
        }
      }
    }

    throw lastError || new Error('All Gemini API keys in rotation pool failed stream initialization.');
  }

  public getStatus() {
    const now = Date.now();
    const activeKeyName = this.currentActiveKeyName || this.keys[0]?.name || 'GEMINI_API_KEY';
    const activeFriendly = this.getKeyFriendlyLabel(activeKeyName);

    return {
      connected: this.keys.some(k => k.status === 'active' || k.status === 'rate_limited'),
      totalKeysConfigured: this.keys.length,
      activeHealthyKeysCount: this.keys.filter(k => k.status === 'active' && k.cooldownUntil <= now).length,
      activeKey: activeKeyName,
      activeKeyLabel: activeFriendly,
      activeKeyBadge: `🟢 ${activeFriendly} in use`,
      recentFallbackEvents: this.fallbackEvents.slice(0, 5),
      lastFallback: this.fallbackEvents[0] || null,
      keys: this.keys.map((k, idx) => ({
        index: idx + 1,
        friendlyLabel: `Key #${idx + 1}`,
        name: k.name,
        isActive: k.name === activeKeyName,
        status: k.status === 'rate_limited' && k.cooldownUntil > now ? 'rate_limited' : k.status,
        failCount: k.failCount,
        totalCalls: k.totalCalls,
        successCalls: k.successCalls,
        lastUsedAt: k.lastUsedAt || 'Never',
        cooldownRemainingSeconds: Math.max(0, Math.round((k.cooldownUntil - now) / 1000)),
        lastError: k.lastError || null
      })),
      primaryModel: this.preferredModel,
      supportedModels: this.candidateModels,
      rotationMode: 'Random & Round-Robin Load Distribution with Automatic Quota & 429 Failover',
      autoFallback: true
    };
  }
}

const geminiKeyPool = new GeminiKeyRotationManager();

// Return URL directly without pinging external vertex redirect services
function resolveRedirect(url: string): Promise<string> {
  return Promise.resolve(url);
}

// Exponential Backoff Axios Wrapper for Server-side Crawling Tasks
async function axiosWithRetry(url: string, config: any = {}, maxRetries = 2, initialDelayMs = 500): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      const startTime = Date.now();
      const response = await axios(url, config);
      const duration = Date.now() - startTime;
      console.log(`[CRAWL_SERVER_LOG] HTTP ${response.status} ${config.method || 'GET'} ${url} (${duration}ms)`);
      if ([429, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
        attempt++;
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200, 3000);
        console.warn(`[CRAWL_SERVER_LOG] Received HTTP ${response.status} from ${url}. Retrying in ${Math.round(delay)}ms (Attempt ${attempt}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return response;
    } catch (error: any) {
      attempt++;
      const statusCode = error.response?.status || 'NETWORK_ERROR';
      const isTimeout = error.code === 'ECONNABORTED' || (typeof error.message === 'string' && error.message.toLowerCase().includes('timeout'));
      const isClientError = error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 429;
      
      console.error(`[CRAWL_SERVER_LOG] Error fetching ${url} - Status: ${statusCode}, Message: ${error.message} (Attempt ${attempt}/${maxRetries + 1})`);
      
      // Do not endlessly retry timeouts, 4xx client errors (404, 403, 401, 400), or when max retries reached
      if (attempt > maxRetries || isTimeout || isClientError) {
        throw error;
      }
      const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200, 3000);
      console.warn(`[CRAWL_SERVER_LOG] Retrying ${url} in ${Math.round(delay)}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function generateContentWithFallback(_aiInstance: any, _params: any): Promise<any> {
  // In Passive Mode, return safe offline response with 0 outbound API requests
  return {
    text: "🛡️ [PASSIVE SAFE MODE ACTIVE] Cloud automated API calls are cancelled/deactivated to protect against Google Cloud policy violations."
  };
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
    const rawPath = (parsed.pathname + parsed.search).toLowerCase();
    let decodedPath = rawPath;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch (e) {}
    
    // Ignore static asset extensions & auth/junk paths
    if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|mp3|mp4|zip|gz|tar|rar)$/i.test(parsed.pathname)) {
      return false;
    }
    
    // Clean instruction tokens with Unicode support (preserves Bengali, Arabic, Latin, etc.)
    const stopWords = new Set([
      // English stop words
      'find', 'all', 'the', 'links', 'link', 'about', 'a', 'an', 'for', 'in', 'on', 'page', 'pages', 
      'website', 'site', 'get', 'crawl', 'extract', 'show', 'list', 'me', 'with', 'from', 'to', 'of', 
      'and', 'or', 'only', 'relevant', 'urls', 'url', 'please', 'give', 'fetch',
      // Common Bengali stop words
      'সব', 'সবগুলো', 'সবগুলি', 'লিঙ্ক', 'লিংক', 'লিঙ্কগুলো', 'লিংকগুলো', 'পেজ', 'পৃষ্ঠা', 'খুঁজুন', 'বের', 
      'করুন', 'এবং', 'বা', 'এর', 'জন্য', 'থেকে', 'সম্পর্কিত', 'সংক্রান্ত', 'সাইট', 'তথ্য', 'দাও', 'করো'
    ]);
    
    // Unicode-aware word tokenization: \p{L} matches Unicode letters, \p{M} matches combining vowel marks, \p{N} matches numbers
    const instructionTokens = (instruction || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\s_\-]/gu, ' ')
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length >= 2 && !stopWords.has(t));

    // Semantic bilingual concept mapping (Bengali/English synonyms)
    const semanticSynonyms: Record<string, string[]> = {
      'ডকুমেন্টেশন': ['doc', 'docs', 'documentation', 'guide', 'manual', 'reference', 'api'],
      'ডকস': ['doc', 'docs', 'documentation', 'guide'],
      'গাইড': ['guide', 'guides', 'tutorial', 'manual'],
      'প্রাইভেসি': ['privacy', 'policy', 'terms'],
      'গোপনীয়তা': ['privacy', 'policy', 'terms'],
      'শর্তাবলী': ['terms', 'condition', 'policy'],
      'ব্লগ': ['blog', 'article', 'post', 'news'],
      'নিবন্ধ': ['blog', 'article', 'post'],
      'কোর্স': ['course', 'learn', 'tutorial', 'lesson', 'academy'],
      'টিউটোরিয়াল': ['tutorial', 'guide', 'learn'],
      'যোগাযোগ': ['contact', 'about', 'support'],
      'প্রোডাক্ট': ['product', 'item', 'pricing', 'features'],
      'পণ্য': ['product', 'shop', 'store'],
      'দোকান': ['shop', 'store', 'cart'],
      'এপিআই': ['api', 'reference', 'endpoint'],
      'অথেন্টিকেশন': ['auth', 'login', 'security', 'token']
    };

    // Expand tokens with semantic synonyms
    const expandedTokens = new Set<string>(instructionTokens);
    for (const token of instructionTokens) {
      if (semanticSynonyms[token]) {
        semanticSynonyms[token].forEach(syn => expandedTokens.add(syn));
      }
    }
    const allTokens = Array.from(expandedTokens);

    // If instruction has specific keywords, check if URL path/slug or host matches at least one keyword
    if (allTokens.length > 0) {
      const matchesKeyword = allTokens.some(token => rawPath.includes(token) || decodedPath.includes(token));
      if (!matchesKeyword) {
        const isRoot = parsed.pathname === '/' || parsed.pathname === '';
        if (!isRoot) {
          const matchesHost = allTokens.some(token => parsed.hostname.toLowerCase().includes(token));
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

function extractPageMetadataAndEntities($: cheerio.CheerioAPI, htmlData: string, pageUrl: string) {
  // 1. Metadata
  const title = ($('title').first().text() || $('meta[property="og:title"]').attr('content') || '').trim();
  const description = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '').trim();
  const canonical = ($('link[rel="canonical"]').attr('href') || '').trim();
  const keywordsRaw = $('meta[name="keywords"]').attr('content') || '';
  const keywords = keywordsRaw.split(',').map(k => k.trim()).filter(Boolean);
  const ogTitle = ($('meta[property="og:title"]').attr('content') || '').trim();
  const ogDescription = ($('meta[property="og:description"]').attr('content') || '').trim();
  const ogImage = ($('meta[property="og:image"]').attr('content') || '').trim();
  const ogType = ($('meta[property="og:type"]').attr('content') || '').trim();
  const twitterCard = ($('meta[name="twitter:card"]').attr('content') || '').trim();
  const author = ($('meta[name="author"]').attr('content') || '').trim();
  const h1: string[] = [];
  $('h1').each((_, el) => {
    const text = $(el).text().trim();
    if (text && !h1.includes(text)) h1.push(text);
  });

  // 2. Emails
  const emailsSet = new Set<string>();
  $('a[href^="mailto:"]').each((_, el) => {
    const raw = $(el).attr('href') || '';
    const clean = raw.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
    if (clean && clean.includes('@') && clean.includes('.')) {
      emailsSet.add(clean);
    }
  });

  const bodyText = $('body').text() || htmlData;
  const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  const emailMatches = bodyText.match(emailRegex) || [];
  const bannedExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js', 'json', 'pdf', 'woff', 'woff2'];
  for (const email of emailMatches) {
    const lower = email.toLowerCase().trim();
    const ext = lower.split('.').pop() || '';
    if (!bannedExts.includes(ext) && !lower.endsWith('.placeholder') && !lower.includes('sentry') && !lower.includes('webpack') && !lower.includes('example.com')) {
      emailsSet.add(lower);
    }
  }

  // 3. Phone numbers
  const phonesSet = new Set<string>();
  $('a[href^="tel:"]').each((_, el) => {
    const raw = $(el).attr('href') || '';
    const clean = raw.replace(/^tel:/i, '').trim();
    if (clean.replace(/\D/g, '').length >= 7) {
      phonesSet.add(clean);
    }
  });

  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
  const phoneMatches = bodyText.match(phoneRegex) || [];
  for (const phone of phoneMatches) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      if (!/^(19\d\d|20\d\d)$/.test(phone.trim())) {
        phonesSet.add(phone.trim());
      }
    }
  }

  // 4. Social Links
  const socialPlatforms = [
    { platform: 'Twitter / X', regex: /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,30})/i },
    { platform: 'LinkedIn', regex: /linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_-]+)/i },
    { platform: 'Facebook', regex: /facebook\.com\/([a-zA-Z0-9_.-]+)/i },
    { platform: 'Instagram', regex: /instagram\.com\/([a-zA-Z0-9_.-]+)/i },
    { platform: 'YouTube', regex: /youtube\.com\/(?:@|channel\/|c\/)?([a-zA-Z0-9_.-]+)/i },
    { platform: 'GitHub', regex: /github\.com\/([a-zA-Z0-9_-]+)/i },
    { platform: 'TikTok', regex: /tiktok\.com\/@([a-zA-Z0-9_.-]+)/i },
    { platform: 'Telegram', regex: /(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)/i },
    { platform: 'Discord', regex: /(?:discord\.gg|discord\.com\/invite)\/([a-zA-Z0-9_-]+)/i }
  ];

  const socialLinks: { platform: string; url: string }[] = [];
  const seenSocialUrls = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href.startsWith('http')) return;
    for (const sp of socialPlatforms) {
      if (sp.regex.test(href) && !seenSocialUrls.has(href)) {
        seenSocialUrls.add(href);
        socialLinks.push({ platform: sp.platform, url: href });
        break;
      }
    }
  });

  return {
    metadata: {
      title,
      description,
      canonical,
      keywords,
      ogTitle,
      ogDescription,
      ogImage,
      ogType,
      twitterCard,
      author,
      h1: h1.slice(0, 5)
    },
    entities: {
      emails: Array.from(emailsSet).slice(0, 50),
      phones: Array.from(phonesSet).slice(0, 50),
      socialLinks: socialLinks.slice(0, 50)
    }
  };
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

  // Direct Download Endpoint for the Implementation Plan
  app.get('/api/download-plan', (req, res) => {
    const candidatePaths = [
      path.join(process.cwd(), 'downloadable_docs/implementation_plan.md'),
      path.join(process.cwd(), 'docs/implementation_plan.md'),
      path.join(process.cwd(), 'public/implementation_plan.md'),
      path.resolve(__dirname, 'downloadable_docs/implementation_plan.md'),
      path.resolve(__dirname, 'docs/implementation_plan.md'),
      path.resolve(__dirname, 'public/implementation_plan.md'),
    ];
    const planFile = candidatePaths.find(p => fs.existsSync(p));
    if (planFile) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="implementation_plan.md"');
      return res.sendFile(planFile);
    }
    return res.status(404).send('Implementation plan file not found.');
  });

  // Direct Download Endpoint for the Full Architectural Blueprint
  app.get('/api/download-blueprint', (req, res) => {
    const candidatePaths = [
      path.join(process.cwd(), 'downloadable_docs/architectural_blueprint.md'),
      path.join(process.cwd(), 'docs/architectural_blueprint.md'),
      path.join(process.cwd(), 'public/architectural_blueprint.md'),
      path.resolve(__dirname, 'downloadable_docs/architectural_blueprint.md'),
      path.resolve(__dirname, 'docs/architectural_blueprint.md'),
      path.resolve(__dirname, 'public/architectural_blueprint.md'),
    ];
    const blueprintFile = candidatePaths.find(p => fs.existsSync(p));
    if (blueprintFile) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="architectural_blueprint.md"');
      return res.sendFile(blueprintFile);
    }
    return res.status(404).send('Architectural blueprint file not found.');
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

  // Status Endpoint checking both Firebase & Gemini API Multi-Key Pool connection
  app.get(['/api/gemini/status', '/api/system-status', '/api/api-status'], async (req, res) => {
    try {
      const firebaseCfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
      let firebaseInfo: any = { connected: true, status: 'connected' };
      if (fs.existsSync(firebaseCfgPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(firebaseCfgPath, 'utf8'));
          firebaseInfo = {
            connected: true,
            status: 'connected',
            projectId: cfg.projectId,
            firestoreDatabaseId: cfg.firestoreDatabaseId,
            authDomain: cfg.authDomain
          };
        } catch (e) {}
      }

      const geminiStatus = geminiKeyPool.getStatus();

      return res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        firebase: firebaseInfo,
        gemini: geminiStatus
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Chat Endpoint powered by Gemini API Key Pool with Auto-Fallback
  app.post('/api/chat', async (req, res) => {
    try {
      const { history, message, context, deepResearch, expertMode } = req.body;
      
      let systemInstruction = `You are an advanced Web Intelligence, Real-Time Crawling, and Data Analysis assistant.
CRITICAL HALLUCINATION PREVENTION & REAL-TIME GROUNDING RULES:
1. NEVER invent, fabricate, speculate, or guess URLs, endpoints, or links under any circumstances. Every single URL you output MUST either:
   (a) Exist verbatim in the provided session context / verified crawled URL pool, or
   (b) Come directly from verified live Google Search grounding web sources.
2. If the user asks for links, subpages, or URLs of a specific website or seed URL:
   - Carefully inspect the "VERIFIED CRAWLER URL POOL" or session context provided to you.
   - If verified URLs exist in the context, present ONLY those verified URLs.
   - If the requested URLs or subpages have not been crawled or are NOT present in the session context, DO NOT hallucinate fake URLs (e.g., do NOT invent /about, /features, /pricing, /docs, /api/v1). Explicitly inform the user in their language (Bengali or English) that these specific paths have not been crawled yet in this session, present whatever verified data is available, and advise them to run the Crawler or Smart Crawler on that domain.
   - NEVER output arbitrary, guessed, or hypothetical links in code blocks unless they are verified in the context or search grounding.
3. Support both Bengali and English fluently based on the user's communication language. Provide clear, honest citations and factual answers.`;
      
      if (deepResearch) {
        systemInstruction += "\n\nDEEP RESEARCH MODE: You have access to detailed web knowledge and live Google Search grounding. Ensure your citations and research are highly specific and helpful. ALWAYS cite real web sources where relevant.";
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
      res.flushHeaders();

      // Format contents for @google/genai
      const contentsPayload: any[] = [];
      if (Array.isArray(history) && history.length > 0) {
        for (const h of history.slice(-10)) {
          contentsPayload.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text || '' }]
          });
        }
      }
      contentsPayload.push({
        role: 'user',
        parts: [{ text: message || '' }]
      });

      try {
        const { stream, keyUsed, keyLabel, modelUsed, fallbackOccurred, fallbackEvent } = await geminiKeyPool.generateContentStreamWithFallback({
          contents: contentsPayload,
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }] // Live Google Search grounding to prevent URL fabrication
          }
        });

        // Notify client of active model and key rotation
        res.write(`data: ${JSON.stringify({ 
          type: 'model_used', 
          model: `${modelUsed} (${keyLabel})`, 
          tokens: 0,
          keyUsed,
          keyLabel,
          fallbackOccurred,
          fallbackEvent
        })}\n\n`);

        if (fallbackOccurred && fallbackEvent) {
          res.write(`data: ${JSON.stringify({ 
            type: 'key_fallback', 
            fallbackEvent 
          })}\n\n`);
        }

        for await (const chunk of stream) {
          const chunkText = chunk.text;
          if (chunkText) {
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
          }

          // Extract search grounding metadata if present
          const grounding = chunk.candidates?.[0]?.groundingMetadata;
          if (grounding?.groundingChunks || grounding?.webSearchQueries) {
            const mappings: Array<{ index: number; vertexUrl: string; realUrl: string; title?: string }> = [];
            const chunks = grounding.groundingChunks || [];
            chunks.forEach((gc: any, idx: number) => {
              if (gc.web?.uri) {
                mappings.push({
                  index: idx,
                  vertexUrl: `[${idx + 1}]`,
                  realUrl: gc.web.uri,
                  title: gc.web.title || gc.web.uri
                });
              }
            });
            if (mappings.length > 0) {
              res.write(`data: ${JSON.stringify({ type: 'grounding_mapping', mappings })}\n\n`);
            }
          }
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        return res.end();
      } catch (geminiErr: any) {
        console.error('[API_CHAT] Gemini stream failed after all fallback attempts:', geminiErr.message);

        // Graceful fallback to local contextual analyzer so user never gets broken screen
        res.write(`data: ${JSON.stringify({ 
          type: 'model_used', 
          model: 'Local Analysis (Fallback Mode)', 
          tokens: 0 
        })}\n\n`);

        let fallbackReply = `⚠️ **এআই এপিআই নোটিশ (Auto-Fallback Mode):**\n\n` +
          `জেমিনি এপিআই কী পুলের সবগুলি কী এই মুহূর্তে লিমিট বা সাময়িক চাহিদায় রয়েছে (${geminiErr.message})।\n\n`;

        if (context && context.trim().length > 0) {
          const urlMatches = Array.from(new Set(context.match(/https?:\/\/[^\s"'<>]+/gi) || []));
          fallbackReply += `📊 **লোকাল অফলাইন কনটেক্সট সারাংশ:**\n` +
            `- মোট শনাক্তকৃত লিঙ্ক: ${urlMatches.length}টি\n\n` +
            `\`\`\`\n${urlMatches.slice(0, 20).join('\n')}\n\`\`\`\n\n` +
            `কিছুক্ষণ পর আবার মেসেজ পাঠালে অটোমেটিক কী পুল থেকে পুনরায় কানেক্ট হবে।`;
        } else {
          fallbackReply += `আপনার বার্তা: "${message}"\n\nসিস্টেম ব্যাকগ্রাউন্ডে কী রোটেশন ও ফেইলওভার পর্যবেক্ষণ করছে। কিছুক্ষণ পর পুনরায় বার্তা পাঠান।`;
        }

        const chunks = fallbackReply.match(/[\s\S]{1,60}/g) || [fallbackReply];
        for (const chunk of chunks) {
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
          await new Promise(r => setTimeout(r, 15));
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        return res.end();
      }
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  });

  app.get('/api/subdomains', async (req, res) => {
    const domain = req.query.domain as string;
    if (!domain) return res.status(400).json({ error: 'Domain is required' });
    
    // In Passive Mode, avoid external scraping pings to crt.sh/hackertarget
    const standardPrefixes = ['www', 'api', 'app', 'blog', 'mail', 'dev', 'admin', 'portal', 'docs'];
    const safeSubdomains = standardPrefixes.map(p => `${p}.${domain}`);
    return res.json({ subdomains: safeSubdomains, passiveMode: true });
  });

  // SSE endpoint for crawling
  app.get('/api/crawl', async (req, res) => {
    const targetUrl = req.query.url as string;
    const mode = req.query.mode as 'single' | 'subdir' | 'domain';
    const maxPages = parseInt(req.query.maxPages as string) || 50;
    const maxDepth = parseInt(req.query.maxDepth as string) || 3;
    const maxBreadth = parseInt(req.query.maxBreadth as string) || 1000;
    const crawlDelay = Math.max(0, Math.min(10000, parseInt(req.query.crawlDelay as string) || 0));
    const restrictDomain = ((req.query.restrictDomain as string) || '').trim().toLowerCase();
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

    const customRegexRaw = (req.query.customRegex as string) || '';
    let customRegex: RegExp | null = null;
    if (customRegexRaw) {
      try {
        customRegex = new RegExp(customRegexRaw, 'i');
      } catch (e) {}
    }

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

          // Custom Regex Filter (User-defined expression)
          if (customRegex) {
            if (!customRegex.test(normalizedUrl)) {
              if (verbose) sendEvent('status', { log: `[SKIP: Custom Regex Mismatch] ${normalizedUrl}` });
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
            } else if (restrictDomain) {
              // Custom domain/subdomain restriction override
              if (resolvedHost === restrictDomain || resolvedHost.endsWith('.' + restrictDomain)) {
                isValid = true;
              } else {
                rejectReason = `Restricted to domain/subdomain ${restrictDomain} (${resolvedHost} mismatch)`;
              }
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

              if (restrictDomain) {
                if (resolvedHost === restrictDomain || resolvedHost.endsWith('.' + restrictDomain)) {
                  canCrawl = true;
                }
              } else if (mode === 'subdir' && (resolvedHost === startDomain || isIncludedHost) && isSubdirMatch(resolvedUrl.pathname)) {
                canCrawl = true;
              } else if (mode === 'domain') {
                if (isIncludedHost) canCrawl = true;
                else if (subdomainOnly && resolvedHost === startDomain) canCrawl = true;
                else if (!subdomainOnly && (resolvedHost === baseDomain || resolvedHost.endsWith('.' + baseDomain))) canCrawl = true;
              }

              // Filter out administrative, notice dismissal, login/logout, or non-content CMS actions
              const skipAdminPaths = /\/(wp-json\/wc-admin|wp-admin|wp-login\.php|xmlrpc\.php|wp-cron\.php|admin-ajax\.php|cart|checkout|my-account|logout|\.well-known\/)/i;
              const hasAdminAction = /[?&](action=dismiss|action=logout|_wpnonce=|wc-ajax=)/i.test(normalizedUrl);
              if (skipAdminPaths.test(resolvedUrl.pathname) || hasAdminAction) {
                canCrawl = false;
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

              try {
                const parsedInfo = extractPageMetadataAndEntities($, htmlData, currentUrl);
                sendEvent('page_data', { url: currentUrl, ...parsedInfo });
              } catch (parseErr: any) {
                // Silently continue if entity parsing encounters abnormal DOM
              }

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

        // Polite crawl delay between page requests if configured
        if (crawlDelay > 0 && toVisit.length > 0 && pagesCrawled < maxPages && isClientConnected) {
          await new Promise(r => setTimeout(r, crawlDelay));
        }
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

  // Dedicated single-page or on-demand content parsing & entity extraction endpoint
  app.post('/api/parse-page', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      const response = await axiosWithRetry(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000,
        validateStatus: () => true
      });

      const htmlData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      const $ = cheerio.load(htmlData);
      const extracted = extractPageMetadataAndEntities($, htmlData, url);

      return res.json({
        url,
        statusCode: response.status,
        ...extracted
      });
    } catch (err: any) {
      console.error('Error in /api/parse-page:', err.message);
      return res.status(500).json({ error: err.message || 'Failed to parse page' });
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
          if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) continue;

          let htmlData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          const $ = cheerio.load(htmlData);

          // 1. Content-Based Inspection (Title, Headings, Meta Description)
          const pageTitle = ($('title').first().text() || $('meta[property="og:title"]').attr('content') || '').trim();
          const pageDesc = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '').trim();
          const headingsArr: string[] = [];
          $('h1, h2, h3').each((_, el) => {
            const hText = $(el).text().trim();
            if (hText && !headingsArr.includes(hText)) headingsArr.push(hText);
          });
          const pageHeadingsText = headingsArr.slice(0, 8).join(' ');
          const combinedPageContent = `${pageTitle} ${pageHeadingsText} ${pageDesc}`.toLowerCase();

          // Prepare multilingual tokens for content scoring
          const stopWords = new Set([
            'find', 'all', 'the', 'links', 'link', 'about', 'a', 'an', 'for', 'in', 'on', 'page', 'pages', 
            'website', 'site', 'get', 'crawl', 'extract', 'show', 'list', 'me', 'with', 'from', 'to', 'of', 
            'and', 'or', 'only', 'relevant', 'urls', 'url', 'please', 'give', 'fetch',
            'সব', 'সবগুলো', 'সবগুলি', 'লিঙ্ক', 'লিংক', 'লিঙ্কগুলো', 'লিংকগুলো', 'পেজ', 'পৃষ্ঠা', 'খুঁজুন', 'বের', 
            'করুন', 'এবং', 'বা', 'এর', 'জন্য', 'থেকে', 'সম্পর্কিত', 'সংক্রান্ত', 'সাইট', 'তথ্য'
          ]);

          const rawInstructionTokens = (instruction || '')
            .toLowerCase()
            .replace(/[^\p{L}\p{M}\p{N}\s_\-]/gu, ' ')
            .split(/\s+/)
            .map(t => t.trim())
            .filter(t => t.length >= 2 && !stopWords.has(t));

          const semanticSynonyms: Record<string, string[]> = {
            'ডকুমেন্টেশন': ['doc', 'docs', 'documentation', 'guide', 'manual', 'reference', 'api'],
            'ডকস': ['doc', 'docs', 'documentation', 'guide'],
            'গাইড': ['guide', 'guides', 'tutorial', 'manual'],
            'প্রাইভেসি': ['privacy', 'policy', 'terms'],
            'গোপনীয়তা': ['privacy', 'policy', 'terms'],
            'শর্তাবলী': ['terms', 'condition', 'policy'],
            'ব্লগ': ['blog', 'article', 'post', 'news'],
            'নিবন্ধ': ['blog', 'article', 'post'],
            'কোর্স': ['course', 'learn', 'tutorial', 'lesson'],
            'টিউটোরিয়াল': ['tutorial', 'guide', 'learn'],
            'যোগাযোগ': ['contact', 'about', 'support'],
            'প্রোডাক্ট': ['product', 'item', 'pricing', 'features'],
            'পণ্য': ['product', 'shop', 'store'],
            'এপিআই': ['api', 'reference', 'endpoint'],
            'অথেন্টিকেশন': ['auth', 'login', 'security', 'token']
          };

          const allTokensSet = new Set<string>(rawInstructionTokens);
          for (const token of rawInstructionTokens) {
            if (semanticSynonyms[token]) {
              semanticSynonyms[token].forEach(syn => allTokensSet.add(syn));
            }
          }
          const allInstructionTokens = Array.from(allTokensSet);

          // Test if current page content matches user instruction intent
          const isContentMatch = allInstructionTokens.length > 0 && allInstructionTokens.some(tok => combinedPageContent.includes(tok));
          if (isContentMatch && !foundLinks.has(currentUrl)) {
            foundLinks.add(currentUrl);
            sendEvent('link', { 
              url: currentUrl, 
              source: 'content_matched', 
              title: pageTitle || 'Content Matched Page' 
            });
            sendEvent('status', { 
              log: `[CONTENT MATCH] ${currentUrl} - "${pageTitle || 'Matched page intent in headings/title'}"` 
            });
          }

          // 2. Comprehensive Link Extraction: Anchor tags, <link>, SPA script JSON blobs, and deep regex
          const rawLinkCandidates = new Map<string, { source: string; anchorText?: string }>();

          // 2a. Anchor tags with anchor text inspection
          $('a').each((_, el) => {
            const href = $(el).attr('href');
            const anchorText = $(el).text().trim();
            if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
              rawLinkCandidates.set(href, { source: 'anchor', anchorText });
            }
          });

          // 2b. Link tags and data attributes
          $('link[href], [data-href], [data-url]').each((_, el) => {
            const href = $(el).attr('href') || $(el).attr('data-href') || $(el).attr('data-url');
            if (href && !rawLinkCandidates.has(href)) {
              rawLinkCandidates.set(href, { source: 'link_tag' });
            }
          });

          // 2c. Structured JSON-LD (<script type="application/ld+json">)
          $('script[type="application/ld+json"]').each((_, el) => {
            try {
              const jsonText = $(el).html() || '';
              const parsed = JSON.parse(jsonText);
              const extractUrlsFromJson = (obj: any) => {
                if (!obj || typeof obj !== 'object') return;
                if (typeof obj.url === 'string' && obj.url.startsWith('http')) {
                  rawLinkCandidates.set(obj.url, { source: 'json_ld' });
                }
                if (typeof obj['@id'] === 'string' && obj['@id'].startsWith('http')) {
                  rawLinkCandidates.set(obj['@id'], { source: 'json_ld' });
                }
                if (Array.isArray(obj.itemListElement)) {
                  obj.itemListElement.forEach((item: any) => {
                    if (item?.item && typeof item.item === 'string') rawLinkCandidates.set(item.item, { source: 'json_ld' });
                    else if (item?.url) rawLinkCandidates.set(item.url, { source: 'json_ld' });
                  });
                }
                for (const k of Object.keys(obj)) {
                  if (typeof obj[k] === 'object') extractUrlsFromJson(obj[k]);
                }
              };
              extractUrlsFromJson(parsed);
            } catch (e) {}
          });

          // 2d. Deep Regex Extraction for SPAs & Client-side Frameworks (Next.js __NEXT_DATA__, Vite, Nuxt)
          let rawTextForRegex = htmlData.replace(/\\\//g, '/');
          const domainRegex = new RegExp(`https?://${startDomain.replace(/\./g, '\\.')}[^\\s"'<>\`\\[\\]{}|\\\\^]+`, 'gi');
          const absRegexMatches = rawTextForRegex.match(domainRegex) || [];
          for (const m of absRegexMatches.slice(0, 200)) {
            if (!rawLinkCandidates.has(m)) {
              rawLinkCandidates.set(m, { source: 'spa_deep_regex' });
            }
          }

          // Relative paths in scripts and attributes: e.g. "/docs/..." or "/guides/..."
          const relRegex = /["'](\/[a-zA-Z0-9_\-\.][a-zA-Z0-9_\-\./?=&%#]*)["']/g;
          let relMatch;
          let relCount = 0;
          while ((relMatch = relRegex.exec(rawTextForRegex)) !== null && relCount < 100) {
            const relHref = relMatch[1];
            if (relHref && !rawLinkCandidates.has(relHref)) {
              rawLinkCandidates.set(relHref, { source: 'spa_relative_regex' });
              relCount++;
            }
          }

          // 3. Process and Normalize Extracted Links
          const matchedNewLinks: string[] = [];
          const exploratoryNewLinks: string[] = [];

          for (const [rawHref, meta] of rawLinkCandidates.entries()) {
            try {
              const sanitized = sanitizeAndDecodeUrl(rawHref);
              if (!sanitized) continue;

              const resolvedUrl = new URL(sanitized, currentUrl);
              const normalizedUrl = resolvedUrl.toString().split('#')[0];

              if (visited.has(normalizedUrl) || foundLinks.has(normalizedUrl)) continue;

              let allowed = isUrlDomainAllowed(normalizedUrl, startDomain, includeDomainsList);
              if (!allowed) continue;

              // Check filters
              if (includePatternsList.length > 0 && !includePatternsList.some(p => p.test(normalizedUrl))) continue;
              if (excludePatternsList.length > 0 && excludePatternsList.some(p => p.test(normalizedUrl))) continue;
              
              const ext = normalizedUrl.split('.').pop()?.toLowerCase() || '';
              if (excludeExtensionsList.length > 0 && excludeExtensionsList.includes(ext)) continue;

              // Skip static media/binary files
              if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js', 'ico', 'woff', 'woff2', 'ttf', 'zip', 'gz', 'pdf'].includes(ext)) {
                continue;
              }

              // Skip CMS admin / logout paths
              if (/\/(wp-admin|wp-login\.php|logout|xmlrpc\.php|admin-ajax\.php|\.well-known\/)/i.test(resolvedUrl.pathname)) {
                continue;
              }

              // Determine if link matches user instruction (via URL slug, host, or anchor text)
              const slugMatches = validateAndScoreUrlWithInstruction(normalizedUrl, startDomain, instruction, includeDomainsList);
              const anchorMatches = Boolean(meta.anchorText && allInstructionTokens.some(tok => meta.anchorText!.toLowerCase().includes(tok)));

              if (slugMatches || anchorMatches) {
                matchedNewLinks.push(normalizedUrl);
              } else {
                // If on same origin/subdomain, qualify as exploratory navigation candidate
                const isSameOrigin = resolvedUrl.hostname.toLowerCase() === startDomain.toLowerCase();
                const isContentPath = resolvedUrl.pathname.length > 1 && !resolvedUrl.pathname.includes('/cart');
                if (isSameOrigin && isContentPath) {
                  exploratoryNewLinks.push(normalizedUrl);
                }
              }
            } catch (e) {}
          }

          // 4. Handle Direct Matches: Emit & Queue
          if (matchedNewLinks.length > 0) {
            for (const mUrl of matchedNewLinks) {
              if (!foundLinks.has(mUrl)) {
                foundLinks.add(mUrl);
                sendEvent('link', { url: mUrl, source: 'instruction_validated' });
                if (currentDepth < maxDepth) {
                  toVisit.push({ url: mUrl, depth: currentDepth + 1 });
                }
              }
            }
            sendEvent('status', { 
              log: `[MATCH FOUND] Validated ${matchedNewLinks.length} target instruction links from ${currentUrl}` 
            });
          }

          // 5. DO NOT ABORT ON 0 DIRECT MATCHES: Traversal for Documentation & Topic Hubs
          // If level 1 didn't have keyword in slug, queue exploratory links to traverse deeper documentation paths
          if (currentDepth < maxDepth && exploratoryNewLinks.length > 0) {
            // Pick up to 8 same-origin exploratory links to continue deep crawl exploration
            const toQueue = exploratoryNewLinks
              .filter(link => !visited.has(link) && !toVisit.some(item => item.url === link))
              .slice(0, 8);

            for (const expUrl of toQueue) {
              toVisit.push({ url: expUrl, depth: currentDepth + 1 });
            }

            if (toQueue.length > 0) {
              sendEvent('status', { 
                log: `[DEEP TRAVERSAL] Queued ${toQueue.length} exploratory hub path(s) at Depth ${currentDepth + 1} (Traversing documentation tree...)` 
              });
            }
          }
        } catch (error: any) {
          errorsCount++;
          sendEvent('status', { log: `Failed to fetch ${currentUrl}: ${error.message}` });
        }
      }

      sendEvent('status', { log: `Smart crawl finished. Analyzed ${pagesCrawled} pages.` });

      // AI Summary with Multi-Key Pool & Fallback
      if (foundLinks.size > 0) {
        sendEvent('status', { log: `Generating intelligent AI analysis report...` });
        const linksArray = Array.from(foundLinks);
        
        let summaryText = '';
        try {
          const aiPrompt = `You are an expert web intelligence and data extractor analyst.
A smart crawl for instruction "${instruction}" finished.
Crawled ${pagesCrawled} pages and found ${linksArray.length} relevant URLs.
Sample URLs found:
${linksArray.slice(0, 25).map((u, i) => `${i + 1}. ${u}`).join('\n')}

Generate a structured Markdown summary report in Bengali & English with:
1. 📊 Crawl Results Overview (Found count, target domain)
2. 🎯 Key findings matching the user's intent: "${instruction}"
3. 💡 Recommended Next Actions (e.g. Bulk Fetching, Extracting tables/emails, or further deep scanning)`;

          const aiRes = await geminiKeyPool.generateContentWithFallback({
            contents: [{ parts: [{ text: aiPrompt }] }],
          });
          summaryText = aiRes.text;
        } catch (sumErr: any) {
          console.warn('[SMART_CRAWL] AI Summary generation fallback:', sumErr.message);
          summaryText = `### 📊 স্মার্ট ক্রলার বিশ্লেষণ রিপোর্ট (Smart Crawl Report)\n\n` +
            `**অনুরোধকৃত নির্দেশ:** "${instruction}"\n` +
            `**মোট পর্যালোচিত পেজ:** ${pagesCrawled}\n` +
            `**শনাক্তকৃত প্রাসঙ্গিক লিঙ্ক:** ${linksArray.length}\n\n` +
            `সংগৃহীত লিঙ্কসমূহ লোকাল সেশনে সুরক্ষিত রয়েছে।`;
        }

        sendEvent('summary', { text: summaryText });
        sendEvent('status', { log: `Analysis report generated successfully.` });
      }

      sendEvent('done', { total: foundLinks.size, pagesCrawled, errors: errorsCount });
      clearInterval(heartbeat);
      setTimeout(() => res.end(), 250);
      
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    }
  });

  // POST endpoint for AI filtering of a list of URLs with Key Rotation & Auto Fallback
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

      // Fast local pre-filter
      const preFiltered = urls.filter(u => 
        typeof u === 'string' && 
        u.startsWith('http') && 
        validateAndScoreUrlWithInstruction(u, startDomain, instruction)
      );

      // Attempt AI refinement if available
      try {
        const candidateSlice = urls.slice(0, 60);
        const prompt = `Filter the following list of URLs based on the instruction: "${instruction}".
Return ONLY a valid JSON array of string URLs that match.
URLs:
${JSON.stringify(candidateSlice)}`;

        const aiRes = await geminiKeyPool.generateContentWithFallback({
          contents: [{ parts: [{ text: prompt }] }],
          config: {
            responseMimeType: 'application/json'
          }
        });

        const parsed = JSON.parse(aiRes.text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return res.json({ urls: parsed, keyUsed: aiRes.keyUsed, modelUsed: aiRes.modelUsed });
        }
      } catch (aiErr: any) {
        console.warn('[SMART_FILTER] AI filter fallback to local heuristics:', aiErr.message);
      }

      res.json({ urls: preFiltered.length > 0 ? preFiltered : urls });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST endpoint to generate intelligent tags on demand with Key Rotation & Auto Fallback
  app.post('/api/generate-tags', async (req, res) => {
    const { title, url, type, sampleUrls = [], existingTags = [] } = req.body;

    try {
      const urlsSlice = Array.isArray(sampleUrls) ? sampleUrls.slice(0, 30) : [];
      
      // Fast, deterministic local heuristic categorization
      const localTags: string[] = [];
      if (url) {
        try {
          const parsed = new URL(url);
          const hostParts = parsed.hostname.replace(/^www\./, '').split('.');
          if (hostParts[0] && hostParts[0].length > 2) {
            localTags.push(hostParts[0].toLowerCase());
          }
          const pathSegments = parsed.pathname.split('/').filter(p => p.length > 2 && !p.includes('.'));
          pathSegments.slice(0, 2).forEach(p => localTags.push(p.toLowerCase()));
        } catch (e) {}
      }
      if (type) localTags.push(type.replace('_', '-'));

      // Extract keywords from title
      if (title) {
        const words = title.toLowerCase().replace(/[^a-z0-9\s-_]/g, '').split(/\s+/).filter((w: string) => w.length > 3 && !['crawl', 'crawler', 'links', 'data', 'page'].includes(w));
        words.slice(0, 2).forEach((w: string) => localTags.push(w));
      }

      // Sample URL paths for extra tags
      urlsSlice.forEach((u: any) => {
        const uStr = typeof u === 'string' ? u : (u.url || '');
        if (uStr.includes('/blog') && !localTags.includes('blog')) localTags.push('blog');
        if (uStr.includes('/product') && !localTags.includes('products')) localTags.push('products');
        if (uStr.includes('/doc') && !localTags.includes('documentation')) localTags.push('docs');
      });

      // Try AI tag generation for smart suggestions
      try {
        const tagPrompt = `Generate 3 to 5 concise tags (lowercase, hyphen-separated, no hashtag) for a web crawling session:
Title: "${title || 'Web Crawl'}"
URL: "${url || 'N/A'}"
Type: "${type || 'crawler'}"
Sample URLs: ${urlsSlice.slice(0, 10).map((u: any) => typeof u === 'string' ? u : u.url).join(', ')}
Return ONLY a JSON array of strings, e.g. ["tech", "blog", "research"].`;

        const aiRes = await geminiKeyPool.generateContentWithFallback({
          contents: [{ parts: [{ text: tagPrompt }] }],
          config: { responseMimeType: 'application/json' }
        });

        const parsedTags = JSON.parse(aiRes.text);
        if (Array.isArray(parsedTags) && parsedTags.length > 0) {
          const merged = Array.from(new Set([...existingTags, ...parsedTags.map((t: string) => t.toLowerCase().trim()), ...localTags])).slice(0, 6);
          return res.json({ tags: merged, keyUsed: aiRes.keyUsed });
        }
      } catch (aiTagErr: any) {
        console.warn('[GENERATE_TAGS] AI tags fallback to local heuristics:', aiTagErr.message);
      }

      const finalTags = Array.from(new Set([...existingTags, ...localTags])).slice(0, 5);
      if (finalTags.length === 0) {
        finalTags.push('web-data', 'resources');
      }

      res.json({ tags: finalTags });
    } catch (error: any) {
      console.error('Tag generation endpoint failed:', error);
      res.status(500).json({ error: error.message || 'Failed to generate tags', tags: [] });
    }
  });

  // Health check endpoint to scan crawled URLs and detect 404/500/broken links
  app.post('/api/check-urls-health', async (req, res) => {
    try {
      const { urls } = req.body;
      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'Array of URLs is required' });
      }

      const targetUrls: string[] = urls
        .filter((u: any) => typeof u === 'string' && u.startsWith('http'))
        .slice(0, 50);

      const results: Array<{
        url: string;
        status: number;
        ok: boolean;
        statusText: string;
      }> = [];

      const batchSize = 6;
      for (let i = 0; i < targetUrls.length; i += batchSize) {
        const batch = targetUrls.slice(i, i + batchSize);
        await Promise.all(batch.map(async (u) => {
          try {
            let response;
            try {
              response = await axios.head(u, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 5000,
                maxRedirects: 3,
                validateStatus: () => true
              });
            } catch (headErr) {
              response = null;
            }

            if (!response || response.status === 405) {
              response = await axios.get(u, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 5000,
                maxRedirects: 3,
                validateStatus: () => true
              });
            }

            const status = response.status;
            const ok = status >= 200 && status < 400;
            results.push({
              url: u,
              status,
              ok,
              statusText: status === 404 ? '404 Not Found' : status === 500 ? '500 Server Error' : (response.statusText || String(status))
            });
          } catch (err: any) {
            const status = err.response?.status || (err.code === 'ECONNABORTED' ? 408 : 500);
            results.push({
              url: u,
              status,
              ok: false,
              statusText: err.code === 'ECONNABORTED' ? 'Timeout (408)' : (err.message || 'Connection Error')
            });
          }
        }));
      }

      res.json({
        totalChecked: results.length,
        brokenCount: results.filter(r => !r.ok).length,
        results
      });
    } catch (error: any) {
      console.error('Check URLs health failed:', error);
      res.status(500).json({ error: error.message || 'Internal health check error' });
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
