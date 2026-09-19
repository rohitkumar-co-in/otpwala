import { useState, useEffect } from 'react';
import {
  getAdminRecharges,
  getAdminFundingSummary,
  creditUser,
} from '../../lib/api';
import type { AdminFundingSource } from '../../lib/api';
import FundingSourcePicker from './FundingSourcePicker';
import { toast } from '../../lib/toast';
import {
  SearchIcon,
  RefreshCwIcon,
  CreditCardIcon,
  CheckCircleIcon,
  CheckIcon,
  XIcon,
} from '../ui/Icons';

const getCachedRecharges = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem('otpwala_admin_recharges_cache');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export default function RechargeManager() {
  const cached = getCachedRecharges();
  const [recharges, setRecharges] = useState<any[]>(cached?.recharges || []);
  const [total, setTotal] = useState(cached?.total || 0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(!cached?.recharges);
  const [hasLoaded, setHasLoaded] = useState(Boolean(cached?.recharges));
  const [recentRefresh, setRecentRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Credit modal state
  const [creditUserTarget, setCreditUserTarget] = useState<any | null>(null);
  const [creditAmount, setCreditAmount] = useState<number>(100);
  const [creditReason, setCreditReason] = useState<string>('Manual Admin Credit');
  const [creditFundingSource, setCreditFundingSource] = useState<'' | AdminFundingSource>('');
  const [crediting, setCrediting] = useState(false);

  // Balance-sheet view: which funding source is being listed, and platform totals.
  const [sourceFilter, setSourceFilter] = useState<'all' | 'upi' | 'manual' | 'free'>('all');
  const [summary, setSummary] = useState<any>(cached?.summary || null);

  const SOURCE_FILTERS: { key: 'all' | 'upi' | 'manual' | 'free'; label: string }[] = [
    { key: 'all', label: 'All funding' },
    { key: 'upi', label: 'UPI top-ups (cash)' },
    { key: 'manual', label: 'Manual funding (cash)' },
    { key: 'free', label: 'Free funds (no cash)' },
  ];

  const sourceBadge = (tx: any) => {
    if (tx.type === 'topup') return { label: 'UPI Top-Up', className: 'badge-success' };
    if (tx.type === 'admin_grant') return { label: 'Free Funds (Admin)', className: 'badge-warning' };
    return { label: 'Manual Funding', className: 'badge-primary' };
  };

  const inr = (value: any) => {
    if (value === undefined || value === null) return '...';
    return `₹${parseFloat(value || 0).toFixed(2)}`;
  };

  const limit = 20;

  const loadSummary = async () => {
    try {
      const data = await getAdminFundingSummary();
      if (data) {
        setSummary(data);
        return data;
      }
    } catch (err) {
      console.warn('Funding summary warning:', err);
    }
    return null;
  };

  const loadRecharges = async (isManual = false) => {
    setLoading(true);
    setError(null);
    try {
      const [rechargesData, summaryData] = await Promise.all([
        getAdminRecharges(limit, page * limit, search, sourceFilter),
        getAdminFundingSummary().catch(() => null),
      ]);
      const list = rechargesData?.recharges || [];
      const totalCount = rechargesData?.total || 0;
      setRecharges(list);
      setTotal(totalCount);
      if (summaryData) setSummary(summaryData);

      try {
        sessionStorage.setItem('otpwala_admin_recharges_cache', JSON.stringify({
          recharges: list,
          total: totalCount,
          summary: summaryData || summary,
        }));
      } catch {}
      setHasLoaded(true);

      if (isManual) {
        setRecentRefresh(true);
        setTimeout(() => setRecentRefresh(false), 2500);
        toast.success('Recharge records and ledger refreshed.', 'Ledger Refreshed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load recharges');
      if (isManual) {
        toast.error(err.message || 'Failed to load recharges', 'Refresh Failed');
      }
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  };

  useEffect(() => {
    loadRecharges();
  }, [page, search, sourceFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  };

  const handleCreditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditUserTarget) return;
    if (creditAmount === 0 || isNaN(creditAmount)) {
      setError('Please enter a valid amount');
      return;
    }
    if (!creditFundingSource) {
      setError('Choose whether the funds were manually funded (money received) or added for free by admin.');
      return;
    }
    setCrediting(true);
    setError(null);
    setSuccess(null);
    try {
      await creditUser(creditUserTarget.user_id, creditAmount, creditReason, creditFundingSource);
      const msg = creditFundingSource === 'free_grant'
        ? `Added ${inr(Math.abs(creditAmount))} free funds to ${creditUserTarget.email} (not counted as revenue).`
        : `Recorded ${inr(Math.abs(creditAmount))} manual funding for ${creditUserTarget.email} as collected cash.`;
      setSuccess(msg);
      toast.success(msg, 'Wallet Credited');
      setCreditUserTarget(null);
      setCreditReason('Manual Admin Credit');
      setCreditFundingSource('');
      await loadRecharges();
    } catch (err: any) {
      setError(err.message || 'Failed to update user balance');
      toast.error(err.message || 'Failed to update user balance', 'Credit Failed');
    } finally {
      setCrediting(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="admin-recharge-manager" style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', margin: 0 }}>Wallet Recharges</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.2rem' }}>Every wallet funding entry, separated into cash really received and free balance granted to users.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
            <div className="input-with-icon">
              <span className="icon"><SearchIcon size={16} /></span>
              <input
                type="text"
                className="input input-sm"
                aria-label="Search recharge records by email"
                placeholder="Search email..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ width: '220px' }}
              />
            </div>
            <button type="submit" className="btn btn-secondary btn-sm">Search</button>
          </form>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => loadRecharges(true)}
            title="Refresh"
            aria-label="Refresh recharge records"
            disabled={loading}
            style={{
              borderColor: recentRefresh ? '#10b981' : undefined,
              color: recentRefresh ? '#34d399' : undefined,
            }}
          >
            {recentRefresh ? (
              <CheckIcon size={16} color="#34d399" />
            ) : (
              <RefreshCwIcon size={16} className={loading ? 'spin' : ''} />
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{error}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}><XIcon size={14} /></button>
        </div>
      )}

      {success && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircleIcon size={18} />
            <span>{success}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setSuccess(null)}><XIcon size={14} /></button>
        </div>
      )}

      {/* Loading banner when fetching fresh configuration */}
      {loading && !hasLoaded && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.85rem 1.25rem',
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
          marginBottom: '1rem',
        }}>
          <RefreshCwIcon size={16} className="animate-spin" color="var(--accent-primary)" />
          <span>Loading recharge ledger records &amp; funding summary...</span>
        </div>
      )}

      {/* Balance-sheet view: what was really collected vs granted for free */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Cash collected (real money)</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#34d399', marginTop: '0.3rem' }}>
            {!summary && loading ? '...' : inr(summary?.cashCollected)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
            {!summary && loading ? (
              <span>Calculating collected funds...</span>
            ) : (
              <>
                UPI top-ups {inr(summary?.totalTopups)} ({summary?.topupCount || 0})
                <br />
                Manual funding {inr(summary?.manualFunding)} ({summary?.manualFundingCount || 0})
              </>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #a855f7' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Free funds granted (not revenue)</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#c084fc', marginTop: '0.3rem' }}>
            {!summary && loading ? '...' : inr(summary?.freeFunds)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
            {!summary && loading ? (
              <span>Calculating free funds...</span>
            ) : (
              `${summary?.freeFundsCount || 0} admin grant(s) · today ${inr(summary?.freeFundsToday)}`
            )}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #64748b' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Customer wallet liability</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.3rem' }}>
            {!summary && loading ? '...' : inr(summary?.walletLiability)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
            {!summary && loading ? (
              <span>Calculating liability...</span>
            ) : (
              `Today collected: ${inr(summary?.cashCollectedToday)}`
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem', marginBottom: '1rem' }}>
        {SOURCE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setSourceFilter(f.key); setPage(0); }}
            className={`btn btn-sm ${sourceFilter === f.key ? 'btn-primary' : 'btn-ghost'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>User</th>
                <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                <th style={{ padding: '0.75rem 1rem' }}>Balance After</th>
                <th style={{ padding: '0.75rem 1rem' }}>Description</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && recharges.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="spinner"></div>
                  </td>
                </tr>
              ) : recharges.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No recharge records found.
                  </td>
                </tr>
              ) : (
                recharges.map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tx.email}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.name}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className={`badge ${sourceBadge(tx).className}`} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
                        {sourceBadge(tx).label}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--success)' }}>
                      +₹{parseFloat(tx.amount).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      ₹{parseFloat(tx.balance_after || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {tx.description}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <button 
                        className="btn btn-ghost btn-sm"
                        onClick={() => setCreditUserTarget(tx)}
                        title="Add Funds"
                        style={{ color: 'var(--primary)' }}
                      >
                        <CreditCardIcon size={16} />
                        <span style={{ marginLeft: '0.35rem' }}>Add Funds</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Credit Balance Modal */}
      {creditUserTarget && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content card glass-card" style={{ width: '100%', maxWidth: '420px', padding: '1.5rem', animation: 'scaleUp 0.2s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)' }}>Add Funds</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Close balance editor" onClick={() => setCreditUserTarget(null)}><XIcon size={18} /></button>
            </div>
            
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Add funds to <strong style={{ color: 'var(--text-primary)' }}>{creditUserTarget.email}</strong> and record where the money came from.
            </p>

            <form onSubmit={handleCreditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="label">Amount (₹)</label>
                <input 
                  type="number" 
                  className="input" 
                  aria-label="Balance adjustment amount"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(Number(e.target.value))}
                  required
                  step="0.01"
                />
              </div>
              
              <FundingSourcePicker
                value={creditFundingSource}
                onChange={setCreditFundingSource}
                disabled={crediting}
              />

              <div>
                <label className="label">Reason / Description</label>
                <input 
                  type="text" 
                  className="input" 
                  aria-label="Balance adjustment reason"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  required
                  minLength={5}
                  placeholder="e.g. Customer paid ₹500 via UPI / Goodwill credit"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setCreditUserTarget(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={crediting || !creditFundingSource}>
                  {crediting ? 'Processing...' : !creditFundingSource ? 'Choose funding source' : `Add ₹${creditAmount}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
