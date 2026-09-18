import { useState, useEffect } from 'react';
import { getOrders } from '../../lib/api';
import { formatPhoneNumber } from '../../lib/phone';
import { ClipboardListIcon, ClockIcon, CheckIcon, CopyIcon, XIcon, RefreshCwIcon, ArrowLeftIcon, ArrowRightIcon, AlertCircleIcon } from '../ui/Icons';
import { getActiveCurrency, formatDualPrice, type Currency } from '../../lib/currency';

export default function OrderHistory() {
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>(getActiveCurrency());
  const limit = 15;

  useEffect(() => {
    const handleCurrencyChange = (e: any) => {
      if (e.detail?.currency) setCurrency(e.detail.currency);
    };
    window.addEventListener('otpwala:currency-change', handleCurrencyChange);
    return () => window.removeEventListener('otpwala:currency-change', handleCurrencyChange);
  }, []);

  async function copyToClipboard(value: string, id: string) {
    try {
      await navigator.clipboard?.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1500);
    } catch {}
  }

  useEffect(() => {
    loadOrders();
  }, [page, statusFilter]);

  const hasWaitingOrders = orders.some((o) => o.status === 'waiting');

  // Background check every 3s if any order is waiting for SMS
  useEffect(() => {
    if (!hasWaitingOrders) return;

    const interval = setInterval(async () => {
      try {
        const data = await getOrders(limit, page * limit, statusFilter || undefined);
        if (data?.orders) {
          setOrders(data.orders);
        }
      } catch {}
    }, 3000);

    return () => clearInterval(interval);
  }, [hasWaitingOrders, page, statusFilter]);

  async function loadOrders() {
    setLoading(true);
    try {
      const data = await getOrders(limit, page * limit, statusFilter || undefined);
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ClipboardListIcon size={26} color="var(--primary)" />
          My Orders
        </h2>
        
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {['', 'waiting', 'code_received', 'cancelled'].map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0); }}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
            >
              {s === '' ? 'All' : s === 'code_received' ? 'OTP Received' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="orders-important-note" role="note" aria-label="Important OTP information">
        <span className="orders-important-note-icon" aria-hidden="true">
          <AlertCircleIcon size={22} />
        </span>
        <div>
          <strong className="orders-important-note-title">Important Note</strong>
          <ul>
            <li>It is <strong>not guaranteed</strong> that every phone number will receive an OTP.</li>
            <li>If you do not receive the OTP within <strong>2 minutes</strong>, you can cancel the phone number and purchase a new one.</li>
            <li>If a number does not receive an OTP, the charge will be refunded to your wallet within <strong>5 to 10 minutes</strong> after cancellation or automatic expiry.</li>
          </ul>
        </div>
      </div>

      {successMessage && (
        <div role="status" className="alert alert-success" style={{ position: 'fixed', right: '1rem', top: '1rem', zIndex: 1000, maxWidth: '420px' }}>
          {successMessage}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner spinner-lg"></div>
        </div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          No orders found.
        </div>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Country</th>
                  <th>Number</th>
                  <th>Status</th>
                  <th>Price</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const formattedPhone = formatPhoneNumber(order.phone_number, order.country_code);
                  return (
                  <tr key={order.id}>
                    <td style={{ fontWeight: 600 }}>{order.service_name}</td>
                    <td><strong>{order.country_name || 'Unknown country'}</strong></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600 }}>
                      {order.phone_number ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span><small style={{ display: 'block', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', fontWeight: 400 }}>Phone number</small>{formattedPhone.display || order.phone_number}</span>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }} onClick={() => copyToClipboard(String(order.phone_number || ''), `number-${order.id}`)} title="Copy number">
                            {copiedId === `number-${order.id}` ? <CheckIcon size={12} color="var(--success)" /> : <CopyIcon size={12} />}
                          </button>
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      {order.sms_code ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#10b981', fontSize: '0.95rem', background: 'rgba(16, 185, 129, 0.15)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                            {order.sms_code}
                          </span>
                          <button
                            onClick={() => copyToClipboard(order.sms_code, `code-${order.id}`)}
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0.15rem 0.35rem', fontSize: '0.7rem' }}
                            title="Copy OTP"
                          >
                            {copiedId === `code-${order.id}` ? <CheckIcon size={12} color="var(--success)" /> : <CopyIcon size={12} />}
                          </button>
                        </div>
                      ) : order.status === 'waiting' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#f59e0b', fontSize: '0.78rem', fontWeight: 600 }}>
                          <RefreshCwIcon size={12} className="animate-spin" />
                          <span>Waiting for OTP...</span>
                        </span>
                      ) : <StatusBadge status={order.status} />}
                    </td>
                    <td style={{ fontWeight: 600, color: order.status === 'code_received' || order.sms_code ? 'inherit' : 'var(--text-muted)' }}>
                      {order.status === 'code_received' || order.sms_code ? 'Price: ' : 'Refund: '}{formatDualPrice(parseFloat(order.sell_price_inr || 0), currency).full}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {new Date(order.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center' }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} className="btn btn-ghost btn-sm" disabled={page === 0} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <ArrowLeftIcon size={14} /> Prev
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Page {page + 1} of {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} className="btn btn-ghost btn-sm" disabled={page >= totalPages - 1} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                Next <ArrowRightIcon size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function eventLabel(event: any) {
  if (event.event_type === 'created') return 'Number purchased';
  if (event.event_type === 'otp_received') return 'OTP received';
  if (event.event_type === 'refunded') return 'Refund credited to wallet';
  if (event.event_type === 'snapshot') return `Recorded as ${String(event.to_status || 'unknown').replace('_', ' ')}`;
  return `Status changed from ${String(event.from_status || 'unknown').replace('_', ' ')} to ${String(event.to_status || 'unknown').replace('_', ' ')}`;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; icon: any; className: string }> = {
    waiting: { label: 'Waiting', icon: <ClockIcon size={12} />, className: 'badge badge-warning' },
    code_received: { label: 'OTP Received', icon: <CheckIcon size={12} />, className: 'badge badge-success' },
    completed: { label: 'OTP Received', icon: <CheckIcon size={12} />, className: 'badge badge-success' },
    cancelled: { label: 'Cancelled', icon: <XIcon size={12} />, className: 'badge badge-error' },
    refunded: { label: 'Refunded', icon: <RefreshCwIcon size={12} />, className: 'badge badge-accent' },
    expired: { label: 'Expired', icon: <ClockIcon size={12} />, className: 'badge badge-error' },
  };
  const item = config[status];
  if (!item) return <span className="badge">{status}</span>;
  return (
    <span className={item.className} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
      {item.icon}
      {item.label}
    </span>
  );
}
