/**
 * OTPWala Universal In-Site Confirmation Modal System
 * Provides sleek, glassmorphic in-site confirmation dialogs instead of browser-level alert/confirm popups.
 */

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  confirmButtonColor?: string;
}

const ICONS = {
  danger: `
    <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.25); display: flex; align-items: center; justify-content: center; color: #dc2626; margin: 0 auto 1rem;">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    </div>
  `,
  warning: `
    <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.25); display: flex; align-items: center; justify-content: center; color: #d97706; margin: 0 auto 1rem;">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
  `,
  info: `
    <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(37, 99, 235, 0.12); border: 1px solid rgba(37, 99, 235, 0.25); display: flex; align-items: center; justify-content: center; color: #2563eb; margin: 0 auto 1rem;">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
    </div>
  `,
};

export function showConfirm(options: ConfirmOptions | string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(false);
      return;
    }

    const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
    const type = opts.type || (
      (opts.confirmText && /delete|reject|erase|remove|ban|suspend/i.test(opts.confirmText)) ||
      /delete|reject|erase|remove|ban|suspend/i.test(opts.message)
        ? 'danger'
        : 'warning'
    );
    const title = opts.title || (type === 'danger' ? 'Confirm Action' : type === 'warning' ? 'Attention Required' : 'Please Confirm');
    const confirmText = opts.confirmText || 'Confirm';
    const cancelText = opts.cancelText || 'Cancel';

    // Backdrop overlay
    const overlay = document.createElement('div');
    overlay.className = 'otpwala-confirm-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 1000000;
      background: rgba(15, 23, 42, 0.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    // Modal Card
    const dialog = document.createElement('div');
    dialog.className = 'otpwala-confirm-dialog';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'otpwala-confirm-title');
    dialog.setAttribute('aria-describedby', 'otpwala-confirm-desc');
    dialog.style.cssText = `
      background: #ffffff;
      border: 1px solid rgba(229, 231, 235, 0.85);
      border-radius: 18px;
      max-width: 440px;
      width: 100%;
      padding: 1.75rem 1.5rem;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04);
      transform: scale(0.94);
      opacity: 0;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
      position: relative;
    `;

    const iconHtml = ICONS[type] || ICONS.warning;

    const confirmBg = type === 'danger'
      ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
      : type === 'warning'
      ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)'
      : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)';

    const confirmHoverBorder = type === 'danger' ? '#991b1b' : type === 'warning' ? '#92400e' : '#1e40af';

    dialog.innerHTML = `
      ${iconHtml}
      <h3 id="otpwala-confirm-title" style="font-family: var(--font-display, inherit); font-size: 1.2rem; font-weight: 700; color: #0f172a; margin: 0 0 0.5rem; line-height: 1.35;">
        ${title}
      </h3>
      <p id="otpwala-confirm-desc" style="font-size: 0.88rem; color: #475569; margin: 0 0 1.5rem; line-height: 1.55;">
        ${opts.message}
      </p>
      <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
        <button id="otpwala-confirm-cancel" type="button" class="btn btn-secondary" style="flex: 1; min-width: 110px; padding: 0.65rem 1.15rem; font-weight: 600; font-size: 0.88rem; cursor: pointer; border-radius: 10px;">
          ${cancelText}
        </button>
        <button id="otpwala-confirm-ok" type="button" class="btn" style="flex: 1.2; min-width: 130px; padding: 0.65rem 1.15rem; font-weight: 700; font-size: 0.88rem; color: #ffffff; background: ${confirmBg}; border: 1px solid ${confirmHoverBorder}; border-radius: 10px; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
          ${confirmText}
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Prevent background scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Animate in
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      dialog.style.opacity = '1';
      dialog.style.transform = 'scale(1)';
    });

    let settled = false;

    function cleanup(result: boolean) {
      if (settled) return;
      settled = true;

      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;

      overlay.style.opacity = '0';
      dialog.style.opacity = '0';
      dialog.style.transform = 'scale(0.94)';

      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 200);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(false);
      }
    }

    window.addEventListener('keydown', onKeyDown);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup(false);
      }
    });

    const cancelBtn = dialog.querySelector('#otpwala-confirm-cancel') as HTMLElement | null;
    const okBtn = dialog.querySelector('#otpwala-confirm-ok') as HTMLElement | null;

    cancelBtn?.addEventListener('click', () => cleanup(false));
    okBtn?.addEventListener('click', () => cleanup(true));

    // Focus cancel button by default for safety on destructive actions
    if (type === 'danger') {
      cancelBtn?.focus();
    } else {
      okBtn?.focus();
    }
  });
}
