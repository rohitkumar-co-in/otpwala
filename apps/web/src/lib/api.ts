import { supabase } from './supabase';
import {
  getLocalSessionId,
  handleSessionTermination,
  getOrWaitForSession,
  getStoredSessionSync,
} from './sessionManager';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.')) {
      return 'http://localhost:3001';
    }
    return (window as any).__PUBLIC_API_URL__ !== undefined ? (window as any).__PUBLIC_API_URL__ : '';
  }
  return import.meta.env.PUBLIC_API_URL || '';
}

const API_URL = getApiBaseUrl();

const PUBLIC_PATHS = ['/api/services', '/api/countries', '/api/branding', '/api/health', '/api/auth/config'];

async function getAuthToken(isPublic = false): Promise<string | null> {
  // 1. Instant synchronous check from localStorage (0ms)
  const syncSession = getStoredSessionSync();
  if (syncSession?.access_token) return syncSession.access_token;

  // If this is a public catalog/branding route, never block on auth resolution
  if (isPublic) {
    return null;
  }

  try {
    const session = await getOrWaitForSession(1500);
    return session?.access_token || null;
  } catch {
    return null;
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const token = await getAuthToken(isPublic);
  const sessionId = getLocalSessionId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (sessionId) {
    headers['x-session-id'] = sessionId;
  }

  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();
  
  if (!data.success) {
    if (
      data.error === 'concurrent_session' ||
      data.error === 'account_deleted' ||
      data.error === 'account_banned'
    ) {
      await handleSessionTermination(data.error);
    }
    if (
      data.error === 'user_insufficient_funds' ||
      data.code === 'USER_INSUFFICIENT_FUNDS' ||
      (typeof data.message === 'string' && data.message.toLowerCase().includes('insufficient wallet balance'))
    ) {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/wallet')) {
        window.location.href = '/dashboard/wallet?insufficient=1';
      }
    }
    const errObj = new Error(data.message || data.error || 'Request failed');
    (errObj as any).code = data.error || data.code;
    throw errObj;
  }

  return (data.data !== undefined ? data.data : data) as T;
}

// ─── Catalog ───
export const getServices = (featuredOnly = false) => apiFetch<any[]>(`/api/services${featuredOnly ? '?featured=true' : ''}`);
export const getCountries = () => apiFetch<any[]>('/api/countries');
export const getServiceCountries = (code: string) => apiFetch<any[]>(`/api/services/${code}/countries`);

// ─── Prices ───
export const getPrice = (service: string, country: number) =>
  apiFetch<{ available: boolean; count: number; priceInr: number; priceUsd: number }>(
    `/api/prices/${service}/${country}`
  );

// ─── Numbers ───
export const buyNumber = (service: string, country: number) =>
  apiFetch<any>('/api/numbers/buy', {
    method: 'POST',
    body: JSON.stringify({ service, country }),
  });

export const getOrderStatus = (orderId: string) =>
  apiFetch<any>(`/api/numbers/${orderId}/status`);

export const cancelOrder = (orderId: string) =>
  apiFetch<any>(`/api/numbers/${orderId}/cancel`, { method: 'POST' });

export const completeOrder = (orderId: string) =>
  apiFetch<any>(`/api/numbers/${orderId}/complete`, { method: 'POST' });

export const retryOrder = (orderId: string) =>
  apiFetch<any>(`/api/numbers/${orderId}/retry`, { method: 'POST' });

// ─── Wallet ───
export const getWallet = () =>
  apiFetch<{ balance: number; transactions: any[]; totalTransactions: number; config?: any }>('/api/wallet');

export const getWalletConfig = () =>
  apiFetch<any>('/api/wallet/config');

export const getUserPaymentRequests = () =>
  apiFetch<any[]>('/api/wallet/payment-requests');

