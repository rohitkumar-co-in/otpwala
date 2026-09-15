import { useState, useEffect } from 'react';
import {
  getAdminRecharges,
  creditUser,
} from '../../lib/api';
import {
  SearchIcon,
  RefreshCwIcon,
  CreditCardIcon,
  CheckCircleIcon,
  XIcon,
} from '../ui/Icons';

export default function RechargeManager() {
  const [recharges, setRecharges] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Credit modal state
  const [creditUserTarget, setCreditUserTarget] = useState<any | null>(null);
  const [creditAmount, setCreditAmount] = useState<number>(100);
  const [creditReason, setCreditReason] = useState<string>('Manual Admin Credit');
  const [crediting, setCrediting] = useState(false);

  const limit = 20;

  const loadRecharges = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminRecharges(limit, page * limit, search);
      setRecharges(data?.recharges || []);
      setTotal(data?.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load recharges');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecharges();
  }, [page, search]);

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
    setCrediting(true);
    setError(null);
    setSuccess(null);
    try {
      await creditUser(creditUserTarget.user_id, creditAmount, creditReason);
      setSuccess(`Successfully ${creditAmount > 0 ? 'credited' : 'debited'} ₹${Math.abs(creditAmount)} to ${creditUserTarget.email}!`);
      setCreditUserTarget(null);
      await loadRecharges();
    } catch (err: any) {
      setError(err.message || 'Failed to update user balance');
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
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.2rem' }}>History of all UPI top-ups and manual admin credits across the platform.</p>
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
          <button className="btn btn-ghost btn-sm btn-icon" onClick={loadRecharges} title="Refresh" aria-label="Refresh recharge records" disabled={loading}>
            <RefreshCwIcon size={16} className={loading ? 'spin' : ''} />
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
                      <span className={`badge ${tx.type === 'admin_credit' ? 'badge-primary' : 'badge-success'}`} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
                        {tx.type === 'admin_credit' ? 'Admin Credit' : 'UPI Top-Up'}
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
                        title="Change User Balance"
                        style={{ color: 'var(--primary)' }}
                      >
                        <CreditCardIcon size={16} />
                        <span style={{ marginLeft: '0.35rem' }}>Change Balance</span>
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
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)' }}>Change Balance</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Close balance editor" onClick={() => setCreditUserTarget(null)}><XIcon size={18} /></button>
            </div>
            
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Update wallet balance for <strong style={{ color: 'var(--text-primary)' }}>{creditUserTarget.email}</strong>. Use negative values to deduct balance.
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
              
              <div>
                <label className="label">Reason / Description</label>
                <input 
                  type="text" 
                  className="input" 
                  aria-label="Balance adjustment reason"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  required
                  placeholder="e.g. Manual deposit, refund, etc."
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setCreditUserTarget(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={crediting}>
                  {crediting ? 'Processing...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
