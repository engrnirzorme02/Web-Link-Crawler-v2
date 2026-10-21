/** Client API with centralized URL routing and resilient networking. */
export interface RetryOptions { maxRetries?: number; initialDelayMs?: number; backoffFactor?: number; onLog?: (message: string, type?: 'info'|'error'|'warning'|'success') => void; }
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}
export function logNetworkEvent(message: string, type: 'info'|'error'|'warning'|'success' = 'info', onLog?: (msg: string, type?: 'info'|'error'|'warning'|'success') => void) {
  const msg = `[CRAWL_NETWORK_LOG ${new Date().toLocaleTimeString()}] ${message}`;
  if (type === 'error') console.error(msg); else if (type === 'warning') console.warn(msg); else console.log(msg);
  onLog?.(message, type);
}
export async function fetchWithRetry(url: string, options: RequestInit = {}, retryOpts: RetryOptions = {}): Promise<Response> {
  const { maxRetries = 3, initialDelayMs = 1000, backoffFactor = 2, onLog } = retryOpts;
  const resolvedUrl = apiUrl(url); let attempt = 0;
  while (true) {
    try {
      logNetworkEvent(`Requesting: ${options.method || 'GET'} ${resolvedUrl} (Attempt ${attempt + 1}/${maxRetries + 1})`, 'info', onLog);
      const response = await fetch(resolvedUrl, options);
      logNetworkEvent(`HTTP ${response.status} for ${resolvedUrl}`, response.ok ? 'success' : 'warning', onLog);
      if ((response.status === 429 || (response.status >= 500 && response.status <= 599)) && attempt < maxRetries) {
        attempt++; const delay = Math.min(initialDelayMs * Math.pow(backoffFactor, attempt - 1) + Math.random() * 200, 10000);
        await new Promise(resolve => setTimeout(resolve, delay)); continue;
      }
      return response;
    } catch (error: any) {
      attempt++;
      const detail = error?.name === 'TypeError' ? 'Network glitch or connection refused' : (error?.message || String(error));
      logNetworkEvent(`Connection failure on ${resolvedUrl}: ${detail} (Attempt ${attempt}/${maxRetries + 1})`, 'error', onLog);
      if (attempt > maxRetries) throw new Error(`Connection error to server (${detail}) after ${maxRetries} retry attempts.`);
      const delay = Math.min(initialDelayMs * Math.pow(backoffFactor, attempt - 1) + Math.random() * 200, 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
export interface SSEOptions {
  url: string; onMessage: (data: any) => void; onError?: (errorMessage: string) => void;
  onLog?: (message: string, type?: 'info'|'error'|'warning'|'success') => void;
  maxRetries?: number; initialDelayMs?: number; stableConnectionMs?: number;
}
/**
 * Exponential backoff for SSE. Retry budget resets only after a sustained connection.
 * This reconnects transport only; server-side resume requires persisted job/event state.
 */
export function createEventSourceConnection({ url, onMessage, onError, onLog, maxRetries = 4, initialDelayMs = 1000, stableConnectionMs = 30000 }: SSEOptions) {
  let eventSource: EventSource | null = null, retryCount = 0, isClosedManually = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null, stableTimer: ReturnType<typeof setTimeout> | null = null;
  const resolvedUrl = apiUrl(url);
  const clearStable = () => { if (stableTimer) clearTimeout(stableTimer); stableTimer = null; };
  const connect = () => {
    if (isClosedManually) return;
    logNetworkEvent(`Connecting SSE stream to ${resolvedUrl} (Attempt ${retryCount + 1}/${maxRetries + 1})`, 'info', onLog);
    const source = new EventSource(resolvedUrl); eventSource = source;
    source.onopen = () => {
      logNetworkEvent(`SSE connected: ${resolvedUrl}`, 'success', onLog);
      clearStable(); stableTimer = setTimeout(() => { retryCount = 0; stableTimer = null; }, stableConnectionMs);
    };
    source.onmessage = event => {
      if (isClosedManually) return;
      try { onMessage(JSON.parse(event.data)); } catch (err) { console.error('Failed to parse SSE JSON chunk:', err); }
    };
    source.onerror = () => {
      if (isClosedManually || eventSource !== source) return;
      clearStable(); source.close(); eventSource = null; retryCount++;
      if (retryCount <= maxRetries) {
        const delay = Math.min(initialDelayMs * Math.pow(2, retryCount - 1) + Math.random() * 200, 10000);
        logNetworkEvent(`SSE interrupted; retrying in ${Math.round(delay)}ms (${retryCount}/${maxRetries})`, 'warning', onLog);
        reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
      } else {
        const message = `SSE connection failed after ${maxRetries} retries. Automatic reconnect cannot resume a server job unless job replay is implemented.`;
        logNetworkEvent(message, 'error', onLog); onError?.(message);
      }
    };
  };
  connect();
  return { close: () => {
    isClosedManually = true; if (reconnectTimer) clearTimeout(reconnectTimer); clearStable();
    reconnectTimer = null; eventSource?.close(); eventSource = null;
    logNetworkEvent('SSE stream closed by client.', 'info', onLog);
  } };
}
