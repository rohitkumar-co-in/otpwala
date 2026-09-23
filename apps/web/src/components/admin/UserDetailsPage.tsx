import { useEffect, useState } from 'react';
import { getAdminUserDetails } from '../../lib/api';
import { RefreshCwIcon, ArrowLeftIcon, CopyIcon, CheckIcon } from '../ui/Icons';

type Tab = 'orders' | 'deposits' | 'tickets';

export default function UserDetailsPage({ userId: initialUserId = '' }: { userId?: string }) {
  const [userId, setUserId] = useState(initialUserId);
  const [details, setDetails] = useState<any | null>(null);
  const [tab, setTab] = useState<Tab>('orders');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <a href="/admin/users" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
        <ArrowLeftIcon size={14} /> Back to Users
      </a>

      <section className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(37, 99, 235, 0.12)', color: '#2563eb', fontWeight: 800, fontSize: '1.15rem' }}>{displayName[0]?.toUpperCase() || 'U'}</div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.4rem', fontFamily: 'var(--font-display)' }}>{displayName}</h1>
              <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{user.email || 'No email'}</div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <RefreshCwIcon size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem', marginTop: '1.35rem' }}>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem', minWidth: 0 }}><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Name</div><div style={{ marginTop: '0.25rem', fontWeight: 700, overflowWrap: 'anywhere' }}>{displayName}</div></div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem', minWidth: 0 }}><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Email</div><div style={{ marginTop: '0.25rem', fontWeight: 650, overflowWrap: 'anywhere' }}>{user.email || 'Not set'}</div></div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem', minWidth: 0 }}><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Date Joined</div><div style={{ marginTop: '0.25rem', fontWeight: 650 }}>{user.created_at ? new Date(user.created_at).toLocaleString('en-IN') : 'Not available'}</div></div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem', minWidth: 0 }}><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Last Login</div><div style={{ marginTop: '0.25rem', fontWeight: 650 }}>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('en-IN') : 'Never'}</div></div>
          <div style={{ gridColumn: '1 / -1', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem', minWidth: 0, background: 'var(--bg-glass)' }}><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>User ID</div><div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}><code style={{ fontSize: '0.78rem', overflowWrap: 'anywhere', flex: 1 }}>{displayId}</code><button type="button" className="btn btn-ghost btn-sm" onClick={copyUserId} title="Copy user ID" aria-label="Copy user ID" style={{ padding: '0.25rem', color: copied ? 'var(--success)' : 'var(--text-muted)' }}>{copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}</button></div></div>
        </div>
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
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '0.65rem' }}>Reference</th><th style={{ padding: '0.65rem' }}>Status</th><th style={{ padding: '0.65rem' }}>Amount / Details</th><th style={{ padding: '0.65rem' }}>Date</th>
              </tr></thead>
              <tbody>{rows.map((row: any) => {
                const reference = row.id || row.transaction_id || row.order_id || '—';
                const status = row.status || row.type || row.priority || '—';
                const amount = row.amount ?? row.amount_inr ?? row.sell_price_inr;
                const detail = amount != null ? `₹${Number(amount).toFixed(2)}` : row.subject || row.service_name || row.message || '—';
                return <tr key={reference} style={{ borderBottom: '1px solid var(--border-subtle)' }}><td style={{ padding: '0.65rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{String(reference).slice(0, 18)}{String(reference).length > 18 ? '...' : ''}</td><td style={{ padding: '0.65rem' }}>{status}</td><td style={{ padding: '0.65rem', maxWidth: '420px', overflowWrap: 'anywhere' }}>{detail}</td><td style={{ padding: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{row.created_at ? new Date(row.created_at).toLocaleString('en-IN') : '—'}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
