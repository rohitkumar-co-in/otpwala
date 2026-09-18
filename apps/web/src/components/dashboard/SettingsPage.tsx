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
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { CheckIcon } from '../ui/Icons';

import { promptAndDownloadUserData } from '../../lib/dataExport';

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recentPasswordSave, setRecentPasswordSave] = useState(false);
  const [recentHistoryRefresh, setRecentHistoryRefresh] = useState(false);

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
      const payload = data?.data !== undefined ? data.data : data;
      await promptAndDownloadUserData(payload, `otpwala-account-data-${user?.email ? user.email.split('@')[0] : 'user'}`);
      setSuccessMsg('Your account data export was generated.');
    } catch (error: any) {
      setErrorMsg(error.message || 'Unable to export account data.');
      toast.error(error.message || 'Unable to export account data.', 'Export Failed');
    }
    finally { setPrivacyBusy(''); }
  }

  async function submitDeletionRequest() {
    const confirmed = await showConfirm({
      title: 'Request Account Deletion',
      message: 'Submit an account deletion request for admin review? Financial records and transaction ledgers will be retained in accordance with legal and regulatory compliance.',
      confirmText: 'Request Account Deletion',
      cancelText: 'Keep Account',
      type: 'danger',
    });
    if (!confirmed) return;
    setPrivacyBusy('delete'); setErrorMsg('');
    try {
      await requestAccountDeletion();
      setDeletionRequests(await getAccountDeletionRequests());
      setSuccessMsg('Your account deletion request was submitted for privacy review.');
      toast.success('Your account deletion request was submitted for privacy review.', 'Request Submitted');
    }
    catch (error: any) {
      setErrorMsg(error.message || 'Unable to submit deletion request.');
      toast.error(error.message || 'Unable to submit deletion request.', 'Request Failed');
    }
    finally { setPrivacyBusy(''); }
  }

  async function loadLoginHistory(isManual = false) {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await getLoginHistory(20);
      setLoginHistoryData(res);
      if (isManual) {
        setRecentHistoryRefresh(true);
        setTimeout(() => setRecentHistoryRefresh(false), 2500);
        toast.success('Security audit trail & network telemetry refreshed.', 'Telemetry Refreshed');
      }
    } catch (err: any) {
      console.warn('Failed to load login history:', err);
      setHistoryError(err.message || 'Unable to load login history.');
      if (isManual) {
        toast.error(err.message || 'Unable to load login history.', 'Refresh Failed');
      }
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
      const msg = 'New password must be at least 8 characters long.';
      setErrorMsg(msg);
      toast.error(msg, 'Invalid Password');
      return;
    }

    if (newPassword !== confirmPassword) {
      const msg = 'New password and confirmation password do not match.';
      setErrorMsg(msg);
      toast.error(msg, 'Password Mismatch');
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
          const msg = 'Current password is incorrect. Please try again.';
          setErrorMsg(msg);
          toast.error(msg, 'Verification Failed');
          setSubmitting(false);
          return;
        }
      }

      // 2. Update password in Supabase Auth
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        const msg = updateErr.message || 'Failed to update password.';
        setErrorMsg(msg);
        toast.error(msg, 'Update Failed');
        return;
      }

      // Success
      setSuccessMsg('Your password has been changed successfully!');
      setRecentPasswordSave(true);
      setTimeout(() => setRecentPasswordSave(false), 2500);
      toast.success('Your password has been changed successfully!', 'Password Changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStrengthScore(0);
    } catch (err: any) {
      const msg = err.message || 'An unexpected error occurred while changing password.';
      setErrorMsg(msg);
      toast.error(msg, 'Password Error');
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

      {/* Top Row: 2-Column Balanced Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
        
        {/* Column 1: Account Credentials & Password */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
          
          {/* Card 1: Account Credentials Overview */}
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
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Account Profile
                </h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Registered email and identity status
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Registered Email
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Account Role
                  </span>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: '0.25rem', display: 'block' }}>
                    {(profile?.role === 'admin' || profile?.role === 'superadmin') ? 'Administrator' : 'Customer'}
                  </span>
                </div>

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
          </div>

          {/* Card 2: Change Password */}
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
                  Update your authentication credentials
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
                  Current Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    className="input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password (if set)"
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
                    placeholder="Enter new password (min. 8 characters)"
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

              {/* Password Strength Indicator */}
              {newPassword && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Password Strength:</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: strength.color }}>{strength.label}</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(0,0,0,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
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
                  backgroundColor: recentPasswordSave ? '#10b981' : undefined,
                  borderColor: recentPasswordSave ? '#10b981' : undefined,
                  transition: 'all 0.2s ease',
                }}
              >
                {submitting ? (
                  <>
                    <div className="spinner spinner-sm"></div>
                    <span>Updating Password...</span>
                  </>
                ) : recentPasswordSave ? (
                  <>
                    <CheckIcon size={16} />
                    <span>Password Updated!</span>
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
        </div>

        {/* Column 2: Two-Factor Authentication & Privacy */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
          {/* Card 3: Authenticator 2FA */}
          <MfaPanel />

          {/* Card 4: Privacy & Account Data Rights */}
          <div className="card-glass" style={{ padding: 'clamp(1.25rem, 2vw, 1.75rem)', borderRadius: 'var(--radius-lg, 16px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
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
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Privacy &amp; Account Data
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Manage and export your personal data
                </span>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5, margin: '0 0 1rem' }}>
              Download a complete JSON export of your profile, order history, wallet transactions, and support messages, or request reviewed account deletion.
            </p>

            {deletionRequests[0] && (
              <p role="status" style={{
                color: 'var(--text-secondary)',
                fontSize: '0.82rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(0,0,0,0.03)',
                borderRadius: '6px',
                marginBottom: '1rem',
              }}>
                Latest erasure request: <strong style={{ textTransform: 'capitalize' }}>{deletionRequests[0].status}</strong> · submitted {new Date(deletionRequests[0].requested_at).toLocaleString()}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={downloadAccountData} disabled={Boolean(privacyBusy)}>
                {privacyBusy === 'export' ? 'Preparing…' : 'Download My Data'}
              </button>
              <button
                className="btn btn-sm"
                onClick={submitDeletionRequest}
                disabled={Boolean(privacyBusy) || deletionPending}
                aria-disabled={deletionPending}
                style={{
                  color: deletionPending ? 'var(--text-muted)' : 'var(--error, #ef4444)',
                  border: '1px solid rgba(239,68,68,.35)',
                  background: 'rgba(239, 68, 68, 0.05)',
                  opacity: deletionPending ? .6 : 1,
                  cursor: deletionPending ? 'not-allowed' : undefined
                }}
              >
                {deletionPending ? 'Deletion Request Pending' : privacyBusy === 'delete' ? 'Submitting…' : 'Request Account Deletion'}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Section 2: Login Activity & Device Security Command Center (Full Width) */}
      <div className="card-glass" style={{ padding: 'clamp(1.25rem, 2.5vw, 2rem)', borderRadius: 'var(--radius-lg, 16px)', width: '100%' }}>
        
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(16, 185, 129, 0.15))',
              border: '1px solid rgba(99, 102, 241, 0.25)',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Login Activity &amp; Device Security
                </h2>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '0.15rem 0.6rem',
                  borderRadius: '9999px',
                  background: 'rgba(99, 102, 241, 0.12)',
                  color: 'var(--accent-primary, #6366f1)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                }}>
                  Compliance Audit Trail
                </span>
              </div>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                Verified telemetry of authorized sign-ins including IP addresses, Internet Service Providers (ISP), and geographical origin for SaaS security and compliance.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => loadLoginHistory(true)}
            disabled={historyLoading}
            className="btn btn-secondary btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.45rem 0.95rem',
              borderColor: recentHistoryRefresh ? '#10b981' : undefined,
              color: recentHistoryRefresh ? '#34d399' : undefined,
              transition: 'all 0.2s ease',
            }}
            title="Refresh login history"
          >
            {recentHistoryRefresh ? (
              <>
                <CheckIcon size={14} color="#34d399" />
                <span>Refreshed!</span>
              </>
            ) : (
              <>
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
                <span>{historyLoading ? 'Refreshing…' : 'Refresh Logs'}</span>
              </>
            )}
          </button>
        </div>

        {/* Current Active Session Box (Spacious, Zero Overlap) */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.04), rgba(99, 102, 241, 0.04))',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: 'var(--radius-lg, 14px)',
          padding: '1.25rem',
          marginBottom: '1.75rem',
        }}>
          {/* Top Status Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            paddingBottom: '0.85rem',
            borderBottom: '1px solid rgba(16, 185, 129, 0.15)',
            marginBottom: '1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 10px #10b981',
                display: 'inline-block',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Current Active Session
              </span>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                color: '#059669',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                padding: '0.12rem 0.5rem',
                borderRadius: '9999px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Single-Device Lock Active
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span>Session ID:</span>
              <code style={{
                background: 'rgba(0,0,0,0.05)',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                color: 'var(--text-secondary)',
              }}>
                {activeSessionId ? `${activeSessionId.substring(0, 14)}…` : 'Active'}
              </code>
            </div>
          </div>

          {/* 4 Dedicated Telemetry Cards (No cramped columns, full breathing room) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: '0.85rem',
          }}>
            
            {/* Box 1: Public IP Address */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.7)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '0.4rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Public IP Address
                </span>
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: 'var(--accent-primary, #6366f1)',
                  background: 'rgba(99, 102, 241, 0.1)',
                  padding: '0.1rem 0.4rem',
                  borderRadius: '4px',
                }}>
                  {isIPv6(loginHistoryData?.current?.ip || profile?.last_login_ip) ? 'IPv6' : 'IPv4'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span
                  title={loginHistoryData?.current?.ip || profile?.last_login_ip || 'Detecting...'}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    wordBreak: 'break-all',
                    lineHeight: 1.3,
                  }}
                >
                  {loginHistoryData?.current?.ip || profile?.last_login_ip || 'Detecting IP...'}
                </span>
                {(loginHistoryData?.current?.ip || profile?.last_login_ip) && (
                  <button
                    type="button"
                    onClick={() => handleCopyIp(loginHistoryData?.current?.ip || profile?.last_login_ip)}
                    className="btn btn-secondary btn-sm"
                    style={{
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.7rem',
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                    title="Copy IP address"
                  >
                    {copiedIp === (loginHistoryData?.current?.ip || profile?.last_login_ip) ? (
                      <span style={{ color: '#10b981', fontWeight: 600 }}>Copied</span>
                    ) : (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Verified via Cloudflare Edge</span>
            </div>

            {/* Box 2: Network / ISP */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.7)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '0.4rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Network Provider (ISP)
                </span>
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  background: 'rgba(0,0,0,0.06)',
                  padding: '0.1rem 0.4rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                }}>
                  {loginHistoryData?.history?.[0]?.asn ? `AS${loginHistoryData.history[0].asn}` : 'Carrier'}
                </span>
              </div>

              <div style={{
                fontSize: '0.92rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                wordBreak: 'break-word',
                lineHeight: 1.35,
              }}>
                {loginHistoryData?.current?.isp || profile?.last_login_isp || 'Standard Network'}
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Telecom / Autonomous System</span>
            </div>

            {/* Box 3: Location */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.7)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '0.4rem',
            }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Location &amp; Region
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary, #6366f1)" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {[loginHistoryData?.current?.city, loginHistoryData?.current?.country].filter(Boolean).join(', ') || profile?.last_login_country || 'Current Region'}
                </span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Geographical Origin</span>
            </div>

            {/* Box 4: Current Client Device */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.7)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '0.4rem',
            }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active Browser &amp; OS
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {typeof navigator !== 'undefined' ? `${parseDeviceAndBrowser(navigator.userAgent).browser} on ${parseDeviceAndBrowser(navigator.userAgent).os}` : 'Current Device'}
                </span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>This Browser Session</span>
            </div>

          </div>
        </div>

        {/* History Section Subheader */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Recent Sign-in History
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Logged audit events with network and location fingerprints
            </span>
          </div>
          {loginHistoryData?.history && loginHistoryData.history.length > 0 && (
            <span style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              background: 'rgba(0,0,0,0.05)',
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              fontWeight: 600,
            }}>
              {loginHistoryData.history.length} Event{loginHistoryData.history.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {/* History Error State */}
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

        {/* Loading State */}
        {historyLoading && !loginHistoryData ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner spinner-sm" style={{ margin: '0 auto 0.75rem' }} />
            <span style={{ fontSize: '0.85rem' }}>Retrieving compliance audit records…</span>
          </div>
        ) : !loginHistoryData?.history || loginHistoryData.history.length === 0 ? (
          /* Empty State */
          <div style={{
            padding: '3rem 1.5rem',
            textAlign: 'center',
            background: 'rgba(0, 0, 0, 0.02)',
            borderRadius: 'var(--radius-md, 12px)',
            border: '1px dashed var(--border-subtle, #e2e8f0)',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ margin: '0 auto 0.75rem' }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.35rem' }}>
              No historical sign-in events recorded yet
            </h4>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0, maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
              Your future sign-ins, IP addresses, and ISP telemetry will be securely logged and displayed here.
            </p>
          </div>
        ) : (
          /* Modern Card List Feed (Zero Horizontal Scrollbars, Perfect on All Devices) */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {loginHistoryData.history.map((item: UserSecurityLog, idx: number) => {
              const badge = getEventBadge(item.event_type);
              const dev = parseDeviceAndBrowser(item.user_agent);
              // Only the single latest sign-in (index 0) is the active current session
              const isCurrent = idx === 0 && (
                !loginHistoryData.current?.ip ||
                item.ip_address === loginHistoryData.current?.ip ||
                item.ip_address === profile?.last_login_ip
              );
              return (
                <div
                  key={item.id}
                  style={{
                    background: isCurrent ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.03), rgba(99, 102, 241, 0.03))' : 'rgba(255, 255, 255, 0.65)',
                    border: isCurrent ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(0, 0, 0, 0.06)',
                    borderRadius: '12px',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Row 1: Header (Device + Event Badge + Status + Timestamp) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.65rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      {/* Device Icon */}
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: dev.icon === 'mobile' ? 'rgba(168, 85, 247, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: dev.icon === 'mobile' ? '#a855f7' : '#6366f1',
                      }}>
                        {dev.icon === 'mobile' ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                            <line x1="12" y1="18" x2="12.01" y2="18" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                            <line x1="8" y1="21" x2="16" y2="21" />
                            <line x1="12" y1="17" x2="12" y2="21" />
                          </svg>
                        )}
                      </div>

                      {/* Device Title */}
                      <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {dev.browser} on {dev.os}
                      </span>

                      {/* Event Badge */}
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.55rem',
                        borderRadius: '9999px',
                        color: badge.color,
                        background: badge.bg,
                        border: `1px solid ${badge.border}`,
                      }}>
                        {badge.label}
                      </span>

                      {/* Current Active Badge */}
                      {isCurrent && (
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          color: '#10b981',
                          background: 'rgba(16, 185, 129, 0.12)',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          padding: '0.12rem 0.45rem',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                          Current Session
                        </span>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>{formatLogTimestamp(item.created_at)}</span>
                    </div>
                  </div>

                  {/* Row 2: Network, Location, and IP Pills */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem 1.25rem',
                    fontSize: '0.84rem',
                    paddingTop: '0.35rem',
                    borderTop: '1px dashed rgba(0, 0, 0, 0.06)',
                  }}>
                    {/* Carrier & ASN */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                        <line x1="12" y1="20" x2="12.01" y2="20" />
                      </svg>
                      <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                        {item.isp || 'Standard Network'}
                      </strong>
                      {item.asn && (
                        <span style={{
                          fontSize: '0.68rem',
                          fontFamily: 'monospace',
                          color: 'var(--text-muted)',
                          background: 'rgba(0,0,0,0.05)',
                          padding: '0.08rem 0.35rem',
                          borderRadius: '4px',
                        }}>
                          AS{item.asn}
                        </span>
                      )}
                    </div>

                    {/* Location */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span>{[item.city, item.country].filter(Boolean).join(', ') || 'Unknown Location'}</span>
                    </div>

                    {/* IP Monospace with Copy */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}>
                      <span style={{
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        color: 'var(--text-primary)',
                        background: 'rgba(0,0,0,0.05)',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '6px',
                        wordBreak: 'break-all',
                      }}>
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
                          padding: '0.2rem',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Copy IP address"
                      >
                        {copiedIp === item.ip_address ? (
                          <CheckIcon size={12} color="#10b981" />
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function isIPv6(ip?: string | null): boolean {
  return Boolean(ip && ip.includes(':'));
}

function parseDeviceAndBrowser(ua?: string | null): { browser: string; os: string; icon: 'desktop' | 'mobile' } {
  if (!ua) return { browser: 'Web Browser', os: 'Device', icon: 'desktop' };
  
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome/')) browser = 'Google Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';

  let os = 'Device';
  let icon: 'desktop' | 'mobile' = 'desktop';

  if (ua.includes('Android')) { os = 'Android'; icon = 'mobile'; }
  else if (ua.includes('iPhone')) { os = 'iPhone'; icon = 'mobile'; }
  else if (ua.includes('iPad')) { os = 'iPad'; icon = 'mobile'; }
  else if (ua.includes('Windows')) { os = 'Windows'; icon = 'desktop'; }
  else if (ua.includes('Mac OS') || ua.includes('Macintosh')) { os = 'macOS'; icon = 'desktop'; }
  else if (ua.includes('Linux')) { os = 'Linux'; icon = 'desktop'; }

  return { browser, os, icon };
}

function getEventBadge(eventType: string) {
  switch (eventType) {
    case 'signup':
      return { label: 'Account Created', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' };
    case 'oauth_login':
      return { label: 'Google Sign In', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.3)' };
    case 'session_refresh':
      return { label: 'Session Refresh', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)', border: 'rgba(100, 116, 139, 0.3)' };
    case 'password_reset':
      return { label: 'Password Reset', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' };
    case 'login':
    default:
      return { label: 'Standard Login', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)' };
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
