import { FormEvent, useEffect, useState } from 'react';
import { createSupportTicket, getSupportTickets } from '../../lib/api';

export default function SupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [orderId, setOrderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = () => getSupportTickets().then(setTickets).catch((e) => setNotice(e.message));
  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setNotice('');
    try {
      await createSupportTicket(subject, message, orderId.trim() || undefined);
      setSubject(''); setMessage(''); setOrderId(''); setNotice('Ticket created successfully.'); await load();
    } catch (err: any) { setNotice(err.message || 'Unable to create ticket.'); }
    finally { setBusy(false); }
  }

  return <div style={{ display: 'grid', gap: '1.25rem' }}>
    <div><h1 style={{ margin: 0, fontSize: '1.75rem' }}>Help &amp; Support</h1><p style={{ color: 'var(--text-secondary)' }}>Create an order-linked ticket and track replies here.</p></div>
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
        {t.public_reply && <div className="alert alert-success" style={{ marginTop: '0.75rem' }}><strong>Support reply:</strong> {t.public_reply}</div>}
        <small style={{ color: 'var(--text-muted)' }}>{new Date(t.created_at).toLocaleString()}</small>
      </article>)}
    </section>
  </div>;
}
