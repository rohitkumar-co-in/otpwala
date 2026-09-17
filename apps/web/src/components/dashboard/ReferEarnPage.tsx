import React, { useState, useEffect } from 'react';
import { getReferralStats, claimReferralCode, type ReferralStatsData } from '../../lib/api';
import { UsersIcon, CheckCircleIcon, AlertCircleIcon, RefreshCwIcon, LockIcon, HourglassIcon, GiftIcon, TargetIcon, ZapIcon, InfoIcon } from '../ui/Icons';

export default function ReferEarnPage() {
  const [data, setData] = useState<ReferralStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Claim referral code state (48 hours window)
  const [claimInputCode, setClaimInputCode] = useState('');
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getReferralStats();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load referral statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = claimInputCode.trim().toUpperCase();
    if (!code) {
      setClaimError('Please enter a valid referral code');
      return;
    }

    setClaimLoading(true);
    setClaimError(null);
    setClaimSuccess(null);
    try {
      const res = await claimReferralCode(code);
      setClaimSuccess(res.message || `Referral code ${code} claimed successfully!`);
      setClaimInputCode('');
      await loadData();
    } catch (err: any) {
      setClaimError(err.message || 'Failed to claim referral code');
    } finally {
      setClaimLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const referralCode = data?.referralCode || '...';
  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://otpwala.me';
  const referralUrl = `${siteOrigin}/auth/register?ref=${referralCode}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
      prompt('Copy your referral link:', referralUrl);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      prompt('Copy your referral code:', referralCode);
    }
  };

  const tier1 = data?.bonusConfig?.tier1 ?? 20;
  const tier2 = data?.bonusConfig?.tier2 ?? 5;
  const tier3 = data?.bonusConfig?.tier3 ?? 5;
  const windowDays = (data?.bonusConfig as any)?.windowDays ?? 30;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)' }}>
            Refer & <span className="text-gradient">Earn</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Earn <strong>{tier1}%</strong> on your friend&apos;s 1st deposit, <strong>{tier2}%</strong> on 2nd deposit, and <strong>{tier3}%</strong> on 3rd deposit (within {windowDays} days of joining)!
          </p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={loadData}
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          <RefreshCwIcon size={14} className={loading ? 'animate-spin' : ''} />
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircleIcon size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Mandatory Non-Withdrawable Notice */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(147, 51, 234, 0.08) 100%)',
          border: '1px solid rgba(37, 99, 235, 0.25)',
          borderRadius: '14px',
          padding: '1.1rem 1.4rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'var(--accent-primary, #2563eb)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: '1.1rem',
          }}
        >
          <InfoIcon size={18} color="var(--accent-primary)" aria-hidden="true" />
        </div>
        <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
          <strong>Platform Credit Policy:</strong> All referral commission bonuses are added directly to your OTPWala wallet.
          <span style={{ color: '#2563eb', fontWeight: 600 }}> The money cannot be withdrawn and can only be used on the OTPWala platform to purchase virtual numbers.</span>
        </div>
      </div>

      {/* ─── CLAIM REFERRAL WELCOME CODE SECTION (24h Window) ─── */}
      {(() => {
        const claimStatus = data?.claimStatus;
        const isReferred = claimStatus?.isReferred;
        const canClaim = claimStatus?.canClaimReferral;
        const isWithin24 = claimStatus?.isWithin24Hours ?? claimStatus?.isWithin48Hours;
        const hoursLeft = claimStatus?.hoursRemaining ?? 0;
        const boundCode = claimStatus?.referrerCode;

        // State 1: Already claimed / permanently bound -> Fades out & locked
        if (isReferred) {
          return (
            <div
              className="card"
              style={{
                padding: '1.25rem 1.5rem',
                borderRadius: '14px',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                background: 'rgba(16, 185, 129, 0.04)',
                opacity: 0.85,
                transition: 'all 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                    <LockIcon size={19} color="#10b981" aria-hidden="true" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>Referral Code Active &amp; Bound</span>
                      <span className="badge badge-success" style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem' }}>PERMANENTLY LOCKED</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      Your account is bound to referral code: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{boundCode || 'APPLIED'}</strong>. This code cannot be changed.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // State 2: Expired (> 24 hours post registration) -> Faded out
        if (!canClaim && !isWithin24) {
          return (
            <div
              className="card"
              style={{
                padding: '1.25rem 1.5rem',
                borderRadius: '14px',
                border: '1px solid var(--border-subtle)',
                background: 'rgba(255, 255, 255, 0.02)',
                opacity: 0.45,
                transition: 'all 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', opacity: 0.6 }}>
                  <HourglassIcon size={19} color="var(--text-muted)" aria-hidden="true" />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Referral Code Claim Window Ended
                  </div>
                  <div style={{ fontSize: '0.785rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    Referral codes could strictly only be added within 24 hours of account registration. You can still share your own invite link below to earn commissions!
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // State 3: Active Claim Window (< 24 hours remaining)
        return (
          <div
            className="card"
            style={{
              padding: '1.5rem',
              borderRadius: '14px',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.07) 0%, rgba(99, 102, 241, 0.05) 100%)',
              boxShadow: '0 8px 24px rgba(168, 85, 247, 0.08)',
              transition: 'all 0.3s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <GiftIcon size={19} color="var(--accent-primary)" aria-hidden="true" />
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Have a Friend&apos;s Referral Code?
                  </h2>
                </div>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Enter your referrer&apos;s code below. <strong>Notice:</strong> Once entered, the code permanently locks to your account and cannot be modified.
                </p>
              </div>

              <span
                className="badge"
                style={{
                  background: 'rgba(234, 179, 8, 0.12)',
                  border: '1px solid rgba(234, 179, 8, 0.35)',
                  color: '#eab308',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.75rem',
                }}
              >
                <HourglassIcon size={15} color="#eab308" aria-hidden="true" />
                <span>{hoursLeft.toFixed(1)}h remaining to claim</span>
              </span>
            </div>

            <form onSubmit={handleClaimReferral} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. REF123ABC"
                  value={claimInputCode}
                  onChange={(e) => {
                    setClaimInputCode(e.target.value.toUpperCase());
                    setClaimError(null);
                  }}
                  required
                  style={{
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 600,
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={claimLoading}
                className="btn btn-primary"
                style={{
                  padding: '0.65rem 1.4rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {claimLoading ? (
                  <>
                    <RefreshCwIcon size={14} className="animate-spin" />
                    <span>Applying...</span>
                  </>
                ) : (
                  <span>Apply Referral Code</span>
                )}
              </button>
            </form>

            {claimError && (
              <div className="alert alert-error" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
                <AlertCircleIcon size={16} />
                <span>{claimError}</span>
              </div>
            )}

            {claimSuccess && (
              <div className="alert alert-success" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
                <CheckCircleIcon size={16} />
                <span>{claimSuccess}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Hero Cards Grid: Link Share & Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Referral Link & Code Card */}
        <div className="card card-glass" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-primary, #2563eb)' }}>
                Your Unique Invite Link
              </span>
              <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                Instant Attribution
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1rem', lineHeight: 1.4 }}>
              Share this link with your friends or audience. When they create an account, they'll be automatically tied to your referral code.
            </p>

            {/* Link Input Box */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
              <input
                type="text"
                readOnly
                value={referralUrl}
                style={{
                  flex: 1,
                  padding: '0.65rem 0.9rem',
                  fontSize: '0.85rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-glass-strong, rgba(255,255,255,0.7))',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
              <button
                className="btn btn-primary"
                onClick={handleCopyLink}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
              >
                {copiedLink ? <CheckCircleIcon size={16} /> : null}
                <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>

            {/* Referral Code Box */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border-subtle)', padding: '0.75rem 1rem', borderRadius: '10px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Your Referral Code:</span>
                <strong style={{ fontSize: '1.1rem', letterSpacing: '0.08em', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {referralCode}
                </strong>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleCopyCode}
                style={{ fontSize: '0.8rem' }}
              >
                {copiedCode ? 'Copied Code!' : 'Copy Code'}
              </button>
            </div>
          </div>

          {/* Social Share Shortcuts */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Join OTPWala for instant SMS OTP verification numbers! Sign up with my link: ${referralUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.78rem', color: '#16a34a' }}
            >
              Share on WhatsApp
            </a>
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent('Join OTPWala for instant SMS OTP verification numbers!')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.78rem', color: '#2563eb' }}
            >
              Share on Telegram
            </a>
          </div>
        </div>

        {/* Stats & Tier Progress Card */}
        <div className="card card-glass" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1.25rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-primary, #2563eb)' }}>
              Referral Earnings Summary
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1.2rem 1rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Total Bonus Earned
                </span>
                <strong style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-display)' }}>
                  ₹{(data?.totalEarned || 0).toFixed(2)}
                </strong>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1.2rem 1rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Friends Joined
                </span>
                <strong style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                  {data?.totalReferrals || 0}
                </strong>
              </div>
            </div>
          </div>

          {/* Reward Tiers breakdown */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.65rem' }}>
              Reward Structure (1st, 2nd &amp; 3rd Deposits):
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><TargetIcon size={15} color="#10b981" aria-hidden="true" />1st Deposit Bonus</span>
                <span style={{ fontWeight: 700, color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>{tier1}% Commission</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><ZapIcon size={15} color="#3b82f6" aria-hidden="true" />2nd Deposit Bonus</span>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Only if within {windowDays} days of joining</span>
                </div>
                <span style={{ fontWeight: 700, color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>{tier2}% Commission</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><GiftIcon size={15} color="#8b5cf6" aria-hidden="true" />3rd Deposit Bonus</span>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Only if within {windowDays} days of joining</span>
                </div>
                <span style={{ fontWeight: 700, color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>{tier3}% Commission</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Referred Friends Table (STRICT REQUIREMENT: SHOW ONLY NAME AND DATE OF JOINING) */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Referred Friends</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
              Users who registered using your referral code. For privacy preservation, only name and date of joining are displayed.
            </p>
          </div>
          <span className="badge badge-primary" style={{ fontSize: '0.78rem' }}>
            {data?.referredUsers?.length || 0} Registered
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            Loading referrals...
          </div>
        ) : !data?.referredUsers || data.referredUsers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <UsersIcon size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>No referrals yet</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              Share your link above to start earning 20% deposit commissions!
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem' }}>#</th>
                  <th style={{ padding: '0.75rem' }}>Referred User Name</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Date Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.referredUsers.map((user, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.75rem', color: 'var(--text-muted)', width: '40px' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: 'rgba(37, 99, 235, 0.12)',
                            color: '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                          }}
                        >
                          {(user.name || 'U')[0].toUpperCase()}
                        </div>
                        <span>{user.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {new Date(user.joinedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Deposit Bonus History (Format: "1 refer bonus from X +y amount added to your account") */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Deposit Bonus History</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
              Real-time ledger of bonuses credited to your account from your friends' deposits.
            </p>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 700 }}>
            +₹{(data?.totalEarned || 0).toFixed(2)} Total Added
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            Loading bonus logs...
          </div>
        ) : !data?.bonusLogs || data.bonusLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>No deposit bonuses earned yet</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              When a referred user completes a deposit, your 20% or 5% bonus will automatically be logged here.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem' }}>Bonus Description</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  <th style={{ padding: '0.75rem' }}>Date & Time</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.bonusLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <GiftIcon size={16} color="#10b981" aria-hidden="true" />
                        <span>{log.description}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
                        Added to Balance
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#10b981', fontSize: '0.95rem' }}>
                      +₹{log.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
