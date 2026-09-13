import { useState, useEffect } from 'react';
import { getOrders, cancelOrder } from '../../lib/api';
import { ClipboardListIcon, ClockIcon, CheckIcon, XIcon, RefreshCwIcon, ArrowLeftIcon, ArrowRightIcon } from '../ui/Icons';

export default function OrderHistory() {
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const limit = 15;

  useEffect(() => {
    loadOrders();
  }, [page, statusFilter]);

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
    const confirmCancel = window.confirm(`Cancel order for ${serviceName} and receive a 100% refund to your wallet?`);
    if (!confirmCancel) return;
    setActionLoading(orderId);
    try {
      await cancelOrder(orderId);
      await loadOrders();
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
                  <th>Price</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id}>
                    <td style={{ fontWeight: 600 }}>{order.service_name}</td>
                    <td>{order.country_name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{order.phone_number}</td>
                    <td>
                      {order.sms_code ? (
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--success)' }}>
                          {order.sms_code}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td><StatusBadge status={order.status} /></td>
                    <td style={{ fontWeight: 600 }}>₹{parseFloat(order.sell_price_inr).toFixed(2)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {new Date(order.created_at).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
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
                            disabled={actionLoading === order.id}
                            className="btn btn-danger btn-sm"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                            title="Cancel and instant refund"
                          >
                            Cancel
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
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
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
