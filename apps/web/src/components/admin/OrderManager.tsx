import { useState, useEffect } from 'react';
import { getAdminOrders } from '../../lib/api';
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const limit = 20;

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminOrders(limit, page * limit);
      setOrders(data?.orders || []);
      setTotal(data?.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load order logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [page]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const filteredOrders = statusFilter === 'all'
    ? orders
    : orders.filter((o) => o.status === statusFilter);

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
          onClick={loadOrders}
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          <RefreshCwIcon size={14} className={loading ? 'animate-spin' : ''} />
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
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
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {['all', 'waiting', 'code_received', 'completed', 'cancelled', 'expired'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`btn btn-sm ${statusFilter === st ? 'btn-primary' : 'btn-ghost'}`}
            style={{ textTransform: 'capitalize' }}
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
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem' }}>ID</th>
                  <th style={{ padding: '0.75rem' }}>User Email</th>
                  <th style={{ padding: '0.75rem' }}>Service / Country</th>
                  <th style={{ padding: '0.75rem' }}>Phone Number</th>
                  <th style={{ padding: '0.75rem' }}>OTP Code</th>
                  <th style={{ padding: '0.75rem' }}>Sell Price</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  <th style={{ padding: '0.75rem' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {o.id.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.8rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {o.profiles?.email || 'Unknown User'}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Tiger ID: {o.tiger_order_id || '—'}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span className="badge badge-info" style={{ fontWeight: 700 }}>
                          {o.service_code.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          ID:{o.country_code}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {o.phone_number ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            {o.phone_number}
                          </span>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                            onClick={() => copyToClipboard(o.phone_number, o.id)}
                            title="Copy number"
                          >
                            {copiedId === o.id ? <CheckIcon size={12} color="var(--success)" /> : <CopyIcon size={12} />}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {o.sms_code ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span
                            className="badge badge-success"
                            style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem', padding: '0.2rem 0.5rem' }}
                          >
                            {o.sms_code}
                          </span>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                            onClick={() => copyToClipboard(o.sms_code, `code-${o.id}`)}
                            title="Copy OTP"
                          >
                            {copiedId === `code-${o.id}` ? <CheckIcon size={12} color="var(--success)" /> : <CopyIcon size={12} />}
                          </button>
                        </div>
                      ) : o.status === 'waiting' ? (
                        <span style={{ color: '#60a5fa', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span className="status-dot active"></span> Waiting for SMS...
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: 700, color: '#34d399' }}>
                      ₹{parseFloat(o.sell_price_inr || 0).toFixed(2)}
                      {o.cost_price_usd && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                          Base: ${parseFloat(o.cost_price_usd).toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span className={`badge ${
                        o.status === 'code_received' || o.status === 'completed'
                          ? 'badge-success'
                          : o.status === 'waiting'
                          ? 'badge-info'
                          : 'badge-error'
                      }`}>
                        {o.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
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