// ─── Auth Config ───
export const getAuthConfig = async () => {
  try {
    const res = await apiFetch<{ allowEmailSignup: boolean; allowGoogleLogin: boolean; allowRegistration: boolean }>('/api/auth/config');
    if (res && typeof window !== 'undefined') {
      try {
        localStorage.setItem('otpwala_auth_config', JSON.stringify(res));
      } catch {}
    }
    return res;
  } catch (err) {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('otpwala_auth_config');
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    throw err;
  }
};

export const getTransactions = (limit = 20, offset = 0) =>
  apiFetch<{ transactions: any[]; total: number }>(`/api/wallet/transactions?limit=${limit}&offset=${offset}`);

export const topUp = (amount: number, method = 'upi', utr?: string) =>
  apiFetch<any>('/api/wallet/topup', {
    method: 'POST',
    body: JSON.stringify({
      amount,
      method,
      paymentMethod: method,
      utr,
      transactionId: utr,
    }),
  });

// ─── Orders ───
export const getOrders = (limit = 20, offset = 0, status?: string) => {
  let url = `/api/orders?limit=${limit}&offset=${offset}`;
  if (status) url += `&status=${status}`;
  return apiFetch<{ orders: any[]; total: number; summary?: { totalOrders: number; activeOrders: number; otpDelivered: number; otpNotReceived: number; totalRefunded: number; spentOnDelivered: number } }>(url);
};

// ─── Admin ───
export const getAdminDashboard = () => apiFetch<any>('/api/admin/dashboard');
export const runAdminReconciliation = () =>
  apiFetch<{ scanned: number; delivered: number; refunded: number; failed: number }>('/api/admin/reconcile', { method: 'POST' });
export const getAdminAuditLogs = (limit = 50, offset = 0, action = '') =>
  apiFetch<{ logs: any[]; total: number }>(`/api/admin/audit-logs?limit=${limit}&offset=${offset}&action=${encodeURIComponent(action)}`);
export const getAdminUsers = (limit = 20, offset = 0, search = '') =>
  apiFetch<any>(`/api/admin/users?limit=${limit}&offset=${offset}&search=${search}`);
export const getAdminUserDetails = (userId: string) =>
  apiFetch<{ user: any; transactions: any[]; orders: any[] }>(`/api/admin/users/${userId}/details`);
export const creditUser = (userId: string, amount: number, description: string) =>
  apiFetch<any>(`/api/admin/users/${userId}/credit`, {
    method: 'POST',
    body: JSON.stringify({ amount, description }),
  });
export const banUser = (userId: string, banned: boolean) =>
  apiFetch<any>(`/api/admin/users/${userId}/ban`, {
    method: 'POST',
    body: JSON.stringify({ banned }),
  });
export const setUserZeroMarkup = (userId: string, hasZeroMarkup: boolean) =>
  apiFetch<any>(`/api/admin/users/${userId}/zero-markup`, {
    method: 'POST',
    body: JSON.stringify({ hasZeroMarkup }),
  });
export const deleteUser = (userId: string) =>
  apiFetch<any>(`/api/admin/users/${userId}`, { method: 'DELETE' });
export const bulkBanUsers = (userIds: string[], banned: boolean) =>
  apiFetch<any>('/api/admin/users/bulk-ban', {
    method: 'POST',
    body: JSON.stringify({ userIds, banned }),
  });
