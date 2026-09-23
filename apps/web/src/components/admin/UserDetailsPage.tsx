import { useEffect, useState } from 'react';
import { getAdminUserDetails } from '../../lib/api';
import { RefreshCwIcon, ArrowLeftIcon } from '../ui/Icons';

type Tab = 'orders' | 'deposits' | 'tickets';

export default function UserDetailsPage({ userId: initialUserId = '' }: { userId?: string }) {
  const [userId, setUserId] = useState(initialUserId);
  const [details, setDetails] = useState<any | null>(null);
  const [tab, setTab] = useState<Tab>('orders');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <a href="/admin/users" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
        <ArrowLeftIcon size={14} /> Back to Users
      </a>

      <section className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontFamily: 'var(--font-display)' }}>{user.name || user.full_name || 'Anonymous User'}</h1>
            <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{user.email || 'No email'}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <RefreshCwIcon size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '1.25rem' }}>
          {[
            ['Name', user.name || user.full_name || 'Not set'],
            ['Email', user.email || 'Not set'],
            ['Date Joined', user.created_at ? new Date(user.created_at).toLocaleString('en-IN') : 'Not available'],
            ['User ID', user.id || userId],
            ['Last Login', user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('en-IN') : 'Never'],
          ].map(([label, value]) => (
            <div key={label} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.75rem', minWidth: 0 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ marginTop: '0.25rem', fontWeight: 650, fontSize: '0.82rem', overflowWrap: 'anywhere', fontFamily: label === 'User ID' ? 'var(--font-mono)' : undefined }}>{value}</div>
            </div>
          ))}
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
