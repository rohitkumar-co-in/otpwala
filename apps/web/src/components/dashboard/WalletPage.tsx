import { useState, useEffect } from 'react';
import { getWallet, getTransactions, topUp, getUserPaymentRequests } from '../../lib/api';
import {
  DollarIcon,
  CheckIcon,
  CopyIcon,
  QrCodeIcon,
  RefreshCwIcon,
  ShieldIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  XIcon,
  InfoIcon,
  CreditCardIcon,
} from '../ui/Icons';
import { getActiveCurrency, type Currency } from '../../lib/currency';
import { toast } from '../../lib/toast';
import { readDashboardCache, writeDashboardCache } from '../../lib/dashboardCache';

interface WalletConfig {
  minDeposit: number;
  maxDeposit: number;
  suggestions: number[];
  upiId: string;
  upiName: string;
  binancePayEnabled?: boolean;
  binancePayId?: string;
  binancePayNickname?: string;
  binancePayQrUrl?: string;
  usdtInrRate?: number;
  binanceMinDeposit?: number;
  binanceMaxDeposit?: number;
  binanceSuggestions?: number[];
}

const BinanceIcon = ({ size = 20, style }: { size?: number; style?: React.CSSProperties }) => (
  <img
    src="/icons/services/binance.svg"
    alt="Binance Pay"
    width={size}
    height={size}
    style={{
      display: 'block',
      width: `${size}px`,
      height: `${size}px`,
      objectFit: 'contain',
      ...style,
    }}
  />
);

const UpiIcon = ({ size = 20, style }: { size?: number; style?: React.CSSProperties }) => (
  <img
    src="/icons/services/upi.svg"
    alt="UPI"
    width={size}
    height={size}
    style={{
      display: 'block',
      width: `${size}px`,
      height: `${size}px`,
      objectFit: 'contain',
      ...style,
    }}
  />
);

