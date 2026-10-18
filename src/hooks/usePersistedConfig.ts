import { useState, useEffect, useCallback } from 'react';

/**
 * usePersistedConfig
 * Reusable hook that persists form state / configuration in localStorage
 * with error-safe parsing fallbacks and a factory reset action.
 */
export function usePersistedConfig<T>(key: string, defaultVal: T): [T, (val: T | ((prev: T) => T)) => void, () => void] {
  const storageKey = `crawler_v2_cfg_${key}`;

  const [state, setStateInternal] = useState<T>(() => {
    try {
      if (typeof window === 'undefined') return defaultVal;
      const item = localStorage.getItem(storageKey);
      if (item !== null) {
        return JSON.parse(item);
      }
    } catch (err) {
      console.warn(`[usePersistedConfig] Failed to load key "${storageKey}" from localStorage:`, err);
    }
    return defaultVal;
  });

  const setState = useCallback((val: T | ((prev: T) => T)) => {
    setStateInternal(prev => {
      const nextVal = typeof val === 'function' ? (val as (prev: T) => T)(prev) : val;
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, JSON.stringify(nextVal));
        }
      } catch (err) {
        console.warn(`[usePersistedConfig] Failed to save key "${storageKey}":`, err);
      }
      return nextVal;
    });
  }, [storageKey]);

  const resetToDefault = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(storageKey);
      }
    } catch (err) {
      console.warn(`[usePersistedConfig] Failed to clear key "${storageKey}":`, err);
    }
    setStateInternal(defaultVal);
  }, [storageKey, defaultVal]);

  return [state, setState, resetToDefault];
}
