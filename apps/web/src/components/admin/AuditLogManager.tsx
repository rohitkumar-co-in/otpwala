import { useEffect, useState } from 'react';
import { getAdminAuditLogs } from '../../lib/api';
import { toast } from '../../lib/toast';
import { RefreshCwIcon, AlertCircleIcon, CheckIcon } from '../ui/Icons';

export default function AuditLogManager() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [recentRefresh, setRecentRefresh] = useState(false);
  const [error, setError] = useState('');

  const load = async (isManual = false) => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminAuditLogs(100, 0, action);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      if (isManual) {
        setRecentRefresh(true);
        setTimeout(() => setRecentRefresh(false), 2500);
        toast.success('Audit trail refreshed.', 'Audit Refreshed');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load audit records');
      if (isManual) {
        toast.error(err.message || 'Unable to load audit records', 'Refresh Failed');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
    <div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>Admin <span className="text-gradient">Audit Trail</span></h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Append-only record of privileged actions. Showing {logs.length} of {total} records.</p>
    </div>
    <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
      <input className="input" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filter action, e.g. wallet.credit" aria-label="Filter audit action" style={{ minWidth: 260 }} />
      <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>Filter</button>
      <button
        className="btn btn-secondary btn-sm"
        type="button"
        onClick={() => load(true)}
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          borderColor: recentRefresh ? '#10b981' : undefined,
          color: recentRefresh ? '#34d399' : undefined,
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
            <span>Refresh</span>
          </>
        )}
      </button>
    </form>
    {error && <div className="alert alert-error"><AlertCircleIcon size={18} /> {error}</div>}
    <div className="card" style={{ padding: '1rem', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <caption className="sr-only">Privileged administrator actions ordered from newest to oldest</caption>
        <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
          <th scope="col" style={{ padding: '0.7rem' }}>Time</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Details</th><th scope="col">IP</th>
        </tr></thead>
        <tbody>{logs.map((log) => <tr key={log.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <td style={{ padding: '0.7rem', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
          <td>{log.profiles?.email || log.actor_id || 'System'}</td>
          <td><span className="badge badge-info">{log.action}</span></td>
          <td>{log.target_type}{log.target_id ? ` · ${log.target_id}` : ''}</td>
          <td><code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(log.metadata || {})}</code></td>
          <td style={{ color: 'var(--text-muted)' }}>{log.ip_address || '—'}</td>
        </tr>)}</tbody>
      </table>
      {!loading && logs.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No matching audit records.</div>}
    </div>
  </div>;
}
