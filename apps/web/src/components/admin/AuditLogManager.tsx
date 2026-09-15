import { useEffect, useState } from 'react';
import { getAdminAuditLogs } from '../../lib/api';
import { RefreshCwIcon, AlertCircleIcon } from '../ui/Icons';

export default function AuditLogManager() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminAuditLogs(100, 0, action);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Unable to load audit records');
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
      <button className="btn btn-secondary btn-sm" type="button" onClick={load} disabled={loading}><RefreshCwIcon size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button>
    </form>
    {error && <div className="alert alert-error"><AlertCircleIcon size={18} /> {error}</div>}
    <div className="card" style={{ padding: '1rem', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
          <th style={{ padding: '0.7rem' }}>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th><th>IP</th>
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
