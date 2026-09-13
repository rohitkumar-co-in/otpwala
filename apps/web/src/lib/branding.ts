export interface SiteBranding {
  brandName: string;
  separator: string;
  slogan: string;
}

export const DEFAULT_BRANDING: SiteBranding = {
  brandName: 'OTPWala',
  separator: '—',
  slogan: 'Instant Virtual Numbers for SMS Verification',
};

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
          separator: b.separator || DEFAULT_BRANDING.separator,
          slogan: b.slogan || DEFAULT_BRANDING.slogan,
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
      separator: branding.separator || current.separator,
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
  const sep = branding.separator || DEFAULT_BRANDING.separator;
  const slogan = branding.slogan || DEFAULT_BRANDING.slogan;

  if (!pageName || pageName === 'Home' || pageName === brand || pageName.toLowerCase().includes('homepage')) {
    return `${brand} ${sep} ${slogan}`;
  }

  // If pageName already contains a separator and brand suffix, normalize it
  if (pageName.includes(' — ') || pageName.includes(' | ') || pageName.includes(' • ')) {
    const parts = pageName.split(/ [—|•-] /);
    const prefix = parts[0]?.trim();
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

  const { brandName, separator, slogan } = branding;

  // 1. Update Title
  const path = window.location.pathname;
  if (path === '/' || path === '') {
    document.title = `${brandName} ${separator} ${slogan}`;
  } else if (document.title) {
    const parts = document.title.split(/ [—|•-] /);
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
