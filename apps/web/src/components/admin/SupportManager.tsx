import { useEffect, useState } from 'react';
import { getAdminSupportTickets, updateAdminSupportTicket, replyToAdminSupportTicket, getAdminDataDeletionRequests, processAdminDataDeletionRequest } from '../../lib/api';
import { showConfirm } from '../../lib/confirm';

export default function SupportManager() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [filter, setFilter] = useState('open');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [deletions, setDeletions] = useState<any[]>([]);
  const [deletionNotes, setDeletionNotes] = useState<Record<string,string>>({});
  const [replies, setReplies] = useState<Record<string, string>>({});
  const load = () => getAdminSupportTickets(filter).then(setTickets).catch((e) => setError(e.message));
  const loadDeletions = () => getAdminDataDeletionRequests('pending').then(setDeletions).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [filter]);
  useEffect(() => { loadDeletions(); }, []);
  const edit = (id: string, key: string, value: string) => setTickets((rows) => rows.map((r) => r.id === id ? { ...r, [key]: value } : r));
  async function save(t: any) {
    setBusy(t.id); setError('');
    try { await updateAdminSupportTicket(t.id, t.status, t.priority, t.admin_notes || '', t.public_reply || ''); await load(); }
    catch (e: any) { setError(e.message || 'Unable to update ticket.'); } finally { setBusy(''); }
  }
  async function processDeletion(id: string, decision: 'approve'|'reject') {
    if (decision === 'approve') {
      const confirmed = await showConfirm({
        title: 'Approve Data Erasure',
        message: 'Erase this user’s login and eligible personal data? Financial ledger and order accounting records will be retained in pseudonymized form for regulatory compliance.',
        confirmText: 'Approve & Erase Data',
        cancelText: 'Cancel',
        type: 'danger',
      });
      if (!confirmed) return;
    }
    setBusy(id); setError('');
    try { await processAdminDataDeletionRequest(id, decision, deletionNotes[id] || ''); await loadDeletions(); }
    catch (e: any) { setError(e.message || 'Unable to process data erasure request.'); } finally { setBusy(''); }
  }
  async function reply(t: any) {
    const text = (replies[t.id] || '').trim(); if (!text) return;
    setBusy(t.id); setError('');
    try { await replyToAdminSupportTicket(t.id, text); setReplies((all) => ({ ...all, [t.id]: '' })); setFilter('open'); }
    catch (e: any) { setError(e.message || 'Unable to send reply.'); } finally { setBusy(''); }
  }
  return <div style={{ display: 'grid', gap: '1rem' }}>
    <div><h1 style={{ margin: 0, fontSize: '1.75rem' }}>Support Queue</h1><p style={{ color: 'var(--text-secondary)' }}>Review, reply to, assign, and resolve customer issues.</p></div>
    {error && <div className="alert alert-error">{error}</div>}
    <section className="card" style={{ padding: '1rem', display: 'grid', gap: '0.75rem' }}>
      <div><h2 style={{ margin: 0, fontSize: '1.1rem' }}>Privacy &amp; Data-Erasure Requests</h2><p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>Super Admin review is required. Approval removes authentication and personal content while retaining pseudonymized financial records.</p></div>
      {deletions.length === 0 ? <p style={{ color: 'var(--text-muted)', margin: 0 }}>No pending erasure requests.</p> : deletions.map((d) => <article key={d.id} style={{ padding: '0.85rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', display: 'grid', gap: '0.55rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}><strong>{d.profiles?.email || d.user_id}</strong><span className="badge badge-warning">Pending since {new Date(d.requested_at).toLocaleString()}</span></div>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{d.user_message}</p>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Wallet: ₹{Number(d.profiles?.wallet_balance || 0).toFixed(2)} · Suspended: {d.profiles?.is_banned ? 'Yes' : 'No (will be suspended on approval)'}</div>
        <label>Review notes<textarea className="input" rows={2} maxLength={2000} value={deletionNotes[d.id] || ''} onChange={(e) => setDeletionNotes((all) => ({...all,[d.id]:e.target.value}))} /></label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}><button className="btn btn-primary btn-sm" disabled={busy === d.id} onClick={() => processDeletion(d.id,'approve')}>Approve secure erasure</button><button className="btn btn-ghost btn-sm" disabled={busy === d.id} onClick={() => processDeletion(d.id,'reject')}>Reject request</button></div>
      </article>)}
    </section>
    <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>{['open','resolved','closed','all'].map((s) => <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(s)}>{s === 'open' ? 'Open' : s.charAt(0).toUpperCase() + s.slice(1)}</button>)}</div>
    {tickets.length === 0 && <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>No matching tickets.</div>}
    {tickets.map((t) => <article className="card" key={t.id} style={{ padding: '1rem', display: 'grid', gap: '0.7rem', overflowWrap: 'anywhere' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}><strong>{t.subject}</strong><span style={{ display: 'inline-flex', alignItems: 'center', gap: '.6rem' }}><span className="badge" style={{ background: String(t.status).toLowerCase() === 'closed' ? 'rgba(239,68,68,.14)' : String(t.status).toLowerCase() === 'resolved' ? 'rgba(16,185,129,.14)' : 'rgba(245,158,11,.16)', color: String(t.status).toLowerCase() === 'closed' ? '#dc2626' : String(t.status).toLowerCase() === 'resolved' ? '#059669' : '#b45309' }}>{String(t.status).toLowerCase() === 'closed' ? 'Closed' : String(t.status).toLowerCase() === 'resolved' ? 'Resolved' : 'Open'}</span>{t.profiles?.email || t.user_id}</span></div>
      <p style={{ margin: 0 }}>{t.message}</p>{t.order_id && <small>Order: {t.order_id}</small>}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label>Status <select className="input" value={['open', 'in_progress', 'pending'].includes(String(t.status).toLowerCase()) ? 'open' : t.status} onChange={(e) => edit(t.id,'status',e.target.value)}>{['open','resolved','closed'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Priority <select className="input" value={t.priority} onChange={(e) => edit(t.id,'priority',e.target.value)}>{['low','normal','high','urgent'].map(x=><option key={x}>{x}</option>)}</select></label>
      </div>
      <label>Reply visible to customer<textarea className="input" rows={3} maxLength={4000} value={t.public_reply || ''} onChange={(e) => edit(t.id,'public_reply',e.target.value)} /></label>
      {['closed', 'resolved'].includes(String(t.status).toLowerCase()) ? <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', margin: 0 }}>This ticket is {String(t.status).toLowerCase()} and cannot receive further replies.</p> : <><label>Reply in thread<textarea className="input" rows={3} maxLength={4000} value={replies[t.id] || ''} onChange={(e) => setReplies((all) => ({ ...all, [t.id]: e.target.value }))} placeholder="Send a new reply without creating another ticket…" /></label><button className="btn btn-secondary btn-sm" disabled={busy === t.id || !(replies[t.id] || '').trim()} onClick={() => reply(t)} style={{ justifySelf: 'start' }}>{busy === t.id ? 'Sending…' : 'Send Thread Reply'}</button></>}
      <label>Internal notes<textarea className="input" rows={2} maxLength={4000} value={t.admin_notes || ''} onChange={(e) => edit(t.id,'admin_notes',e.target.value)} /></label>
      <button className="btn btn-primary btn-sm" disabled={busy === t.id} onClick={() => save(t)} style={{ justifySelf: 'start' }}>{busy === t.id ? 'Saving…' : 'Save Ticket'}</button>
    </article>)}
  </div>;
}