export default function WalletPage() {
  const cachedWallet = readDashboardCache<{ balance: number; config: WalletConfig; requests: any[] } | null>('wallet', null);
  const cachedTransactions = readDashboardCache<{ transactions: any[]; total: number } | null>('wallet-transactions-0', null);
  const [balance, setBalance] = useState(cachedWallet?.balance || 0);
  const [transactions, setTransactions] = useState<any[]>(cachedTransactions?.transactions || []);
  const [userRequests, setUserRequests] = useState<any[]>(cachedWallet?.requests || []);
  const [totalTx, setTotalTx] = useState(cachedTransactions?.total || 0);
  const [page, setPage] = useState(0);
  const [transactionFilter, setTransactionFilter] = useState<'all' | 'topup' | 'deduction' | 'refund' | 'admin_grant'>('all');
  const [loading, setLoading] = useState(!cachedWallet);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);

  // Dynamic Wallet Config (Admin Controlled)
  const [walletConfig, setWalletConfig] = useState<WalletConfig>(cachedWallet?.config || {
    minDeposit: 50,
    maxDeposit: 50000,
    suggestions: [50, 100, 200, 300, 500],
    upiId: 'otpwala@upi',
    upiName: 'OTPWala Services',
    binancePayEnabled: true,
    binancePayId: '',
    binancePayNickname: '',
    binancePayQrUrl: '',
    usdtInrRate: 115,
  });

  const [currency, setCurrency] = useState<Currency>(getActiveCurrency());
  // Currency selects the initial deposit rail; users can still switch manually.
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'binance'>('upi');
  const [upiAmount, setUpiAmount] = useState('100');
  const [binanceAmount, setBinanceAmount] = useState('1');
  const [utrNumber, setUtrNumber] = useState('');
  const [binanceTxId, setBinanceTxId] = useState('');
  const [agreeNote, setAgreeNote] = useState(false);
  const [agreeNoteError, setAgreeNoteError] = useState(false);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [topUpSuccess, setTopUpSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedBinance, setCopiedBinance] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [recentRefresh, setRecentRefresh] = useState(false);
  const [recentDepositSubmit, setRecentDepositSubmit] = useState(false);
  const [insufficientAlert, setInsufficientAlert] = useState(false);

  const limit = 15;

  useEffect(() => {
    loadWallet();
    const handleCurrencyChange = (e: any) => {
      if (e.detail?.currency) {
        setCurrency(e.detail.currency);
      }
    };
    window.addEventListener('otpwala:currency-change', handleCurrencyChange);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('insufficient') === '1' || params.get('error') === 'insufficient_funds') {
        setInsufficientAlert(true);
      }
    }
    return () => window.removeEventListener('otpwala:currency-change', handleCurrencyChange);
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [page]);

  useEffect(() => {
    if (currency === 'USD' && walletConfig.binancePayEnabled !== false) {
      setPaymentMethod('binance');
    } else if (currency === 'INR') {
      setPaymentMethod('upi');
    }
  }, [currency, walletConfig.binancePayEnabled]);

  async function handleRefresh(isManual = false) {
    setRefreshing(true);
    try {
      await Promise.all([loadWallet(), loadTransactions()]);
      if (isManual) {
        setRecentRefresh(true);
        setTimeout(() => setRecentRefresh(false), 2500);
        toast.success('Wallet balance & transaction history refreshed.', 'Wallet Refreshed');
      }
    } catch (err: any) {
      if (isManual) {
        toast.error(err?.message || 'Failed to refresh wallet', 'Refresh Failed');
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function loadWallet() {
    setWalletError(null);
    try {
      const [walletData, requestsData] = await Promise.all([
        getWallet(),
        getUserPaymentRequests().catch(() => []),
      ]);
      setBalance(parseFloat(String(walletData.balance)) || 0);
      window.dispatchEvent(new CustomEvent('otpwala:wallet-balance', {
        detail: {
          balance: parseFloat(String(walletData.balance)) || 0,
          rate: Number(walletData.config?.usdToInrRate) || 115,
        },
      }));
      setUserRequests(requestsData || []);
      if (walletData.config) {
        const minDeposit = Number(walletData.config.minDeposit) || 1;
        const maxDeposit = Math.max(minDeposit, Number(walletData.config.maxDeposit) || minDeposit);
        const suggestions = (walletData.config.suggestions || [])
          .map(Number)
          .filter((amount: number) => Number.isFinite(amount) && amount >= minDeposit && amount <= maxDeposit);

        const binanceMinDeposit = Number(walletData.config.binanceMinDeposit) || 1;
        const binanceMaxDeposit = Math.max(binanceMinDeposit, Number(walletData.config.binanceMaxDeposit) || 500);
        const binanceSuggestions = (walletData.config.binanceSuggestions || [1, 2, 5, 10, 20])
          .map(Number)
          .filter((amount: number) => Number.isFinite(amount) && amount >= binanceMinDeposit && amount <= binanceMaxDeposit);

        const safeConfig = {
          ...walletData.config,
          minDeposit,
          maxDeposit,
          suggestions: suggestions.length > 0 ? suggestions : [minDeposit],
          binanceMinDeposit,
          binanceMaxDeposit,
          binanceSuggestions: binanceSuggestions.length > 0 ? binanceSuggestions : [binanceMinDeposit],
        };
        setWalletConfig(safeConfig);
        setUpiAmount(String(safeConfig.suggestions[0] || 100));
        setBinanceAmount(String(safeConfig.binanceSuggestions[0] || 1));
        writeDashboardCache('wallet', { balance: parseFloat(String(walletData.balance)) || 0, config: safeConfig, requests: requestsData || [] });
      }
    } catch (err: any) {
      console.error('Wallet error:', err);
      setWalletError(err?.message || 'Unable to load your wallet.');
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactions() {
    setTransactionsError(null);
    try {
      const data = await getTransactions(limit, page * limit);
      setTransactions(data.transactions || []);
      setTotalTx(data.total || 0);
      writeDashboardCache(`wallet-transactions-${page}`, { transactions: data.transactions || [], total: data.total || 0 });
    } catch (err: any) {
      console.error('Transaction error:', err);
      setTransactionsError(err?.message || 'Unable to load transaction history.');
    }
  }

  const handleCopyUpi = () => {
    if (!walletConfig.upiId) return;
    navigator.clipboard.writeText(walletConfig.upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyBinance = () => {
    if (!walletConfig.binancePayId) return;
    navigator.clipboard.writeText(walletConfig.binancePayId);
    setCopiedBinance(true);
    setTimeout(() => setCopiedBinance(false), 2000);
  };

  async function handleSubmitDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreeNote) {
      setAgreeNoteError(true);
      setTopUpError('Please agree to the Refund & Payments policy and the deposit note to continue.');
      const el = document.getElementById('wallet-terms-wrapper');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const rate = Number(walletConfig.usdtInrRate) || 115;
    let finalAmountInr = 0;
    let displayUsdt = '';

    if (paymentMethod === 'binance') {
      const usdtVal = parseFloat(binanceAmount);
      if (!usdtVal || isNaN(usdtVal) || usdtVal <= 0) {
        setTopUpError('Please enter a valid USDT / USD amount');
        return;
      }
      finalAmountInr = Number((usdtVal * rate).toFixed(2));
      displayUsdt = usdtVal.toFixed(2);

      const minUsdt = walletConfig.binanceMinDeposit || 1;
      const maxUsdt = walletConfig.binanceMaxDeposit || 500;

      if (usdtVal < minUsdt) {
        setTopUpError(`Minimum deposit amount is ${minUsdt} USDT`);
        return;
      }
      if (usdtVal > maxUsdt) {
        setTopUpError(`Maximum deposit amount is ${maxUsdt} USDT`);
        return;
      }
      const cleanBinance = binanceTxId.trim().replace(/\s+/g, '');
      if (!cleanBinance) {
        setTopUpError('Please enter your Binance Pay Order ID from your payment receipt');
        return;
      }
      if (!/^\d+$/.test(cleanBinance)) {
        setTopUpError('Please enter a valid numeric Binance Pay Order ID (digits only, e.g. 430406788154015744)');
        return;
      }
    } else {
      const upiVal = parseFloat(upiAmount);
      if (!upiVal || isNaN(upiVal) || upiVal <= 0) {
        setTopUpError('Please enter a valid deposit amount');
        return;
      }
      finalAmountInr = upiVal;
      displayUsdt = (upiVal / rate).toFixed(2);

      if (upiVal < walletConfig.minDeposit) {
        setTopUpError(
          currency === 'USD'
            ? `Minimum deposit amount is $${(walletConfig.minDeposit / rate).toFixed(2)}`
            : `Minimum deposit amount is ₹${walletConfig.minDeposit}`
        );
        return;
      }
      if (upiVal > walletConfig.maxDeposit) {
        setTopUpError(
          currency === 'USD'
            ? `Maximum deposit amount is $${(walletConfig.maxDeposit / rate).toFixed(2)}`
            : `Maximum deposit amount is ₹${walletConfig.maxDeposit.toLocaleString('en-IN')}`
        );
        return;
      }
      const cleanUtr = utrNumber.trim().replace(/\s+/g, '');
      if (!cleanUtr) {
        setTopUpError('Please enter the 12-digit UPI reference ID / UTR from your payment receipt');
        return;
      }
      if (!/^\d{12}$/.test(cleanUtr)) {
        setTopUpError('Please enter a valid 12-digit numeric UPI reference ID / UTR (e.g. 129815979728)');
        return;
      }
    }

    if (!agreeNote) {
      setAgreeNoteError(true);
      setTopUpError('Please agree to the Refund & Payments policy and the deposit note to continue.');
      const termsBox = document.getElementById('wallet-terms-wrapper');
      if (termsBox) {
        termsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setTopUpLoading(true);
    setTopUpError(null);
    setTopUpSuccess(null);

    try {
      const refId = paymentMethod === 'upi' ? utrNumber.trim().replace(/\s+/g, '') : binanceTxId.trim().replace(/\s+/g, '');
      const data = await topUp(finalAmountInr, paymentMethod, refId);
      const succMsg = paymentMethod === 'upi'
        ? (data.data?.message ||
          (currency === 'USD'
            ? `UPI deposit request of $${displayUsdt} submitted! Admin will verify and credit your wallet.`
            : `UPI deposit request of ₹${finalAmountInr} submitted! Admin will verify and credit your wallet.`))
        : (data.data?.message ||
          `Binance Pay deposit request of ${displayUsdt} USDT submitted! Admin will verify and credit your wallet.`);
      
      setTopUpSuccess(succMsg);
      setRecentDepositSubmit(true);
      setTimeout(() => setRecentDepositSubmit(false), 2500);
      toast.success(succMsg, 'Deposit Request Submitted');

      if (paymentMethod === 'upi') {
        setUtrNumber('');
      } else {
        setBinanceTxId('');
      }
      await Promise.all([loadWallet(), loadTransactions()]);
    } catch (err: any) {
      const errMsg = err.message || 'Deposit submission failed. Please try again.';
      setTopUpError(errMsg);
      toast.error(errMsg, 'Deposit Submission Failed');
    } finally {
      setTopUpLoading(false);
    }
  }

  const usdtRate = Number(walletConfig.usdtInrRate) || 115;
  const numericUpiAmount = parseFloat(upiAmount) || walletConfig.minDeposit;
  const numericBinanceUsdt = parseFloat(binanceAmount) || (walletConfig.binanceMinDeposit || 1);
  const calculatedInr = Number((numericBinanceUsdt * usdtRate).toFixed(2));

  const numericAmount = paymentMethod === 'binance' ? calculatedInr : numericUpiAmount;
  const usdtAmount = paymentMethod === 'binance' ? numericBinanceUsdt.toFixed(2) : (numericUpiAmount / usdtRate).toFixed(2);

  const upiPayUri = `upi://pay?pa=${walletConfig.upiId}&pn=${encodeURIComponent(walletConfig.upiName)}&am=${numericUpiAmount}&cu=INR&tn=OTPWala%20Deposit`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiPayUri)}`;

  // Only use the official uploaded Binance QR code image (never auto-generate pseudo-QRs which fail on Binance App)
  const binanceQrUrl = walletConfig.binancePayQrUrl?.trim() || '';

  const totalPages = Math.ceil(totalTx / limit);
  const visibleTransactions = transactionFilter === 'all'
    ? transactions
    : transactions.filter((tx) => tx.type === transactionFilter);

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
            Wallet & <span className="text-gradient">Deposits</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Submit a wallet top-up using UPI or Binance Pay (Crypto) and use it after approval
          </p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => handleRefresh(true)}
          disabled={refreshing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            borderColor: recentRefresh ? '#10b981' : undefined,
            color: recentRefresh ? '#34d399' : undefined,
            transition: 'all 0.2s ease',
          }}
        >
          {recentRefresh ? (
            <>
              <CheckIcon size={14} color="#34d399" />
              <span>Refreshed!</span>
            </>
          ) : (
            <>
              <RefreshCwIcon size={14} className={refreshing ? 'animate-spin' : ''} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </>
          )}
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
          <CreditCardIcon size={16} color="#2563eb" aria-hidden="true" />
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
          {currency === 'USD' ? `$${(balance / usdtRate).toFixed(2)}` : `₹${balance.toFixed(2)}`}
        </div>
        <div
          style={{
            fontSize: '0.85rem',
            color: '#475569',
            marginTop: '0.45rem',
            fontWeight: 500,
          }}
        >
          Available for temporary virtual-number purchases
        </div>
        {walletError && (
          <div className="alert alert-error" role="alert" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
            <span>{walletError}</span>
            <button className="btn btn-ghost btn-sm" onClick={loadWallet}>Retry</button>
          </div>
        )}
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
        <AlertCircleIcon size={21} color="#dc2626" aria-hidden="true" />
        <div>
          <div style={{ color: '#b91c1c', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
            Strict No-Refund & Platform-Only Usage Policy
          </div>
          <div style={{ color: '#475569', fontSize: '0.825rem', lineHeight: 1.5 }}>
            <strong style={{ color: '#0f172a' }}>Verified wallet deposits are intended for on-platform use and are generally final.</strong> They are non-withdrawable and non-transferable, subject to applicable law and correction of unauthorized, duplicate, incorrectly credited, or technically failed payments. Deposited funds can only be used on the platform to purchase temporary virtual phone numbers and SMS verification services.
          </div>
        </div>
      </div>

      {/* Deposit Section */}
      <div className="card" style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: 'var(--radius-sm)',
                background: paymentMethod === 'binance' ? '#181a20' : '#ffffff',
                border: paymentMethod === 'binance' ? '1px solid rgba(243, 186, 47, 0.35)' : '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
              }}
            >
              {paymentMethod === 'binance' ? <BinanceIcon size={24} /> : <UpiIcon size={22} />}
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                {paymentMethod === 'binance' ? 'Deposit via Binance Pay (USDT)' : 'Deposit via UPI'}
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {paymentMethod === 'binance'
                  ? 'Send USDT using Binance Pay ID or QR, then submit your Order ID for verification.'
                  : 'Follow the payment details below, then submit your UTR for review.'}
              </span>
            </div>
          </div>
          <span className={`badge ${paymentMethod === 'binance' ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.75rem', fontWeight: 700 }}>
            {paymentMethod === 'binance' ? 'Crypto / USDT' : 'Instant UPI'}
          </span>
        </div>

        {/* Payment Method Selector */}
        {walletConfig.binancePayEnabled !== false && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.6rem' }}>
              Select Payment Method:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
              {/* UPI Option (Left / First) */}
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('upi');
                  setTopUpError(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  border: paymentMethod === 'upi' ? '2px solid #2563eb' : '1px solid var(--border-subtle)',
                  background: paymentMethod === 'upi' ? 'rgba(37, 99, 235, 0.06)' : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    background: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    padding: '5px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  <UpiIcon size={28} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: paymentMethod === 'upi' ? '#1d4ed8' : 'var(--text-primary)' }}>
                    UPI / QR (INR)
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    GPay, PhonePe, Paytm, BHIM
                  </div>
                </div>
                {paymentMethod === 'upi' && <CheckCircleIcon size={18} color="#2563eb" />}
              </button>

              {/* Binance Pay Option (Right / Second) */}
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('binance');
                  setTopUpError(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  border: paymentMethod === 'binance' ? '2px solid #f59e0b' : '1px solid var(--border-subtle)',
                  background: paymentMethod === 'binance' ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    background: '#181a20',
                    border: '1px solid rgba(243, 186, 47, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    padding: '4px',
                  }}
                >
                  <BinanceIcon size={30} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.92rem', color: paymentMethod === 'binance' ? '#b45309' : 'var(--text-primary)' }}>
                      Binance Pay
                    </span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d' }}>
                      USDT
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Binance App • 0 Gas Fee (Crypto)
                  </div>
                </div>
                {paymentMethod === 'binance' && <CheckCircleIcon size={18} color="#f59e0b" />}
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Amount Selection */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', margin: 0 }}>
              {paymentMethod === 'binance' ? '1. Select or Enter Amount in USDT:' : '1. Select or Enter Amount in INR:'}
            </label>
          </div>

          {/* Dynamic Suggestions (Displays all 5 Admin-configured quick chips) */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
            {paymentMethod === 'binance' ? (
              /* Binance USDT Suggestions */
              (walletConfig.binanceSuggestions || [1, 2, 5, 10, 20]).slice(0, 5).map((usdtVal) => {
                const isSelected = parseFloat(binanceAmount) === usdtVal;
                return (
                  <button
                    key={usdtVal}
                    type="button"
                    onClick={() => {
                      setBinanceAmount(String(usdtVal));
                      setTopUpError(null);
                    }}
                    className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    style={{
                      padding: '0.45rem 1.1rem',
                      fontWeight: 700,
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.9rem',
                      transition: 'all 0.15s ease',
                      background: isSelected ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : undefined,
                      borderColor: isSelected ? '#d97706' : undefined,
                    }}
                  >
                    {usdtVal} USDT
                  </button>
                );
              })
            ) : (
              /* UPI amounts use INR */
              walletConfig.suggestions.slice(0, 5).map((amount) => {
                const isSelected = upiAmount === String(amount);
                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => {
                      setUpiAmount(String(amount));
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
              })
            )}
          </div>

          <div style={{ maxWidth: '360px' }}>
            <div className="input-group" style={{ position: 'relative' }}>
              {paymentMethod === 'binance' ? (
                <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '100%' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: '12px',
                      fontWeight: 700,
                      color: '#b45309',
                      fontSize: '1.05rem',
                      pointerEvents: 'none',
                    }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    step="any"
                    className="input"
                    placeholder="e.g. 5 or 10 USDT"
                    value={binanceAmount}
                    onChange={(e) => {
                      setBinanceAmount(e.target.value);
                      setTopUpError(null);
                    }}
                    min={walletConfig.binanceMinDeposit || 1}
                    max={walletConfig.binanceMaxDeposit || 500}
                    style={{ fontSize: '1.1rem', fontWeight: 700, paddingLeft: '28px', width: '100%' }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      right: '12px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: '#b45309',
                      pointerEvents: 'none',
                    }}
                  >
                    USDT
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '100%' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: '12px',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      fontSize: '1.05rem',
                      pointerEvents: 'none',
                    }}
                  >
                    ₹
                  </span>
                  <input
                    type="number"
                    className="input"
                    placeholder="Custom Amount (INR)"
                    value={upiAmount}
                    onChange={(e) => {
                      setUpiAmount(e.target.value);
                      setTopUpError(null);
                    }}
                    min={walletConfig.minDeposit}
                    max={walletConfig.maxDeposit}
                    style={{ fontSize: '1.1rem', fontWeight: 700, paddingLeft: '28px', width: '100%' }}
                  />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', flexWrap: 'wrap', gap: '0.25rem' }}>
              {paymentMethod === 'binance' ? (
                <>
                  <span>Min: {walletConfig.binanceMinDeposit || 1} USDT</span>
                  <span style={{ fontWeight: 700, color: '#b45309' }}>Amount: {usdtAmount} USDT</span>
                  <span>Max: {walletConfig.binanceMaxDeposit || 500} USDT</span>
                </>
              ) : (
                <>
                  <span>Min: ₹{walletConfig.minDeposit}</span>
                  <span style={{ fontWeight: 700, color: '#2563eb' }}>Amount: ₹{numericUpiAmount.toFixed(2)}</span>
                  <span>Max: ₹{walletConfig.maxDeposit.toLocaleString('en-IN')}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Step 2: Payment Details (QR & Details) */}
        {paymentMethod === 'upi' ? (
          /* UPI Payment Details */
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <UpiIcon size={20} />
              <label style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                2. Scan QR or Pay to Admin UPI ID:
              </label>
            </div>

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
        ) : (
          /* Binance Pay Details */
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.04) 0%, rgba(251, 191, 36, 0.08) 100%), var(--bg-secondary)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BinanceIcon size={20} />
                <label style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  2. Send USDT via Binance Pay:
                </label>
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '0.2rem 0.6rem', borderRadius: '999px', border: '1px solid #fde68a' }}>
                Amount to Send: {usdtAmount} USDT
              </div>
            </div>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Binance QR Code */}
              {binanceQrUrl ? (
                <div
                  style={{
                    background: '#ffffff',
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                  }}
                >
                  <img
                    src={binanceQrUrl}
                    alt="Official Binance Pay QR Code"
                    width={180}
                    height={180}
                    style={{ display: 'block', borderRadius: '4px', objectFit: 'contain', aspectRatio: '1/1' }}
                  />
                  <span style={{ color: '#111827', fontSize: '0.78rem', fontWeight: 700, marginTop: '8px' }}>
                    Pay {usdtAmount} USDT
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    width: '180px',
                    height: '180px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px dashed rgba(245, 158, 11, 0.4)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '1.25rem',
                  }}
                >
                  <BinanceIcon size={44} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.6rem' }}>
                    Use Binance Pay ID
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem', lineHeight: 1.35 }}>
                    Open Binance App &rarr; Pay &rarr; Send to Pay ID below
                  </span>
                </div>
              )}

              {/* Binance Details & Steps */}
              <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {walletConfig.binancePayNickname && (
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                      Payee Binance Nickname
                    </span>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                      {walletConfig.binancePayNickname}
                    </div>
                  </div>
                )}

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                    Binance Pay ID
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        padding: '0.5rem 0.85rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '1.05rem',
                        fontWeight: 700,
                        color: '#d97706',
                        flex: 1,
                        maxWidth: '280px',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {walletConfig.binancePayId || 'Not Configured'}
                    </div>
                    {walletConfig.binancePayId && (
                      <button
                        type="button"
                        onClick={handleCopyBinance}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        {copiedBinance ? <CheckIcon size={14} color="#34d399" /> : <CopyIcon size={14} />}
                        <span>{copiedBinance ? 'Copied!' : 'Copy'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* How to Pay Guide */}
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45, background: 'rgba(255,255,255,0.03)', padding: '0.65rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>How to pay:</strong>
                  <ol style={{ margin: '0.3rem 0 0 1.1rem', padding: 0 }}>
                    <li>Open <strong>Binance App</strong> → tap <strong>Pay</strong> (or scan the QR above).</li>
                    <li>Choose <strong>Send</strong> → select <strong>Pay ID</strong> and paste <code>{walletConfig.binancePayId}</code>.</li>
                    <li>Send exactly <strong>{usdtAmount} USDT</strong> (zero gas fees!).</li>
                    <li>Copy the numeric <strong>Order ID</strong> (e.g. <code>430406748854015744</code>) from your payment receipt.</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Enter Reference ID & Submit */}
        <form onSubmit={handleSubmitDeposit}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
            {paymentMethod === 'upi'
              ? '3. Enter 12-Digit UPI Reference ID / UTR:'
              : '3. Enter Binance Pay Order ID:'}
          </label>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: '260px' }}>
              {paymentMethod === 'upi' ? (
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{12}"
                  maxLength={12}
                  className="input"
                  placeholder="e.g. 128255979728 (12-digit UPI Reference ID)"
                  value={utrNumber}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
                    setUtrNumber(digits);
                    setTopUpError(null);
                  }}
                  required
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}
                />
              ) : (
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  className="input"
                  placeholder="e.g. 430406788154015744 (Binance Pay Order ID)"
                  value={binanceTxId}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    setBinanceTxId(digits);
                    setTopUpError(null);
                  }}
                  required
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}
                />
              )}
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.35rem', lineHeight: 1.4 }}>
                {paymentMethod === 'upi' ? (
                  <>Open your UPI payment app receipt and copy the <strong>12-digit UPI Ref ID / UTR</strong> (e.g. <code>129815979728</code>).</>
                ) : (
                  <>In your Binance App: Go to <strong>Pay</strong> → <strong>Payment History</strong> → tap the payment → copy the numeric <strong>Order ID</strong> (e.g. <code>430406788154015744</code>).</>
                )}
              </span>
            </div>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.08)', padding: '0.75rem 0.95rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
            <InfoIcon size={18} color="#3b82f6" aria-hidden="true" />
            <div style={{ lineHeight: 1.5 }}>
              <div>
                <strong>Note:</strong> Your balance will be added in <strong>under 5 minutes to 2 hours</strong> after payment verification. If it takes longer than that, please message <a href="https://t.me/OTPWalaSupport" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'underline', fontWeight: 600 }}>@OTPWalaSupport</a> on Telegram with your Transaction ID and screenshot for faster payment approval.
              </div>
              <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#1e40af', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ClockIcon size={13} color="#1e40af" />
                <span>10 AM to 10 PM IST timing — outside of this time it can take a bit longer to approve.</span>
              </div>
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.6rem', display: 'flex', alignItems: 'flex-start', gap: '0.35rem' }}>
            <AlertCircleIcon size={16} color="#f87171" aria-hidden="true" />
            <span style={{ lineHeight: 1.4 }}>By depositing, you confirm that wallet funds are intended for on-platform use. For an unauthorized, duplicate, or incorrectly credited payment, contact support promptly with the transaction reference.</span>
          </div>

          <div
            id="wallet-terms-wrapper"
            style={{
              marginTop: '1rem',
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              border: agreeNoteError ? '1.5px solid #ef4444' : '1.5px solid transparent',
              background: agreeNoteError ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
              boxShadow: agreeNoteError ? '0 0 0 3px rgba(239, 68, 68, 0.25)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: agreeNoteError ? '#f87171' : 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={agreeNote}
                onChange={(e) => {
                  setAgreeNote(e.target.checked);
                  if (e.target.checked) setAgreeNoteError(false);
                }}
                style={{ width: '17px', height: '17px', cursor: 'pointer', accentColor: '#3b82f6', flexShrink: 0 }}
              />
              <span>
                I agree to{' '}
                <a
                  href="/refund-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#3b82f6', textDecoration: 'underline', fontWeight: 700 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Refund &amp; Payments
                </a>{' '}
                and the above written note
              </span>
            </label>
          </div>

          <div style={{ marginTop: '1rem' }}>
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
                background: recentDepositSubmit
                  ? '#10b981'
                  : paymentMethod === 'binance'
                  ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                  : undefined,
                border: paymentMethod === 'binance' && !recentDepositSubmit ? 'none' : undefined,
                borderColor: recentDepositSubmit ? '#10b981' : undefined,
                opacity: topUpLoading ? 0.7 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              <CheckIcon size={16} />
              <span>
                {topUpLoading
                  ? 'Submitting...'
                  : recentDepositSubmit
                    ? 'Deposit Submitted!'
                    : paymentMethod === 'binance'
                      ? `Submit Binance Pay Deposit (${usdtAmount} USDT)`
                      : (currency === 'USD'
                        ? `Submit Deposit ($${usdtAmount})`
                        : `Submit Deposit (₹${numericAmount})`)}
              </span>
            </button>
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
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Real-time verification status of your deposit submissions</span>
          </div>
          <div className="card" style={{ padding: '0.5rem', overflowX: 'auto', marginBottom: '1.75rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                  <th style={{ padding: '0.75rem 1rem' }}>UTR / Order ID / Ref</th>
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
                  return (
                    <tr key={req.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                        {currency === 'USD' ? `$${(amt / usdtRate).toFixed(2)}` : `₹${amt.toFixed(2)}`}
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
                        <span className={`badge ${method === 'binance' ? 'badge-warning' : 'badge-info'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          {method === 'binance' ? <BinanceIcon size={14} /> : <UpiIcon size={14} />}
                          <span>{method === 'binance' ? 'BINANCE PAY' : method.toUpperCase()}</span>
                        </span>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.15rem', fontWeight: 700 }}>Transaction History</h3>
          {transactionsError && <button className="btn btn-ghost btn-sm" onClick={loadTransactions}>Retry history</button>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginBottom: '0.75rem' }} aria-label="Filter wallet transactions">
          {(['all', 'topup', 'deduction', 'refund', 'admin_grant'] as const).map((filter) => (
            <button key={filter} type="button" className={`btn btn-sm ${transactionFilter === filter ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTransactionFilter(filter)}>
              {filter === 'all' ? 'All' : filter === 'admin_grant' ? 'Free funds' : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
        {transactionsError ? (
          <div className="alert alert-error" role="alert">{transactionsError}</div>
        ) : visibleTransactions.length === 0 ? (
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
                {visibleTransactions.map((tx) => {
                  const isDebit = tx.type === 'deduction';
                  const amount = Math.abs(parseFloat(tx.amount) || 0);
                  return (
                    <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className={`badge ${isDebit ? 'badge-secondary' : 'badge-success'}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          color: isDebit ? 'var(--error)' : 'var(--success)',
                        }}
                      >
                        {isDebit ? '−' : '+'}{currency === 'USD' ? `$${(amount / usdtRate).toFixed(2)}` : `₹${amount.toFixed(2)}`}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {currency === 'USD' ? `$${(parseFloat(tx.balance_after || 0) / usdtRate).toFixed(2)}` : `₹${parseFloat(tx.balance_after || 0).toFixed(2)}`}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                        {tx.description || '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
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
