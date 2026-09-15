import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function MfaPanel() {
  const [factor, setFactor] = useState<any>(null);
  const [enrollment, setEnrollment] = useState<any>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [needsElevation, setNeedsElevation] = useState(false);

  async function load() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return setMessage(error.message);
    const verifiedFactor = data?.totp?.find((item: any) => item.status === 'verified') || null;
    setFactor(verifiedFactor);
    const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setNeedsElevation(Boolean(verifiedFactor && assurance.data?.currentLevel !== 'aal2'));
  }
  useEffect(() => { load(); }, []);

  async function beginEnrollment() {
    setBusy(true); setMessage('');
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'OTPWala Authenticator' });
    if (error) setMessage(error.message); else setEnrollment(data);
    setBusy(false);
  }

  async function verifyEnrollment() {
    if (!enrollment?.id || !/^\d{6}$/.test(code)) return setMessage('Enter the 6-digit code from your authenticator app.');
    setBusy(true); setMessage('');
    const challenge = await supabase.auth.mfa.challenge({ factorId: enrollment.id });
    if (challenge.error) { setMessage(challenge.error.message); setBusy(false); return; }
    const verified = await supabase.auth.mfa.verify({ factorId: enrollment.id, challengeId: challenge.data.id, code });
    if (verified.error) setMessage(verified.error.message);
    else { await supabase.auth.refreshSession(); setEnrollment(null); setCode(''); setMessage('Two-factor authentication is active.'); await load(); }
    setBusy(false);
  }

  async function removeMfa() {
    if (!factor || !window.confirm('Remove authenticator protection from this account?')) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) setMessage(error.message); else { setFactor(null); setMessage('Two-factor authentication was removed.'); }
    setBusy(false);
  }

  async function elevateSession() {
    if (!factor || !/^\d{6}$/.test(code)) return setMessage('Enter the current 6-digit authenticator code.');
    setBusy(true); setMessage('');
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error) { setMessage(challenge.error.message); setBusy(false); return; }
    const verified = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code });
    if (verified.error) setMessage(verified.error.message);
    else { setCode(''); setNeedsElevation(false); setMessage('Two-factor verification complete for this session.'); }
    setBusy(false);
  }

  return <div className="card-glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg, 16px)' }}>
    <h3 style={{ marginTop: 0 }}>Authenticator Two-Factor Security</h3>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Protect sensitive admin and account operations using a TOTP authenticator app.</p>
    {message && <div className="alert alert-info" role="status" style={{ marginBottom: '0.75rem' }}>{message}</div>}
    {factor ? <div style={{ display: 'grid', gap: '0.75rem' }}>
      <span className="badge badge-success" style={{ justifySelf: 'start' }}>Authenticator enabled</span>
      {needsElevation && <>
        <div className="alert alert-warning">Enter an authenticator code to unlock protected admin operations for this session.</div>
        <label>Six-digit authenticator code<input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
        <button className="btn btn-primary btn-sm" onClick={elevateSession} disabled={busy || code.length !== 6} style={{ justifySelf: 'start' }}>{busy ? 'Verifying…' : 'Verify Session'}</button>
      </>}
      <button className="btn btn-sm" onClick={removeMfa} disabled={busy} style={{ justifySelf: 'start', color: 'var(--error)', border: '1px solid rgba(239,68,68,.4)' }}>Remove authenticator</button>
    </div> : enrollment ? <div style={{ display: 'grid', gap: '0.75rem' }}>
      <p style={{ margin: 0 }}>Scan this QR code, then enter the current six-digit code.</p>
      <img src={enrollment.totp?.qr_code} alt="Authenticator enrollment QR code" width="200" height="200" style={{ background: '#fff', padding: 8, borderRadius: 8 }} />
      <details><summary>Cannot scan?</summary><code style={{ overflowWrap: 'anywhere' }}>{enrollment.totp?.secret}</code></details>
      <label>Six-digit verification code<input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
      <button className="btn btn-primary btn-sm" onClick={verifyEnrollment} disabled={busy || code.length !== 6} style={{ justifySelf: 'start' }}>{busy ? 'Verifying…' : 'Verify and Enable'}</button>
    </div> : <button className="btn btn-primary btn-sm" onClick={beginEnrollment} disabled={busy}>{busy ? 'Preparing…' : 'Set Up Authenticator'}</button>}
  </div>;
}
