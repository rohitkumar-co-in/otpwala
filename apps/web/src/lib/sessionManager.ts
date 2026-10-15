import { supabase, authStorageKey } from './supabase';

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

export async function assertAccountCanSignIn(accessToken: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/access-check`, {
    cache: 'no-store', headers: { Authorization: `Bearer ${accessToken}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.valid !== true) {
    if (result.reason === 'account_banned' || result.reason === 'account_deleted') {
      clearLocalSessionId();
      try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
      window.location.href = `/auth/login?error=${encodeURIComponent(result.reason)}`;
    }
    throw new Error(result.message || 'Unable to verify account access. Please try again.');
  }
}

/**
 * Generate a unique session identifier for this device login.
 */
export function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16).padStart(8, '0').slice(-8)}-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12)}`;
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
let registeringSession: Promise<{ success: boolean; sessionId: string }> | null = null;

export function registerCurrentSession(
  accessToken: string,
  customSessionId?: string
): Promise<{ success: boolean; sessionId: string }> {
  if (registeringSession) return registeringSession;
  registeringSession = performSessionRegistration(accessToken, customSessionId).finally(() => { registeringSession = null; });
  return registeringSession;
}

async function performSessionRegistration(accessToken: string, customSessionId?: string): Promise<{ success: boolean; sessionId: string }> {
  const sessionId = customSessionId || generateSessionId();
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

    setLocalSessionId(sessionId);
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
      if (key === authStorageKey) {
        const item = localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed?.access_token && parsed?.user && parsed.expires_at * 1000 > Date.now() + 30000) {
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
let restoringSession: Promise<any> | null = null;

export function getOrWaitForSession(_maxWaitMs = 3000): Promise<any> {
  if (!restoringSession) {
    restoringSession = (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      let session = data.session;
      if (session && (!session.expires_at || session.expires_at * 1000 <= Date.now() + 30000)) {
        const refreshed = await supabase.auth.refreshSession();
        if (refreshed.error) throw refreshed.error;
        session = refreshed.data.session;
      }
      return session;
    })().finally(() => { restoringSession = null; });
  }
  return restoringSession;
}

/** All protected requests wait for SDK restoration and device registration. */
export async function getReadySession(): Promise<any> {
  const session = await getOrWaitForSession();
  if (!session) return null;
  if (registeringSession) {
    const result = await registeringSession;
    if (!result.success) throw new Error('Unable to prepare your session. Please try again.');
  } else if (!getLocalSessionId() || getLocalSessionId()?.startsWith('sess_')) {
    const result = await registerCurrentSession(session.access_token);
    if (!result.success) throw new Error('Unable to prepare your session. Please try again.');
  }
  return session;
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

    if (data.valid === false || !res.ok) {
      return {
        valid: false,
        reason: data.reason || 'account_unavailable',
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
 * Terminate the local session when the account or this device session is invalidated.
 */
export async function handleSessionTermination(
  reason: 'concurrent_session' | 'account_deleted' | 'account_banned' | string
): Promise<void> {
  if (!['concurrent_session', 'account_banned', 'account_deleted'].includes(reason)) {
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
  intervalMs = 15000
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
    } catch {
      // A temporary refresh failure must not terminate a valid login.
    } finally {
      isChecking = false;
    }
  };

  const intervalId = setInterval(check, intervalMs);
  const resume = () => { void check(); };
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  void check();

  return () => {
    clearInterval(intervalId);
    window.removeEventListener('focus', resume);
    document.removeEventListener('visibilitychange', resume);
  };
}
