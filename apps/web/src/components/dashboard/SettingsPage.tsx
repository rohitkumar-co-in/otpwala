import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getLocalSessionId } from '../../lib/sessionManager';
import {
  exportAccountData,
  requestAccountDeletion,
  getAccountDeletionRequests,
  getLoginHistory,
  type UserSecurityLog,
  type LoginHistoryData,
} from '../../lib/api';
import MfaPanel from './MfaPanel';

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Login history & security telemetry state
  const [loginHistoryData, setLoginHistoryData] = useState<LoginHistoryData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Visibility toggles
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form status
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Password strength
  const [strengthScore, setStrengthScore] = useState(0);
  const [privacyBusy, setPrivacyBusy] = useState('');
  const [deletionRequests, setDeletionRequests] = useState<any[]>([]);
  const deletionPending = deletionRequests.some((request) => request.status === 'pending');

  async function downloadAccountData() {
    setPrivacyBusy('export'); setErrorMsg('');
    try {
      const data = await exportAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `otpwala-data-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      URL.revokeObjectURL(url); setSuccessMsg('Your account data export was generated.');
    } catch (error: any) { setErrorMsg(error.message || 'Unable to export account data.'); }
    finally { setPrivacyBusy(''); }
  }

  async function submitDeletionRequest() {
    if (!window.confirm('Submit an account deletion request for admin review? Financial records may need to be retained where legally required.')) return;
    setPrivacyBusy('delete'); setErrorMsg('');
    try { await requestAccountDeletion(); setDeletionRequests(await getAccountDeletionRequests()); setSuccessMsg('Your account deletion request was submitted for privacy review.'); }
    catch (error: any) { setErrorMsg(error.message || 'Unable to submit deletion request.'); }
    finally { setPrivacyBusy(''); }
  }

  async function loadLoginHistory() {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await getLoginHistory(20);
      setLoginHistoryData(res);
    } catch (err: any) {
      console.warn('Failed to load login history:', err);
      setHistoryError(err.message || 'Unable to load login history.');
    } finally {
      setHistoryLoading(false);
    }
  }

  function handleCopyIp(ip: string) {
    if (!ip) return;
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  }

  useEffect(() => {
    loadUserData();
    getAccountDeletionRequests().then(setDeletionRequests).catch(() => {});
    loadLoginHistory();
  }, []);

  useEffect(() => {
    evaluatePasswordStrength(newPassword);
  }, [newPassword]);

  async function loadUserData() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
        setProfile(prof);
      }
    } catch (err) {
      console.error('Failed to load user info:', err);
    } finally {
      setLoading(false);
    }
  }

  function evaluatePasswordStrength(pwd: string) {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    setStrengthScore(score);
  }

  function getStrengthLabel(score: number) {
    if (score === 0) return { label: 'Empty', color: 'var(--text-muted)' };
    if (score <= 2) return { label: 'Weak', color: 'var(--error, #ef4444)' };
    if (score <= 3) return { label: 'Medium', color: 'var(--warning, #f59e0b)' };
    return { label: 'Strong', color: 'var(--success, #10b981)' };
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('New password and confirmation password do not match.');
      return;
    }

    setSubmitting(true);

    try {
      // 1. If user provided a current password, verify it first
      if (currentPassword && user?.email) {
        const { error: verifyErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });

        if (verifyErr) {
          setErrorMsg('Current password is incorrect. Please try again.');
          setSubmitting(false);
          return;
        }
      }

      // 2. Update password in Supabase Auth
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        setErrorMsg(updateErr.message || 'Failed to update password.');
        return;
      }

      // Success
      setSuccessMsg('Your password has been changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStrengthScore(0);
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred while changing password.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  const strength = getStrengthLabel(strengthScore);
  const activeSessionId = getLocalSessionId();
  const createdAt = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A';

  return (
    <div style={{ width: '100%', maxWidth: '1120px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>
          Account Settings & Security
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', margin: 0 }}>
          Manage your account credentials, security preferences, and active devices.
        </p>
      </div>

      {/* Grid: Change Password Card & Account Details */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
        {/* Card 1: Change Password */}
        <div className="card-glass" style={{ padding: 'clamp(1.25rem, 2vw, 1.75rem)', borderRadius: 'var(--radius-lg, 16px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary, #6366f1)',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Change Password
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Choose a strong, unique password
              </span>
            </div>
          </div>

          {errorMsg && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: 'var(--error, #ef4444)',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md, 8px)',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              color: 'var(--success, #10b981)',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md, 8px)',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange}>
            {/* Current Password */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                Current Password <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(optional if logging in via OTP)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  className="input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  style={{ width: '100%', paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0.25rem',
                  }}
                  title={showCurrentPassword ? 'Hide password' : 'Show password'}
                >
                  {showCurrentPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  className="input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  style={{ width: '100%', paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0.25rem',
                  }}
                  title={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Strength indicator */}
            {newPassword && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Password Strength:</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: strength.color }}>{strength.label}</span>
                </div>
                <div style={{ height: '4px', background: 'var(--border-subtle)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(strengthScore / 5) * 100}%`,
                    background: strength.color,
                    transition: 'all 0.3s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Confirm Password */}
            <div style={{ marginBottom: '1.5rem', marginTop: newPassword ? 0 : '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                Confirm New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  minLength={8}
                  style={{ width: '100%', paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0.25rem',
                  }}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
              }}
            >
              {submitting ? (
                <>
                  <div className="spinner spinner-sm"></div>
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Update Password</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Keep the strongest account protection next to the password controls. */}
        <MfaPanel />
        </div>

        {/* Card 2: Account Security Overview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card-glass" style={{ padding: 'clamp(1.25rem, 2vw, 1.75rem)', borderRadius: 'var(--radius-lg, 16px)' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 1.25rem', color: 'var(--text-primary)' }}>
              Account Credentials
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Registered Email
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                    {user?.email || 'N/A'}
                  </strong>
                  <span style={{
                    fontSize: '0.7rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: 'var(--success, #10b981)',
                    fontWeight: 600,
                  }}>
                    Verified
                  </span>
                </div>
              </div>

              <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Account Role
                </span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: '0.25rem', display: 'block' }}>
                  {(profile?.role === 'admin' || profile?.role === 'superadmin') ? 'Administrator' : 'Standard Customer'}
                </span>
              </div>

              <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Member Since
                </span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginTop: '0.25rem', display: 'block' }}>
                  {createdAt}
                </span>
              </div>
            </div>
          </div>

          <div className="card-glass" style={{ order: 2, padding: '1.5rem', borderRadius: 'var(--radius-lg, 16px)', borderLeft: '3px solid var(--accent-primary, #6366f1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.6rem' }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--success, #10b981)',
                boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
              }} />
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Single-Device Protection Active
              </h4>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45, margin: '0 0 0.75rem' }}>
              Your account is locked to your current active device session. Logging in on any other device will automatically log out older sessions.
            </p>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              Session ID: {activeSessionId ? activeSessionId.substring(0, 16) + '...' : 'Active'}
            </span>
          </div>
          <div className="card-glass" style={{ order: 1, padding: '1.5rem', borderRadius: 'var(--radius-lg, 16px)' }}>
            <h3 style={{ marginTop: 0 }}>Privacy &amp; Account Data</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Download your profile, orders, wallet ledger, and support history, or request reviewed account deletion.</p>
            {deletionRequests[0] && <p role="status" style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Latest erasure request: <strong style={{ textTransform: 'capitalize' }}>{deletionRequests[0].status}</strong> · submitted {new Date(deletionRequests[0].requested_at).toLocaleString()}</p>}
            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={downloadAccountData} disabled={Boolean(privacyBusy)}>{privacyBusy === 'export' ? 'Preparing…' : 'Download My Data'}</button>
              <button className="btn btn-sm" onClick={submitDeletionRequest} disabled={Boolean(privacyBusy) || deletionPending} aria-disabled={deletionPending} style={{ color: deletionPending ? 'var(--text-muted)' : 'var(--error)', border: '1px solid rgba(239,68,68,.4)', opacity: deletionPending ? .55 : 1, cursor: deletionPending ? 'not-allowed' : undefined }}>{deletionPending ? 'Deletion Request Pending Review' : privacyBusy === 'delete' ? 'Submitting…' : 'Request Account Deletion'}</button>
            </div>
          </div>
        </div>

      </div>

      {/* Card 3: Login Activity & Security History (Compliance & Forensic Audit) */}
      <div className="card-glass" style={{ padding: 'clamp(1.25rem, 2.5vw, 1.85rem)', borderRadius: 'var(--radius-lg, 16px)', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '11px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(168, 85, 247, 0.18))',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary, #6366f1)',
              flexShrink: 0,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Login Activity &amp; Security History
                </h2>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '0.15rem 0.55rem',
                  borderRadius: '9999px',
                  background: 'rgba(99, 102, 241, 0.12)',
                  color: 'var(--accent-primary, #6366f1)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                }}>
                  Compliance Audit
                </span>
              </div>
              <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
                Verified telemetry of authorized sign-ins including public IP, Internet Service Provider (ISP), and geographical origin for SaaS safety and regulatory requirements.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadLoginHistory}
            disabled={historyLoading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.85rem' }}
            title="Refresh login history"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                animation: historyLoading ? 'spin 1s linear infinite' : 'none',
              }}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>{historyLoading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>

        {/* Current Active Session Highlight Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(16, 185, 129, 0.05))',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 10px #10b981',
                display: 'inline-block',
              }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Current Active Session
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                fontFamily: 'monospace',
                fontSize: '1rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                background: 'rgba(0, 0, 0, 0.06)',
                padding: '0.15rem 0.5rem',
                borderRadius: '6px',
              }}>
                {loginHistoryData?.current?.ip || profile?.last_login_ip || 'Detecting IP...'}
              </span>
              {(loginHistoryData?.current?.ip || profile?.last_login_ip) && (
                <button
                  type="button"
                  onClick={() => handleCopyIp(loginHistoryData?.current?.ip || profile?.last_login_ip)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copiedIp === (loginHistoryData?.current?.ip || profile?.last_login_ip) ? '#10b981' : 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0.2rem',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                  title="Copy IP address"
                >
                  {copiedIp === (loginHistoryData?.current?.ip || profile?.last_login_ip) ? (
                    <span>Copied!</span>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
              Network / ISP
            </span>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginTop: '0.2rem' }}>
              {loginHistoryData?.current?.isp || profile?.last_login_isp || 'Standard Network'}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
              Location &amp; Region
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', display: 'block', marginTop: '0.2rem' }}>
              {[loginHistoryData?.current?.city, loginHistoryData?.current?.country].filter(Boolean).join(', ') || profile?.last_login_country || 'Current Region'}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
              Session Protection
            </span>
            <span style={{
              fontSize: '0.78rem',
              color: '#10b981',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              marginTop: '0.2rem',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Isolated Single-Session Active
            </span>
          </div>
        </div>

        {/* History Table or States */}
        {historyError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: 'var(--error, #ef4444)',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-md, 8px)',
            fontSize: '0.85rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>{historyError}</span>
            <button
              type="button"
              onClick={loadLoginHistory}
              style={{ background: 'none', border: 'none', color: 'var(--error)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.82rem' }}
            >
              Retry
            </button>
          </div>
        )}

        {historyLoading && !loginHistoryData ? (
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner spinner-sm" style={{ margin: '0 auto 0.75rem' }} />
            <span style={{ fontSize: '0.85rem' }}>Loading verified login logs…</span>
          </div>
        ) : !loginHistoryData?.history || loginHistoryData.history.length === 0 ? (
          <div style={{
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            background: 'rgba(0, 0, 0, 0.02)',
            borderRadius: 'var(--radius-md, 10px)',
            border: '1px dashed var(--border-subtle, #e2e8f0)',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ margin: '0 auto 0.75rem' }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.25rem' }}>
              No historical login events logged yet
            </h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
              Future sign-ins, IP addresses, and ISP telemetry will be audited and displayed here.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle, #e2e8f0)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Event</th>
                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Network / ISP</th>
                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>IP Address</th>
                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Location</th>
                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Device / Browser</th>
                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {loginHistoryData.history.map((item: UserSecurityLog) => {
                  const badge = getEventBadge(item.event_type);
                  const dev = parseDeviceAndBrowser(item.user_agent);
                  const isCurrent = item.ip_address === (loginHistoryData.current?.ip || profile?.last_login_ip);
                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Event Column */}
                      <td style={{ padding: '0.85rem 0.5rem', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '9999px',
                          color: badge.color,
                          background: badge.bg,
                          border: `1px solid ${badge.border}`,
                        }}>
                          {badge.label}
                        </span>
                        {isCurrent && (
                          <span style={{
                            marginLeft: '0.4rem',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: '#10b981',
                            background: 'rgba(16, 185, 129, 0.1)',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                          }}>
                            Active
                          </span>
                        )}
                      </td>

                      {/* ISP / Carrier Column */}
                      <td style={{ padding: '0.85rem 0.5rem', maxWidth: '200px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.isp || 'Standard Network'}>
                          {item.isp || 'Standard Network'}
                        </div>
                        {item.asn && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            AS{item.asn}
                          </span>
                        )}
                      </td>

                      {/* IP Address Column */}
                      <td style={{ padding: '0.85rem 0.5rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.83rem', color: 'var(--text-primary)' }}>
                            {item.ip_address}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyIp(item.ip_address)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: copiedIp === item.ip_address ? '#10b981' : 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '0.15rem',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            title="Copy IP"
                          >
                            {copiedIp === item.ip_address ? (
                              <span style={{ fontSize: '0.7rem' }}>✓</span>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Location Column */}
                      <td style={{ padding: '0.85rem 0.5rem', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--text-primary)' }}>
                          {[item.city, item.country].filter(Boolean).join(', ') || 'Unknown'}
                        </span>
                      </td>

                      {/* Device & Browser Column */}
                      <td style={{ padding: '0.85rem 0.5rem', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {dev.browser} on {dev.os}
                        </span>
                      </td>

                      {/* Timestamp Column */}
                      <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {formatLogTimestamp(item.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function parseDeviceAndBrowser(ua?: string | null): { browser: string; os: string } {
  if (!ua) return { browser: 'Browser', os: 'Device' };
  
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';

  let os = 'Device';
  if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone')) os = 'iPhone';
  else if (ua.includes('iPad')) os = 'iPad';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS') || ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return { browser, os };
}

function getEventBadge(eventType: string) {
  switch (eventType) {
    case 'signup':
      return { label: 'Account Created', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' };
    case 'oauth_login':
      return { label: 'Google Sign In', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.3)' };
    case 'session_refresh':
      return { label: 'Session Refresh', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', border: 'rgba(100, 116, 139, 0.3)' };
    case 'password_reset':
      return { label: 'Password Reset', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)' };
    case 'login':
    default:
      return { label: 'Standard Sign In', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)' };
  }
}

function formatLogTimestamp(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}
