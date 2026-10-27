/**
 * Client API & Resilient Networking Service
 * Provides exponential backoff retries, status code logging, and SSE reconnect management.
 */

/**
 * Resolve API paths for same-origin web deployment or a separately hosted backend.
 * VITE_API_BASE_URL is public client configuration only; never place secrets in it.
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");

export function apiUrl(path: string): string {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  onLog?: (message: string, type?: 'info' | 'error' | 'warning' | 'success') => void;
}

/**
 * Log networking event with structured tag to console and optional log callback.
 */
export function logNetworkEvent(
  message: string,
  type: 'info' | 'error' | 'warning' | 'success' = 'info',
  onLog?: (msg: string, type?: 'info' | 'error' | 'warning' | 'success') => void
) {
  const timestamp = new Date().toLocaleTimeString();
  const consoleMsg = `[CRAWL_NETWORK_LOG ${timestamp}] ${message}`;

  if (type === 'error') {
    console.error(consoleMsg);
  } else if (type === 'warning') {
    console.warn(consoleMsg);
  } else {
    console.log(consoleMsg);
  }

  if (onLog) {
    onLog(message, type);
  }
}

/**
 * Perform standard HTTP fetch with exponential backoff retry.
 * Handles network disconnections, server timeouts, and 5xx / 429 status codes gracefully.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOpts: RetryOptions = {}
): Promise<Response> {
  const { maxRetries = 3, initialDelayMs = 1000, backoffFactor = 2, onLog } = retryOpts;
  const requestUrl = apiUrl(url);

  let attempt = 0;

  while (true) {
    try {
      logNetworkEvent(`Requesting: ${options.method || 'GET'} ${requestUrl} (Attempt ${attempt + 1}/${maxRetries + 1})`, 'info', onLog);

      const response = await fetch(requestUrl, options);

      logNetworkEvent(`Response status code: HTTP ${response.status} (${response.statusText || 'OK'}) for ${requestUrl}`, 
        response.ok ? 'success' : 'warning', 
        onLog
      );

      // If status code is 429 or 5xx, and we still have retry attempts remaining:
      if ((response.status === 429 || (response.status >= 500 && response.status <= 599)) && attempt < maxRetries) {
        attempt++;
        const delay = Math.min(initialDelayMs * Math.pow(backoffFactor, attempt - 1) + Math.random() * 200, 10000);
        logNetworkEvent(
          `Server returned HTTP ${response.status}. Retrying in ${Math.round(delay)}ms (Attempt ${attempt}/${maxRetries})...`,
          'warning',
          onLog
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error: any) {
      attempt++;
      const isNetworkError = error.name === 'TypeError' || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError');
      const errDetail = isNetworkError ? 'Network glitch or connection refused' : error.message;

      logNetworkEvent(
        `Connection failure on ${requestUrl}: ${errDetail} (Attempt ${attempt}/${maxRetries + 1})`,
        'error',
        onLog
      );

      if (attempt > maxRetries) {
        throw new Error(`Connection error to server (${errDetail}) after ${maxRetries} retry attempts.`);
      }

      const delay = Math.min(initialDelayMs * Math.pow(backoffFactor, attempt - 1) + Math.random() * 200, 10000);
      logNetworkEvent(`Retrying connection to server in ${Math.round(delay)}ms...`, 'warning', onLog);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * EventSource wrapper with exponential backoff reconnect logic.
 */
export interface SSEOptions {
  url: string;
  onMessage: (data: any) => void;
  onError?: (errorMessage: string) => void;
  onLog?: (message: string, type?: 'info' | 'error' | 'warning' | 'success') => void;
  maxRetries?: number;
  initialDelayMs?: number;
}

export function createEventSourceConnection({
  url,
  onMessage,
  onError,
  onLog,
  maxRetries = 4,
  initialDelayMs = 1000
}: SSEOptions) {
  const resolvedUrl = apiUrl(url);
  let eventSource: EventSource | null = null;
  let retryCount = 0;
  let isClosedManually = false;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let stableConnectionTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (isClosedManually) return;

    logNetworkEvent(`Connecting SSE stream to ${resolvedUrl} (Attempt ${retryCount + 1}/${maxRetries + 1})...`, 'info', onLog);

    eventSource = new EventSource(resolvedUrl);

    eventSource.onopen = () => {
      logNetworkEvent(`SSE stream connected successfully (HTTP 200 OK) for ${resolvedUrl}`, 'success', onLog);
      // Do not reset on a fleeting onopen: mobile networks/backgrounding can flap.
      if (stableConnectionTimer) clearTimeout(stableConnectionTimer);
      stableConnectionTimer = setTimeout(() => {
        retryCount = 0;
        stableConnectionTimer = null;
      }, 30_000);
    };

    eventSource.onmessage = (event) => {
      if (isClosedManually) return;
      try {
        const parsed = JSON.parse(event.data);
        onMessage(parsed);
      } catch (err: any) {
        console.error("Failed to parse SSE JSON chunk:", err);
      }
    };

    eventSource.onerror = () => {
      if (isClosedManually) return;

      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (stableConnectionTimer) {
        clearTimeout(stableConnectionTimer);
        stableConnectionTimer = null;
      }

      retryCount++;

      if (retryCount <= maxRetries) {
        const delay = Math.min(initialDelayMs * Math.pow(2, retryCount - 1) + Math.random() * 200, 10000);
        logNetworkEvent(
          `Connection error to server on SSE stream. Retrying in ${Math.round(delay)}ms (Attempt ${retryCount}/${maxRetries})...`,
          'warning',
          onLog
        );

        reconnectTimer = setTimeout(() => {
          connect();
        }, delay);
      } else {
        const fatalMsg = `Connection error to server after ${maxRetries} reconnect attempts. Please check network or server status.`;
        logNetworkEvent(fatalMsg, 'error', onLog);
        if (onError) {
          onError(fatalMsg);
        }
      }
    };
  };

  connect();

  return {
    close: () => {
      isClosedManually = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (stableConnectionTimer) clearTimeout(stableConnectionTimer);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      logNetworkEvent(`SSE stream closed by client.`, 'info', onLog);
    }
  };
}
