import { FormEvent, useEffect, useState } from 'react';
import { createSupportTicket, getSupportTickets, replyToSupportTicket } from '../../lib/api';

export default function SupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [orderId, setOrderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [replyBusy, setReplyBusy] = useState('');

  const load = () => getSupportTickets().then(setTickets).catch((e) => setNotice(e.message));
  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setNotice('');
    if (subject.trim().length < 5 || message.trim().length < 10) { setNotice('Please enter a subject (at least 5 characters) and a message (at least 10 characters).'); setBusy(false); return; }
    try {
      await createSupportTicket(subject, message, orderId.trim() || undefined);
      setSubject(''); setMessage(''); setOrderId(''); setNotice('Ticket created successfully.'); await load();
    } catch (err: any) { setNotice(err.message || 'Unable to create ticket.'); }
    finally { setBusy(false); }
  }

  async function submitReply(ticketId: string) {
    const reply = (replies[ticketId] || '').trim();
    if (!reply) { setNotice('Please enter a reply before sending.'); return; }
    setReplyBusy(ticketId); setNotice('');
    try { await replyToSupportTicket(ticketId, reply); setReplies((all) => ({ ...all, [ticketId]: '' })); setNotice('Reply added to your ticket.'); await load(); }
    catch (err: any) { setNotice(err.message || 'Unable to send reply.'); }
    finally { setReplyBusy(''); }
  }

  return <div style={{ display: 'grid', gap: '1.25rem' }}>
    <div><h1 style={{ margin: 0, fontSize: '1.75rem' }}>Help &amp; Support</h1><p style={{ color: 'var(--text-secondary)' }}>Create a ticket, reply in the same thread, and track support updates here.</p></div>
    <div className="card" style={{ padding: '1rem', borderLeft: '3px solid #229ED9', background: 'rgba(34,158,217,.08)' }}><strong style={{ color: '#168ac0' }}>Need quick help or payment assistance?</strong><p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '.88rem' }}>Message our Telegram support team for faster help with top-ups, payment verification, or urgent account issues.</p><a className="btn btn-secondary btn-sm" href="https://t.me/OTPWalaSupport" target="_blank" rel="noreferrer" style={{ marginTop: '.7rem' }}>Open Telegram Support</a></div>
    {notice && <div className="alert alert-info" role="status">{notice}</div>}
    <form className="card" onSubmit={submit} style={{ padding: '1.25rem', display: 'grid', gap: '0.8rem' }}>
      <label>Subject<input className="input" required minLength={5} maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      <label>Order ID (optional)<input className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Paste the complete order ID" /></label>
      <label>How can we help?<textarea className="input" required minLength={10} maxLength={2000} rows={5} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
      <button className="btn btn-primary" disabled={busy} style={{ justifySelf: 'start' }}>{busy ? 'Submitting…' : 'Create Ticket'}</button>
    </form>
    <section style={{ display: 'grid', gap: '0.75rem' }}><h2 style={{ marginBottom: 0 }}>Your Tickets</h2>
      {tickets.length === 0 && <div className="card" style={{ padding: '1.5rem', color: 'var(--text-muted)' }}>No support tickets yet.</div>}
      {tickets.map((t) => <article className="card" key={t.id} style={{ padding: '1rem', overflowWrap: 'anywhere' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}><strong>{t.subject}</strong><span className="badge badge-info">{String(t.status).replace('_', ' ')}</span></div>
        <p>{t.message}</p>{t.order_id && <small>Order: {t.order_id}</small>}
        {t.public_reply && <div className="alert alert-success" style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}><strong>Conversation:</strong>{'\n'}{t.public_reply}</div>}
        <div style={{ display: 'grid', gap: '.5rem', marginTop: '.8rem' }}><label style={{ fontSize: '.82rem', fontWeight: 600 }}>Reply to this ticket<textarea className="input" rows={3} maxLength={4000} value={replies[t.id] || ''} onChange={(e) => setReplies((all) => ({ ...all, [t.id]: e.target.value }))} placeholder="Add information or reply to support…" /></label><button className="btn btn-secondary btn-sm" disabled={replyBusy === t.id || !(replies[t.id] || '').trim()} onClick={() => submitReply(t.id)} style={{ justifySelf: 'start' }}>{replyBusy === t.id ? 'Sending…' : 'Send Reply'}</button></div>
        <small style={{ color: 'var(--text-muted)' }}>{new Date(t.created_at).toLocaleString()}</small>
      </article>)}
    </section>
  </div>;
}
