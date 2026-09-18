import { useState, useEffect } from 'react';
import { getAdminDashboard, getAdminOrders, getAdminPaymentRequests, approvePaymentRequest, rejectPaymentRequest, runAdminReconciliation } from '../../lib/api';
import { formatPhoneNumber } from '../../lib/phone';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
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
  CopyIcon,
  XIcon,
} from '../ui/Icons';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [recentOrdersTotal, setRecentOrdersTotal] = useState(0);
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentRefresh, setRecentRefresh] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [paymentTab, setPaymentTab] = useState<'pending' | 'approved' | 'all'>('pending');
  const [reconciling, setReconciling] = useState(false);
  const integrityUnavailable = Boolean(stats?.financialIntegrity?.error);
  const integrityIssues = Number(stats?.financialIntegrity?.totalIssues || 0);
  // Funding totals come from the wallet_funding_summary RPC. Until that migration is
  // applied the keys are absent — fall back to top-ups only and say so instead of
  // silently reporting free balance as collected cash.
  const fundingSummaryAvailable = stats ? stats.cashCollected !== undefined : false;
  const cashCollected = fundingSummaryAvailable
    ? Number(stats?.cashCollected || 0)
    : parseFloat(stats?.totalTopups || 0) + parseFloat(stats?.adminCredits || 0);

  const loadRecentOrders = async () => {
    setOrdersLoading(true);
    try {
      const data = await getAdminOrders(8, 0);
      setRecentOrders(data?.orders || []);
      setRecentOrdersTotal(data?.total || 0);
    } catch (err) {
      console.warn('Dashboard orders warning:', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadData = async (isManual = false) => {
    setLoading(true);
    setError(null);
    try {
      const fetchStats = getAdminDashboard()
        .then((data) => {
          if (data) setStats(data);
        })
        .catch((err) => {
          console.warn('Dashboard stats warning:', err);
          setError(err?.message || 'Unable to load dashboard metrics.');
        });

      const fetchOrders = loadRecentOrders();

      const fetchPayments = getAdminPaymentRequests()
        .then((data) => {
          setPaymentRequests(data || []);
        })
        .catch((err) => {
          console.warn('Dashboard payments warning:', err);
          setError(err?.message || 'Unable to load payment requests.');
        });

      await Promise.allSettled([fetchStats, fetchOrders, fetchPayments]);
      if (isManual) {
        setRecentRefresh(true);
        setTimeout(() => setRecentRefresh(false), 2500);
        toast.success('Admin dashboard metrics and requests refreshed.', 'Dashboard Refreshed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load admin overview');
      if (isManual) {
        toast.error(err.message || 'Failed to load admin overview', 'Refresh Failed');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleReconcile = async () => {
    setReconciling(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const result = await runAdminReconciliation();
      const msg = `Reconciliation complete: ${result.scanned} scanned, ${result.delivered} delivered, ${result.refunded} refunded, ${result.failed} failed.`;
      setSuccessMsg(msg);
      toast.success(msg, 'Reconciliation Complete');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Reconciliation failed');
      toast.error(err.message || 'Reconciliation failed', 'Reconciliation Failed');
    } finally {
      setReconciling(false);
    }
  };

  const handleApprovePayment = async (requestId: string, amount: number) => {
    setActionLoading(requestId);
    setError(null);
    setSuccessMsg(null);
    try {
      await approvePaymentRequest(requestId);
      const msg = `Approved top-up of ₹${amount.toFixed(2)} successfully!`;
      setSuccessMsg(msg);
      toast.success(msg, 'Payment Approved');
      setPaymentRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'approved' } : r))
      );
      const [newStats, newRequests] = await Promise.all([
        getAdminDashboard().catch(() => null),
        getAdminPaymentRequests().catch(() => []),
      ]);
      if (newStats) setStats(newStats);
      if (newRequests) setPaymentRequests(newRequests);
    } catch (err: any) {
      setError(err.message || 'Failed to approve payment');
      toast.error(err.message || 'Failed to approve payment', 'Approval Failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectPayment = async (requestId: string, amount: number) => {
    const confirmReject = await showConfirm({
      title: 'Reject Deposit Request',
      message: `Are you sure you want to reject this ₹${amount.toFixed(2)} deposit request? The user will be notified of the rejection.`,
      confirmText: 'Reject Deposit',
      cancelText: 'Cancel',
      type: 'danger',
    });
    if (!confirmReject) return;
    setActionLoading(requestId);
    setError(null);
    setSuccessMsg(null);
    try {
      await rejectPaymentRequest(requestId);
      const msg = `Deposit request of ₹${amount.toFixed(2)} was rejected.`;
      setSuccessMsg(msg);
      toast.info(msg, 'Payment Rejected');
      setPaymentRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'rejected' } : r))
      );
      const [newStats, newRequests] = await Promise.all([
        getAdminDashboard().catch(() => null),
        getAdminPaymentRequests().catch(() => []),
      ]);
      if (newStats) setStats(newStats);
      if (newRequests) setPaymentRequests(newRequests);
    } catch (err: any) {
      setError(err.message || 'Failed to reject payment');
      toast.error(err.message || 'Failed to reject payment', 'Rejection Failed');
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
            Admin <span className="text-gradient">Dashboard</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Live platform metrics, payment verification queue, and automated background reconciliation
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleReconcile}
            disabled={reconciling}
            title="Scan orders waiting for SMS and auto-deliver or refund expired items"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', border: '1px solid var(--border-subtle)' }}
          >
            <RefreshCwIcon size={14} className={reconciling ? 'animate-spin' : ''} />
            <span>{reconciling ? 'Reconciling...' : 'Auto-Reconcile Orders'}</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => loadData(true)}
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

      {stats && parseFloat(stats.tigerBalance || 0) < 1.0 && (
        <div style={{
          padding: '0.85rem 1.15rem',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <AlertCircleIcon size={22} color="#f59e0b" aria-hidden="true" />
            <div>
              <div style={{ fontWeight: 600, color: '#f59e0b', fontSize: '0.875rem' }}>
                Tiger SMS Provider Balance is Low (${parseFloat(stats.tigerBalance || 0).toFixed(2)})
              </div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                Carrier orders costing above ${parseFloat(stats.tigerBalance || 0).toFixed(2)} will fail with "Carrier numbers unavailable". Please top up your Tiger SMS account.
              </div>
            </div>
          </div>
          <a
            href="https://tiger-sms.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm"
            style={{ background: '#f59e0b', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            Top Up on Tiger SMS ↗
          </a>
        </div>
      )}

      {stats && (!stats.providerAvailable || stats.failedRefunds > 0 || stats.stuckOrders > 0) && (
        <div className="alert alert-error" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.45rem' }}>
          <strong>Operations require attention</strong>
          {!stats.providerAvailable && <span>Tiger SMS health check failed: {stats.providerError || 'provider unavailable'}</span>}
          {stats.failedRefunds > 0 && <a href="/admin/orders?status=failed_refund" style={{ color: 'inherit' }}>{stats.failedRefunds} refund(s) failed — inspect and retry reconciliation</a>}
          {stats.stuckOrders > 0 && <a href="/admin/orders?status=stuck" style={{ color: 'inherit' }}>{stats.stuckOrders} expired waiting order(s) need reconciliation</a>}
        </div>
      )}

      {stats?.recentAlerts?.length > 0 && (
        <section className="card" style={{ padding: '1.25rem' }} aria-labelledby="operational-alerts-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.85rem' }}>
            <div>
              <h2 id="operational-alerts-heading" style={{ fontSize: '1.05rem', margin: 0 }}>Operational Alert History</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0.2rem 0 0' }}>Latest deduplicated provider and notification alerts.</p>
            </div>
            {stats.failedAlerts > 0 && <span className="badge badge-error">{stats.failedAlerts} failed</span>}
          </div>
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            {stats.recentAlerts.map((alert: any) => (
              <div key={alert.alert_key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.75rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ fontSize: '0.84rem' }}>{String(alert.alert_type).replaceAll('_', ' ')}</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', marginTop: '0.2rem' }}>
                    {alert.details?.balance != null ? `Provider balance $${Number(alert.details.balance).toFixed(2)} · threshold $${Number(alert.details.threshold || 0).toFixed(2)} · ` : ''}
                    {new Date(alert.created_at).toLocaleString()}
                  </div>
                  {alert.last_error && <div style={{ color: 'var(--error)', fontSize: '0.74rem', marginTop: '0.2rem' }}>{alert.last_error}</div>}
                </div>
                <span className={`badge ${alert.status === 'sent' ? 'badge-success' : alert.status === 'failed' ? 'badge-error' : 'badge-warning'}`}>
                  {alert.channel}: {alert.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {stats?.financialIntegrity && (
        <section className="card" style={{ padding: '1.25rem', borderLeft: `4px solid ${integrityUnavailable || integrityIssues > 0 ? 'var(--error)' : 'var(--success)'}` }} aria-labelledby="financial-integrity-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div><h2 id="financial-integrity-heading" style={{ fontSize: '1.05rem', margin: 0 }}>Financial Integrity Check</h2><p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0.25rem 0 0' }}>Cross-checks orders, refunds, approved top-ups, and profile balances against the immutable wallet ledger.</p></div>
            <span className={`badge ${integrityUnavailable || integrityIssues > 0 ? 'badge-error' : 'badge-success'}`}>{integrityUnavailable ? 'Check unavailable' : integrityIssues === 0 ? 'All checks passed' : `${integrityIssues} issue(s)`}</span>
          </div>
          {integrityUnavailable ? <p role="alert" style={{ color: 'var(--error)', fontSize: '0.8rem', margin: '0.85rem 0 0' }}>{stats.financialIntegrity.error} Refresh the dashboard; if it persists, investigate the database RPC before approving financial actions.</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.55rem', marginTop: '0.85rem' }}>
            {[
              ['Orders without debit', stats.financialIntegrity.ordersWithoutDebit],
              ['Order amount mismatch', stats.financialIntegrity.orderDebitMismatch],
              ['Refunds without credit', stats.financialIntegrity.refundsWithoutCredit],
              ['Refund amount mismatch', stats.financialIntegrity.refundAmountMismatch],
              ['Top-ups without credit', stats.financialIntegrity.topupsWithoutCredit],
              ['Top-up amount mismatch', stats.financialIntegrity.topupAmountMismatch],
              ['Wallet balance mismatch', stats.financialIntegrity.walletBalanceMismatch],
            ].map(([label,value]) => <div key={String(label)} style={{ padding: '0.65rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>{label}<strong style={{ display: 'block', marginTop: '0.2rem', fontSize: '1rem', color: Number(value || 0) ? 'var(--error)' : 'var(--success)' }}>{Number(value || 0)}</strong></div>)}
          </div>}
          {!integrityUnavailable && (Number(stats.financialIntegrity.legacyUnlinkedOrders || 0) + Number(stats.financialIntegrity.legacyUnlinkedTopups || 0)) > 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0.85rem 0 0' }}>
              Historical pre-baseline records: {Number(stats.financialIntegrity.legacyUnlinkedOrders || 0)} order(s) and {Number(stats.financialIntegrity.legacyUnlinkedTopups || 0)} top-up(s) lack provable legacy links. They are retained for audit and excluded from the live atomic-ledger control.
            </p>
          )}
        </section>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {/* Tiger SMS Balance & Status */}
        <div className="card glass-card" style={{ padding: '1.25rem', borderLeft: `4px solid ${parseFloat(stats?.tigerBalance || 0) >= 1.0 ? '#10b981' : parseFloat(stats?.tigerBalance || 0) > 0 ? '#f59e0b' : '#ef4444'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tiger SMS API
            </span>
            <span className={`badge ${parseFloat(stats?.tigerBalance || 0) >= 1.0 ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.5rem' }}>
              <span className="status-dot active pulse-dot" style={{ width: '6px', height: '6px', background: parseFloat(stats?.tigerBalance || 0) >= 1.0 ? 'var(--success)' : '#f59e0b' }}></span>
              <span>{parseFloat(stats?.tigerBalance || 0) >= 1.0 ? 'Up & Operational' : 'Low Balance'}</span>
            </span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, marginTop: '0.5rem', fontFamily: 'var(--font-display)', color: parseFloat(stats?.tigerBalance || 0) >= 1.0 ? 'var(--text-primary)' : '#f59e0b' }}>
            {loading && !stats ? '...' : `$${parseFloat(stats?.tigerBalance || 0).toFixed(2)}`}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', fontSize: '0.75rem' }}>
            <span className={`status-dot ${parseFloat(stats?.tigerBalance || 0) >= 1.0 ? 'active' : ''}`} style={{ background: parseFloat(stats?.tigerBalance || 0) >= 1.0 ? 'var(--success)' : parseFloat(stats?.tigerBalance || 0) > 0 ? '#f59e0b' : 'var(--error)' }}></span>
            <span style={{ color: parseFloat(stats?.tigerBalance || 0) >= 1.0 ? 'var(--success)' : parseFloat(stats?.tigerBalance || 0) > 0 ? '#f59e0b' : 'var(--error)', fontWeight: 600 }}>
              {parseFloat(stats?.tigerBalance || 0) >= 1.0
                ? 'Upstream Provider Connected & Healthy'
                : parseFloat(stats?.tigerBalance || 0) > 0
                ? 'Low Balance — Top Up Tiger SMS'
                : 'Provider Connected • Balance $0.00'}
            </span>
          </div>
        </div>

        {/* Cash really received: UPI top-ups + manually confirmed funding */}
        <div className="card glass-card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Cash Collected (Real Money)
            </span>
            <DollarIcon size={20} color="#34d399" />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, marginTop: '0.5rem', fontFamily: 'var(--font-display)', color: '#34d399' }}>
            {loading && !stats ? '...' : `₹${parseFloat(stats?.cashCollected ?? stats?.totalTopups ?? 0).toFixed(2)}`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
            UPI ₹{parseFloat(stats?.totalTopups || 0).toFixed(2)} ({stats?.topupCount || 0})
            {' · '}Manual ₹{parseFloat(stats?.manualFunding || 0).toFixed(2)} ({stats?.manualFundingCount || 0})
            <br />
            Today: <strong style={{ color: 'var(--text-primary)' }}>₹{parseFloat(stats?.cashCollectedToday || 0).toFixed(2)}</strong>
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

      {stats && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Order &amp; Financial Breakdown</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0.25rem 0 0' }}>
              Lifetime totals. Today uses Asia/Kolkata time. Sales and provider cost include OTP-delivered orders only.
              Cash collected counts UPI top-ups and admin-confirmed manual funding; free funds granted by an admin are never revenue. Order refunds are wallet credits, not cash collected or revenue.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            {[
              ['OTP Delivered', stats.otpDelivered || 0, '#10b981'],
              ['OTP Not Received', stats.otpNotReceived || 0, '#f59e0b'],
              ['Lifetime Order Refunds (Wallet Credits)', `${stats.refundCount || 0} · ₹${parseFloat(stats.refundAmount || 0).toFixed(2)}`, '#ef4444'],
              ['Refunds Needing Attention', stats.refundsPending || 0, '#f97316'],
              ['Gross OTP Sales', `₹${parseFloat(stats.grossOtpSales || 0).toFixed(2)}`, '#3b82f6'],
              ['Provider Cost', `₹${parseFloat(stats.providerCostInr || 0).toFixed(2)}`, '#8b5cf6'],
              ['Gross Profit', `₹${parseFloat(stats.grossProfit || 0).toFixed(2)}`, '#059669'],
              ['Customer Wallet Liability', `₹${parseFloat(stats.walletLiability || 0).toFixed(2)}`, '#64748b'],
              ['Cash Collected (UPI + Manual)', `₹${parseFloat(stats.cashCollected || 0).toFixed(2)}`, '#10b981'],
              ['Free Funds Granted (Not Revenue)', `₹${parseFloat(stats.freeFunds || 0).toFixed(2)} · ${stats.freeFundsCount || 0} grant(s)`, '#a855f7'],
              ['Unresolved Support', stats.unresolvedSupport || 0, '#0ea5e9'],
            ].map(([label, value, color]) => (
              <div key={String(label)} style={{ padding: '0.85rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                <div style={{ color: String(color), fontSize: '1.15rem', fontWeight: 800, marginTop: '0.3rem' }}>{String(value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Top-up Requests Section with Tabs */}
      {(() => {
        const pendingList = paymentRequests.filter((r) => {
          const s = String(r.status || '').toLowerCase();
          return s === 'pending' || s === 'created';
        });
        const approvedList = paymentRequests.filter((r) => {
          const s = String(r.status || '').toLowerCase();
          return s === 'approved' || s === 'paid';
        });

        const displayedRequests =
          paymentTab === 'pending'
            ? pendingList
            : paymentTab === 'approved'
            ? approvedList
            : paymentRequests;

        return (
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Top-up & Deposit Requests</h2>
                {pendingList.length > 0 ? (
                  <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                    {pendingList.length} Pending
                  </span>
                ) : (
                  <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                    All Cleared
                  </span>
                )}
              </div>

              {/* Tab Switcher */}
              <div style={{ display: 'inline-flex', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '2px', gap: '2px' }}>
                <button
                  type="button"
                  onClick={() => setPaymentTab('pending')}
                  style={{
                    border: 'none',
                    background: paymentTab === 'pending' ? 'var(--primary)' : 'transparent',
                    color: paymentTab === 'pending' ? '#fff' : 'var(--text-secondary)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Pending ({pendingList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentTab('approved')}
                  style={{
                    border: 'none',
                    background: paymentTab === 'approved' ? 'var(--primary)' : 'transparent',
                    color: paymentTab === 'approved' ? '#fff' : 'var(--text-secondary)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Approved ({approvedList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentTab('all')}
                  style={{
                    border: 'none',
                    background: paymentTab === 'all' ? 'var(--primary)' : 'transparent',
                    color: paymentTab === 'all' ? '#fff' : 'var(--text-secondary)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  All ({paymentRequests.length})
                </button>
              </div>
            </div>

            {loading && paymentRequests.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCwIcon size={16} className="animate-spin" style={{ display: 'inline', marginRight: '6px' }} />
                Loading deposit requests...
              </div>
            ) : displayedRequests.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <CheckCircleIcon size={16} color="var(--success)" />
                <span>
                  {paymentTab === 'pending'
                    ? 'All top-up requests are up to date! No manual approvals pending.'
                    : `No ${paymentTab} deposit requests found.`}
                </span>
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
                      <th style={{ padding: '0.65rem 0.75rem' }}>Status</th>
                      <th style={{ padding: '0.65rem 0.75rem' }}>Requested At</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRequests.map((req) => {
                      const amt = parseFloat(req.amount ?? req.amount_inr ?? 0);
                      const utr = req.transaction_id || req.gateway_payment_id || '';
                      const method = req.payment_method || req.gateway || 'UPI';
                      const st = String(req.status || 'pending').toLowerCase();
                      const isPending = st === 'pending' || st === 'created';
                      const isApproved = st === 'approved' || st === 'paid';

                      return (
                        <tr key={req.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                            {req.profiles?.email || req.user_id}
                          </td>
                          <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--success)' }}>
                            ₹{amt.toFixed(2)}
                          </td>
                          <td style={{ padding: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                            {utr ? (
                              <span className="badge badge-secondary" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.03em' }}>
                                {utr}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <span className="badge badge-info">{method.toUpperCase()}</span>
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            {isApproved ? (
                              <span className="badge badge-success">Approved</span>
                            ) : isPending ? (
                              <span className="badge badge-warning">Pending</span>
                            ) : (
                              <span className="badge badge-danger">Rejected</span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            {new Date(req.created_at).toLocaleString()}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                            {isPending ? (
                              <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-primary btn-sm"
                                  disabled={actionLoading === req.id}
                                  onClick={() => handleApprovePayment(req.id, amt)}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                >
                                  <CheckIcon size={14} />
                                  <span>{actionLoading === req.id ? 'Approving...' : 'Approve & Credit'}</span>
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  disabled={actionLoading === req.id}
                                  onClick={() => handleRejectPayment(req.id, amt)}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                  title="Reject deposit request"
                                >
                                  <XIcon size={14} />
                                  <span>Reject</span>
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: isApproved ? 'var(--success)' : 'var(--text-muted)', fontWeight: 500 }}>
                                {isApproved ? 'Credited to wallet' : 'Declined'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* Recent Orders Overview */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Recent Orders Across Platform</h2>
          <a href="/admin/orders" className="btn btn-ghost btn-sm" style={{ fontSize: '0.8rem' }}>
            View All Orders →
          </a>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Showing <strong>{recentOrders.length}</strong> orders on this page (Total {recentOrdersTotal})
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={loadRecentOrders}
            disabled={ordersLoading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: ordersLoading ? 'not-allowed' : 'pointer' }}
          >
            <RefreshCwIcon size={14} className={ordersLoading ? 'animate-spin' : ''} />
            <span>{ordersLoading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {ordersLoading && recentOrders.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading platform orders...
          </div>
        ) : recentOrders.length === 0 ? (
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
                  <th style={{ padding: '0.75rem' }}>Service</th>
                  <th style={{ padding: '0.75rem' }}>Country</th>
                  <th style={{ padding: '0.75rem' }}>Number</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  <th style={{ padding: '0.75rem' }}>Price</th>
                  <th style={{ padding: '0.75rem' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {o.id.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.8rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {o.profiles?.email || 'Unknown User'}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{o.service_name || o.service_code || 'Unknown service'}</strong>
                    </td>
                    <td style={{ padding: '0.75rem' }}><strong>{o.country_name || 'Unknown country'}</strong></td>
                    <td style={{ padding: '0.75rem' }}>
                      {o.phone_number ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            <span><small style={{ display: 'block', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>Phone number</small>{formatPhoneNumber(o.phone_number, o.country_code).display || o.phone_number}</span>
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
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {o.sms_code ? <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span className="badge badge-success" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem' }}>{o.sms_code}</span><button className="btn btn-ghost btn-sm" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }} onClick={() => copyToClipboard(o.sms_code, `code-${o.id}`)} title="Copy OTP">{copiedId === `code-${o.id}` ? <CheckIcon size={12} color="var(--success)" /> : <CopyIcon size={12} />}</button></div> : <span className={`badge ${o.status === 'waiting' ? 'badge-info' : ['cancelled', 'expired'].includes(o.status) ? 'badge-error' : 'badge-warning'}`}>{o.status === 'code_received' ? 'OTP Received' : o.status.replace('_', ' ')}</span>}
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: 700, color: '#34d399' }}>
                      {o.status === 'code_received' || o.sms_code ? (
                        <>
                          <div>Sale: ₹{parseFloat(o.sell_price_inr || 0).toFixed(2)}</div>
                          {o.cost_price_inr != null && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 700 }}>
                              Gross profit: ₹{(parseFloat(o.sell_price_inr || 0) - parseFloat(o.cost_price_inr || 0)).toFixed(2)}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ color: 'var(--text-muted)' }}>Refunded: ₹{parseFloat(o.sell_price_inr || 0).toFixed(2)}</div>
                      )}
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
