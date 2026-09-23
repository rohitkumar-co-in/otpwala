// Currency utility for OTPWala: Universal INR / USD dual-currency support

export type Currency = 'INR' | 'USD';

const CURRENCY_KEY = 'otpwala_currency';
export const DEFAULT_USD_TO_INR_RATE = 115;

function getLocationDefaultCurrency(): Currency {
  if (typeof navigator === 'undefined') return 'USD';
  const locale = String(navigator.language || '').toLowerCase();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  return locale.endsWith('-in') || timeZone === 'Asia/Calcutta' || timeZone === 'Asia/Kolkata' ? 'INR' : 'USD';
}

/**
 * Get active currency from localStorage (defaults to the browser's India signal).
 */
export function getActiveCurrency(): Currency {
  if (typeof window === 'undefined') return 'USD';
  try {
    const saved = localStorage.getItem(CURRENCY_KEY);
    return saved === 'INR' || saved === 'USD' ? saved : getLocationDefaultCurrency();
  } catch {
    return getLocationDefaultCurrency();
  }
}

/**
 * Set active currency and broadcast event
 */
export function setActiveCurrency(currency: Currency): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CURRENCY_KEY, currency);
    window.dispatchEvent(new CustomEvent('otpwala:currency-change', { detail: { currency } }));
  } catch {}

  void (async () => {
    try {
      const { supabase } = await import('./supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const apiBase = String(import.meta.env.PUBLIC_API_URL || '').replace(/\/$/, '');
      await fetch(`${apiBase}/api/user/currency-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ currency }),
      });
    } catch {}
  })();
}

/**
 * Formats a monetary amount based on active currency.
 * In INR mode: "₹149.50 (~$1.30)"
 * In USD mode: "$1.30 (~₹149.50)"
 */
export function formatDualPrice(
  amountInr: number,
  currency: Currency = getActiveCurrency(),
  rate: number = DEFAULT_USD_TO_INR_RATE
): { primary: string; secondary: string; full: string } {
  const safeInr = Number(amountInr) || 0;
  const safeRate = Number(rate) > 0 ? Number(rate) : DEFAULT_USD_TO_INR_RATE;
  const safeUsd = safeInr / safeRate;

  const inrStr = `₹${safeInr.toFixed(2)}`;
  const usdStr = `$${safeUsd.toFixed(2)}`;

  if (currency === 'USD') {
    return {
      primary: usdStr,
      secondary: `≈ ${inrStr}`,
      full: `${usdStr} (≈ ${inrStr})`,
    };
  }

  return {
    primary: inrStr,
    secondary: `≈ ${usdStr}`,
    full: `${inrStr} (≈ ${usdStr})`,
  };
}

/**
 * Formats a single monetary string for headers, buttons, etc.
 */
export function formatCurrencyAmount(
  amountInr: number,
  currency: Currency = getActiveCurrency(),
  rate: number = DEFAULT_USD_TO_INR_RATE
): string {
  const safeInr = Number(amountInr) || 0;
  const safeRate = Number(rate) > 0 ? Number(rate) : DEFAULT_USD_TO_INR_RATE;

  if (currency === 'USD') {
    const safeUsd = safeInr / safeRate;
    return `$${safeUsd.toFixed(2)}`;
  }

  return `₹${safeInr.toFixed(2)}`;
}
