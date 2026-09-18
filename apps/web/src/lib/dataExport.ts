/**
 * OTPWala Universal Data Export & Formatting Engine
 * Generates beautiful, self-contained HTML reports (printable as PDF),
 * structured CSV spreadsheets, and clean JSON archives.
 */

import { toast } from './toast';

export type ExportFormat = 'html' | 'json' | 'csv';

function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(isoStr: string | null | undefined): string {
  if (!isoStr) return 'N/A';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(isoStr);
  }
}

function normalizeData(rawInput: any): Record<string, any> {
  if (!rawInput) return {};
  if (typeof rawInput === 'object' && rawInput.data && typeof rawInput.data === 'object' && !Array.isArray(rawInput.data)) {
    return rawInput.data;
  }
  return typeof rawInput === 'object' ? rawInput : {};
}

/**
 * Generate a standalone, publication-quality HTML document with embedded CSS
 * suitable for offline viewing in any web browser or printing as a PDF statement.
 */
export function generateHtmlReport(rawInput: any, title = 'Account Data & Security Dossier'): string {
  const data = normalizeData(rawInput);
  const profile = (data && data.profile) || {};
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const transactions = Array.isArray(data?.walletTransactions) ? data.walletTransactions : [];
  const securityLogs = Array.isArray(data?.securityLogs) ? data.securityLogs : [];
  const paymentRequests = Array.isArray(data?.paymentRequests) ? data.paymentRequests : [];
  const supportTickets = Array.isArray(data?.supportTickets) ? data.supportTickets : [];
  const referrals = data?.referrals?.given || (Array.isArray(data?.referrals) ? data.referrals : []);

  const totalSpent = transactions
    .filter((t: any) => t.type === 'deduction' && t.status === 'completed')
    .reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount || 0)), 0);

  const totalTopup = transactions
    .filter((t: any) => t.type === 'topup' && t.status === 'completed')
    .reduce((sum: number, t: any) => sum + parseFloat(t.amount || 0), 0);

  const exportDate = formatDate(data?.exportedAt || new Date().toISOString());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${escapeHtml(profile.email || 'User')}</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --success: #16a34a;
      --danger: #dc2626;
      --warning: #d97706;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 1080px;
      margin: 0 auto;
      background: var(--surface);
      border-radius: 16px;
      border: 1px solid var(--border);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: #ffffff;
      padding: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1.5rem;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .brand-logo {
      width: 44px;
      height: 44px;
      background: #2563eb;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 1.25rem;
      color: #ffffff;
    }
    .header h1 { font-size: 1.4rem; font-weight: 700; margin-bottom: 0.2rem; }
    .header p { font-size: 0.82rem; color: #94a3b8; }
    .header-actions { display: flex; gap: 0.75rem; }
    .print-btn {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 0.55rem 1.15rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    }
    .print-btn:hover { background: #1d4ed8; }
    .content { padding: 2rem; display: flex; flex-direction: column; gap: 2rem; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
    }
    .stat-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.2rem;
    }
    .stat-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
    .stat-val { font-size: 1.5rem; font-weight: 800; color: var(--text); margin-top: 0.25rem; }
    .section-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border-bottom: 2px solid var(--border);
      padding-bottom: 0.5rem;
    }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: capitalize;
    }
    .badge-success { background: rgba(22, 163, 74, 0.12); color: var(--success); }
    .badge-danger { background: rgba(220, 38, 38, 0.12); color: var(--danger); }
    .badge-warning { background: rgba(217, 119, 6, 0.12); color: var(--warning); }
    .badge-primary { background: rgba(37, 99, 235, 0.12); color: var(--primary); }
    .badge-muted { background: #e2e8f0; color: var(--text-muted); }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
    }
    .info-item {
      padding: 0.75rem 1rem;
      background: var(--bg);
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .info-item span { display: block; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; }
    .info-item strong { font-size: 0.95rem; color: var(--text); word-break: break-all; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left; }
    th { background: #f1f5f9; padding: 0.75rem 1rem; font-weight: 700; color: var(--text); border-bottom: 1px solid var(--border); }
    td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #fafafa; }
    .mono { font-family: monospace; font-size: 0.82rem; }
    .empty-state { text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.88rem; font-style: italic; }
    .footer { text-align: center; padding: 1.5rem; font-size: 0.78rem; color: var(--text-muted); border-top: 1px solid var(--border); }
    @media print {
      body { background: #ffffff; padding: 0; }
      .container { border: none; box-shadow: none; border-radius: 0; }
      .print-btn { display: none; }
      .header { background: #0f172a !important; color: #ffffff !important; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Top Header -->
    <div class="header">
      <div class="header-brand">
        <div class="brand-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </div>
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p>Official OTPWala User Audit &amp; Data Archive · Exported ${exportDate}</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="print-btn" onclick="window.print()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Print / Save PDF
        </button>
      </div>
    </div>

    <div class="content">
      <!-- Executive Summary Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Available Balance</div>
          <div class="stat-val" style="color: #10b981;">₹${parseFloat(profile.wallet_balance || 0).toFixed(2)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Deposits Approved</div>
          <div class="stat-val">₹${totalTopup.toFixed(2)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Order Spend</div>
          <div class="stat-val">₹${totalSpent.toFixed(2)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Numbers Purchased</div>
          <div class="stat-val">${orders.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Sign-in Events</div>
          <div class="stat-val">${securityLogs.length}</div>
        </div>
      </div>

      <!-- Section 1: User Profile -->
      <div>
        <h2 class="section-title">1. Account Profile &amp; Identity</h2>
        <div class="info-grid">
          <div class="info-item">
            <span>Registered Email</span>
            <strong>${escapeHtml(profile.email || 'N/A')}</strong>
          </div>
          <div class="info-item">
            <span>Full Name</span>
            <strong>${escapeHtml(profile.full_name || profile.name || 'N/A')}</strong>
          </div>
          <div class="info-item">
            <span>Account Role</span>
            <strong><span class="badge ${profile.role === 'admin' ? 'badge-primary' : profile.role === 'superadmin' ? 'badge-danger' : 'badge-muted'}">${escapeHtml(profile.role || 'user')}</span></strong>
          </div>
          <div class="info-item">
            <span>User ID (UUID)</span>
            <strong class="mono">${escapeHtml(profile.id || 'N/A')}</strong>
          </div>
          <div class="info-item">
            <span>Registration Date</span>
            <strong>${formatDate(profile.created_at)}</strong>
          </div>
          <div class="info-item">
            <span>Account Status</span>
            <strong>${profile.is_banned ? '<span class="badge badge-danger">Suspended / Banned</span>' : '<span class="badge badge-success">Active &amp; In Good Standing</span>'}</strong>
          </div>
          <div class="info-item">
            <span>Referral Code</span>
            <strong class="mono">${escapeHtml(profile.referral_code || 'None')}</strong>
          </div>
          <div class="info-item">
            <span>Last Known Login Network</span>
            <strong>${escapeHtml(profile.last_login_isp || 'N/A')}</strong>
          </div>
        </div>
      </div>

      <!-- Section 2: Security & Login Logs -->
      <div>
        <h2 class="section-title">2. Security Audit Trail &amp; Login History (${securityLogs.length})</h2>
        <div class="table-wrap">
          ${securityLogs.length === 0 ? '<div class="empty-state">No sign-in security records logged.</div>' : `
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event</th>
                  <th>IP Address</th>
                  <th>ISP &amp; Carrier</th>
                  <th>Location</th>
                  <th>Client Device / OS</th>
                </tr>
              </thead>
              <tbody>
                ${securityLogs.map((log: any) => `
                  <tr>
                    <td>${formatDate(log.created_at)}</td>
                    <td><span class="badge badge-primary">${escapeHtml(log.event_type)}</span></td>
                    <td class="mono">${escapeHtml(log.ip_address)}</td>
                    <td>${escapeHtml(log.isp || 'N/A')}${log.asn ? ` (AS${log.asn})` : ''}</td>
                    <td>${escapeHtml([log.city, log.region, log.country].filter(Boolean).join(', ') || 'N/A')}</td>
                    <td style="max-width: 250px; font-size: 0.78rem; color: var(--text-muted); word-break: break-all;">${escapeHtml(log.user_agent || 'N/A')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>

      <!-- Section 3: Orders History -->
      <div>
        <h2 class="section-title">3. Purchased Virtual Numbers &amp; OTP Orders (${orders.length})</h2>
        <div class="table-wrap">
          ${orders.length === 0 ? '<div class="empty-state">No number orders placed.</div>' : `
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Service</th>
                  <th>Country</th>
                  <th>Phone Number</th>
                  <th>SMS / OTP Code</th>
                  <th>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${orders.map((o: any) => `
                  <tr>
                    <td>${formatDate(o.created_at)}</td>
                    <td><strong>${escapeHtml(o.service_name || o.service_code || 'Unknown')}</strong></td>
                    <td>${escapeHtml(o.country_name || String(o.country_code) || 'N/A')}</td>
                    <td class="mono"><strong>${escapeHtml(o.phone_number || 'N/A')}</strong></td>
                    <td>
                      ${o.sms_code ? `<span class="mono" style="color: #10b981; font-weight: 800; background: rgba(16, 185, 129, 0.1); padding: 0.15rem 0.4rem; border-radius: 4px;">${escapeHtml(o.sms_code)}</span>` : '<span style="color: #94a3b8;">—</span>'}
                    </td>
                    <td>₹${parseFloat(o.price_inr || o.sell_price_inr || 0).toFixed(2)}</td>
                    <td>
                      <span class="badge ${o.status === 'code_received' ? 'badge-success' : o.status === 'waiting' ? 'badge-warning' : 'badge-danger'}">
                        ${escapeHtml(o.status)}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>

      <!-- Section 4: Wallet Transactions Ledger -->
      <div>
        <h2 class="section-title">4. Wallet Balance Ledger (${transactions.length})</h2>
        <div class="table-wrap">
          ${transactions.length === 0 ? '<div class="empty-state">No wallet transactions recorded.</div>' : `
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Balance After</th>
                  <th>Description</th>
                  <th>Reference</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${transactions.map((tx: any) => {
                  const isCredit = ['topup', 'admin_credit', 'admin_grant', 'refund', 'referral_bonus'].includes(tx.type);
                  return `
                  <tr>
                    <td>${formatDate(tx.created_at)}</td>
                    <td><span class="badge ${isCredit ? 'badge-success' : 'badge-danger'}">${escapeHtml(tx.type)}</span></td>
                    <td style="font-weight: 700; color: ${isCredit ? '#10b981' : '#ef4444'};">
                      ${isCredit ? '+' : '-'}₹${parseFloat(tx.amount || 0).toFixed(2)}
                    </td>
                    <td class="mono">₹${parseFloat(tx.balance_after || 0).toFixed(2)}</td>
                    <td>${escapeHtml(tx.description || 'N/A')}</td>
                    <td class="mono" style="font-size: 0.75rem;">${escapeHtml(tx.reference_id || 'N/A')}</td>
                    <td><span class="badge badge-success">${escapeHtml(tx.status || 'completed')}</span></td>
                  </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>

      <!-- Section 5: Payment Requests -->
      <div>
        <h2 class="section-title">5. Deposit &amp; Payment Requests (${paymentRequests.length})</h2>
        <div class="table-wrap">
          ${paymentRequests.length === 0 ? '<div class="empty-state">No payment top-up requests submitted.</div>' : `
            <table>
              <thead>
                <tr>
                  <th>Submitted Date</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>UTR / Binance Pay Order ID</th>
                  <th>Status</th>
                  <th>Review Date</th>
                </tr>
              </thead>
              <tbody>
                ${paymentRequests.map((p: any) => `
                  <tr>
                    <td>${formatDate(p.created_at)}</td>
                    <td><strong>${escapeHtml((p.payment_method || 'UPI').toUpperCase())}</strong></td>
                    <td>₹${parseFloat(p.amount || 0).toFixed(2)}</td>
                    <td class="mono"><strong>${escapeHtml(p.utr || p.binance_tx_id || p.transaction_id || 'N/A')}</strong></td>
                    <td>
                      <span class="badge ${p.status === 'approved' ? 'badge-success' : p.status === 'pending' ? 'badge-warning' : 'badge-danger'}">
                        ${escapeHtml(p.status)}
                      </span>
                    </td>
                    <td>${formatDate(p.reviewed_at)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>

      <!-- Section 6: Support Tickets -->
      <div>
        <h2 class="section-title">6. Support Conversations (${supportTickets.length})</h2>
        <div class="table-wrap">
          ${supportTickets.length === 0 ? '<div class="empty-state">No support tickets filed.</div>' : `
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Subject</th>
                  <th>Message</th>
                  <th>Staff Reply</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${supportTickets.map((t: any) => `
                  <tr>
                    <td>${formatDate(t.created_at)}</td>
                    <td><strong>${escapeHtml(t.subject || 'Support Request')}</strong></td>
                    <td style="max-width: 300px;">${escapeHtml(t.message || '')}</td>
                    <td style="max-width: 300px; color: #2563eb;">${escapeHtml(t.public_reply || 'Pending reply')}</td>
                    <td><span class="badge badge-primary">${escapeHtml(t.status || 'open')}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>

    </div>

    <div class="footer">
      This document was generated automatically by OTPWala for compliance and audit review purposes.<br>
      Confidential Personal Data · Retention &amp; Privacy Compliant
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate a clean, properly structured JSON string
 */
export function generateJsonExport(rawInput: any): string {
  const data = normalizeData(rawInput);
  return JSON.stringify(data, null, 2);
}

/**
 * Generate a formatted CSV spreadsheet string
 */
export function generateCsvExport(rawInput: any): string {
  const data = normalizeData(rawInput);
  const lines: string[] = [];

  lines.push('--- ACCOUNT PROFILE ---');
  lines.push('Field,Value');
  const profile = (data && data.profile) || {};
  lines.push(`User ID,"${profile.id || ''}"`);
  lines.push(`Email,"${profile.email || ''}"`);
  lines.push(`Full Name,"${profile.full_name || profile.name || ''}"`);
  lines.push(`Role,"${profile.role || 'user'}"`);
  lines.push(`Wallet Balance,"₹${parseFloat(profile.wallet_balance || 0).toFixed(2)}"`);
  lines.push(`Created At,"${profile.created_at || ''}"`);
  lines.push(`Referral Code,"${profile.referral_code || ''}"`);
  lines.push('');

  lines.push('--- PURCHASED ORDERS ---');
  lines.push('ID,Service,Country,PhoneNumber,SMSCode,PriceINR,Status,CreatedAt');
  for (const o of (data.orders || [])) {
    lines.push(`"${o.id || ''}","${o.service_name || o.service_code || ''}","${o.country_name || ''}","${o.phone_number || ''}","${o.sms_code || ''}","${o.price_inr || 0}","${o.status || ''}","${o.created_at || ''}"`);
  }
  lines.push('');

  lines.push('--- WALLET TRANSACTIONS ---');
  lines.push('ID,Type,Amount,BalanceAfter,Description,Status,ReferenceID,CreatedAt');
  for (const tx of (data.walletTransactions || [])) {
    lines.push(`"${tx.id || ''}","${tx.type || ''}","${tx.amount || 0}","${tx.balance_after || 0}","${(tx.description || '').replace(/"/g, '""')}","${tx.status || ''}","${tx.reference_id || ''}","${tx.created_at || ''}"`);
  }
  lines.push('');

  lines.push('--- SIGN-IN SECURITY TELEMETRY ---');
  lines.push('ID,EventType,IPAddress,ISP,ASN,Country,City,UserAgent,CreatedAt');
  for (const s of (data.securityLogs || [])) {
    lines.push(`"${s.id || ''}","${s.event_type || ''}","${s.ip_address || ''}","${(s.isp || '').replace(/"/g, '""')}","${s.asn || ''}","${s.country || ''}","${s.city || ''}","${(s.user_agent || '').replace(/"/g, '""')}","${s.created_at || ''}"`);
  }

  return lines.join('\n');
}

/**
 * Triggers a download in the browser
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Modern In-Site Modal Dialog asking user/admin which format they want:
 * 1. HTML Report (Default & Recommended)
 * 2. CSV Spreadsheet
 * 3. Raw JSON Archive
 */
export function promptAndDownloadUserData(rawInput: any, defaultBaseName: string): Promise<void> {
  const data = normalizeData(rawInput);
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve();

    const dateStamp = new Date().toISOString().slice(0, 10);
    const overlay = document.createElement('div');
    overlay.className = 'otpwala-export-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 1000000;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #ffffff;
      border-radius: 18px;
      border: 1px solid rgba(229, 231, 235, 0.9);
      max-width: 480px;
      width: 100%;
      padding: 1.75rem;
      box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25);
      transform: scale(0.95);
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    dialog.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(37, 99, 235, 0.1); color: #2563eb; display: flex; align-items: center; justify-content: center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 700; margin: 0; color: #0f172a;">Export Account Data</h3>
            <p style="font-size: 0.8rem; color: #64748b; margin: 0;">Choose your preferred data format</p>
          </div>
        </div>
        <button id="otpwala-export-close" style="background: none; border: none; font-size: 1.4rem; color: #94a3b8; cursor: pointer; padding: 0.2rem;">&times;</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;">
        <!-- Option 1: Interactive HTML Report (Recommended) -->
        <button id="export-html" type="button" style="display: flex; align-items: center; justify-content: space-between; padding: 0.95rem 1.15rem; background: rgba(37, 99, 235, 0.05); border: 1.5px solid #2563eb; border-radius: 12px; cursor: pointer; text-align: left; transition: all 0.15s ease;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(37, 99, 235, 0.12); color: #2563eb; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div>
              <div style="font-weight: 700; font-size: 0.92rem; color: #1e40af; display: flex; align-items: center; gap: 0.4rem;">
                <span>HTML Report &amp; PDF</span>
                <span style="font-size: 0.65rem; background: #2563eb; color: #fff; padding: 0.1rem 0.45rem; border-radius: 4px; font-weight: 700;">RECOMMENDED</span>
              </div>
              <div style="font-size: 0.78rem; color: #475569; margin-top: 0.15rem;">Interactive viewable report. Opens in any browser, printable to PDF.</div>
            </div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>

        <!-- Option 2: Excel / CSV Spreadsheet -->
        <button id="export-csv" type="button" style="display: flex; align-items: center; justify-content: space-between; padding: 0.95rem 1.15rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; cursor: pointer; text-align: left; transition: all 0.15s ease;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(16, 185, 129, 0.12); color: #059669; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="3" y1="15" x2="21" y2="15"></line>
                <line x1="9" y1="3" x2="9" y2="21"></line>
                <line x1="15" y1="3" x2="15" y2="21"></line>
              </svg>
            </div>
            <div>
              <div style="font-weight: 700; font-size: 0.92rem; color: #0f172a;">Spreadsheet Archive (.csv)</div>
              <div style="font-size: 0.78rem; color: #64748b; margin-top: 0.15rem;">Best for Excel, Google Sheets, or spreadsheet calculations.</div>
            </div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>

        <!-- Option 3: Raw JSON Archive -->
        <button id="export-json" type="button" style="display: flex; align-items: center; justify-content: space-between; padding: 0.95rem 1.15rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; cursor: pointer; text-align: left; transition: all 0.15s ease;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(217, 119, 6, 0.12); color: #d97706; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
            </div>
            <div>
              <div style="font-weight: 700; font-size: 0.92rem; color: #0f172a;">Raw Data Archive (.json)</div>
              <div style="font-size: 0.78rem; color: #64748b; margin-top: 0.15rem;">Machine-readable structured backup for developers or database import.</div>
            </div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <button id="otpwala-export-cancel" type="button" class="btn btn-secondary btn-sm" style="padding: 0.5rem 1.25rem; font-weight: 600;">
          Cancel
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      dialog.style.transform = 'scale(1)';
    });

    function close() {
      overlay.style.opacity = '0';
      dialog.style.transform = 'scale(0.95)';
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 200);
    }

    dialog.querySelector('#otpwala-export-close')?.addEventListener('click', close);
    dialog.querySelector('#otpwala-export-cancel')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    dialog.querySelector('#export-html')?.addEventListener('click', () => {
      const htmlContent = generateHtmlReport(data, 'Account Data & Security Dossier');
      downloadFile(htmlContent, `${defaultBaseName}-${dateStamp}.html`, 'text/html');
      toast.success('HTML Report downloaded. Open in your browser to view or print as PDF.', 'Report Generated');
      close();
    });

    dialog.querySelector('#export-csv')?.addEventListener('click', () => {
      const csvContent = generateCsvExport(data);
      downloadFile(csvContent, `${defaultBaseName}-${dateStamp}.csv`, 'text/csv');
      toast.success('Spreadsheet CSV downloaded successfully.', 'CSV Generated');
      close();
    });

    dialog.querySelector('#export-json')?.addEventListener('click', () => {
      const jsonContent = generateJsonExport(data);
      downloadFile(jsonContent, `${defaultBaseName}-${dateStamp}.json`, 'application/json');
      toast.success('Clean JSON archive downloaded successfully.', 'JSON Exported');
      close();
    });
  });
}
