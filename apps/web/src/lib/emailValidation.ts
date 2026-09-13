/**
 * OTPWala Email Validation Utility
 * Enforces strict domain whitelist and anti-abuse policies:
 * 1. Only @gmail.com, @googlemail.com, @yahoo.*, @hotmail.com, @outlook.com
 * 2. No plus (+) aliases (e.g. user+alias@gmail.com)
 * 3. No tricky dotted usernames (e.g. r.o.h.i.t@gmail.com or ro.hit@gmail.com)
 * 4. No custom or temporary domains
 */

export interface EmailValidationResult {
  valid: boolean;
  error?: string;
  cleanedEmail?: string;
}

// Approved domain patterns
const ALLOWED_EXACT_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'outlook.com',
]);

function isAllowedDomain(domain: string): boolean {
  if (ALLOWED_EXACT_DOMAINS.has(domain)) {
    return true;
  }
  // Allow yahoo.com and international variants (e.g. yahoo.co.in, yahoo.co.uk, yahoo.ca)
  if (/^yahoo\.[a-z]{2,3}(\.[a-z]{2})?$/.test(domain)) {
    return true;
  }
  return false;
}

export function validateAllowedEmail(rawEmail: string): EmailValidationResult {
  if (!rawEmail || typeof rawEmail !== 'string') {
    return { valid: false, error: 'Email address is required.' };
  }

  const cleaned = rawEmail.trim().toLowerCase();

  // Basic format check
  const atIndex = cleaned.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === cleaned.length - 1) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }

  const username = cleaned.slice(0, atIndex);
  const domain = cleaned.slice(atIndex + 1);

  if (!username || !domain) {
    return { valid: false, error: 'Please enter a complete email address.' };
  }

  // 1. Check for plus (+) aliases
  if (username.includes('+')) {
    return {
      valid: false,
      error: "Email aliases containing '+' are not allowed. Please use your standard email address.",
    };
  }

  // 2. Check for tricky dotted emails in username
  if (username.includes('.')) {
    return {
      valid: false,
      error: 'Dotted email usernames are not permitted. Please enter your email without dots.',
    };
  }

  // 3. Check for disallowed special characters in username
  if (/[^a-z0-9_-]/.test(username)) {
    return {
      valid: false,
      error: 'Email contains invalid characters. Please use standard alphanumeric characters.',
    };
  }

  // 4. Validate domain against whitelist
  if (!isAllowedDomain(domain)) {
    return {
      valid: false,
      error: 'Only @gmail, @googlemail, @yahoo, @hotmail, and @outlook email addresses are accepted. Custom domains are not permitted.',
    };
  }

  return {
    valid: true,
    cleanedEmail: cleaned,
  };
}
