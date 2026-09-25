export interface SiteBranding {
  brandName: string;
  separator: string;
  slogan: string;
}

export const DEFAULT_BRANDING: SiteBranding = {
  brandName: 'OTPWala',
  separator: '|',
  slogan: 'Check services, country availability, and prices for SMS verification.',
};

function cleanSeparator(value?: string): string {
  return value && !/[\u2014\u2013]/.test(value) ? value : DEFAULT_BRANDING.separator;
}

/**
 * Get locally cached branding or fall back to defaults
 */
export function getCachedBranding(): SiteBranding {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('otpwala_branding');
      if (raw) {
        const b = JSON.parse(raw);
        return {
          brandName: b.brandName || DEFAULT_BRANDING.brandName,
          separator: cleanSeparator(b.separator),
          slogan: b.slogan === 'Instant Virtual Numbers for SMS Verification' ? DEFAULT_BRANDING.slogan : (b.slogan || DEFAULT_BRANDING.slogan),
        };
      }
    } catch {}
  }
  return DEFAULT_BRANDING;
}

/**
 * Save branding config to local cache and update live DOM
 */
export function setCachedBranding(branding: Partial<SiteBranding>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getCachedBranding();
    const updated: SiteBranding = {
      brandName: branding.brandName || current.brandName,
      separator: cleanSeparator(branding.separator || current.separator),
      slogan: branding.slogan || current.slogan,
    };
    localStorage.setItem('otpwala_branding', JSON.stringify(updated));
    applyBrandingToDOM(updated);
  } catch {}
}

/**
 * Format page tab title based on page name and branding configuration
 */
export function formatPageTitle(pageName?: string, branding: SiteBranding = DEFAULT_BRANDING): string {
  const brand = branding.brandName || DEFAULT_BRANDING.brandName;
  const sep = cleanSeparator(branding.separator);
  const slogan = branding.slogan === 'Instant Virtual Numbers for SMS Verification' ? DEFAULT_BRANDING.slogan : (branding.slogan || DEFAULT_BRANDING.slogan);

  if (!pageName || pageName === 'Home' || pageName === brand || pageName.toLowerCase().includes('homepage')) {
    return `${brand} ${sep} ${slogan}`;
  }

  // Normalize authored titles and preserve the home-page slogan suffix.
  if (/[|•\u2014\u2013-]/.test(pageName)) {
    const parts = pageName.split(/ [|•\u2014\u2013-] /);
    const prefix = parts[0]?.trim();
    if (prefix === brand && parts.length > 1) {
      return `${brand} ${sep} ${parts.slice(1).join(' ')}`;
    }
    if (prefix && prefix !== brand) {
      return `${prefix} ${sep} ${brand}`;
    }
  }

  return `${pageName} ${sep} ${brand}`;
}

/**
 * Dynamically apply branding to active DOM elements
 */
export function applyBrandingToDOM(branding: SiteBranding): void {
  if (typeof document === 'undefined') return;

  const { brandName, slogan } = branding;
  const separator = cleanSeparator(branding.separator);

  // 1. Update Title
  const path = window.location.pathname;
  if (path === '/' || path === '') {
    document.title = `${brandName} ${separator} ${slogan}`;
  } else if (document.title) {
    const parts = document.title.split(/ [|•\u2014\u2013-] /);
    const prefix = parts[0]?.trim();
    if (prefix && prefix !== brandName) {
      document.title = `${prefix} ${separator} ${brandName}`;
    }
  }

  // 2. Update brand name targets
  document.querySelectorAll('[data-brand-name]').forEach((el) => {
    el.textContent = brandName;
  });

  // 3. Update brand slogan targets
  document.querySelectorAll('[data-brand-slogan]').forEach((el) => {
    el.textContent = slogan;
  });

  // 4. Update separator targets
  document.querySelectorAll('[data-brand-separator]').forEach((el) => {
    el.textContent = separator;
  });
}
