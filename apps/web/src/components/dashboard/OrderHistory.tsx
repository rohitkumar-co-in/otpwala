import { useState, useEffect } from 'react';
import { getOrders } from '../../lib/api';
import { formatPhoneNumber } from '../../lib/phone';
import { ClipboardListIcon, ClockIcon, CheckIcon, CopyIcon, XIcon, RefreshCwIcon, ArrowLeftIcon, ArrowRightIcon, AlertCircleIcon } from '../ui/Icons';
import { getActiveCurrency, formatDualPrice, type Currency } from '../../lib/currency';
import { toast } from '../../lib/toast';
import { readDashboardCache, writeDashboardCache } from '../../lib/dashboardCache';
import OrderCatalogLabel from '../orders/OrderCatalogLabel';

export default function OrderHistory() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const cached = readDashboardCache<{ orders: any[]; total: number } | null>(`orders-${page}-all`, null);
  const [orders, setOrders] = useState<any[]>(cached?.orders || []);
  const [total, setTotal] = useState(cached?.total || 0);
  const [loading, setLoading] = useState(!cached);
  const [recentRefresh, setRecentRefresh] = useState(false);
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

  async function loadOrders(isManual = false) {
    setLoading(orders.length === 0);
    try {
      const data = await getOrders(limit, page * limit, statusFilter || undefined);
      setOrders(data.orders || []);
      setTotal(data.total || 0);
      writeDashboardCache(`orders-${page}-${statusFilter || 'all'}`, { orders: data.orders || [], total: data.total || 0 });
      if (isManual) {
        setRecentRefresh(true);
        setTimeout(() => setRecentRefresh(false), 2500);
        toast.success('Order history refreshed.', 'Orders Refreshed');
      }
    } catch (err: any) {
      console.error('Error loading orders:', err);
      if (isManual) {
        toast.error(err?.message || 'Failed to refresh orders', 'Refresh Failed');
      }
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
        
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {['', 'waiting', 'code_received', 'cancelled'].map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0); }}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
            >
              {s === '' ? 'All' : s === 'code_received' ? 'OTP Received' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => loadOrders(true)}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              borderColor: recentRefresh ? '#10b981' : undefined,
              color: recentRefresh ? '#34d399' : undefined,
              transition: 'all 0.2s ease',
            }}
          >
            {recentRefresh ? (
              <>
                <CheckIcon size={14} color="#34d399" />
                <span>Refreshed!</span>
              </>
            ) : (
              <>
                <RefreshCwIcon size={14} className={loading ? 'animate-spin' : ''} />
                <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
              </>
            )}
          </button>
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
            <li>You may request cancellation while a number is waiting. OTPWala checks the order status before confirming it.</li>
            <li>Your order changes to cancelled only after cancellation is confirmed. If the request is declined, the number stays active and no refund is issued.</li>
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
          <div className="table-container responsive-card-table" style={{ overflowX: 'auto' }}>
            <table aria-label="Order history" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem' }}>Service</th>
                  <th style={{ padding: '0.75rem' }}>Country</th>
                  <th style={{ padding: '0.75rem' }}>Phone Number</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  <th style={{ padding: '0.75rem' }}>Price</th>
                  <th style={{ padding: '0.75rem' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const formattedPhone = formatPhoneNumber(order.phone_number, order.country_code);
                  const isRefunded = String(order.refund_status || '').toLowerCase() === 'refunded';
                  return (
                  <tr key={order.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td data-label="Service" style={{ padding: '0.75rem' }}><strong style={{ color: 'var(--text-primary)' }}><OrderCatalogLabel kind="service" name={order.service_name} code={order.service_code} /></strong></td>
                    <td data-label="Country" style={{ padding: '0.75rem' }}><strong><OrderCatalogLabel kind="country" name={order.country_name} /></strong></td>
                    <td data-label="Phone Number" style={{ padding: '0.75rem' }}>
                      {order.phone_number ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formattedPhone.display || order.phone_number}</span>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }} onClick={() => copyToClipboard(String(order.phone_number || ''), `number-${order.id}`)} title="Copy number">
                            {copiedId === `number-${order.id}` ? <CheckIcon size={12} color="var(--success)" /> : <CopyIcon size={12} />}
                          </button>
                        </div>
                      ) : 'N/A'}
                    </td>
                    <td data-label="Status" style={{ padding: '0.75rem' }}>
                      <StatusBadge status={order.status} />
                    </td>
                    <td data-label="Price" style={{ padding: '0.75rem', fontWeight: 600, color: isRefunded ? 'var(--text-muted)' : 'inherit' }}>
                      {isRefunded ? 'Refunded: ' : 'Price: '}{formatDualPrice(parseFloat(order.sell_price_inr || order.price_inr || 0), currency).primary}
                    </td>
                    <td data-label="Time" style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
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
    waiting: { label: 'Waiting', icon: <ClockIcon size={12} />, className: 'badge badge-info' },
    code_received: { label: 'OTP Received', icon: <CheckIcon size={12} />, className: 'badge badge-success' },
    completed: { label: 'OTP Received', icon: <CheckIcon size={12} />, className: 'badge badge-success' },
    cancelled: { label: 'Cancelled', icon: <XIcon size={12} />, className: 'badge badge-error' },
    refunded: { label: 'Refunded', icon: <RefreshCwIcon size={12} />, className: 'badge badge-info' },
    expired: { label: 'Expired', icon: <ClockIcon size={12} />, className: 'badge badge-error' },
  };
  const item = config[status];
  if (!item) return <span className="badge badge-warning" style={{ fontWeight: 700 }}>{status}</span>;
  return (
    <span className={item.className} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
      {item.icon}
      {item.label}
    </span>
  );
}
