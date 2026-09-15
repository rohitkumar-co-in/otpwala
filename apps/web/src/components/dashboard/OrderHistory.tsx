import { Fragment, useState, useEffect } from 'react';
import { getOrders, cancelOrder } from '../../lib/api';
import { ClipboardListIcon, ClockIcon, CheckIcon, XIcon, RefreshCwIcon, ArrowLeftIcon, ArrowRightIcon, AlertCircleIcon } from '../ui/Icons';

export default function OrderHistory() {
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const limit = 15;

  useEffect(() => {
    loadOrders();
  }, [page, statusFilter]);

  // Background check every 3s if any order is waiting for SMS
  useEffect(() => {
    const hasWaiting = orders.some((o) => o.status === 'waiting');
    if (!hasWaiting) return;

    const interval = setInterval(async () => {
      try {
        const data = await getOrders(limit, page * limit, statusFilter || undefined);
        if (data?.orders) {
          setOrders(data.orders);
        }
      } catch {}
    }, 3000);

    return () => clearInterval(interval);
  }, [orders, page, statusFilter]);

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

  async function handleCancelOrder(orderId: string, serviceName: string) {
    const confirmCancel = window.confirm(`Cancel ${serviceName}? If no OTP was received, the charge will be refunded to your wallet within 5–10 minutes after cancellation.`);
    if (!confirmCancel) return;
    setActionLoading(orderId);
    try {
      await cancelOrder(orderId);
      await loadOrders();
      setSuccessMessage('Number cancelled. If no OTP was received, the charge will be refunded to your wallet within 5–10 minutes.');
      window.setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      alert(err.message || 'Failed to cancel order');
    } finally {
      setActionLoading(null);
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
          {['', 'waiting', 'code_received', 'completed', 'cancelled'].map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0); }}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
            >
              {s === '' ? 'All' : s === 'code_received' ? 'Received' : s.charAt(0).toUpperCase() + s.slice(1)}
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
                  <th>OTP Code</th>
                  <th>Status</th>
                  <th>Refund</th>
                  <th>Price</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const cancelWaitSeconds = Math.max(0, 120 - Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000));
                  return (
                  <Fragment key={order.id}>
                  <tr>
                    <td style={{ fontWeight: 600 }}>{order.service_name}</td>
                    <td>{order.country_name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                      {order.phone_number ? (
                        <span
                          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                          onClick={() => navigator.clipboard?.writeText(String(order.phone_number || ''))}
                          title={`Copy ${order.phone_number}`}
                        >
                          {order.phone_number}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      {order.sms_code ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#10b981', fontSize: '0.95rem', background: 'rgba(16, 185, 129, 0.15)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                            {order.sms_code}
                          </span>
                          <button
                            onClick={() => navigator.clipboard?.writeText(order.sms_code)}
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0.15rem 0.35rem', fontSize: '0.7rem' }}
                            title="Copy OTP"
                          >
                            Copy
                          </button>
                        </div>
                      ) : order.status === 'waiting' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#f59e0b', fontSize: '0.78rem', fontWeight: 600 }}>
                          <RefreshCwIcon size={12} className="animate-spin" />
                          <span>Waiting for OTP...</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td><StatusBadge status={order.status} /></td>
                    <td>
                      {order.refund_status === 'refunded' ? (
                        <span className="badge badge-success">Credited</span>
                      ) : ['pending', 'processing'].includes(order.refund_status) ? (
                        <span className="badge badge-warning">Processing</span>
                      ) : order.refund_status === 'failed' ? (
                        <span className="badge badge-error">Needs Support</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>₹{parseFloat(order.sell_price_inr).toFixed(2)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {new Date(order.created_at).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-expanded={expandedOrder === order.id}
                        onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        History ({order.events?.length || 0})
                      </button>
                      {order.status === 'waiting' && (
                        <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          <a
                            href={`/dashboard/buy?active=${order.id}`}
                            className="btn btn-primary btn-sm"
                            style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', textDecoration: 'none' }}
                          >
                            Live Room
                          </a>
                          <button
                            onClick={() => handleCancelOrder(order.id, order.service_name)}
                            disabled={actionLoading === order.id || cancelWaitSeconds > 0}
                            className="btn btn-danger btn-sm"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                            title={cancelWaitSeconds > 0 ? 'Please wait 2 minutes for the OTP before cancelling this number.' : 'Request cancellation'}
                          >
                            {cancelWaitSeconds > 0 ? `Wait ${cancelWaitSeconds}s` : 'Cancel'}
                          </button>
                        </div>
                      )}
                      {order.status === 'code_received' && (
                        <a
                          href={`/dashboard/buy?active=${order.id}`}
                          className="btn btn-success btn-sm"
                          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', textDecoration: 'none' }}
                        >
                          View Code
                        </a>
                      )}
                      {!['waiting', 'code_received'].includes(order.status) && (
                        null
                      )}
                      </div>
                    </td>
                  </tr>
                  {expandedOrder === order.id && (
                    <tr>
                      <td colSpan={9} style={{ padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.025)' }}>
                        <div style={{ fontWeight: 700, marginBottom: '0.55rem' }}>Order timeline</div>
                        {order.events?.length ? (
                          <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: '0.4rem' }}>
                            {order.events.map((event: any) => (
                              <li key={event.id} style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                <strong style={{ color: 'var(--text-primary)' }}>{eventLabel(event)}</strong>
                                {' — '}{new Date(event.created_at).toLocaleString()}
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No lifecycle events recorded yet.</span>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
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
    code_received: { label: 'Received', icon: <CheckIcon size={12} />, className: 'badge badge-success' },
    completed: { label: 'Done', icon: <CheckIcon size={12} />, className: 'badge badge-info' },
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
