import { useState, useEffect } from 'react';
import { getWallet, getTransactions, topUp, getUserPaymentRequests } from '../../lib/api';
import {
  DollarIcon,
  ZapIcon,
  CheckIcon,
  CopyIcon,
  QrCodeIcon,
  RefreshCwIcon,
  ShieldIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  XIcon,
} from '../ui/Icons';

interface WalletConfig {
  minDeposit: number;
  maxDeposit: number;
  suggestions: number[];
  upiId: string;
  upiName: string;
}

export default function WalletPage() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [userRequests, setUserRequests] = useState<any[]>([]);
  const [totalTx, setTotalTx] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  // Dynamic Wallet Config (Admin Controlled)
  const [walletConfig, setWalletConfig] = useState<WalletConfig>({
    minDeposit: 50,
    maxDeposit: 50000,
    suggestions: [50, 100, 200, 500, 1000],
    upiId: 'otpwala@upi',
    upiName: 'OTPWala Services',
  });

  const [topUpAmount, setTopUpAmount] = useState('100');
  const [utrNumber, setUtrNumber] = useState('');
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [topUpSuccess, setTopUpSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [insufficientAlert, setInsufficientAlert] = useState(false);

  const limit = 15;

  useEffect(() => {
    loadWallet();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('insufficient') === '1' || params.get('error') === 'insufficient_funds') {
        setInsufficientAlert(true);
      }
    }
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [page]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([loadWallet(), loadTransactions()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function loadWallet() {
    try {
      const [walletData, requestsData] = await Promise.all([
        getWallet(),
        getUserPaymentRequests().catch(() => []),
      ]);
      setBalance(parseFloat(String(walletData.balance)) || 0);
      setUserRequests(requestsData || []);
      if (walletData.config) {
        setWalletConfig(walletData.config);
        if (walletData.config.suggestions && walletData.config.suggestions.length > 0) {
          setTopUpAmount(String(walletData.config.suggestions[0]));
        }
      }
    } catch (err) {
      console.error('Wallet error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactions() {
    try {
      const data = await getTransactions(limit, page * limit);
      setTransactions(data.transactions || []);
      setTotalTx(data.total || 0);
    } catch (err) {
      console.error('Transaction error:', err);
    }
  }

  const handleCopyUpi = () => {
    if (!walletConfig.upiId) return;
    navigator.clipboard.writeText(walletConfig.upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  async function handleSubmitUpiDeposit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(topUpAmount);

    if (!amount || isNaN(amount)) {
      setTopUpError('Please enter a valid deposit amount');
      return;
    }

    if (amount < walletConfig.minDeposit) {
      setTopUpError(`Minimum deposit amount is ₹${walletConfig.minDeposit}`);
      return;
    }

    if (amount > walletConfig.maxDeposit) {
      setTopUpError(`Maximum deposit amount is ₹${walletConfig.maxDeposit.toLocaleString('en-IN')}`);
      return;
    }

    if (!utrNumber.trim()) {
      setTopUpError('Please enter the 12-digit UPI UTR / Reference ID from your payment receipt');
      return;
    }

    setTopUpLoading(true);
    setTopUpError(null);
    setTopUpSuccess(null);

    try {
      const data = await topUp(amount, 'upi', utrNumber.trim());
      setTopUpSuccess(
        data.data?.message ||
          `UPI deposit request of ₹${amount} submitted! Admin will verify and credit your wallet.`
      );
      setUtrNumber('');
      await Promise.all([loadWallet(), loadTransactions()]);
    } catch (err: any) {
      setTopUpError(err.message || 'Deposit submission failed. Please try again.');
    } finally {
      setTopUpLoading(false);
    }
  }

  const numericAmount = parseFloat(topUpAmount) || walletConfig.minDeposit;
  const upiPayUri = `upi://pay?pa=${walletConfig.upiId}&pn=${encodeURIComponent(walletConfig.upiName)}&am=${numericAmount}&cu=INR&tn=OTPWala%20Deposit`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiPayUri)}`;

  const totalPages = Math.ceil(totalTx / limit);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>
            Wallet & <span className="text-gradient">UPI Deposits</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Top up your balance instantly using any UPI App (PhonePe, Google Pay, Paytm, BHIM)
          </p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleRefresh}
          disabled={refreshing}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <RefreshCwIcon size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Insufficient Funds Banner */}
      {insufficientAlert && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '12px',
            color: '#b91c1c',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertCircleIcon size={22} color="#dc2626" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Insufficient Wallet Balance</div>
              <div style={{ fontSize: '0.85rem', color: '#7f1d1d' }}>
                You don't have enough balance to purchase this number. Please top up your wallet below to proceed with your order.
              </div>
            </div>
          </div>
          <button
            onClick={() => setInsufficientAlert(false)}
            className="btn btn-ghost btn-sm"
            style={{ padding: '0.35rem', minHeight: 'auto', color: '#991b1b' }}
            title="Dismiss"
          >
            <XIcon size={16} />
          </button>
        </div>
      )}

      {/* Balance Card */}
      <div
        className="card"
        style={{
          padding: '2.25rem 2rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '18px',
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.04) 0%, rgba(16, 185, 129, 0.05) 100%), #ffffff',
          border: '1px solid rgba(37, 99, 235, 0.18)',
          boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.06), 0 4px 12px -2px rgba(0, 0, 0, 0.03)',
        }}
      >
        <div
          style={{
            fontSize: '0.82rem',
            color: '#1e40af',
            marginBottom: '0.5rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'rgba(37, 99, 235, 0.08)',
            border: '1px solid rgba(37, 99, 235, 0.2)',
            padding: '0.25rem 0.85rem',
            borderRadius: '999px',
          }}
        >
          <span>💼</span>
          <span>Available Wallet Balance</span>
        </div>
        <div
          style={{
            fontSize: '3.5rem',
            fontWeight: 800,
            fontFamily: 'var(--font-display)',
            color: '#059669',
            lineHeight: 1.15,
            marginTop: '0.35rem',
            letterSpacing: '-0.02em',
          }}
        >
          ₹{balance.toFixed(2)}
        </div>
        <div
          style={{
            fontSize: '0.875rem',
            color: '#475569',
            marginTop: '0.5rem',
            fontWeight: 500,
          }}
        >
          Can be used instantly for temporary virtual numbers &amp; SMS OTPs
        </div>
      </div>

      {/* Strict No-Refund Notice Banner */}
      <div
        style={{
          background: 'rgba(239, 68, 68, 0.06)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.85rem',
        }}
      >
        <div style={{ color: '#dc2626', fontSize: '1.25rem', lineHeight: 1, marginTop: '2px' }}>⚠️</div>
        <div>
          <div style={{ color: '#b91c1c', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
            Strict No-Refund & Platform-Only Usage Policy
          </div>
          <div style={{ color: '#475569', fontSize: '0.825rem', lineHeight: 1.5 }}>
            <strong style={{ color: '#0f172a' }}>No refund requests will be entertained once funds are deposited.</strong> All deposits are strictly non-refundable and non-withdrawable. Deposited funds can only be used on the platform to purchase temporary virtual phone numbers and SMS verification services.
          </div>
        </div>
      </div>

      {/* UPI Deposit Section */}
      <div className="card" style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ZapIcon size={18} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Deposit via UPI</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                No convenience fees. 100% secure direct UPI transfer.
              </span>
            </div>
          </div>
          <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
            UPI Only
          </span>
        </div>

        {/* Step 1: Amount Selection */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.6rem' }}>
            1. Select or Enter Amount:
          </label>

          {/* Dynamic Admin Suggestions (Up to 5) */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
            {walletConfig.suggestions.slice(0, 5).map((amount) => {
              const isSelected = topUpAmount === String(amount);
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => {
                    setTopUpAmount(String(amount));
                    setTopUpError(null);
                  }}
                  className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{
                    padding: '0.45rem 1.1rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.9rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  ₹{amount}
                </button>
              );
            })}
          </div>

          <div style={{ maxWidth: '320px' }}>
            <div className="input-group">
              <input
                type="number"
                className="input"
                placeholder="Custom Amount"
                value={topUpAmount}
                onChange={(e) => {
                  setTopUpAmount(e.target.value);
                  setTopUpError(null);
                }}
                min={walletConfig.minDeposit}
                max={walletConfig.maxDeposit}
                style={{ fontSize: '1.1rem', fontWeight: 700 }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              <span>Min: ₹{walletConfig.minDeposit}</span>
              <span>Max: ₹{walletConfig.maxDeposit.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* Step 2: Payment Details (QR & VPA) */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '1rem' }}>
            2. Scan QR or Pay to Admin UPI ID:
          </label>

          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Dynamic QR Box */}
            <div
              style={{
                background: '#ffffff',
                padding: '10px',
                borderRadius: 'var(--radius-md)',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              <img
                src={qrUrl}
                alt="UPI Deposit QR Code"
                width={170}
                height={170}
                style={{ display: 'block', borderRadius: '4px' }}
              />
              <span style={{ color: '#111827', fontSize: '0.75rem', fontWeight: 700, marginTop: '6px' }}>
                Scan to Pay ₹{numericAmount}
              </span>
            </div>

            {/* UPI Details & Intent */}
            <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                  Payee Business Name
                </span>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  {walletConfig.upiName}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                  Admin UPI ID / VPA
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      padding: '0.5rem 0.85rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      color: 'var(--accent-primary)',
                      flex: 1,
                      maxWidth: '280px',
                    }}
                  >
                    {walletConfig.upiId}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    {copied ? <CheckIcon size={14} color="#34d399" /> : <CopyIcon size={14} />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Mobile UPI Intent Button */}
              <div>
                <a
                  href={upiPayUri}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <QrCodeIcon size={14} />
                  <span>Open in UPI App (GPay/PhonePe/Paytm)</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Enter UTR & Submit */}
        <form onSubmit={handleSubmitUpiDeposit}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
            3. Enter 12-Digit UTR / Transaction Reference ID:
          </label>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: '260px' }}>
              <input
                type="text"
                className="input"
                placeholder="e.g. 429381029481 (Found in your UPI payment receipt)"
                value={utrNumber}
                onChange={(e) => {
                  setUtrNumber(e.target.value);
                  setTopUpError(null);
                }}
                required
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.35rem' }}>
                Open your UPI app payment receipt and copy the 12-digit UTR/UPI Ref ID.
              </span>
            </div>

            <button
              type="submit"
              disabled={topUpLoading}
              className="btn btn-primary"
              style={{
                height: '46px',
                padding: '0 1.5rem',
                fontSize: '0.95rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <CheckIcon size={16} />
              <span>{topUpLoading ? 'Submitting...' : `Submit Deposit (₹${numericAmount})`}</span>
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>⚠️</span>
            <span>By depositing, you confirm you understand no refund requests will be entertained. Balance can only be used on the platform.</span>
          </div>
        </form>

        {/* Success / Error Banners */}
        {topUpError && (
          <div
            className="alert alert-error"
            style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <AlertCircleIcon size={18} />
            <span>{topUpError}</span>
          </div>
        )}

        {topUpSuccess && (
          <div
            className="alert alert-success"
            style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <CheckCircleIcon size={18} />
            <span>{topUpSuccess}</span>
          </div>
        )}
      </div>

      {/* Recent Deposit Requests (UTR Tracking) */}
      {userRequests.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Recent Deposit Requests</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Real-time verification status of your UPI UTR submissions</span>
          </div>
          <div className="card" style={{ padding: '0.5rem', overflowX: 'auto', marginBottom: '1.75rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                  <th style={{ padding: '0.75rem 1rem' }}>UTR / Reference ID</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Method</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Submitted At</th>
                </tr>
              </thead>
              <tbody>
                {userRequests.map((req) => {
                  const amt = parseFloat(req.amount ?? req.amount_inr ?? 0);
                  const utrId = req.transaction_id || req.gateway_payment_id || '';
                  const st = req.status;
                  const isPending = st === 'pending' || st === 'created';
                  const isApproved = st === 'approved' || st === 'paid';
                  const isRejected = st === 'rejected' || st === 'failed';
                  const method = req.payment_method || req.gateway || 'UPI';

                  return (
                    <tr key={req.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                        ₹{amt.toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                        {utrId ? (
                          <span className="badge badge-secondary" style={{ fontFamily: 'var(--font-mono)' }}>
                            {utrId}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {isPending && (
                          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            <ClockIcon size={12} />
                            <span>Pending Verification</span>
                          </span>
                        )}
                        {isApproved && (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            <CheckIcon size={12} />
                            <span>Approved &amp; Credited</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="badge badge-error" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            <XIcon size={12} />
                            <span>Rejected</span>
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className="badge badge-info">{method.toUpperCase()}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(req.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.15rem', fontWeight: 700 }}>Transaction History</h3>
        {transactions.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            No transactions yet.
          </div>
        ) : (
          <div className="card" style={{ padding: '0.5rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Balance After</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Description</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className={`badge ${parseFloat(tx.amount) >= 0 ? 'badge-success' : 'badge-secondary'}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        color: parseFloat(tx.amount) >= 0 ? 'var(--success)' : 'var(--error)',
                      }}
                    >
                      {parseFloat(tx.amount) >= 0 ? '+' : ''}₹{Math.abs(parseFloat(tx.amount)).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      ₹{parseFloat(tx.balance_after || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                      {tx.description || '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', padding: '1rem' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
