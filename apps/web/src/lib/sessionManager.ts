import { supabase } from './supabase';

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.')) {
      return 'http://localhost:3001';
    }
    return (window as any).__PUBLIC_API_URL__ !== undefined ? (window as any).__PUBLIC_API_URL__ : '';
  }
  return import.meta.env.PUBLIC_API_URL || '';
}

const API_BASE = getApiBaseUrl();
const SESSION_STORAGE_KEY = 'otpwala_session_id';

/**
 * Generate a unique session identifier for this device login.
 */
export function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'sess_' + crypto.randomUUID();
  }
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
}

/**
 * Retrieve the active session ID stored for this device.
 */
export function getLocalSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

/**
 * Store the active session ID for this device.
 */
export function setLocalSessionId(sessionId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
}

/**
 * Clear the local device session ID.
 */
export function clearLocalSessionId(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Register a new device session with the backend API.
 * This assigns this device as the sole active session and invalidates any previous device.
 */
export async function registerCurrentSession(
  accessToken: string,
  customSessionId?: string
): Promise<{ success: boolean; sessionId: string }> {
  const sessionId = customSessionId || generateSessionId();
  setLocalSessionId(sessionId);

  try {
    const res = await fetch(`${API_BASE}/api/auth/register-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ sessionId }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      console.warn('registerCurrentSession failed:', data.error);
      return { success: false, sessionId };
    }

    return { success: true, sessionId };
  } catch (err) {
    console.error('registerCurrentSession network error:', err);
    return { success: false, sessionId };
  }
}

/**
 * Synchronously retrieves any valid Supabase session from localStorage.
 * This is instantaneous (0ms) and completely bypasses navigator.locks and promise contention.
 */
export function getStoredSessionSync(): any {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const item = localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed?.access_token && parsed?.user) {
            return parsed;
          }
        }
      }
    }
  } catch {}
  return null;
}

/**
 * Safely get or wait for Supabase Auth session on page load.
 * Handles OAuth redirects (PKCE code, access_token in hash),
 * localStorage restoration delays, and navigator.locks concurrency.
 */
export async function getOrWaitForSession(maxWaitMs = 3000): Promise<any> {
  // 0. Synchronous instant check — 0ms, never blocks
  const syncSession = getStoredSessionSync();
  if (syncSession?.user) return syncSession;

  // 1. Check if session is available via Supabase memory / cache
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) return session;
  } catch {}

  // 2. Check if there are any signs of an active session or incoming OAuth callback
  const hasUrlToken = typeof window !== 'undefined' && (
    window.location.hash.includes('access_token') || 
    window.location.search.includes('code')
  );
  const hasLocalToken = typeof localStorage !== 'undefined' && Object.keys(localStorage).some(
    k => (k.startsWith('sb-') && k.endsWith('-auth-token')) || k === 'otpwala_session_id'
  );

  // If there are no tokens in URL and no tokens in localStorage, user is definitely not signed in
  if (!hasUrlToken && !hasLocalToken) {
    return null;
  }

  // 3. Wait for onAuthStateChange OR poll getSession
  return new Promise((resolve) => {
    let resolved = false;
    let subscription: any = null;

    try {
      const sub = supabase.auth.onAuthStateChange((_event, newSession) => {
        if (newSession?.user && !resolved) {
          resolved = true;
          if (subscription) subscription.unsubscribe();
          resolve(newSession);
        }
      });
      subscription = sub?.data?.subscription;
    } catch {}

    const startTime = Date.now();
    const interval = setInterval(async () => {
      // Periodic sync check in case localStorage was written by another tab
      const currentSync = getStoredSessionSync();
      if (currentSync?.user && !resolved) {
        resolved = true;
        clearInterval(interval);
        if (subscription) subscription.unsubscribe();
        resolve(currentSync);
        return;
      }

      try {
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (retrySession?.user && !resolved) {
          resolved = true;
          clearInterval(interval);
          if (subscription) subscription.unsubscribe();
          resolve(retrySession);
          return;
        }
      } catch {}

      if (Date.now() - startTime > maxWaitMs && !resolved) {
        resolved = true;
        clearInterval(interval);
        if (subscription) subscription.unsubscribe();
        // Last-chance check against localStorage before concluding null
        const lastChance = getStoredSessionSync();
        resolve(lastChance || null);
      }
    }, 150);
  });
}

export interface SessionCheckResult {
  valid: boolean;
  reason?: 'concurrent_session' | 'account_deleted' | 'account_banned' | 'missing_token' | string;
  message?: string;
}

/**
 * Verify whether this device session is currently valid.
 * Detects if the user was deleted, banned, or if another device logged in.
 */
export async function verifyActiveSession(accessToken: string): Promise<SessionCheckResult> {
  const sessionId = getLocalSessionId();

  try {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
    };
    if (sessionId) {
      headers['x-session-id'] = sessionId;
    }

    const res = await fetch(`${API_BASE}/api/auth/session-check`, {
      method: 'GET',
      headers,
    });

    const data = await res.json().catch(() => ({}));

    if (data.reason === 'account_banned' || data.reason === 'account_deleted') {
      return {
        valid: false,
        reason: data.reason,
        message: data.message || 'Session invalidated.',
      };
    }

    return { valid: true };
  } catch (err) {
    // On temporary network errors, don't kick user
    return { valid: true };
  }
}

/**
 * Terminate the local session and redirect to login only for banned or deleted accounts.
 */
export async function handleSessionTermination(
  reason: 'concurrent_session' | 'account_deleted' | 'account_banned' | string
): Promise<void> {
  if (reason !== 'account_banned' && reason !== 'account_deleted') {
    return;
  }
  clearLocalSessionId();
  try {
    await supabase.auth.signOut();
  } catch {}

  const targetUrl = `/auth/login?error=${encodeURIComponent(reason)}`;
  if (typeof window !== 'undefined') {
    window.location.href = targetUrl;
  }
}

/**
 * Background heartbeat only checking for account banned status
 */
export function startSessionHeartbeat(
  getAccessToken: () => string | Promise<string | null>,
  intervalMs = 60000
): () => void {
  let isChecking = false;

  const check = async () => {
    if (isChecking) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    isChecking = true;
    try {
      const token = await getAccessToken();
      if (!token) return;

      const result = await verifyActiveSession(token);
      if (!result.valid && (result.reason === 'account_banned' || result.reason === 'account_deleted')) {
        await handleSessionTermination(result.reason);
      }
    } finally {
      isChecking = false;
    }
  };

  const intervalId = setInterval(check, intervalMs);

  return () => {
    clearInterval(intervalId);
  };
}
