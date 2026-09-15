import { useEffect, useState } from 'react';
import { getAdminSupportTickets, updateAdminSupportTicket } from '../../lib/api';

export default function SupportManager() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [filter, setFilter] = useState('open');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = () => getAdminSupportTickets(filter).then(setTickets).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [filter]);
  const edit = (id: string, key: string, value: string) => setTickets((rows) => rows.map((r) => r.id === id ? { ...r, [key]: value } : r));
  async function save(t: any) {
    setBusy(t.id); setError('');
    try { await updateAdminSupportTicket(t.id, t.status, t.priority, t.admin_notes || '', t.public_reply || ''); await load(); }
    catch (e: any) { setError(e.message || 'Unable to update ticket.'); } finally { setBusy(''); }
  }
  return <div style={{ display: 'grid', gap: '1rem' }}>
    <div><h1 style={{ margin: 0, fontSize: '1.75rem' }}>Support Queue</h1><p style={{ color: 'var(--text-secondary)' }}>Review, reply to, assign, and resolve customer issues.</p></div>
    {error && <div className="alert alert-error">{error}</div>}
    <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>{['open','in_progress','resolved','closed','all'].map((s) => <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(s)}>{s.replace('_',' ')}</button>)}</div>
    {tickets.length === 0 && <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>No matching tickets.</div>}
    {tickets.map((t) => <article className="card" key={t.id} style={{ padding: '1rem', display: 'grid', gap: '0.7rem', overflowWrap: 'anywhere' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}><strong>{t.subject}</strong><span>{t.profiles?.email || t.user_id}</span></div>
      <p style={{ margin: 0 }}>{t.message}</p>{t.order_id && <small>Order: {t.order_id}</small>}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label>Status <select className="input" value={t.status} onChange={(e) => edit(t.id,'status',e.target.value)}>{['open','in_progress','resolved','closed'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Priority <select className="input" value={t.priority} onChange={(e) => edit(t.id,'priority',e.target.value)}>{['low','normal','high','urgent'].map(x=><option key={x}>{x}</option>)}</select></label>
      </div>
      <label>Reply visible to customer<textarea className="input" rows={3} maxLength={4000} value={t.public_reply || ''} onChange={(e) => edit(t.id,'public_reply',e.target.value)} /></label>
      <label>Internal notes<textarea className="input" rows={2} maxLength={4000} value={t.admin_notes || ''} onChange={(e) => edit(t.id,'admin_notes',e.target.value)} /></label>
      <button className="btn btn-primary btn-sm" disabled={busy === t.id} onClick={() => save(t)} style={{ justifySelf: 'start' }}>{busy === t.id ? 'Saving…' : 'Save Ticket'}</button>
    </article>)}
  </div>;
}
