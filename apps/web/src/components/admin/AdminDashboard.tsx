import { useState, useEffect } from 'react';
import { getAdminDashboard, getAdminOrders, getAdminPaymentRequests, approvePaymentRequest, rejectPaymentRequest } from '../../lib/api';
import {
  ServerIcon,
  DollarIcon,
  SmartphoneIcon,
  UsersIcon,
  RefreshCwIcon,
  TagIcon,
  GlobeIcon,
  ClipboardListIcon,
  SettingsIcon,
  CheckIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  XIcon,
} from '../ui/Icons';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchStats = getAdminDashboard()
        .then((data) => {
          if (data) setStats(data);
        })
        .catch((err) => {
          console.warn('Dashboard stats warning:', err);
        });

      const fetchOrders = getAdminOrders(8, 0)
        .then((data) => {
          setRecentOrders(data?.orders || []);
        })
        .catch((err) => {
          console.warn('Dashboard orders warning:', err);
        });

      const fetchPayments = getAdminPaymentRequests()
        .then((data) => {
          setPaymentRequests(data || []);
        })
        .catch((err) => {
          console.warn('Dashboard payments warning:', err);
        });

      await Promise.allSettled([fetchStats, fetchOrders, fetchPayments]);
    } catch (err: any) {
      setError(err.message || 'Failed to load admin overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprovePayment = async (requestId: string, amount: number) => {
    setActionLoading(requestId);
    setError(null);
    setSuccessMsg(null);
    try {
      await approvePaymentRequest(requestId);
      setSuccessMsg(`Approved top-up of ₹${amount} successfully!`);
      const [newStats, newRequests] = await Promise.all([
        getAdminDashboard().catch(() => null),
        getAdminPaymentRequests().catch(() => []),
      ]);
      if (newStats) setStats(newStats);
      setPaymentRequests(newRequests || []);
    } catch (err: any) {
      setError(err.message || 'Failed to approve payment');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectPayment = async (requestId: string, amount: number) => {
    const confirmReject = window.confirm(`Are you sure you want to reject this ₹${amount.toFixed(2)} deposit request?`);
    if (!confirmReject) return;
    setActionLoading(requestId);
    setError(null);
    setSuccessMsg(null);
    try {
      await rejectPaymentRequest(requestId);
      setSuccessMsg(`Deposit request of ₹${amount.toFixed(2)} was rejected.`);
      const [newStats, newRequests] = await Promise.all([
        getAdminDashboard().catch(() => null),
        getAdminPaymentRequests().catch(() => []),
      ]);
      if (newStats) setStats(newStats);
      setPaymentRequests(newRequests || []);
    } catch (err: any) {
      setError(err.message || 'Failed to reject payment');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)' }}>
            Admin <span className="text-gradient">Overview</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Live platform metrics, Tiger SMS provider sync, and pending tasks
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={loadData}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            <RefreshCwIcon size={14} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <a href="/admin/pricing" className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <TagIcon size={14} />
            <span>Manage Margins</span>
          </a>
        </div>
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

      {successMsg && (
        <div className="alert alert-success" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircleIcon size={18} />
            <span>{successMsg}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setSuccessMsg(null)}>
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1.25rem' }}>
        {/* Tiger SMS Balance & Status */}
        <div className="card glass-card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--accent-primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tiger SMS API
            </span>
            <span className="badge badge-success" style={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.5rem' }}>
              <span className="status-dot active pulse-dot" style={{ width: '6px', height: '6px' }}></span>
              <span>Up &amp; Operational</span>
            </span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, marginTop: '0.5rem', fontFamily: 'var(--font-display)' }}>
            {loading && !stats ? '...' : `$${parseFloat(stats?.tigerBalance || 0).toFixed(2)}`}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', fontSize: '0.75rem' }}>
            <span className={`status-dot ${parseFloat(stats?.tigerBalance || 0) > 0 ? 'active' : ''}`} style={{ background: parseFloat(stats?.tigerBalance || 0) > 0 ? 'var(--success)' : 'var(--error)' }}></span>
            <span style={{ color: parseFloat(stats?.tigerBalance || 0) > 0 ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
              {parseFloat(stats?.tigerBalance || 0) > 0 ? 'Upstream Provider Connected & Healthy' : 'Provider Connected • Balance $0.00'}
            </span>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="card glass-card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Revenue
            </span>
            <DollarIcon size={20} color="#34d399" />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, marginTop: '0.5rem', fontFamily: 'var(--font-display)', color: '#34d399' }}>
            {loading && !stats ? '...' : `₹${parseFloat(stats?.totalRevenue || 0).toFixed(2)}`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
            Today: <strong style={{ color: 'var(--text-primary)' }}>₹{parseFloat(stats?.revenueToday || 0).toFixed(2)}</strong>
          </div>
        </div>

        {/* Orders */}
        <div className="card glass-card" style={{ padding: '1.25rem', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Orders
            </span>
            <SmartphoneIcon size={20} color="#60a5fa" />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, marginTop: '0.5rem', fontFamily: 'var(--font-display)' }}>
            {loading && !stats ? '...' : (stats?.totalOrders || 0)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
            <span>Today: <strong style={{ color: 'var(--text-primary)' }}>{stats?.ordersToday || 0}</strong></span>
            <span>Live waiting: <strong style={{ color: '#60a5fa' }}>{stats?.activeOrders || 0}</strong></span>
          </div>
        </div>

        {/* Users */}
        <div className="card glass-card" style={{ padding: '1.25rem', borderLeft: '4px solid #a855f7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Users
            </span>
            <UsersIcon size={20} color="#c084fc" />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, marginTop: '0.5rem', fontFamily: 'var(--font-display)' }}>
            {loading && !stats ? '...' : (stats?.totalUsers || 0)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
            <a href="/admin/users" style={{ color: 'var(--text-accent)', textDecoration: 'none' }}>
              Manage users &amp; balances &rarr;
            </a>
          </div>
        </div>
      </div>

      {/* Pending Manual Top-up Requests */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Pending Top-up Requests</h2>
            <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
              {paymentRequests.length} Pending
            </span>
          </div>
        </div>

        {loading && paymentRequests.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCwIcon size={16} className="animate-spin" style={{ display: 'inline', marginRight: '6px' }} />
            Loading pending requests...
          </div>
        ) : paymentRequests.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <CheckCircleIcon size={16} color="var(--success)" />
            <span>All top-up requests are up to date! No manual approvals pending.</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.65rem 0.75rem' }}>User Email</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Amount</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>UTR / Ref ID</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Method</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Requested At</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paymentRequests.map((req) => (
                  <tr key={req.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                      {req.profiles?.email || req.user_id}
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--success)' }}>
                      ₹{parseFloat(req.amount_inr || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                      {req.gateway_payment_id ? (
                        <span className="badge badge-secondary" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.03em' }}>
                          {req.gateway_payment_id}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span className="badge badge-info">{req.gateway?.toUpperCase() || 'UPI'}</span>
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {new Date(req.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={actionLoading === req.id}
                          onClick={() => handleApprovePayment(req.id, parseFloat(req.amount_inr))}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          <CheckIcon size={14} />
                          <span>{actionLoading === req.id ? 'Approving...' : 'Approve & Credit'}</span>
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={actionLoading === req.id}
                          onClick={() => handleRejectPayment(req.id, parseFloat(req.amount_inr))}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                          title="Reject deposit request"
                        >
                          <XIcon size={14} />
                          <span>Reject</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Orders Overview */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Recent Orders Across Platform</h2>
          <a href="/admin/orders" className="btn btn-ghost btn-sm" style={{ fontSize: '0.8rem' }}>
            View All Orders →
          </a>
        </div>

        {loading && recentOrders.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCwIcon size={16} className="animate-spin" style={{ display: 'inline', marginRight: '6px' }} />
            Loading recent orders...
          </div>
        ) : recentOrders.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No orders found yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Order ID</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>User</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Service</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Number</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>OTP Code</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Status</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Price</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {o.id.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.8rem' }}>
                      {o.profiles?.email || 'User'}
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>
                      {o.service_code.toUpperCase()}
                    </td>
                    <td style={{ padding: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                      {o.phone_number || '—'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {o.sms_code ? (
                        <span className="badge badge-success" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                          {o.sms_code}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
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
                        {o.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>
                      ₹{parseFloat(o.sell_price_inr || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Action Navigation Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <a href="/admin/pricing" className="card glass-card" style={{ padding: '1.25rem', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <TagIcon size={24} color="var(--accent-primary)" />
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>Profit Margins & Pricing</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
            Configure percentage markup or fixed margins per service or country.
          </p>
        </a>
        <a href="/admin/catalog" className="card glass-card" style={{ padding: '1.25rem', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <GlobeIcon size={24} color="#38bdf8" />
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>Catalog & Visibility</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
            Enable or disable specific services and countries displayed on the website.
          </p>
        </a>
        <a href="/admin/users" className="card glass-card" style={{ padding: '1.25rem', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <UsersIcon size={24} color="#c084fc" />
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>User Management</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
            Search accounts, manually credit wallets, or ban suspicious users.
          </p>
        </a>
        <a href="/admin/orders" className="card glass-card" style={{ padding: '1.25rem', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <ClipboardListIcon size={24} color="#f59e0b" />
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>Full Orders Log</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
            Inspect all SMS activations, statuses, and delivery rates.
          </p>
        </a>
        <a href="/admin/settings" className="card glass-card" style={{ padding: '1.25rem', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <SettingsIcon size={24} color="var(--text-secondary)" />
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>System & Exchange Rates</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
            Set USD/INR conversion rate, UPI IDs, and platform configurations.
          </p>
        </a>
      </div>
    </div>
  );
}
