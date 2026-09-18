import { useState, useEffect } from 'react';
import { getAdminSettings, saveAdminSettingsBatch, getAdminTigerBalance, testTelegramNotification } from '../../lib/api';
import { TelegramIcon } from '../ui/BrandIcons';
import { toast } from '../../lib/toast';
import {
  ServerIcon,
  DollarIcon,
  CreditCardIcon,
  ShieldIcon,
  UsersIcon,
  SaveIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  XIcon,
  ZapIcon,
  TagIcon,
} from '../ui/Icons';

export default function SettingsManager() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [tigerBalance, setTigerBalance] = useState<any>(null);
  const [tigerStatus, setTigerStatus] = useState<'online' | 'error' | 'checking'>('checking');
  const [checkingTiger, setCheckingTiger] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recentRefresh, setRecentRefresh] = useState(false);
  const [recentSave, setRecentSave] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Category 1: Brand & Slogan Configuration
  const [brandName, setBrandName] = useState('OTPWala');
  const [titleSeparator, setTitleSeparator] = useState('—');
  const [brandSlogan, setBrandSlogan] = useState('Instant Virtual Numbers for SMS Verification');

  // Category 3: Currency & Pricing
  const [rateMode, setRateMode] = useState<'tiger_default' | 'custom'>('custom');
  const [tigerDefaultRate, setTigerDefaultRate] = useState('85.00');
  const [customDollarRate, setCustomDollarRate] = useState('86.50');
  const [usdToInr, setUsdToInr] = useState('86.50');
  const [defaultMarkup, setDefaultMarkup] = useState('25');

  // Category 4: Wallet Limits & Suggestions
  const [minDeposit, setMinDeposit] = useState('50');
  const [maxDeposit, setMaxDeposit] = useState('50000');
  const [suggestion1, setSuggestion1] = useState('50');
  const [suggestion2, setSuggestion2] = useState('100');
  const [suggestion3, setSuggestion3] = useState('200');
  const [suggestion4, setSuggestion4] = useState('300');
  const [suggestion5, setSuggestion5] = useState('500');

  // Category 5: UPI & Support
  const [upiId, setUpiId] = useState('otpwala@upi');
  const [upiName, setUpiName] = useState('OTPWala Services');
  const [supportTelegram, setSupportTelegram] = useState('@OTPWalaSupport');

  // Binance Pay Configuration
  const [binancePayEnabled, setBinancePayEnabled] = useState(true);
  const [binancePayId, setBinancePayId] = useState('');
  const [binancePayNickname, setBinancePayNickname] = useState('');
  const [binancePayQrUrl, setBinancePayQrUrl] = useState('');
  const [usdtInrRate, setUsdtInrRate] = useState('90');
  const [binanceMinDeposit, setBinanceMinDeposit] = useState('1');
  const [binanceMaxDeposit, setBinanceMaxDeposit] = useState('500');
  const [binanceSuggestion1, setBinanceSuggestion1] = useState('1');
  const [binanceSuggestion2, setBinanceSuggestion2] = useState('2');
  const [binanceSuggestion3, setBinanceSuggestion3] = useState('5');
  const [binanceSuggestion4, setBinanceSuggestion4] = useState('10');
  const [binanceSuggestion5, setBinanceSuggestion5] = useState('20');

  // Telegram Bot Notifications for Payment Approvals
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramAdminChatId, setTelegramAdminChatId] = useState('');
  const [providerLowBalanceThreshold, setProviderLowBalanceThreshold] = useState('5');
  const [telegramNotificationsEnabled, setTelegramNotificationsEnabled] = useState(true);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Category 6: Referral Tiers & Window
  const [refTier1, setRefTier1] = useState('20');
  const [refTier2, setRefTier2] = useState('5');
  const [refTier3, setRefTier3] = useState('5');
  const [refWindowDays, setRefWindowDays] = useState('30');

  // Category 7: Access & Maintenance
  const [maintenanceMode, setMaintenanceMode] = useState('false');
  const [allowEmailSignup, setAllowEmailSignup] = useState(true);
  const [allowGoogleLogin, setAllowGoogleLogin] = useState(true);
  const [allowRegistration, setAllowRegistration] = useState(true);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsData, balData] = await Promise.all([
        getAdminSettings().catch(() => ({})),
        getAdminTigerBalance().catch(() => null),
      ]);

      const s = settingsData || {};
      setSettings(s);

      if (balData && balData.balance !== undefined) {
        setTigerBalance(balData);
        setTigerStatus('online');
      } else {
        setTigerStatus('error');
      }

      if (s.brand_name) setBrandName(s.brand_name);
      if (s.title_separator) setTitleSeparator(s.title_separator);
      if (s.brand_slogan) setBrandSlogan(s.brand_slogan);

      if (s.dollar_rate_mode) {
        setRateMode(s.dollar_rate_mode === 'tiger_default' ? 'tiger_default' : 'custom');
      }
      if (s.tiger_default_rate) setTigerDefaultRate(s.tiger_default_rate);
      const unifiedDollarRate = s.custom_dollar_rate || s.usd_to_inr_rate || s.usdt_inr_rate;
      if (unifiedDollarRate) {
        setCustomDollarRate(unifiedDollarRate);
        setUsdtInrRate(unifiedDollarRate);
      }

      if (s.usd_to_inr_rate) setUsdToInr(s.usd_to_inr_rate);
      if (s.default_markup_percentage || s.default_markup_percent) {
        setDefaultMarkup(s.default_markup_percentage || s.default_markup_percent);
      }
      if (s.min_deposit_inr || s.min_topup_amount) {
        setMinDeposit(s.min_deposit_inr || s.min_topup_amount);
      }
      if (s.max_deposit_inr) setMaxDeposit(s.max_deposit_inr);

      const rawSugg = s.deposit_suggestions || '50,100,200,300,500';
      const parts = rawSugg.split(',').map((p: string) => p.trim());
      setSuggestion1(parts[0] || '50');
      setSuggestion2(parts[1] || '100');
      setSuggestion3(parts[2] || '200');
      setSuggestion4(parts[3] || '300');
      setSuggestion5(parts[4] || '500');

      if (s.upi_id) setUpiId(s.upi_id);
      if (s.upi_merchant_name) setUpiName(s.upi_merchant_name);
      if (s.support_telegram) setSupportTelegram(s.support_telegram);

      if (s.binance_pay_enabled !== undefined) setBinancePayEnabled(s.binance_pay_enabled !== 'false');
      if (s.binance_pay_id) setBinancePayId(s.binance_pay_id);
      if (s.binance_pay_nickname) setBinancePayNickname(s.binance_pay_nickname);
      if (s.binance_pay_qr_url) setBinancePayQrUrl(s.binance_pay_qr_url);
      if (s.usdt_inr_rate) setUsdtInrRate(s.usdt_inr_rate);
      if (s.binance_min_deposit_usdt) setBinanceMinDeposit(s.binance_min_deposit_usdt);
      if (s.binance_max_deposit_usdt) setBinanceMaxDeposit(s.binance_max_deposit_usdt);

      const rawBinanceSugg = s.binance_deposit_suggestions || '1,2,5,10,20';
      const binanceParts = rawBinanceSugg.split(',').map((p: string) => p.trim());
      setBinanceSuggestion1(binanceParts[0] || '1');
      setBinanceSuggestion2(binanceParts[1] || '2');
      setBinanceSuggestion3(binanceParts[2] || '5');
      setBinanceSuggestion4(binanceParts[3] || '10');
      setBinanceSuggestion5(binanceParts[4] || '20');

      if (s.telegram_bot_token) setTelegramBotToken(s.telegram_bot_token);
      if (s.telegram_admin_chat_id) setTelegramAdminChatId(s.telegram_admin_chat_id);
      if (s.provider_low_balance_threshold_usd) setProviderLowBalanceThreshold(s.provider_low_balance_threshold_usd);
      if (s.telegram_notifications_enabled !== undefined) {
        setTelegramNotificationsEnabled(s.telegram_notifications_enabled !== 'false');
      }

      if (s.maintenance_mode) setMaintenanceMode(s.maintenance_mode);
      if (s.auth_allow_email_signup !== undefined) setAllowEmailSignup(s.auth_allow_email_signup !== 'false');
      if (s.auth_allow_google_login !== undefined) setAllowGoogleLogin(s.auth_allow_google_login !== 'false');
      if (s.auth_allow_registration !== undefined) setAllowRegistration(s.auth_allow_registration !== 'false');
      if (s.referral_bonus_tier1_percent) setRefTier1(s.referral_bonus_tier1_percent);
      if (s.referral_bonus_tier2_percent) setRefTier2(s.referral_bonus_tier2_percent);
      if (s.referral_bonus_tier3_percent) setRefTier3(s.referral_bonus_tier3_percent);
      if (s.referral_bonus_window_days) setRefWindowDays(s.referral_bonus_window_days);

      if (isManual) {
        setRecentRefresh(true);
        setTimeout(() => setRecentRefresh(false), 2500);
        toast.success('System settings & gateway status refreshed successfully.', 'Refreshed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load platform settings');
      if (isManual) {
        toast.error(err.message || 'Failed to load platform settings', 'Refresh Failed');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const checkTigerConnection = async () => {
    setCheckingTiger(true);
    setError(null);
    try {
      const bal = await getAdminTigerBalance();
      if (bal && bal.balance !== undefined) {
        setTigerBalance(bal);
        setTigerStatus('online');
        setSuccess('Tiger SMS Provider connection verified! Upstream API is operational.');
        toast.success(`Tiger SMS API is online! Upstream balance: $${parseFloat(bal.balance || 0).toFixed(2)}`, 'Gateway Online');
      } else {
        setTigerStatus('error');
        setError('Tiger SMS API returned unexpected response or zero balance');
        toast.error('Tiger SMS API returned unexpected response or zero balance', 'Gateway Issue');
      }
    } catch (err: any) {
      setTigerStatus('error');
      setError(err.message || 'Tiger SMS API check failed: Unable to connect');
      toast.error(err.message || 'Tiger SMS API check failed: Unable to connect', 'Gateway Error');
    } finally {
      setCheckingTiger(false);
    }
  };

  const handleSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingKey('all');
    setError(null);
    setSuccess(null);

    const parsedMinDeposit = Number(minDeposit);
    const parsedMaxDeposit = Number(maxDeposit);
    const parsedProviderThreshold = Number(providerLowBalanceThreshold);
    if (!Number.isFinite(parsedMinDeposit) || !Number.isFinite(parsedMaxDeposit) || parsedMinDeposit < 1 || parsedMaxDeposit < parsedMinDeposit) {
      setError('Wallet limits are invalid. The maximum deposit must be greater than or equal to the minimum deposit.');
      setSavingKey(null);
      return;
    }
    if (!Number.isFinite(parsedProviderThreshold) || parsedProviderThreshold < 0.01) {
      setError('Low provider balance threshold must be at least $0.01.');
      setSavingKey(null);
      return;
    }

    const validSuggestions = [suggestion1, suggestion2, suggestion3, suggestion4, suggestion5]
      .map((s) => s.trim())
      .filter((s) => s !== '' && !isNaN(Number(s)) && Number(s) >= parsedMinDeposit && Number(s) <= parsedMaxDeposit)
      .slice(0, 5)
      .join(',');

    const effectiveRate = rateMode === 'tiger_default' ? tigerDefaultRate : customDollarRate;

    const parsedBinanceMin = parseFloat(binanceMinDeposit) || 1;
    const parsedBinanceMax = parseFloat(binanceMaxDeposit) || 500;
    if (parsedBinanceMax < parsedBinanceMin) {
      setError('Binance Maximum Deposit must be greater than or equal to Minimum Deposit.');
      setSavingKey(null);
      return;
    }

    const validBinanceSuggestions = [
      binanceSuggestion1,
      binanceSuggestion2,
      binanceSuggestion3,
      binanceSuggestion4,
      binanceSuggestion5,
    ]
      .map((s) => s.trim())
      .filter((s) => s !== '' && !isNaN(Number(s)) && Number(s) >= parsedBinanceMin && Number(s) <= parsedBinanceMax)
      .slice(0, 5)
      .join(',');

    if (binancePayEnabled) {
      if (!binancePayId.trim()) {
        setError('Binance Pay ID is required when Binance Pay is enabled.');
        setSavingKey(null);
        return;
      }
      if (!binancePayQrUrl.trim()) {
        setError('Official Binance Pay QR Image URL is mandatory when Binance Pay is enabled. Please upload your official 1:1 cropped Binance QR code and provide the URL.');
        setSavingKey(null);
        return;
      }
    }

    try {
      await saveAdminSettingsBatch({
        brand_name: brandName.trim() || 'OTPWala',
        title_separator: titleSeparator.trim() || '—',
        brand_slogan: brandSlogan.trim() || 'Instant Virtual Numbers for SMS Verification',
        dollar_rate_mode: rateMode,
        tiger_default_rate: tigerDefaultRate,
        custom_dollar_rate: customDollarRate,
        usd_to_inr_rate: effectiveRate,
        default_markup_percentage: defaultMarkup,
        default_markup_percent: defaultMarkup,
        min_deposit_inr: minDeposit,
        min_topup_amount: minDeposit,
        max_deposit_inr: maxDeposit,
        deposit_suggestions: validSuggestions || String(parsedMinDeposit),
        upi_id: upiId,
        upi_merchant_name: upiName,
        support_telegram: supportTelegram,
        binance_pay_enabled: String(binancePayEnabled),
        binance_pay_id: binancePayId.trim(),
        binance_pay_nickname: binancePayNickname.trim(),
        binance_pay_qr_url: binancePayQrUrl.trim(),
        usdt_inr_rate: effectiveRate,
        binance_min_deposit_usdt: binanceMinDeposit.trim() || '1',
        binance_max_deposit_usdt: binanceMaxDeposit.trim() || '500',
        binance_deposit_suggestions: validBinanceSuggestions || String(parsedBinanceMin),
        telegram_bot_token: telegramBotToken.trim(),
        telegram_admin_chat_id: telegramAdminChatId.trim(),
        telegram_notifications_enabled: String(telegramNotificationsEnabled),
        provider_low_balance_threshold_usd: providerLowBalanceThreshold,
        maintenance_mode: maintenanceMode,
        auth_allow_email_signup: String(allowEmailSignup),
        auth_allow_google_login: String(allowGoogleLogin),
        auth_allow_registration: String(allowRegistration),
        referral_bonus_tier1_percent: refTier1,
        referral_bonus_tier2_percent: refTier2,
        referral_bonus_tier3_percent: refTier3,
        referral_bonus_window_days: refWindowDays,
      });

      if (typeof window !== 'undefined') {
        try {
          const finalBrand = brandName.trim() || 'OTPWala';
          const finalSep = titleSeparator.trim() || '—';
          const finalSlogan = brandSlogan.trim() || 'Instant Virtual Numbers for SMS Verification';

          localStorage.setItem('otpwala_branding', JSON.stringify({
            brandName: finalBrand,
            separator: finalSep,
            slogan: finalSlogan,
          }));

          localStorage.setItem('otpwala_auth_config', JSON.stringify({
            allowEmailSignup,
            allowGoogleLogin,
            allowRegistration,
          }));

          // Immediately update DOM title & elements
          const path = window.location.pathname;
          if (path === '/' || path === '') {
            document.title = `${finalBrand} ${finalSep} ${finalSlogan}`;
          } else {
            document.title = `Settings ${finalSep} ${finalBrand}`;
          }
          document.querySelectorAll('[data-brand-name]').forEach((el) => {
            el.textContent = finalBrand;
          });
          document.querySelectorAll('[data-brand-slogan]').forEach((el) => {
            el.textContent = finalSlogan;
          });
          document.querySelectorAll('[data-brand-separator]').forEach((el) => {
            el.textContent = finalSep;
          });
        } catch { }
      }

      setUsdToInr(effectiveRate);
      setSuccess(`All system settings successfully saved! Brand: "${brandName}", Rate: ₹${effectiveRate}/USD, Markup: ${defaultMarkup}%, Referral Window: ${refWindowDays} days.`);
      setRecentSave(true);
      setTimeout(() => setRecentSave(false), 2500);
      toast.success(`All system settings successfully saved! Brand: "${brandName}", Rate: ₹${effectiveRate}/USD, Markup: ${defaultMarkup}%`, 'Settings Saved');
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
      toast.error(err.message || 'Failed to save settings', 'Save Failed');
    } finally {
      setSavingKey(null);
    }
  };

  const handleTestTelegram = async () => {
    if (!telegramBotToken.trim()) {
      setError('Please enter your Telegram Bot Token before testing.');
      toast.warning('Please enter your Telegram Bot Token before testing.', 'Missing Token');
      return;
    }
    if (!telegramAdminChatId.trim()) {
      setError('Please enter your Telegram User ID / Chat ID before testing.');
      toast.warning('Please enter your Telegram User ID / Chat ID before testing.', 'Missing Chat ID');
      return;
    }

    setTestingTelegram(true);
    setTelegramTestResult(null);
    setError(null);
    try {
      const res = await testTelegramNotification(telegramBotToken.trim(), telegramAdminChatId.trim());
      setTelegramTestResult({
        success: true,
        message: res?.message || 'Test alert message successfully dispatched to Telegram!',
      });
      toast.success(res?.message || 'Test alert message successfully dispatched to Telegram!', 'Telegram Alert Sent');
    } catch (err: any) {
      setTelegramTestResult({
        success: false,
        message: err.message || 'Telegram test failed. Please check your token and chat ID.',
      });
      toast.error(err.message || 'Telegram test failed. Please check your token and chat ID.', 'Telegram Error');
    } finally {
      setTestingTelegram(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)' }}>
            System <span className="text-gradient">Settings</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Branding, Tiger SMS gateway, currency exchange rates, wallet limits, UPI, referrals, and access controls
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => loadSettings(true)}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: loading ? 'not-allowed' : 'pointer',
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
                <RefreshCwIcon size={14} className={loading ? 'animate-spin' : ''} />
                <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
              </>
            )}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => handleSaveAll()}
            disabled={savingKey === 'all'}
            title="Saves all configuration on this page across all categories"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontWeight: 600,
              backgroundColor: recentSave ? '#10b981' : undefined,
              borderColor: recentSave ? '#10b981' : undefined,
              transition: 'all 0.2s ease',
            }}
          >
            {recentSave ? (
              <>
                <CheckIcon size={14} />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <SaveIcon size={14} />
                <span>{savingKey === 'all' ? 'Saving All Settings...' : 'Save All Settings'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>
            <XIcon size={14} />
          </button>
        </div>
      )}

      {success && (
        <div className="alert alert-success" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircleIcon size={18} />
            <span>{success}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setSuccess(null)}>
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSaveAll} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* BRANDING, TITLE SEPARATOR & HOMEPAGE TAB SLOGAN */}
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid #6366f1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TagIcon size={20} color="#6366f1" />
                <span>Brand Identity &amp; Browser Tab Slogan</span>
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                Global website brand name, browser title separator, and homepage tab slogan. Changing here updates the whole site at once.
              </p>
            </div>
            <span className="badge badge-accent" style={{ fontSize: '0.75rem' }}>
              Site-Wide Variable
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Brand Name
              </label>
              <input
                type="text"
                required
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. OTPWala"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Shown in the logo, header, navbar, footer copyright, and notifications.
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Title Separator Character
              </label>
              <input
                type="text"
                required
                value={titleSeparator}
                onChange={(e) => setTitleSeparator(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. — or | or •"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Separator between page name and brand in browser tabs (e.g. &quot;—&quot;, &quot;|&quot;, or &quot;•&quot;).
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Homepage Tab Slogan
              </label>
              <input
                type="text"
                required
                value={brandSlogan}
                onChange={(e) => setBrandSlogan(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. Instant Virtual Numbers for SMS Verification"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Tagline appended to the brand name on the homepage browser tab.
              </span>
            </div>

          </div>

          {/* Live Browser Tab Preview Box */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Live Browser Tab Title Preview:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', width: '90px', fontSize: '0.75rem' }}>Homepage:</span>
                <strong style={{ color: 'var(--accent-primary)', background: 'rgba(99, 102, 241, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                  {brandName || 'OTPWala'} {titleSeparator || '—'} {brandSlogan || 'Instant Virtual Numbers for SMS Verification'}
                </strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', width: '90px', fontSize: '0.75rem' }}>Subpages:</span>
                <strong style={{ color: 'var(--text-primary)', background: 'rgba(255, 255, 255, 0.05)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                  Dashboard {titleSeparator || '—'} {brandName || 'OTPWala'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* UPSTREAM TIGER SMS PROVIDER HEALTH */}
        <div className="card glass-card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent-primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ServerIcon size={22} color="var(--accent-primary)" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Tiger SMS Gateway Connectivity</h2>
                  {tigerStatus === 'online' ? (
                    <span className="badge badge-success" style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span className="status-dot active pulse-dot" style={{ width: '6px', height: '6px' }}></span>
                      <span>Up &amp; Operational</span>
                    </span>
                  ) : tigerStatus === 'error' ? (
                    <span className="badge badge-error" style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span className="status-dot" style={{ width: '6px', height: '6px', background: '#ef4444' }}></span>
                      <span>Offline / Issue</span>
                    </span>
                  ) : (
                    <span className="badge badge-secondary" style={{ fontSize: '0.72rem' }}>Checking...</span>
                  )}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
                  Direct upstream provider for virtual SIMs &amp; SMS verification. Shows live operational status.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tiger Account Balance</div>
                <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-display)' }}>
                  ${parseFloat(tigerBalance?.balance || 0).toFixed(2)}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={checkTigerConnection}
                disabled={checkingTiger}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <ZapIcon size={14} className={checkingTiger ? 'animate-spin' : ''} />
                <span>{checkingTiger ? 'Verifying...' : 'Ping API Gateway'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* DOLLAR EXCHANGE RATE & FALLBACK MARKUP */}
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <DollarIcon size={20} color="#3b82f6" />
                <span>Master Dollar &amp; USDT Exchange Rate</span>
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                Single unified rate for 1 USD / 1 USDT in INR. Automatically applied to SMS number pricing, Binance Pay USDT wallet deposits, and dual currency displays.
              </p>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Master Rate: <strong style={{ color: 'var(--accent-primary)', fontSize: '0.95rem' }}>1 USD / USDT = ₹{rateMode === 'tiger_default' ? tigerDefaultRate : customDollarRate}</strong>
            </div>
          </div>

          {/* Dollar Rate Mode Selector */}
          <div style={{ marginBottom: '1.25rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Dollar Rate Policy</span>
              <span className="badge badge-accent" style={{ fontSize: '0.7rem' }}>Choose Calculation Mode</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              {/* Option 1: Tiger Default Rate */}
              <div
                onClick={() => setRateMode('tiger_default')}
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  border: rateMode === 'tiger_default' ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  background: rateMode === 'tiger_default' ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: rateMode === 'tiger_default' ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                    Tiger Default Rate
                  </span>
                  <input
                    type="radio"
                    name="rate_mode"
                    checked={rateMode === 'tiger_default'}
                    onChange={() => setRateMode('tiger_default')}
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399', marginBottom: '0.25rem' }}>
                  ₹{tigerDefaultRate} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>/ 1 USD</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Standard upstream baseline rate from Tiger SMS provider.
                </div>
              </div>

              {/* Option 2: Custom Dollar Rate */}
              <div
                onClick={() => setRateMode('custom')}
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  border: rateMode === 'custom' ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  background: rateMode === 'custom' ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: rateMode === 'custom' ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                    Custom Dollar Rate
                  </span>
                  <input
                    type="radio"
                    name="rate_mode"
                    checked={rateMode === 'custom'}
                    onChange={() => setRateMode('custom')}
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-primary)', marginBottom: '0.25rem' }}>
                  ₹{customDollarRate} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>/ 1 USD</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Manual override. Define your custom exchange conversion rate.
                </div>
              </div>
            </div>

            {/* Dollar Rate Configuration */}
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                {rateMode === 'tiger_default' ? 'Tiger Default Baseline (₹)' : 'Enter Custom Dollar Rate (₹)'}
              </label>
              {rateMode === 'tiger_default' ? (
                <input
                  type="number"
                  step="0.01"
                  disabled
                  value={tigerDefaultRate}
                  className="input"
                  style={{ width: '100%', opacity: 0.85, background: 'var(--bg-input)' }}
                />
              ) : (
                <input
                  type="number"
                  step="0.01"
                  required
                  value={customDollarRate}
                  onChange={(e) => setCustomDollarRate(e.target.value)}
                  className="input"
                  style={{ width: '100%' }}
                  placeholder="e.g. 88.50"
                />
              )}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
              Global Fallback Markup (%)
            </label>
            <input
              type="number"
              step="1"
              required
              value={defaultMarkup}
              onChange={(e) => setDefaultMarkup(e.target.value)}
              className="input"
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
              Applied to all services if no specific override rule is found in Pricing Manager.
            </span>
          </div>
        </div>

        {/* CUSTOMER WALLET DEPOSIT LIMITS & PRESETS */}
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid #10b981' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CreditCardIcon size={20} color="#10b981" />
              <span>Wallet Limits &amp; Quick Deposit Chips</span>
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
              Control deposit thresholds and customize the 5 quick-select amount chips on the customer top-up page
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Minimum Deposit Amount (₹)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                required
                value={minDeposit}
                onChange={(e) => setMinDeposit(e.target.value)}
                className="input"
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Minimum amount users are allowed to deposit.
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Maximum Deposit Amount (₹)
              </label>
              <input
                type="number"
                step="1"
                min="10"
                required
                value={maxDeposit}
                onChange={(e) => setMaxDeposit(e.target.value)}
                className="input"
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Maximum limit per single wallet deposit request.
              </span>
            </div>
          </div>

          {/* Amount Suggestions */}
          <div style={{ paddingTop: '1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                Suggested Deposit Amounts (5 Quick Chips)
              </label>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Displayed as quick-select pills on the customer wallet top-up page
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Slot 1 (₹)</span>
                <input
                  type="number"
                  min={minDeposit || '1'}
                  max={maxDeposit || undefined}
                  value={suggestion1}
                  onChange={(e) => setSuggestion1(e.target.value)}
                  className="input input-sm"
                  placeholder="₹50"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Slot 2 (₹)</span>
                <input
                  type="number"
                  min={minDeposit || '1'}
                  max={maxDeposit || undefined}
                  value={suggestion2}
                  onChange={(e) => setSuggestion2(e.target.value)}
                  className="input input-sm"
                  placeholder="₹100"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Slot 3 (₹)</span>
                <input
                  type="number"
                  min={minDeposit || '1'}
                  max={maxDeposit || undefined}
                  value={suggestion3}
                  onChange={(e) => setSuggestion3(e.target.value)}
                  className="input input-sm"
                  placeholder="₹200"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Slot 4 (₹)</span>
                <input
                  type="number"
                  min={minDeposit || '1'}
                  max={maxDeposit || undefined}
                  value={suggestion4}
                  onChange={(e) => setSuggestion4(e.target.value)}
                  className="input input-sm"
                  placeholder="₹300"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Slot 5 (₹)</span>
                <input
                  type="number"
                  min={minDeposit || '1'}
                  max={maxDeposit || undefined}
                  value={suggestion5}
                  onChange={(e) => setSuggestion5(e.target.value)}
                  className="input input-sm"
                  placeholder="₹500"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {/* Live Pill Preview */}
            <div style={{ marginTop: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Pill Preview:</span>
              {[suggestion1, suggestion2, suggestion3, suggestion4, suggestion5]
                .filter((s) => s && !isNaN(Number(s)) && Number(s) >= Number(minDeposit) && Number(s) <= Number(maxDeposit))
                .slice(0, 5)
                .map((amt, idx) => (
                  <span
                    key={idx}
                    className="btn btn-secondary btn-sm"
                    style={{
                      padding: '0.25rem 0.65rem',
                      fontSize: '0.8rem',
                      borderRadius: 'var(--radius-full)',
                      pointerEvents: 'none',
                    }}
                  >
                    ₹{amt}
                  </span>
                ))}
            </div>
          </div>
        </div>

        {/* UPI PAYMENT GATEWAY & SUPPORT */}
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CreditCardIcon size={20} color="#f59e0b" />
                <span>UPI Payment Gateway &amp; Support Contact</span>
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                UPI payment recipient address, payee name for QR generation, and official customer support handle
              </p>
            </div>
            <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
              UPI Direct Transfers
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Admin UPI VPA / Handle
              </label>
              <input
                type="text"
                required
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. yourname@okaxis"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Displayed to users on the deposit screen for QR code generation and manual transfers.
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Payee Business Name
              </label>
              <input
                type="text"
                required
                value={upiName}
                onChange={(e) => setUpiName(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. OTPWala"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Merchant name displayed during UPI payments.
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Telegram Support Handle
              </label>
              <input
                type="text"
                value={supportTelegram}
                onChange={(e) => setSupportTelegram(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="@YourSupportHandle"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Linked on footer, payment screens, and error popups for customer assistance.
              </span>
            </div>
          </div>
        </div>

        {/* BINANCE PAY (CRYPTO / USDT DEPOSITS) */}
        <div className="card" style={{ padding: '1.5rem', border: '1px solid rgba(245, 158, 11, 0.3)', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.03) 0%, rgba(217, 119, 6, 0.01) 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L6.5 7.5L8.6 9.6L12 6.2L15.4 9.6L17.5 7.5L12 2ZM2 12L7.5 6.5L9.6 8.6L6.2 12L9.6 15.4L7.5 17.5L2 12ZM12 22L17.5 16.5L15.4 14.4L12 17.8L8.6 14.4L6.5 16.5L12 22ZM22 12L16.5 17.5L14.4 15.4L17.8 12L14.4 8.6L16.5 6.5L22 12ZM12 9.5L9.5 12L12 14.5L14.5 12L12 9.5Z" />
                </svg>
              </div>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Binance Pay (Crypto / USDT)</span>
                  <span className="badge" style={{ fontSize: '0.68rem', padding: '2px 8px', background: binancePayEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)', color: binancePayEnabled ? '#10b981' : 'var(--text-muted)' }}>
                    {binancePayEnabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Accept direct USDT transfers to your personal Binance Pay ID with manual order verification.
                </span>
              </div>
            </div>

            {/* Enable/Disable Toggle */}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={binancePayEnabled}
                onChange={(e) => setBinancePayEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Enable Binance Pay</span>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Your Binance Pay ID
              </label>
              <input
                type="text"
                value={binancePayId}
                onChange={(e) => setBinancePayId(e.target.value)}
                className="input"
                style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                placeholder="e.g. 839210291"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Found in Binance App → Pay → My Pay ID (numerical ID).
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Binance Nickname / Account Name
              </label>
              <input
                type="text"
                value={binancePayNickname}
                onChange={(e) => setBinancePayNickname(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. OTPWalaOfficial"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Shown to users to confirm they are sending to the right Binance account.
              </span>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                  USDT Exchange Rate (₹ per 1 USDT)
                </label>
                <span className="badge badge-accent" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                  Unified with Master USD Rate
                </span>
              </div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: '#10b981' }}>₹</span>
                <input
                  type="number"
                  step="any"
                  min="1"
                  value={rateMode === 'tiger_default' ? tigerDefaultRate : customDollarRate}
                  onChange={(e) => {
                    setRateMode('custom');
                    setCustomDollarRate(e.target.value);
                    setUsdtInrRate(e.target.value);
                  }}
                  className="input"
                  style={{ width: '100%', paddingLeft: '2rem', fontWeight: 700 }}
                  placeholder="115"
                />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                1 USDT = $1.00 USD (≈ ₹{rateMode === 'tiger_default' ? tigerDefaultRate : customDollarRate}). Changing this sets the single unified rate across numbers, crypto deposits, and wallet.
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Minimum Binance Deposit (USDT / $)
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: '#b45309' }}>$</span>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  required
                  value={binanceMinDeposit}
                  onChange={(e) => setBinanceMinDeposit(e.target.value)}
                  className="input"
                  style={{ width: '100%', paddingLeft: '2rem', fontWeight: 700 }}
                  placeholder="1"
                />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Minimum USDT users can deposit (e.g. 1 USDT ≈ ₹{Math.round((parseFloat(binanceMinDeposit) || 1) * (parseFloat(usdtInrRate) || 90))}).
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Maximum Binance Deposit (USDT / $)
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: '#b45309' }}>$</span>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  value={binanceMaxDeposit}
                  onChange={(e) => setBinanceMaxDeposit(e.target.value)}
                  className="input"
                  style={{ width: '100%', paddingLeft: '2rem', fontWeight: 700 }}
                  placeholder="500"
                />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Maximum USDT limit per deposit request (e.g. {binanceMaxDeposit} USDT ≈ ₹{Math.round((parseFloat(binanceMaxDeposit) || 500) * (parseFloat(usdtInrRate) || 90)).toLocaleString('en-IN')}).
              </span>
            </div>

            {/* Binance Suggested Amounts (5 Quick Chips) */}
            <div style={{ gridColumn: '1 / -1', paddingTop: '1rem', borderTop: '1px solid rgba(245, 158, 11, 0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Binance Suggested Deposit Amounts (5 Quick Chips in USDT / $)
                </label>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Quick-select pills displayed on the customer Binance Pay deposit tab
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.75rem' }}>
                {[
                  { label: 'Slot 1 (USDT)', val: binanceSuggestion1, setVal: setBinanceSuggestion1, placeholder: '1' },
                  { label: 'Slot 2 (USDT)', val: binanceSuggestion2, setVal: setBinanceSuggestion2, placeholder: '2' },
                  { label: 'Slot 3 (USDT)', val: binanceSuggestion3, setVal: setBinanceSuggestion3, placeholder: '5' },
                  { label: 'Slot 4 (USDT)', val: binanceSuggestion4, setVal: setBinanceSuggestion4, placeholder: '10' },
                  { label: 'Slot 5 (USDT)', val: binanceSuggestion5, setVal: setBinanceSuggestion5, placeholder: '20' },
                ].map((slot, i) => (
                  <div key={i}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>
                      {slot.label}
                    </span>
                    <input
                      type="number"
                      step="any"
                      min={binanceMinDeposit || '0.1'}
                      max={binanceMaxDeposit || undefined}
                      value={slot.val}
                      onChange={(e) => slot.setVal(e.target.value)}
                      className="input input-sm"
                      placeholder={`$${slot.placeholder}`}
                      style={{ width: '100%', fontWeight: 600 }}
                    />
                  </div>
                ))}
              </div>

              {/* Binance Live Pill Preview */}
              <div style={{ marginTop: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Pill Preview:</span>
                {[binanceSuggestion1, binanceSuggestion2, binanceSuggestion3, binanceSuggestion4, binanceSuggestion5]
                  .filter((s) => s && !isNaN(Number(s)) && Number(s) >= Number(binanceMinDeposit) && Number(s) <= Number(binanceMaxDeposit))
                  .slice(0, 5)
                  .map((amt, idx) => {
                    const usdtNum = parseFloat(amt);
                    const rateNum = parseFloat(usdtInrRate) || 90;
                    const inrEq = Math.round(usdtNum * rateNum);
                    return (
                      <span
                        key={idx}
                        className="badge"
                        style={{
                          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.25) 100%)',
                          color: '#d97706',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: '999px',
                        }}
                      >
                        ${amt} (≈ ₹{inrEq.toLocaleString('en-IN')})
                      </span>
                    );
                  })}
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.88rem', fontWeight: 700, margin: 0 }}>
                  Official Binance Pay QR Image URL <span style={{ color: '#ef4444' }}>* (Mandatory)</span>
                </label>
                <span className="badge badge-warning" style={{ fontSize: '0.7rem', fontWeight: 700 }}>
                  1:1 Square Crop Required
                </span>
              </div>

              {/* Comprehensive Binance QR Instruction & Hosting Guide */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(251, 191, 36, 0.09) 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: '10px',
                  padding: '1rem 1.15rem',
                  marginBottom: '0.85rem',
                  fontSize: '0.825rem',
                  lineHeight: 1.55,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, color: '#b45309', marginBottom: '0.45rem' }}>
                  <AlertCircleIcon size={16} color="#d97706" />
                  <span>Important: Use Official Binance QR Code Only (Crop in 1:1)</span>
                </div>
                <p style={{ margin: '0 0 0.65rem 0', color: 'var(--text-secondary)' }}>
                  Auto-generated numerical QR codes are rejected by the Binance App scanner with an <em>"Invalid QR Code"</em> error. You <strong>must</strong> export your real, official QR code directly from Binance:
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
                  <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                      📸 1. Export from Binance &amp; Crop 1:1
                    </div>
                    <ol style={{ margin: 0, paddingLeft: '1.15rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      <li>Open <strong>Binance App</strong> &rarr; tap <strong>Pay</strong> &rarr; <strong>Receive</strong>.</li>
                      <li>Save or take a screenshot of your personal Binance Pay QR code.</li>
                      <li><strong>Crop the image to a strict 1:1 square ratio</strong> (centered around the QR pattern and Binance logo).</li>
                    </ol>
                  </div>

                  <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                      ☁️ 2. Upload to Cloudflare Pages or Supabase
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.15rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      <li>
                        <strong>Cloudflare Pages:</strong> Drop your cropped 1:1 image file into <code>apps/web/public/binance-qr.png</code> and enter <code>/binance-qr.png</code> below.
                      </li>
                      <li>
                        <strong>Supabase Storage:</strong> Upload your 1:1 image to a public bucket in your Supabase project (e.g. <code>brand-assets</code>) and paste the public HTTPS URL below.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <input
                type="text"
                value={binancePayQrUrl}
                onChange={(e) => setBinancePayQrUrl(e.target.value)}
                className="input"
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
                placeholder="https://.../binance-qr.png or /binance-qr.png"
                required={binancePayEnabled}
              />

              {/* Real-time 1:1 Image Preview */}
              {binancePayQrUrl.trim() ? (
                <div style={{ marginTop: '0.85rem', display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ width: '90px', height: '90px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #f59e0b', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '4px' }}>
                    <img
                      src={binancePayQrUrl.trim()}
                      alt="Official Binance QR Preview"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', aspectRatio: '1/1' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) parent.innerHTML = '<span style="font-size:0.68rem; color:#ef4444; font-weight:600; text-align:center;">Failed to load image</span>';
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <CheckCircleIcon size={16} />
                      <span>Official 1:1 QR Image Preview Active</span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                      This official QR code will be displayed to users in the Top-Up / Wallet page for direct scanning in the Binance App.
                    </p>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: binancePayEnabled ? '#ef4444' : 'var(--text-muted)', fontWeight: binancePayEnabled ? 600 : 400 }}>
                  {binancePayEnabled
                    ? '⚠️ Official Binance Pay QR URL is mandatory. Please upload your 1:1 cropped QR image and paste the URL above.'
                    : 'Enter the URL of your 1:1 cropped Binance QR image.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TELEGRAM BOT NOTIFICATIONS FOR PAYMENT APPROVAL */}
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid #0284c7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TelegramIcon size={20} style={{ color: '#0284c7' }} />
                <span>Telegram Bot Alerts</span>
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                Payment approval alerts plus low-provider-balance alerts sent directly to your Telegram chat.
              </p>
            </div>
            <span className={`badge ${telegramNotificationsEnabled && telegramBotToken && telegramAdminChatId ? 'badge-success' : 'badge-ghost'}`} style={{ fontSize: '0.75rem' }}>
              {telegramNotificationsEnabled && telegramBotToken && telegramAdminChatId ? 'Alerts Active' : 'Unconfigured'}
            </span>
          </div>

          <div style={{
            background: 'rgba(2, 132, 199, 0.05)',
            border: '1px solid rgba(2, 132, 199, 0.2)',
            borderRadius: '10px',
            padding: '0.9rem 1.1rem',
            marginBottom: '1.25rem',
            fontSize: '0.84rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>Quick Setup Guide:</strong>
            <ol style={{ margin: '0.35rem 0 0 0', paddingLeft: '1.25rem' }}>
              <li>Create your personal bot on Telegram via <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>@BotFather</a> and copy the HTTP API <strong>Bot Token</strong>.</li>
              <li>Start your bot, then get your numerical <strong>User ID / Chat ID</strong> from <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>@userinfobot</a> or <a href="https://t.me/raw_data_bot" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>@raw_data_bot</a>.</li>
              <li>Paste both fields below and click <strong>Test Connection &amp; Send Alert</strong> to confirm delivery.</li>
            </ol>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Telegram Bot Token
              </label>
              <input
                type="text"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                className="input"
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
                placeholder="e.g. 7123456789:AAH78eXyzExampleToken..."
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Provided by @BotFather when creating your notification bot.
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Admin Telegram User ID / Chat ID
              </label>
              <input
                type="text"
                value={telegramAdminChatId}
                onChange={(e) => setTelegramAdminChatId(e.target.value)}
                className="input"
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                placeholder="e.g. 123456789"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Your unique numerical Telegram ID where alerts will be delivered.
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Low Provider Balance Threshold (USD)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={providerLowBalanceThreshold}
                onChange={(e) => setProviderLowBalanceThreshold(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="5.00"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Telegram sends at most two low-balance alerts per IST day: one before noon and one after noon.
              </span>
            </div>
          </div>

          <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={telegramNotificationsEnabled}
                onChange={(e) => setTelegramNotificationsEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                Enable Telegram Bot payment alerts
              </span>
            </label>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={testingTelegram || !telegramBotToken.trim() || !telegramAdminChatId.trim()}
              onClick={handleTestTelegram}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              {testingTelegram ? (
                <>
                  <RefreshCwIcon size={14} className="animate-spin" />
                  <span>Sending Test Alert...</span>
                </>
              ) : (
                <>
                  <TelegramIcon size={14} style={{ color: '#0284c7' }} />
                  <span>Test Connection &amp; Send Alert</span>
                </>
              )}
            </button>
          </div>

          {telegramTestResult && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: telegramTestResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${telegramTestResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: telegramTestResult.success ? '#10b981' : '#ef4444',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {telegramTestResult.success ? <CheckCircleIcon size={16} /> : <AlertCircleIcon size={16} />}
                <span>{telegramTestResult.message}</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setTelegramTestResult(null)}
                style={{ padding: '0.2rem', minHeight: 'auto' }}
              >
                <XIcon size={14} />
              </button>
            </div>
          )}
        </div>

        {/* REFER & EARN COMMISSION PROGRAM */}
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid #a855f7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UsersIcon size={20} color="#a855f7" />
                <span>Refer &amp; Earn Commission Program</span>
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                Reward percentages and eligibility duration for referrers when their referred friends deposit funds
              </p>
            </div>
            <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
              Multi-Tier Deposit Rewards
            </span>
          </div>

          <div style={{
            background: 'rgba(168, 85, 247, 0.05)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: '10px',
            padding: '0.9rem 1.1rem',
            marginBottom: '1.25rem',
            fontSize: '0.84rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.45,
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>Commission Rules:</strong> Configure bonus percentages credited to referrers when their referred friends make wallet deposits.
            <span style={{ color: '#a855f7', fontWeight: 600, display: 'block', marginTop: '0.25rem' }}>
              The 2nd and 3rd deposit bonuses can only be rewarded if deposited within the configured eligibility window below.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                1st Deposit Bonus (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                required
                value={refTier1}
                onChange={(e) => setRefTier1(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="20"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Rewarded on referred user&apos;s 1st deposit.
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                2nd Deposit Bonus (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                required
                value={refTier2}
                onChange={(e) => setRefTier2(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="5"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Rewarded on referred user&apos;s 2nd deposit (within eligibility window).
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                3rd Deposit Bonus (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                required
                value={refTier3}
                onChange={(e) => setRefTier3(e.target.value)}
                className="input"
                style={{ width: '100%' }}
                placeholder="5"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Rewarded on referred user&apos;s 3rd deposit (within eligibility window).
              </span>
            </div>

            {/* Configurable Eligibility Duration Window */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Reward Eligibility Window (Days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                step="1"
                required
                value={refWindowDays}
                onChange={(e) => setRefWindowDays(e.target.value)}
                className="input"
                style={{ width: '100%', borderColor: 'rgba(168, 85, 247, 0.4)' }}
                placeholder="30"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                2nd &amp; 3rd deposit bonuses are only rewarded if deposited within this number of days after registration.
              </span>
            </div>
          </div>
        </div>

        {/* USER ACCESS & MAINTENANCE MODE */}
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid #ef4444' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldIcon size={20} color="#ef4444" />
                <span>Authentication &amp; Platform Access Controls</span>
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                Sign-up methods, Google login toggle, registration master switch, and full-site maintenance mode
              </p>
            </div>
            <span className={allowRegistration ? 'badge badge-success' : 'badge badge-error'} style={{ fontSize: '0.75rem' }}>
              {allowRegistration ? 'Registrations Open' : 'Registrations Closed'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Control 1: Master Registration Switch */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: allowRegistration ? 'var(--bg-secondary)' : 'var(--error-bg)',
              border: allowRegistration ? '1px solid var(--border-subtle)' : '1px solid var(--error-border)',
              transition: 'all var(--transition-fast)'
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Allow User Registration</span>
                  <span className={allowRegistration ? 'badge badge-success' : 'badge badge-error'} style={{ fontSize: '0.7rem' }}>
                    {allowRegistration ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Master switch. When disabled, all new user registrations (both Email &amp; Google) are blocked.
                </div>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allowRegistration}
                  onChange={(e) => setAllowRegistration(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: allowRegistration ? '#2563eb' : '#cbd5e1',
                  borderRadius: '26px',
                  transition: '0.2s',
                }}>
                  <span style={{
                    position: 'absolute',
                    height: '20px',
                    width: '20px',
                    left: allowRegistration ? '25px' : '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }} />
                </span>
              </label>
            </div>

            {/* Control 2: Email Sign Up */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Allow Email Sign Up</span>
                  <span className={allowEmailSignup ? 'badge badge-success' : 'badge badge-warning'} style={{ fontSize: '0.7rem' }}>
                    {allowEmailSignup ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Allow new users to sign up using email and password.
                </div>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allowEmailSignup}
                  onChange={(e) => setAllowEmailSignup(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: allowEmailSignup ? '#2563eb' : '#cbd5e1',
                  borderRadius: '26px',
                  transition: '0.2s',
                }}>
                  <span style={{
                    position: 'absolute',
                    height: '20px',
                    width: '20px',
                    left: allowEmailSignup ? '25px' : '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }} />
                </span>
              </label>
            </div>

            {/* Control 3: Google Log In */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Allow Google Log In</span>
                  <span className={allowGoogleLogin ? 'badge badge-success' : 'badge badge-warning'} style={{ fontSize: '0.7rem' }}>
                    {allowGoogleLogin ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Enable the &quot;Sign in with Google&quot; OAuth button on login and registration pages.
                </div>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allowGoogleLogin}
                  onChange={(e) => setAllowGoogleLogin(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: allowGoogleLogin ? '#2563eb' : '#cbd5e1',
                  borderRadius: '26px',
                  transition: '0.2s',
                }}>
                  <span style={{
                    position: 'absolute',
                    height: '20px',
                    width: '20px',
                    left: allowGoogleLogin ? '25px' : '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }} />
                </span>
              </label>
            </div>

            {/* Control 4: Full-Site Maintenance Mode */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem',
              borderRadius: 'var(--radius-md)',
              background: maintenanceMode === 'true' ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-secondary)',
              border: maintenanceMode === 'true' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-subtle)',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Entire Site Maintenance Mode</span>
                  {maintenanceMode === 'true' ? (
                    <span className="badge badge-error" style={{ fontSize: '0.72rem' }}>SITE UNDER MAINTENANCE</span>
                  ) : (
                    <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>PLATFORM LIVE</span>
                  )}
                </div>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: 1.4 }}>
                  Put the entire website under maintenance. When active, all public pages, dashboard, and number purchases display a full-screen maintenance notice to all non-admin visitors. Administrators retain full access to this admin panel.
                </div>
              </div>
              <select
                value={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.value)}
                className="input input-sm"
                style={{
                  width: 'auto',
                  minWidth: '220px',
                  borderColor: maintenanceMode === 'true' ? '#ef4444' : undefined,
                  fontWeight: 600,
                }}
              >
                <option value="false">Live (Normal Operation)</option>
                <option value="true">Entire Site Under Maintenance</option>
              </select>
            </div>
          </div>
        </div>

        {/* BOTTOM SAVE BAR */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '1.25rem 1.5rem',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              Ready to save all settings?
            </div>
            <div style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Commits all platform configuration: Brand Identity, Tiger SMS Gateway, Dollar Exchange Rate, Margins, Wallet Limits, UPI Setup, Referrals, and Maintenance Controls.
            </div>
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={savingKey === 'all'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 700,
              backgroundColor: recentSave ? '#10b981' : undefined,
              borderColor: recentSave ? '#10b981' : undefined,
              transition: 'all 0.2s ease',
            }}
          >
            {recentSave ? (
              <>
                <CheckIcon size={18} />
                <span>Saved Successfully!</span>
              </>
            ) : (
              <>
                <SaveIcon size={18} />
                <span>{savingKey === 'all' ? 'Saving All Settings...' : 'Save All Settings'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
