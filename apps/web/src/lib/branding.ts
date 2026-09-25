const BRAND_NAME = 'OTPWala';
const TITLE_SEPARATOR = '|';
const HOME_SLOGAN = 'Check services, country availability, and prices for SMS verification.';

/** Build a stable page title from the page label and the site's fixed brand. */
export function formatPageTitle(pageName?: string): string {
  const label = pageName?.trim();
  if (!label || label === 'Home' || label === BRAND_NAME || label.toLowerCase().includes('homepage')) {
    return `${BRAND_NAME} ${TITLE_SEPARATOR} ${HOME_SLOGAN}`;
  }

  if (/[|•\u2014\u2013-]/.test(label)) {
    const parts = label.split(/\s*[|•\u2014\u2013-]\s*/);
    const prefix = parts[0]?.trim();
    if (prefix === BRAND_NAME && parts.length > 1) {
      return `${BRAND_NAME} ${TITLE_SEPARATOR} ${parts.slice(1).join(' ')}`;
    }
    if (prefix && prefix !== BRAND_NAME) {
      return `${prefix} ${TITLE_SEPARATOR} ${BRAND_NAME}`;
    }
  }

  return `${label} ${TITLE_SEPARATOR} ${BRAND_NAME}`;
}
