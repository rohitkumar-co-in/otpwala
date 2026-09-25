import { useEffect, useState } from 'react';
import { banUser, creditUser, getAdminUserDetails, getAdminUserExport } from '../../lib/api';
import type { AdminFundingSource } from '../../lib/api';
import { promptAndDownloadUserData } from '../../lib/dataExport';
import { showConfirm } from '../../lib/confirm';
import { toast } from '../../lib/toast';
import FundingSourcePicker from './FundingSourcePicker';
import { RefreshCwIcon, ArrowLeftIcon, CopyIcon, CheckIcon, CreditCardIcon, DownloadIcon, DollarIcon, ClipboardListIcon, ShieldIcon, BanIcon, ClockIcon } from '../ui/Icons';

type Tab = 'orders' | 'deposits' | 'tickets';

export default function UserDetailsPage({ userId: initialUserId = '' }: { userId?: string }) {
  const [userId, setUserId] = useState(initialUserId);
  const [details, setDetails] = useState<any | null>(null);
  const [tab, setTab] = useState<Tab>('orders');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCredit, setShowCredit] = useState(false);
  const [creditAmount, setCreditAmount] = useState(100);
  const [creditReason, setCreditReason] = useState('Manual admin top-up');
  const [creditFundingSource, setCreditFundingSource] = useState<'' | AdminFundingSource>('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getAdminUserDetails(userId);
      setDetails(response?.data || response);
    } catch (err: any) {
      setError(err.message || 'Failed to load user details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const queryId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : '';
    setUserId(initialUserId || queryId || '');
  }, [initialUserId]);

  useEffect(() => { if (userId) void load(); }, [userId]);

  if (loading && !details) {
    return <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading user details...</div>;
  }
  if (error && !details) {
    return <div className="alert alert-error" role="alert">{error}</div>;
  }

  const user = details?.user || {};
  const rows = details?.[tab] || [];
  const displayName = user.name || user.full_name || 'Anonymous User';
  const displayId = user.id || userId;

  const copyUserId = async () => {
    try {
      await navigator.clipboard.writeText(displayId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const exportUser = async () => {
    setActionLoading(true);
    try {
      const response = await getAdminUserExport(userId);
      const payload = response?.data !== undefined ? response.data : response;
      await promptAndDownloadUserData(payload, `otpwala-user-dossier-${String(user.email || userId).split('@')[0]}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to export user data', 'Export Failed');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleBan = async () => {
    const nextBanned = !user.is_banned;
    const confirmed = await showConfirm({ title: nextBanned ? 'Ban User' : 'Unban User', message: `Are you sure you want to ${nextBanned ? 'ban' : 'unban'} this user?`, confirmText: nextBanned ? 'Ban User' : 'Unban User', cancelText: 'Cancel', type: nextBanned ? 'danger' : 'info' });
    if (!confirmed) return;
    setActionLoading(true);
    try {
      await banUser(userId, nextBanned);
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user status', 'Action Failed');
    } finally {
      setActionLoading(false);
    }
  };

  const submitCredit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creditAmount <= 0 || !creditFundingSource) return;
    setActionLoading(true);
    try {
      await creditUser(userId, creditAmount, creditReason, creditFundingSource);
      toast.success(`₹${creditAmount.toFixed(2)} added to ${user.email || 'the user'} wallet.`, 'Wallet Credited');
      setShowCredit(false);
      setCreditFundingSource('');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Failed to credit user balance', 'Credit Failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <a href="/admin/users" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
        <ArrowLeftIcon size={14} /> Back to Users
      </a>

      <section className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            {user.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-subtle)' }} /> : <div style={{ width: '48px', height: '48px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(37, 99, 235, 0.12)', color: '#2563eb', fontWeight: 800, fontSize: '1.15rem' }}>{displayName[0]?.toUpperCase() || 'U'}</div>}
            <div>
              <h1 style={{ margin: 0, fontSize: '1.4rem', fontFamily: 'var(--font-display)' }}>{displayName}</h1>
              <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{user.email || 'No email'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={exportUser} disabled={loading || actionLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><DownloadIcon size={14} /> Export</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowCredit(true)} disabled={loading || actionLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><CreditCardIcon size={14} /> Credit Balance</button>
            <button className="btn btn-secondary btn-sm" onClick={toggleBan} disabled={loading || actionLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><BanIcon size={14} /> {user.is_banned ? 'Unban' : 'Ban'}</button>
            <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading || actionLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <RefreshCwIcon size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem', marginTop: '1.35rem' }}>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem', minWidth: 0 }}><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Name</div><div style={{ marginTop: '0.25rem', fontWeight: 700, overflowWrap: 'anywhere' }}>{displayName}</div></div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem', minWidth: 0 }}><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Email</div><div style={{ marginTop: '0.25rem', fontWeight: 650, overflowWrap: 'anywhere' }}>{user.email || 'Not set'}</div></div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem', minWidth: 0 }}><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><ClockIcon size={12} /> Registered</div><div style={{ marginTop: '0.25rem', fontWeight: 650 }}>{user.created_at ? new Date(user.created_at).toLocaleString('en-IN') : 'Not available'}</div></div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem', minWidth: 0 }}><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><ClockIcon size={12} /> Last Login</div><div style={{ marginTop: '0.25rem', fontWeight: 650 }}>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('en-IN') : 'Never'}</div></div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem', minWidth: 0 }}><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><ShieldIcon size={12} /> Status</div><div style={{ marginTop: '0.25rem' }}><span className={`badge ${user.is_banned ? 'badge-error' : 'badge-success'}`}>{user.is_banned ? 'Banned' : 'Active'}</span></div></div>
          <div style={{ gridColumn: '1 / -1', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem', minWidth: 0, background: 'var(--bg-glass)' }}><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>User ID</div><div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}><code style={{ fontSize: '0.78rem', overflowWrap: 'anywhere', flex: 1 }}>{displayId}</code><button type="button" className="btn btn-ghost btn-sm" onClick={copyUserId} title="Copy user ID" aria-label="Copy user ID" style={{ padding: '0.25rem', color: copied ? 'var(--success)' : 'var(--text-muted)' }}>{copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}</button></div></div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
        {[
          { label: 'Amount Left', value: `₹${Number(user.wallet_balance || 0).toFixed(2)}`, hint: 'Available to spend', icon: <CreditCardIcon size={18} />, color: '#10b981' },
          { label: 'Total Spent', value: `₹${Number(user.total_spent || 0).toFixed(2)}`, hint: 'Lifetime order volume', icon: <DollarIcon size={18} />, color: '#60a5fa' },
          { label: 'Orders Placed', value: String(user.total_orders ?? details?.orders?.length ?? 0), hint: 'Total purchases', icon: <ClipboardListIcon size={18} />, color: '#f59e0b' },
          { label: 'Pricing Policy', value: user.has_zero_markup ? '0% Markup (Tiger)' : 'Standard Markup', hint: 'Active pricing rule', icon: <ShieldIcon size={18} />, color: '#a78bfa' },
        ].map((stat) => (
          <div key={stat.label} className="card" style={{ padding: '1rem', borderTop: `2px solid ${stat.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: stat.color, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>{stat.icon}{stat.label}</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '0.55rem' }}>{stat.value}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.15rem' }}>{stat.hint}</div>
          </div>
        ))}
      </section>

      <section className="card" style={{ padding: '1.25rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '1rem', margin: '0 0 0.85rem' }}><CreditCardIcon size={16} /> Recent Balance &amp; Wallet Transactions</h2>
        {!details?.transactions?.length ? (
          <div style={{ padding: '1.25rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No balance transactions recorded for this user yet.</div>
        ) : (
          <div className="responsive-card-table" style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}><thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}><th style={{ padding: '0.55rem' }}>Type</th><th style={{ padding: '0.55rem' }}>Amount</th><th style={{ padding: '0.55rem' }}>Balance After</th><th style={{ padding: '0.55rem' }}>Description</th><th style={{ padding: '0.55rem' }}>Date</th></tr></thead><tbody>{details.transactions.map((tx: any) => { const isCredit = ['topup', 'admin_credit', 'refund'].includes(tx.type); return <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}><td data-label="Type" style={{ padding: '0.55rem' }}><span className={`badge ${isCredit ? 'badge-success' : 'badge-error'}`}>{tx.type}</span></td><td data-label="Amount" style={{ padding: '0.55rem', color: isCredit ? '#10b981' : '#ef4444', fontWeight: 700 }}>{isCredit ? '+' : '-'}₹{Number(tx.amount || 0).toFixed(2)}</td><td data-label="Balance After" style={{ padding: '0.55rem' }}>₹{Number(tx.balance_after || 0).toFixed(2)}</td><td data-label="Description" style={{ padding: '0.55rem', color: 'var(--text-secondary)' }}>{tx.description || 'N/A'}</td><td data-label="Date" style={{ padding: '0.55rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{tx.created_at ? new Date(tx.created_at).toLocaleString('en-IN') : 'N/A'}</td></tr>; })}</tbody></table></div>
        )}
      </section>

      <section className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.35rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', marginBottom: '1rem' }} role="tablist" aria-label="User records">
          {(['orders', 'deposits', 'tickets'] as Tab[]).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`btn btn-sm ${tab === item ? 'btn-primary' : 'btn-ghost'}`}>
              {item[0].toUpperCase() + item.slice(1)} ({(details?.[item] || []).length})
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No {tab} records found.</div>
        ) : (
          <div className="responsive-card-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '0.65rem' }}>Reference</th><th style={{ padding: '0.65rem' }}>Status</th><th style={{ padding: '0.65rem' }}>Amount / Details</th><th style={{ padding: '0.65rem' }}>Date</th>
              </tr></thead>
              <tbody>{rows.map((row: any) => {
                const reference = row.id || row.transaction_id || row.order_id || 'N/A';
                const status = row.status || row.type || row.priority || 'N/A';
                const amount = row.amount ?? row.amount_inr ?? row.sell_price_inr;
                const detail = amount != null ? `₹${Number(amount).toFixed(2)}` : row.subject || row.service_name || row.message || 'N/A';
                return <tr key={reference} style={{ borderBottom: '1px solid var(--border-subtle)' }}><td data-label="Reference" style={{ padding: '0.65rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{String(reference).slice(0, 18)}{String(reference).length > 18 ? '...' : ''}</td><td data-label="Status" style={{ padding: '0.65rem' }}>{status}</td><td data-label="Amount / Details" style={{ padding: '0.65rem', maxWidth: '420px', overflowWrap: 'anywhere' }}>{detail}</td><td data-label="Date" style={{ padding: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{row.created_at ? new Date(row.created_at).toLocaleString('en-IN') : 'N/A'}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      {showCredit && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: '1rem', background: 'rgba(0, 0, 0, 0.72)' }}>
          <form className="card" onSubmit={submitCredit} style={{ width: 'min(520px, 100%)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}><h2 style={{ margin: 0, fontSize: '1.1rem' }}>Credit User Balance</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCredit(false)}>Close</button></div>
            <label className="input-label">Amount (INR)<input className="input" type="number" min="0.01" step="0.01" value={creditAmount} onChange={(event) => setCreditAmount(Number(event.target.value))} required /></label>
            <label className="input-label" style={{ display: 'block', marginTop: '0.85rem' }}>Reason<input className="input" value={creditReason} onChange={(event) => setCreditReason(event.target.value)} required /></label>
            <div style={{ marginTop: '0.85rem' }}><FundingSourcePicker value={creditFundingSource} onChange={setCreditFundingSource} disabled={actionLoading} /></div>
            <button className="btn btn-primary" type="submit" disabled={actionLoading || !creditFundingSource} style={{ width: '100%', marginTop: '1rem', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem' }}><CreditCardIcon size={15} />{actionLoading ? 'Crediting...' : 'Credit Balance'}</button>
          </form>
        </div>
      )}
    </div>
  );
}
