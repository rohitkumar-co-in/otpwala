import { useState, useEffect } from 'react';
import { getAdminOrders } from '../../lib/api';
import { formatPhoneNumber } from '../../lib/phone';
import { toast } from '../../lib/toast';
import {
  RefreshCwIcon,
  CopyIcon,
  CheckIcon,
  AlertCircleIcon,
  XIcon,
} from '../ui/Icons';

export default function OrderManager() {
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window === 'undefined') return 'all';
    const requested = new URLSearchParams(window.location.search).get('status');
    return requested || 'all';
  });
  const [loading, setLoading] = useState(true);
  const [recentRefresh, setRecentRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const limit = 20;

  const loadOrders = async (isManual = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminOrders(limit, page * limit, statusFilter);
      setOrders(data?.orders || []);
      setTotal(data?.total || 0);
      if (isManual) {
        setRecentRefresh(true);
        setTimeout(() => setRecentRefresh(false), 2500);
        toast.success('Order audit logs refreshed.', 'Orders Refreshed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load order logs');
      if (isManual) {
        toast.error(err.message || 'Failed to load order logs', 'Refresh Failed');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [page, statusFilter]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const filteredOrders = orders;

  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)' }}>
            Order <span className="text-gradient">Audit Logs</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Complete real-time log of phone numbers, received SMS codes, customer info, and profits
          </p>
        </div>
        <button
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

      {error && (
        <div className="alert alert-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="order-status-filters" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.25rem' }}>
        {['all', 'stuck', 'failed_refund', 'waiting', 'code_received', 'cancelled', 'expired'].map((st) => (
          <button
            key={st}
            onClick={() => { setStatusFilter(st); setPage(0); }}
            className={`btn btn-sm ${statusFilter === st ? 'btn-primary' : 'btn-ghost'}`}
            style={{ textTransform: 'capitalize', flex: '0 0 auto', whiteSpace: 'nowrap' }}
          >
            {st.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Showing <strong>{filteredOrders.length}</strong> orders on this page (Total {total})
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading platform orders...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No orders found for selected filter.
          </div>
        ) : (
          <div className="responsive-card-table" style={{ overflowX: 'auto' }}>
            <table aria-label="Admin orders" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem' }}>ID</th>
                  <th style={{ padding: '0.75rem' }}>User Email</th>
                  <th style={{ padding: '0.75rem' }}>Service</th>
                  <th style={{ padding: '0.75rem' }}>Country</th>
                  <th style={{ padding: '0.75rem' }}>Phone Number</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  <th style={{ padding: '0.75rem' }}>Price</th>
                  <th style={{ padding: '0.75rem' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td data-label="Order ID" style={{ padding: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {o.id.slice(0, 8)}...
                    </td>
                    <td data-label="User Email" style={{ padding: '0.75rem', fontSize: '0.8rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {o.profiles?.email || 'Unknown User'}
                      </div>
                    </td>
                    <td data-label="Service" style={{ padding: '0.75rem' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{o.service_name || o.service_code || 'Unknown service'}</strong>
                    </td>
                    <td data-label="Country" style={{ padding: '0.75rem' }}><strong>{o.country_name || 'Unknown country'}</strong></td>
                    <td data-label="Phone Number" style={{ padding: '0.75rem' }}>
                      {o.phone_number ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            {formatPhoneNumber(o.phone_number, o.country_code).display || o.phone_number}
                          </span>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                            onClick={() => copyToClipboard(String(o.phone_number || ''), o.id)}
                            title="Copy number"
                          >
                            {copiedId === o.id ? <CheckIcon size={12} color="var(--success)" /> : <CopyIcon size={12} />}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                      )}
                    </td>
                    <td data-label="Status / OTP" style={{ padding: '0.75rem' }}>
                      {o.sms_code ? <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span className="badge badge-success" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem' }}>{o.sms_code}</span><button className="btn btn-ghost btn-sm" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }} onClick={() => copyToClipboard(o.sms_code, `code-${o.id}`)} title="Copy OTP">{copiedId === `code-${o.id}` ? <CheckIcon size={12} color="var(--success)" /> : <CopyIcon size={12} />}</button></div> : <span className={`badge ${['code_received', 'completed'].includes(o.status) ? 'badge-success' : o.status === 'waiting' ? 'badge-info' : ['cancelled', 'expired'].includes(o.status) ? 'badge-error' : o.status === 'refunded' ? 'badge-info' : 'badge-warning'}`} style={{ fontWeight: 700 }}>{['code_received', 'completed'].includes(o.status) ? 'OTP Received' : o.status.replace('_', ' ')}</span>}
                    </td>
                    <td data-label="Price" style={{ padding: '0.75rem', fontWeight: 700, color: o.status === 'waiting' ? 'var(--info)' : o.status === 'code_received' || o.sms_code ? '#34d399' : 'var(--text-muted)' }}>
                      {o.status === 'waiting' ? (
                        <div>Waiting: ₹{parseFloat(o.sell_price_inr || 0).toFixed(2)}</div>
                      ) : o.status === 'code_received' || o.sms_code ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem' }}>
                          <div>Sale: ₹{parseFloat(o.sell_price_inr || 0).toFixed(2)}</div>
                          {o.cost_price_inr != null && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 700 }}>
                              Gross profit: ₹{(parseFloat(o.sell_price_inr || 0) - parseFloat(o.cost_price_inr || 0)).toFixed(2)}
                            </div>
                          )}
                        </div>
                      ) : o.refund_status === 'refunded' ? (
                        <div style={{ color: 'var(--text-muted)' }}>Refunded: ₹{parseFloat(o.sell_price_inr || 0).toFixed(2)}</div>
                      ) : (
                        <div style={{ color: 'var(--text-muted)' }}>
                          {o.refund_status === 'failed' ? 'Refund failed: ' : ['pending', 'processing'].includes(o.refund_status) ? 'Refund pending: ' : `${String(o.status || 'unknown').replace(/_/g, ' ')}: `}₹{parseFloat(o.sell_price_inr || 0).toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td data-label="Time" style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      {new Date(o.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem', alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Previous
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
