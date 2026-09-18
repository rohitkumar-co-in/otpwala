/**
 * OTPWala Toast Notification System
 * Lightweight, glassmorphic, floating notifications accessible anywhere on screen
 * without requiring the user to scroll up or down.
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  title?: string;
  duration?: number; // ms, default: 4000 for success/info, 6000 for error
  icon?: string;
}

const ICONS = {
  success: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  `,
  error: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  `,
  warning: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  `,
  info: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  `,
};

const BORDER_COLORS = {
  success: 'rgba(16, 185, 129, 0.45)',
  error: 'rgba(244, 63, 94, 0.55)',
  warning: 'rgba(245, 158, 11, 0.5)',
  info: 'rgba(99, 102, 241, 0.45)',
};

const GLOW_COLORS = {
  success: '0 8px 30px -4px rgba(16, 185, 129, 0.25), 0 4px 12px rgba(0, 0, 0, 0.1)',
  error: '0 8px 30px -4px rgba(244, 63, 94, 0.3), 0 4px 12px rgba(0, 0, 0, 0.1)',
  warning: '0 8px 30px -4px rgba(245, 158, 11, 0.25), 0 4px 12px rgba(0, 0, 0, 0.1)',
  info: '0 8px 30px -4px rgba(99, 102, 241, 0.25), 0 4px 12px rgba(0, 0, 0, 0.1)',
};

function getOrCreateContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  let container = document.getElementById('otpwala-toast-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'otpwala-toast-root';
    container.className = 'otpwala-toast-container';
    container.style.cssText = `
      position: fixed;
      top: 1.25rem;
      right: 1.25rem;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      max-width: 420px;
      width: calc(100vw - 2.5rem);
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(
  type: ToastType,
  message: string,
  options?: ToastOptions | string
) {
  if (typeof document === 'undefined') return;

  const opts: ToastOptions = typeof options === 'string' ? { title: options } : options || {};
  const container = getOrCreateContainer();
  if (!container) return;

  // Maximum 4 toasts visible simultaneously
  while (container.children.length >= 4) {
    container.firstElementChild?.remove();
  }

  const toast = document.createElement('div');
  toast.className = `otpwala-toast otpwala-toast-${type}`;
  toast.style.cssText = `
    pointer-events: auto;
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid ${BORDER_COLORS[type]};
    border-radius: 12px;
    box-shadow: ${GLOW_COLORS[type]};
    padding: 0.85rem 1rem;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    color: #f8fafc;
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    font-size: 0.875rem;
    line-height: 1.4;
    transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    transform: translateX(100%);
    opacity: 0;
  `;

  const iconEl = document.createElement('div');
  iconEl.style.cssText = 'flex-shrink: 0; margin-top: 2px; display: flex; align-items: center; justify-content: center;';
  iconEl.innerHTML = opts.icon || ICONS[type];

  const contentEl = document.createElement('div');
  contentEl.style.cssText = 'flex: 1; min-width: 0;';

  if (opts.title) {
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-weight: 700; font-size: 0.88rem; color: #ffffff; margin-bottom: 2px;';
    titleEl.textContent = opts.title;
    contentEl.appendChild(titleEl);
  }

  const msgEl = document.createElement('div');
  msgEl.style.cssText = 'font-size: 0.82rem; color: rgba(241, 245, 249, 0.88); word-break: break-word;';
  msgEl.textContent = message;
  contentEl.appendChild(msgEl);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.style.cssText = `
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.45);
    cursor: pointer;
    padding: 2px;
    margin-top: 1px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease;
  `;
  closeBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  `;
  closeBtn.onmouseenter = () => { closeBtn.style.color = '#ffffff'; };
  closeBtn.onmouseleave = () => { closeBtn.style.color = 'rgba(255, 255, 255, 0.45)'; };

  toast.appendChild(iconEl);
  toast.appendChild(contentEl);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  // Trigger entrance animation next frame
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity = '1';
  });

  const duration = opts.duration ?? (type === 'error' ? 6000 : 4000);
  let dismissTimeout: number | undefined;

  const dismiss = () => {
    toast.style.transform = 'translateX(100%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
      if (container && !container.children.length) {
        container.remove();
      }
    }, 300);
  };

  const scheduleDismiss = () => {
    if (duration > 0) {
      dismissTimeout = window.setTimeout(dismiss, duration);
    }
  };

  scheduleDismiss();

  closeBtn.onclick = () => {
    if (dismissTimeout) clearTimeout(dismissTimeout);
    dismiss();
  };

  toast.onmouseenter = () => {
    if (dismissTimeout) clearTimeout(dismissTimeout);
  };
  toast.onmouseleave = () => {
    scheduleDismiss();
  };
}

export const toast = {
  success: (message: string, title?: string, duration?: number) =>
    showToast('success', message, { title: title || 'Success', duration }),
  error: (message: string, title?: string, duration?: number) =>
    showToast('error', message, { title: title || 'Error', duration }),
  warning: (message: string, title?: string, duration?: number) =>
    showToast('warning', message, { title: title || 'Warning', duration }),
  info: (message: string, title?: string, duration?: number) =>
    showToast('info', message, { title: title || 'Notice', duration }),
};

export default toast;
