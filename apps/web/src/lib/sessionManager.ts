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

    const data = await res.json();

    if (res.status === 401 || res.status === 403 || !data.valid) {
      return {
        valid: false,
        reason: data.reason || (data.code as string) || 'concurrent_session',
        message: data.message || 'Session invalidated.',
      };
    }

    return { valid: true };
  } catch (err) {
    // On temporary network errors, don't immediately kick user unless confirmed
    return { valid: true };
  }
}

/**
 * Terminate the local session and redirect to login with the appropriate warning message.
 */
export async function handleSessionTermination(
  reason: 'concurrent_session' | 'account_deleted' | 'account_banned' | string
): Promise<void> {
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
 * Start a periodic background heartbeat to detect if:
 * 1. A new device logs in (old device gets logged out with warning)
 * 2. An admin deleted the user account
 * 3. An admin banned the user account
 */
export function startSessionHeartbeat(
  getAccessToken: () => string | Promise<string | null>,
  intervalMs = 12000
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
      if (!result.valid && result.reason) {
        await handleSessionTermination(result.reason);
      }
    } finally {
      isChecking = false;
    }
  };

  const intervalId = setInterval(check, intervalMs);

  // Also check immediately when tab regains focus or visibility
  const onFocus = () => { check(); };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      check();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return () => {
    clearInterval(intervalId);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}