export const bulkDeleteUsers = (userIds: string[]) =>
  apiFetch<any>('/api/admin/users/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });
export const promoteAdmin = (userId: string) =>
  apiFetch<any>(`/api/admin/users/${userId}/promote`, { method: 'POST' });
export const demoteAdmin = (userId: string) =>
  apiFetch<any>(`/api/admin/users/${userId}/demote`, { method: 'POST' });
export const getAdminPricing = () => apiFetch<any[]>('/api/admin/pricing');
export const saveAdminPricing = (rule: any) =>
  apiFetch<any>('/api/admin/pricing', { method: 'POST', body: JSON.stringify(rule) });
export const deleteAdminPricing = (id: string) =>
  apiFetch<any>(`/api/admin/pricing/${id}`, { method: 'DELETE' });
export const getAdminSettings = () => apiFetch<any>('/api/admin/settings');
export const saveAdminSetting = (key: string, value: string) =>
  apiFetch<any>('/api/admin/settings', { method: 'POST', body: JSON.stringify({ key, value }) });
export const saveAdminSettingsBatch = (settings: Record<string, any>) =>
  apiFetch<any>('/api/admin/settings', { method: 'POST', body: JSON.stringify({ settings }) });
export const getAdminTigerBalance = () => apiFetch<any>('/api/admin/tiger-balance');
export const getAdminOrders = (limit = 20, offset = 0, status = 'all') =>
  apiFetch<any>(`/api/admin/orders?limit=${limit}&offset=${offset}&status=${encodeURIComponent(status)}`);
export const getAdminPaymentRequests = () =>
  apiFetch<any[]>('/api/admin/payment-requests');
export const getAdminRecharges = (limit = 20, offset = 0, search = '') =>
  apiFetch<any>(`/api/admin/recharges?limit=${limit}&offset=${offset}&search=${encodeURIComponent(search)}`);
export const approvePaymentRequest = (id: string) =>
  apiFetch<any>(`/api/admin/payment-requests/${id}/approve`, { method: 'POST' });
export const rejectPaymentRequest = (id: string, reason?: string) =>
  apiFetch<any>(`/api/admin/payment-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
export const testTelegramNotification = (botToken?: string, chatId?: string) =>
  apiFetch<any>('/api/admin/telegram/test', {
    method: 'POST',
    body: JSON.stringify({ botToken, chatId }),
  });
export const getAdminCatalog = () =>
  apiFetch<{ services: any[]; countries: any[]; stats: any }>('/api/admin/catalog');
export const toggleAdminService = (code: string, enabled: boolean) =>
  apiFetch<any>('/api/admin/catalog/service', {
    method: 'POST',
    body: JSON.stringify({ code, enabled }),
  });
export const toggleFeaturedService = (code: string, featured: boolean) =>
  apiFetch<any>('/api/admin/catalog/service/featured', {
    method: 'POST',
    body: JSON.stringify({ code, featured }),
  });
export const toggleAdminCountry = (id: number, enabled: boolean) =>
  apiFetch<any>('/api/admin/catalog/country', {
    method: 'POST',
    body: JSON.stringify({ id, enabled }),
  });
export const toggleFeaturedCountry = (id: number, featured: boolean) =>
  apiFetch<any>('/api/admin/catalog/country/featured', {
    method: 'POST',
    body: JSON.stringify({ id, featured }),
  });
export const batchUpdateAdminCatalog = (action: string) =>
  apiFetch<any>('/api/admin/catalog/batch', {
    method: 'POST',
    body: JSON.stringify({ action }),
  });

// ─── Referrals ───
export interface ReferralClaimStatus {
  isReferred: boolean;
  referrerCode: string | null;
  userCreatedAt: string;
  isWithin24Hours?: boolean;
  isWithin48Hours: boolean;
  hoursRemaining: number;
  canClaimReferral: boolean;
}

export interface ReferralStatsData {
  referralCode: string;
  totalEarned: number;
  totalReferrals: number;
  bonusConfig?: { tier1: number; tier2: number; tier3: number; windowDays?: number };
  referredUsers: Array<{ name: string; joinedAt: string }>;
  bonusLogs: Array<{ id: string; description: string; amount: number; createdAt: string }>;
  claimStatus?: ReferralClaimStatus;
}

export const getReferralStats = () =>
  apiFetch<ReferralStatsData>('/api/referrals');

export const attributeReferral = (referralCode: string) =>
  apiFetch<{ attributed: boolean; referrerCode?: string }>('/api/referrals/attribute', {
    method: 'POST',
    body: JSON.stringify({ referralCode }),
  });

export const claimReferralCode = (referralCode: string) =>
  apiFetch<{ attributed: boolean; referrerCode?: string }>('/api/referrals/claim', {
    method: 'POST',
    body: JSON.stringify({ referralCode }),
  });
