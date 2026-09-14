import { useState, useEffect, useRef } from 'react';
import { getServices, getServiceCountries, getPrice, buyNumber as apiBuyNumber, getOrderStatus, cancelOrder, completeOrder, retryOrder, getWallet, getOrders } from '../../lib/api';
import {
  ShoppingCartIcon,
  SearchIcon,
  SmartphoneIcon,
  ArrowLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  CheckIcon,
  RefreshCwIcon,
  CopyIcon,
  AlertCircleIcon,
  StarIcon,
  XIcon,
  ArrowUpDownIcon,
} from '../ui/Icons';
import {
  WhatsAppIcon,
  TelegramIcon,
  GoogleIcon,
  InstagramIcon,
  FacebookIcon,
  TwitterXIcon,
  TikTokIcon,
  OpenAIIcon,
  MicrosoftIcon,
  AppleIcon,
  AmazonIcon,
  NetflixIcon,
  DiscordIcon,
  UberIcon,
  SnapchatIcon,
  TinderIcon,
  SpotifyIcon,
  LinkedInIcon,
  RedditIcon,
  SteamIcon,
  PayPalIcon,
  YahooIcon,
  ViberIcon,
  LineIcon,
} from '../ui/BrandIcons';

type Step = 'service' | 'country' | 'confirm' | 'waiting' | 'received' | 'expired' | 'messages';

function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

function showSuccessToast(message: string) {
  if (typeof document === 'undefined') return;

  let container = document.querySelector('.toast-container') as HTMLElement | null;
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.style.borderColor = 'rgba(16, 185, 129, 0.55)';
  toast.style.color = '#34d399';
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
    if (container && !container.children.length) container.remove();
  }, 6000);
}

export function renderServiceIcon(serviceOrCode: any, size = 26) {
  const isObj = typeof serviceOrCode === 'object' && serviceOrCode !== null;
  const code = (isObj ? serviceOrCode.code : serviceOrCode || '').toLowerCase().trim();
  const name = isObj ? serviceOrCode.name : code;
  const iconUrl = isObj ? serviceOrCode.iconUrl : null;

  // Prefer a crisp local brand icon whenever one exists.
  // This guarantees icons NEVER change, flicker, or get replaced when services finish loading.
  if (code === 'wa' || code === 'wa2') return <WhatsAppIcon size={size} style={{ color: '#25D366' }} />;
  if (code === 'tg' || code === 'eh') return <TelegramIcon size={size} style={{ color: '#229ED9' }} />;
  if (code === 'go' || code === 'gch' || code === 'gms' || code === 'gpy' || code === 'gf') return <GoogleIcon size={size} />;
  if (code === 'ig') return <InstagramIcon size={size} style={{ color: '#E1306C' }} />;
  if (code === 'dr') return <OpenAIIcon size={size} style={{ color: '#10A37F' }} />;
  if (code === 'fb') return <FacebookIcon size={size} style={{ color: '#1877F2' }} />;
  if (code === 'tw') return <TwitterXIcon size={size} style={{ color: '#FFFFFF' }} />;
  if (code === 'lf') return <TikTokIcon size={size} style={{ color: '#FE2C55' }} />;
  if (code === 'mm') return <MicrosoftIcon size={size} />;
  if (code === 'wx') return <AppleIcon size={size} style={{ color: '#E5E7EB' }} />;
  if (code === 'am') return <AmazonIcon size={size} style={{ color: '#FF9900' }} />;
  if (code === 'nf') return <NetflixIcon size={size} style={{ color: '#E50914' }} />;
  if (code === 'ds') return <DiscordIcon size={size} style={{ color: '#5865F2' }} />;
  if (code === 'ub') return <UberIcon size={size} style={{ color: '#FFFFFF' }} />;
  if (code === 'fu') return <SnapchatIcon size={size} style={{ color: '#FFFC00' }} />;
  if (code === 'oi') return <TinderIcon size={size} style={{ color: '#FE3C72' }} />;
  if (code === 'so' || code === 'spot') return <SpotifyIcon size={size} style={{ color: '#1ED760' }} />;
  if (code === 'ln') return <LinkedInIcon size={size} style={{ color: '#0A66C2' }} />;
  if (code === 'rd') return <RedditIcon size={size} style={{ color: '#FF4500' }} />;
  if (code === 'mt' || code === 'steam') return <SteamIcon size={size} style={{ color: '#66C0F4' }} />;
  if (code === 'ts') return <PayPalIcon size={size} style={{ color: '#0079C1' }} />;
  if (code === 'mb') return <YahooIcon size={size} style={{ color: '#6001D2' }} />;
  if (code === 'vi') return <ViberIcon size={size} style={{ color: '#7360F2' }} />;
  if (code === 'me') return <LineIcon size={size} style={{ color: '#00C300' }} />;

  // PRIORITY 2: Remote iconUrl fallback for niche third-party catalog items without a dedicated local SVG
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={name}
        width={size}
        height={size}
        style={{ objectFit: 'contain', display: 'block', maxWidth: `${size}px`, maxHeight: `${size}px` }}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = 'https://tiger-sms.com/img/service/unknown.svg';
        }}
      />
    );
  }

  // PRIORITY 3: Default smartphone icon
  return <SmartphoneIcon size={Math.max(16, size - 4)} color="var(--accent-primary)" />;
}

export function renderCountryFlag(country: any, width = 22, height = 15) {
  if (!country) return null;
  const iso = (country.iso || 'un').toUpperCase();
  const tigerFlagUrl = country.flagUrl || `https://tiger-sms.com/img/country/${iso}.svg`;
  const fallbackUrl = `https://flagcdn.com/${iso.toLowerCase()}.svg`;

  return (
    <img
      src={tigerFlagUrl}
      alt={country.name || iso}
      width={width}
      height={height}
      style={{
        borderRadius: '3px',
        objectFit: 'cover',
        display: 'inline-block',
        verticalAlign: 'middle',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.12)',
        flexShrink: 0,
      }}
      loading="lazy"
      onError={(e) => {
        if (e.currentTarget.src !== fallbackUrl) {
          e.currentTarget.src = fallbackUrl;
        }
      }}
    />
  );
}

function getServiceBg(code: string) {
  const c = (code || '').toLowerCase().trim();
  if (c === 'wa' || c === 'wa2') return 'rgba(37, 211, 102, 0.15)';
  if (c === 'tg' || c === 'eh') return 'rgba(34, 158, 217, 0.15)';
  if (c === 'go' || c === 'gch' || c === 'gms' || c === 'gpy' || c === 'gf') return 'rgba(234, 67, 53, 0.15)';
  if (c === 'ig') return 'rgba(225, 48, 108, 0.15)';
  if (c === 'dr') return 'rgba(16, 163, 127, 0.15)';
  if (c === 'fb') return 'rgba(24, 119, 242, 0.15)';
  if (c === 'tw') return 'rgba(255, 255, 255, 0.12)';
  if (c === 'lf') return 'rgba(254, 44, 85, 0.15)';
  if (c === 'mm') return 'rgba(0, 164, 239, 0.15)';
  if (c === 'wx') return 'rgba(255, 255, 255, 0.12)';
  if (c === 'am') return 'rgba(255, 153, 0, 0.15)';
  if (c === 'nf') return 'rgba(229, 9, 20, 0.15)';
  if (c === 'ds') return 'rgba(88, 101, 242, 0.15)';
  if (c === 'ub') return 'rgba(255, 255, 255, 0.12)';
  if (c === 'fu') return 'rgba(255, 252, 0, 0.15)';
  if (c === 'oi') return 'rgba(254, 60, 114, 0.15)';
  if (c === 'so' || c === 'spot') return 'rgba(30, 215, 96, 0.15)';
  if (c === 'ln') return 'rgba(10, 102, 194, 0.15)';
  if (c === 'rd') return 'rgba(255, 69, 0, 0.15)';
  if (c === 'mt' || c === 'steam') return 'rgba(102, 192, 244, 0.15)';
  if (c === 'ts') return 'rgba(0, 121, 193, 0.15)';
  if (c === 'mb') return 'rgba(96, 1, 210, 0.15)';
  if (c === 'vi') return 'rgba(115, 96, 242, 0.15)';
  if (c === 'me') return 'rgba(0, 195, 0, 0.15)';
  return 'var(--accent-glow)';
}

export type ServiceSortOption = 'featured' | 'name_asc' | 'name_desc';
export type CountrySortOption = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_desc';

export default function BuyNumber() {
  const [step, setStep] = useState<Step>('service');
  const [services, setServices] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [priceInfo, setPriceInfo] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [otpData, setOtpData] = useState<any>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(1200);
  const [loading, setLoading] = useState(false);
  const [buyingCountryId, setBuyingCountryId] = useState<number | null>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [serviceSort, setServiceSort] = useState<ServiceSortOption>('featured');
  const [countrySort, setCountrySort] = useState<CountrySortOption>('name_asc');
  const [countryFilter, setCountryFilter] = useState<'all' | 'cheap'>('all');
  const [copied, setCopied] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [allServicesLoaded, setAllServicesLoaded] = useState(false);
  const [totalServicesCount, setTotalServicesCount] = useState(0);
  const [showAllCountries, setShowAllCountries] = useState(false);
  const [allCountries, setAllCountries] = useState<any[]>([]);
  const [loadingAllCountries, setLoadingAllCountries] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadServices();
    checkActiveParam();
    loadWalletBalance();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function loadWalletBalance() {
    try {
      const data = await getWallet();
      setWalletBalance(parseFloat(String(data.balance)) || 0);
    } catch {
      // Ignore
    }
  }

  async function loadRecentOrders() {
    try {
      const data = await getOrders(10, 0);
      setRecentOrders(data.orders || []);
    } catch {}
  }

  // Timer countdown effect for waiting / messages step
  useEffect(() => {
    if (step !== 'waiting' && step !== 'messages') return;
    if (order?.status !== 'waiting') return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (pollRef.current) clearInterval(pollRef.current);
          setOrder((prevOrd: any) => ({ ...prevOrd, status: 'expired' }));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step, order?.status]);

  async function checkActiveParam() {
    loadRecentOrders();
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const activeId = params.get('active');

    if (!activeId) {
      // Check if user has an active waiting order
      try {
        const data = await getOrders(1, 0, 'waiting');
        if (data && data.orders && data.orders.length > 0) {
          const act = data.orders[0];
          setOrder({
            orderId: act.id,
            phoneNumber: act.phone_number,
            serviceName: act.service_name,
            serviceCode: act.service_code,
            countryName: act.country_name,
            priceInr: parseFloat(act.sell_price_inr) || 0,
            status: act.status,
            createdAt: act.created_at,
          });
          const elapsed = act.created_at ? Math.floor((Date.now() - new Date(act.created_at).getTime()) / 1000) : 0;
          setSecondsLeft(Math.max(0, 1200 - elapsed));
          setStep('messages');
          startPolling(act.id);
        }
      } catch {}
      return;
    }

    try {
      const status = await getOrderStatus(activeId);
      if (status) {
        setOrder({
          orderId: status.orderId || activeId,
          phoneNumber: status.phoneNumber,
          serviceName: status.serviceName,
          countryName: status.countryName,
          priceInr: status.priceInr,
          status: status.status,
          smsCode: status.smsCode,
          smsText: status.smsText || status.text,
          createdAt: status.createdAt,
        });
        setSelectedService({ name: status.serviceName, code: status.serviceCode || '' });
        setSelectedCountry({ name: status.countryName });
        if (status.status === 'code_received' || status.smsCode) {
          setOtpData(status);
        } else if (status.status === 'waiting') {
          const elapsed = status.createdAt ? Math.floor((Date.now() - new Date(status.createdAt).getTime()) / 1000) : 0;
          setSecondsLeft(Math.max(0, 1200 - elapsed));
          startPolling(activeId);
        }
        setStep('messages');
      }
    } catch (err) {
      console.warn('Failed to resume active order:', err);
    }
  }

  async function loadServices() {
    try {
      const allData = await getServices(false);
      if (Array.isArray(allData)) {
        setServices(allData);
        setTotalServicesCount(allData.length);
        setAllServicesLoaded(true);
      }
      setLoading(false);
    } catch (err: any) {
      console.warn('Failed to load services:', err);
      try {
        const allData = await getServices(false);
        if (Array.isArray(allData) && allData.length > 0) {
          setServices(allData);
          setTotalServicesCount(allData.length);
          setAllServicesLoaded(true);
        }
      } catch (fallbackErr: any) {
        console.warn('Fallback error loading services:', fallbackErr);
      }
      setLoading(false);
    }
  }

  async function selectService(service: any) {
    setSelectedService(service);
    setStep('country');
    setCountrySearch('');
    setCountryFilter('all');
    setCountrySort('name_asc');
    setShowAllCountries(false);
    setAllCountries([]);
    setLoading(true);
    setError('');
    try {
      const apiCountries = await getServiceCountries(service.code);
      setCountries(apiCountries);
      setAllCountries(apiCountries);
      setShowAllCountries(true);
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleDirectBuy(country: any) {
    setSelectedCountry(country);

    // Instant wallet check
    if (walletBalance !== null && country.priceInr && walletBalance < country.priceInr) {
      setError(`Insufficient wallet balance. This number costs ₹${country.priceInr.toFixed(2)}, but your current balance is ₹${walletBalance.toFixed(2)}.`);
      return;
    }

    setBuyingCountryId(country.id);
    setError('');

    try {
      const data = await apiBuyNumber(selectedService.code, country.id);
      const newOrder = {
        orderId: data.orderId,
        phoneNumber: data.phoneNumber,
        serviceName: data.serviceName || selectedService.name,
        serviceCode: selectedService.code,
        countryName: data.countryName || country.name,
        priceInr: data.priceInr ?? data.sellPriceInr ?? country.priceInr,
        status: 'waiting',
        createdAt: new Date().toISOString(),
      };
      setOrder(newOrder);
      setOtpData(null);
      setSecondsLeft(1200);
      setStep('messages');
      startPolling(data.orderId);
      loadWalletBalance();
      loadRecentOrders();
    } catch (err: any) {
      const code = err?.code || '';
      const msg = (err?.message || '').toLowerCase();
      if (code === 'user_insufficient_funds' || msg.includes('insufficient wallet balance')) {
        setError(`Insufficient wallet balance. This number costs ₹${country.priceInr?.toFixed(2) || ''}, but your current wallet balance is insufficient.`);
        return;
      }
      setError(err.message || 'Carrier numbers are temporarily unavailable for this country. Please choose another country or retry.');
    } finally {
      setBuyingCountryId(null);
    }
  }

  function startPolling(orderId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await getOrderStatus(orderId);
        if (status) {
          if (status.smsCode || status.status === 'code_received') {
            setOtpData(status);
            setOrder((prev: any) => ({
              ...prev,
              ...status,
              status: 'code_received',
              smsCode: status.smsCode,
              smsText: status.smsText || status.text,
            }));
            playNotificationSound();
            if (pollRef.current) clearInterval(pollRef.current);
            loadWalletBalance();
            loadRecentOrders();
          } else if (status.status === 'expired' || status.status === 'cancelled') {
            setOrder((prev: any) => ({ ...prev, status: status.status }));
            if (pollRef.current) clearInterval(pollRef.current);
            loadWalletBalance();
            loadRecentOrders();
          }
        }
      } catch {
        // Ignore poll errors
      }
    }, 3000);
  }

  async function handleCancel() {
    if (!order) return;
    const elapsedSeconds = Math.max(0, 1200 - secondsLeft);
    if (elapsedSeconds < 120) {
      setError('Please wait 2 minutes for the OTP before cancelling this number.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await cancelOrder(order.orderId);
      if (pollRef.current) clearInterval(pollRef.current);
      setOrder(null);
      setOtpData(null);
      setStep('service');
      showSuccessToast('Number cancelled. Your refund will be credited to your wallet within 2–5 minutes.');
      loadWalletBalance();
      loadRecentOrders();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel order');
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    if (!order) return;
    try {
      await completeOrder(order.orderId);
      setStep('service');
      setOrder(null);
      setOtpData(null);
      loadWalletBalance();
      loadRecentOrders();
    } catch {}
  }

  async function handleRetry() {
    if (!order) return;
    setLoading(true);
    try {
      await retryOrder(order.orderId);
      setOrder((prev: any) => ({ ...prev, status: 'waiting', smsCode: null, smsText: null }));
      setOtpData(null);
      setSecondsLeft(1200);
      setStep('messages');
      startPolling(order.orderId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filteredServices = services.filter((s) => {
    const matchesQuery =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesQuery) return false;

    return true;
  });

  const sortedServices = [...filteredServices].sort((a, b) => {
    if (serviceSort === 'name_asc') {
      return a.name.localeCompare(b.name);
    }
    if (serviceSort === 'name_desc') {
      return b.name.localeCompare(a.name);
    }
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // ─── Step: Select Service ───
  if (step === 'service') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <ShoppingCartIcon size={26} color="var(--accent-primary)" />
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', margin: 0 }}>
                Buy <span className="text-gradient">Virtual Number</span>
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
              Choose a service to receive instant SMS and OTP codes
            </p>
          </div>
        </div>

        {/* Search & Sort Controls Bar */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
            <input
              type="text"
              className="input"
              placeholder="Search 900+ services (WhatsApp, Telegram, Google, ChatGPT...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '2.5rem', height: '46px', fontSize: '0.95rem' }}
            />
            <span style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, display: 'flex', alignItems: 'center' }}>
              <SearchIcon size={16} />
            </span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
              >
                <XIcon size={16} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sort by:</span>
            <select
              value={serviceSort}
              onChange={(e) => setServiceSort(e.target.value as ServiceSortOption)}
              className="input"
              style={{
                width: 'auto',
                minWidth: '190px',
                height: '46px',
                fontSize: '0.875rem',
                cursor: 'pointer',
                colorScheme: 'light',
                backgroundColor: '#f4f5f7',
                color: '#0f172a',
              }}
            >
              <option value="featured" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Featured First</option>
              <option value="name_asc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Name (A to Z)</option>
              <option value="name_desc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Name (Z to A)</option>
            </select>
          </div>
        </div>

        {error && (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircleIcon size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner spinner-lg"></div>
          </div>
        ) : sortedServices.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            No services found matching "{searchQuery}".
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.85rem' }}>
            {sortedServices.map((service) => (
              <button
                key={service.code}
                onClick={() => selectService(service)}
                className="card card-interactive"
                style={{
                  cursor: 'pointer',
                  textAlign: 'center',
                  padding: '1.25rem 0.9rem',
                  border: service.isFeatured ? '1px solid var(--border-glow)' : '1px solid var(--border-subtle)',
                  background: 'var(--bg-card)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {service.isFeatured && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.4rem',
                      borderRadius: 'var(--radius-full)',
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: '#f59e0b',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                    }}
                  >
                    <StarIcon size={10} color="#f59e0b" />
                    Featured
                  </span>
                )}

                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: 'var(--radius-md)',
                    background: getServiceBg(service.code),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '0.5rem',
                    transition: 'transform var(--transition-fast)',
                    padding: '8px',
                  }}
                >
                  {renderServiceIcon(service, 28)}
                </div>

                <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={service.name}>
                  {service.name}
                </div>

              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Use all countries when showAllCountries is active, search is active, or non-default filter
  const activeCountryList = (showAllCountries || countrySearch || countryFilter !== 'all') && allCountries.length > 0
    ? allCountries
    : countries;

  // Filter countries in step 2
  const filteredCountries = activeCountryList.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      String(c.id).includes(countrySearch);
    if (!matchesSearch) return false;
    if (countryFilter === 'cheap') return (c.priceInr || 0) <= 50;
    return true;
  });

  const sortedCountries = [...filteredCountries].sort((a, b) => {
    if (countrySort === 'name_asc') {
      return a.name.localeCompare(b.name);
    }
    if (countrySort === 'name_desc') {
      return b.name.localeCompare(a.name);
    }
    if (countrySort === 'price_asc') {
      const pA = a.priceInr || 9999;
      const pB = b.priceInr || 9999;
      if (pA !== pB) return pA - pB;
      // Use raw USD price as tiebreaker when INR prices are equal (avoids rounding distortion)
      if (a.priceUsd !== b.priceUsd) return (a.priceUsd || 0) - (b.priceUsd || 0);
      return b.available - a.available;
    }
    if (countrySort === 'price_desc') {
      const pA = a.priceInr || 0;
      const pB = b.priceInr || 0;
      if (pA !== pB) return pB - pA;
      return b.available - a.available;
    }
    if (countrySort === 'stock_desc') {
      return b.available - a.available;
    }
    return a.name.localeCompare(b.name);
  });

  // ─── Step: Select Country ───
  if (step === 'country') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => { setStep('service'); setCountrySearch(''); }}
              className="btn btn-ghost btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <ArrowLeftIcon size={14} />
              <span>Back</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-sm)',
                  background: getServiceBg(selectedService?.code || ''),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px',
                }}
              >
                {renderServiceIcon(selectedService, 22)}
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: 0 }}>
                {selectedService?.name} — <span className="text-gradient">Select Country</span>
              </h2>
            </div>
          </div>

          {/* Search & Sort Countries */}
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: '220px' }}>
              <input
                type="text"
                className="input input-sm"
                placeholder="Search countries..."
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                style={{ width: '100%', paddingLeft: '2.2rem' }}
              />
              <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, display: 'flex', alignItems: 'center' }}>
                <SearchIcon size={14} />
              </span>
            </div>

            <select
              value={countrySort}
              onChange={(e) => setCountrySort(e.target.value as CountrySortOption)}
              className="input input-sm"
              style={{
                width: 'auto',
                minWidth: '175px',
                cursor: 'pointer',
                colorScheme: 'light',
                backgroundColor: '#f4f5f7',
                color: '#0f172a',
              }}
            >
              <option value="name_asc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Name (A to Z)</option>
              <option value="name_desc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Name (Z to A)</option>
              <option value="price_asc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Price: Low to High</option>
              <option value="price_desc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Price: High to Low</option>
              <option value="stock_desc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Most Available Stock</option>
            </select>
          </div>
        </div>

        {/* Quick Country Filter Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.65rem' }}>
          {[
            { id: 'all', label: `All Countries (${allCountries.length || countries.length})` },
            { id: 'cheap', label: `Budget (< ₹50) (${(allCountries.length ? allCountries : countries).filter(c => (c.priceInr || 0) <= 50).length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setCountryFilter(tab.id as any);
                // Auto-expand to all countries when using non-default filters
                if (allCountries.length > 0) setShowAllCountries(true);
              }}
              className={`btn btn-sm ${countryFilter === tab.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 'var(--radius-full)', padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
            >
              {tab.label}
            </button>
          ))}
          {/* Load All Countries button shown when not expanded */}
          {!showAllCountries && allCountries.length > countries.length && (
            <button
              onClick={() => setShowAllCountries(true)}
              className="btn btn-ghost btn-sm"
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '0.25rem 0.75rem',
                fontSize: '0.8rem',
                color: 'var(--accent-primary)',
                border: '1px dashed var(--accent-primary)',
              }}
            >
              + Load All {allCountries.length} Countries
            </button>
          )}
        </div>

        {error && (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircleIcon size={16} />
              <span>{error}</span>
            </div>
            {error.toLowerCase().includes('wallet') && (
              <a href="/dashboard/wallet" className="btn btn-primary btn-sm" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                Recharge Wallet →
              </a>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner spinner-lg"></div>
          </div>
        ) : sortedCountries.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            No countries found matching "{countrySearch}".
          </div>
        ) : (
          <>
            <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setCountrySort(countrySort === 'name_asc' ? 'name_desc' : 'name_asc')}
                    title="Click to toggle A-Z / Z-A"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>Country</span>
                      <ArrowUpDownIcon size={13} color={countrySort.startsWith('name') ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                      {countrySort === 'name_asc' && <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)' }}>A-Z</span>}
                      {countrySort === 'name_desc' && <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)' }}>Z-A</span>}
                    </div>
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setCountrySort(countrySort === 'stock_desc' ? 'name_asc' : 'stock_desc')}
                    title="Click to sort by Available Stock"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>Available</span>
                      <ArrowUpDownIcon size={13} color={countrySort === 'stock_desc' ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                    </div>
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setCountrySort(countrySort === 'price_asc' ? 'price_desc' : 'price_asc')}
                    title="Click to sort by Price Low-High / High-Low"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>Price</span>
                      <ArrowUpDownIcon size={13} color={countrySort.startsWith('price') ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                      {countrySort === 'price_asc' && <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>Low-High</span>}
                      {countrySort === 'price_desc' && <span style={{ fontSize: '0.7rem', color: 'var(--warning)' }}>High-Low</span>}
                    </div>
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedCountries.map(country => (
                  <tr key={country.id}>
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        {renderCountryFlag(country, 24, 16)}
                        <span>{country.name}</span>
                      </div>
                    </td>
                    <td><span className="badge badge-success">{country.available.toLocaleString()}</span></td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>
                      {country.priceInr > 0 ? `₹${country.priceInr.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleDirectBuy(country)}
                        disabled={buyingCountryId === country.id}
                        className="btn btn-primary btn-sm"
                        style={{ minWidth: '78px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 700 }}
                      >
                        {buyingCountryId === country.id ? (
                          <>
                            <RefreshCwIcon size={12} className="animate-spin" />
                            <span>Buying...</span>
                          </>
                        ) : (
                          <>
                            <ShoppingCartIcon size={13} />
                            <span>Buy</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Load All Countries CTA */}
          {!showAllCountries && allCountries.length > countries.length && !countrySearch && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem 1.25rem',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(99,102,241,0.02))',
              border: '1px dashed rgba(99,102,241,0.3)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  Showing {countries.length} countries
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  {allCountries.length} total countries available for this service
                </div>
              </div>
              <button
                onClick={() => setShowAllCountries(true)}
                className="btn btn-primary btn-sm"
                style={{ whiteSpace: 'nowrap' }}
              >
                Load All {allCountries.length} Countries
              </button>
            </div>
          )}
        </>
      )}
      </div>
    );
  }

  // ─── Step: Live Room & Received Messages ───
  if (step === 'messages' || step === 'waiting' || step === 'received' || step === 'expired' || step === 'confirm') {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const progressPercent = Math.max(0, Math.min(100, (secondsLeft / 1200) * 100));
    const isWaiting = (order?.status === 'waiting' || step === 'waiting') && !order?.smsCode && !otpData?.smsCode;
    const isExpired = order?.status === 'expired' || step === 'expired' || order?.status === 'cancelled';
    const hasOtp = !!(order?.smsCode || otpData?.smsCode);
    const smsCode = order?.smsCode || otpData?.smsCode || '';
    const smsText = order?.smsText || otpData?.smsText || '';
    const cancelWaitSeconds = Math.max(0, 120 - Math.max(0, 1200 - secondsLeft));
    const cancelWaitMins = Math.floor(cancelWaitSeconds / 60);
    const cancelWaitRemainder = cancelWaitSeconds % 60;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {/* Header with Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.65rem', margin: 0 }}>
              Live <span className="text-gradient">SMS &amp; Received Messages</span>
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Your virtual number is listening. Verification codes arrive in real time right here.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                if (pollRef.current) clearInterval(pollRef.current);
                setStep('service');
              }}
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
            >
              <ShoppingCartIcon size={14} />
              <span>Buy Another Number</span>
            </button>
            <a href="/dashboard/orders" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>View All Orders →</span>
            </a>
          </div>
        </div>

        {/* Error Notification banner if any */}
        {error && (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircleIcon size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Active Number Card (Phone on Left, OTP Code / Loader on RIGHT) */}
        {order && (
          <div
            className="card"
            style={{
              padding: '1.5rem',
              background: hasOtp
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(15, 23, 42, 0.95))'
                : isExpired
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.06), rgba(15, 23, 42, 0.95))'
                : 'var(--bg-card)',
              border: hasOtp
                ? '1px solid rgba(16, 185, 129, 0.45)'
                : isExpired
                ? '1px solid rgba(239, 68, 68, 0.35)'
                : '1px solid var(--border-glow)',
              borderRadius: '16px',
              boxShadow: hasOtp
                ? '0 10px 30px rgba(16, 185, 129, 0.15)'
                : '0 10px 25px rgba(0,0,0,0.3)',
            }}
          >
            {/* Top Info Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: getServiceBg(order?.serviceCode || selectedService?.code || ''),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '7px',
                  }}
                >
                  {renderServiceIcon(selectedService || { code: order?.serviceCode, name: order?.serviceName }, 24)}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                    {order?.serviceName || selectedService?.name || 'SMS Verification'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {renderCountryFlag(selectedCountry || { iso: order?.countryIso, name: order?.countryName }, 18, 12)}
                    <span>{order?.countryName || selectedCountry?.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>•</span>
                    <span style={{ fontWeight: 600, color: 'var(--success)' }}>₹{parseFloat(order?.priceInr || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {isWaiting && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      background: 'rgba(245, 158, 11, 0.12)',
                      color: '#f59e0b',
                      padding: '0.3rem 0.75rem',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                    }}
                  >
                    <RefreshCwIcon size={12} className="animate-spin" />
                    <span>Checking live every 3s</span>
                  </div>
                )}
                {hasOtp && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981',
                      padding: '0.3rem 0.75rem',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                    }}
                  >
                    <CheckCircleIcon size={14} color="#10b981" />
                    <span>OTP Received</span>
                  </div>
                )}
                {isExpired && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#ef4444',
                      padding: '0.3rem 0.75rem',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                    }}
                  >
                    <ClockIcon size={14} color="#ef4444" />
                    <span>Expired &amp; Refunded</span>
                  </div>
                )}
              </div>
            </div>

            {/* Split Panel: Phone Number on LEFT, OTP Code / Loader on the RIGHT */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1.25rem',
                alignItems: 'stretch',
                background: 'var(--bg-glass-strong)',
                borderRadius: '12px',
                padding: '1.25rem',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {/* Left Column: Phone Number */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Virtual Phone Number
                </div>
                {(() => {
                  const apiPhoneNumber = String(order?.phoneNumber || '');
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span
                          onClick={() => apiPhoneNumber && copyToClipboard(apiPhoneNumber)}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'clamp(1.25rem, 4vw, 1.6rem)',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            letterSpacing: '0.02em',
                            wordBreak: 'break-all',
                            cursor: order?.phoneNumber ? 'pointer' : 'default',
                          }}
                          title={apiPhoneNumber ? `Click to copy ${apiPhoneNumber}` : undefined}
                        >
                          {apiPhoneNumber || 'Generating...'}
                        </span>
                        {apiPhoneNumber && (
                          <button
                            onClick={() => copyToClipboard(apiPhoneNumber)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}
                            title={`Copy ${apiPhoneNumber}`}
                          >
                            {copied ? <CheckIcon size={13} color="#10b981" /> : <CopyIcon size={13} />}
                            <span>{copied ? 'Copied!' : 'Copy Number'}</span>
                          </button>
                        )}
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0.6rem 0 0', lineHeight: 1.4 }}>
                        Use this Tiger SMS number exactly as provided in <b>{order?.serviceName || 'your app'}</b>.
                      </p>
                    </>
                  );
                })()}
              </div>

              {/* Right Column: OTP Code / Live Loader on the RIGHT */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: hasOtp ? 'flex-start' : 'center',
                  padding: '1.15rem',
                  borderRadius: '10px',
                  background: hasOtp ? 'rgba(16, 185, 129, 0.12)' : isExpired ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.06)',
                  border: hasOtp ? '1px solid rgba(16, 185, 129, 0.45)' : isExpired ? '1px solid rgba(239, 68, 68, 0.3)' : '1px dashed rgba(245, 158, 11, 0.4)',
                }}
              >
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: hasOtp ? '#10b981' : isExpired ? '#ef4444' : '#f59e0b', marginBottom: '0.45rem', fontWeight: 700 }}>
                  {hasOtp ? '✅ OTP Received' : isExpired ? '❌ Order Expired' : '⏳ Waiting for OTP Code'}
                </div>

                {isWaiting && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: '#f59e0b' }}>
                      <RefreshCwIcon size={20} className="animate-spin" />
                      <span style={{ fontWeight: 700, fontSize: '1rem' }}>Waiting for SMS to arrive...</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <span>Window expires in:</span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: secondsLeft < 180 ? '#ef4444' : '#f59e0b', fontSize: '0.95rem' }}>
                        {mins}:{secs.toString().padStart(2, '0')}
                      </strong>
                    </div>
                    {/* Progress Bar */}
                    <div style={{ height: '4px', width: '100%', maxWidth: '240px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '999px', overflow: 'hidden', marginTop: '0.2rem' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${progressPercent}%`,
                          background: secondsLeft < 180 ? '#ef4444' : '#f59e0b',
                          transition: 'width 1s linear',
                        }}
                      />
                    </div>
                  </div>
                )}

                {hasOtp && (
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '2rem',
                          fontWeight: 900,
                          color: '#10b981',
                          letterSpacing: '0.12em',
                          background: 'rgba(16, 185, 129, 0.22)',
                          padding: '0.25rem 0.95rem',
                          borderRadius: '8px',
                          display: 'inline-block',
                          boxShadow: '0 0 15px rgba(16, 185, 129, 0.2)',
                        }}
                      >
                        {smsCode}
                      </span>
                      <button
                        onClick={() => copyToClipboard(smsCode)}
                        className="btn btn-primary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.95rem', fontSize: '0.85rem', fontWeight: 700 }}
                      >
                        {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                        <span>{copied ? 'Copied!' : 'Copy OTP'}</span>
                      </button>
                    </div>
                    {smsText && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px', marginTop: '0.4rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                        "{smsText}"
                      </div>
                    )}
                  </div>
                )}

                {isExpired && (
                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: '0 0 0.5rem', fontWeight: 600 }}>
                      No SMS code arrived within 20 minutes.
                    </p>
                    <p style={{ color: '#10b981', fontSize: '0.8rem', margin: 0 }}>
                      Refund status is reflected in your wallet after Tiger SMS confirms it.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                🛡️ Eligible refunds are credited after Tiger SMS confirms cancellation (normally within 2–5 minutes).
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {isWaiting && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                    {cancelWaitSeconds > 0 && (
                      <span style={{ color: '#f59e0b', fontSize: '0.75rem', maxWidth: '300px', textAlign: 'right' }}>
                        Please wait 2 minutes for the OTP before cancelling this number.
                      </span>
                    )}
                    <button
                      onClick={handleCancel}
                      disabled={loading || cancelWaitSeconds > 0}
                      className="btn btn-danger btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}
                    >
                      <XIcon size={13} />
                      <span>
                        {loading
                          ? 'Cancelling...'
                          : cancelWaitSeconds > 0
                          ? `Cancel available in ${cancelWaitMins}:${cancelWaitRemainder.toString().padStart(2, '0')}`
                          : 'Cancel Order & Refund'}
                      </span>
                    </button>
                  </div>
                )}
                {hasOtp && (
                  <>
                    <button
                      onClick={handleComplete}
                      className="btn btn-success btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}
                    >
                      <CheckIcon size={13} />
                      <span>Done</span>
                    </button>
                    <button
                      onClick={handleRetry}
                      disabled={loading}
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}
                    >
                      <RefreshCwIcon size={12} className={loading ? 'animate-spin' : ''} />
                      <span>Request Another SMS</span>
                    </button>
                  </>
                )}
                {isExpired && (
                  <button
                    onClick={() => {
                      setStep('service');
                      setOrder(null);
                      setOtpData(null);
                    }}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '0.78rem', fontWeight: 600 }}
                  >
                    Buy Another Number
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* All Received Messages & History Table */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>All Received Messages &amp; Orders</h3>
              <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                {recentOrders.length}
              </span>
            </div>
            <button
              onClick={loadRecentOrders}
              className="btn btn-ghost btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}
            >
              <RefreshCwIcon size={12} />
              <span>Refresh List</span>
            </button>
          </div>

          {recentOrders.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No messages received yet. Buy a number above to start receiving codes!
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Country</th>
                    <th>Number</th>
                    <th>OTP Code</th>
                    <th>Status</th>
                    <th>Price</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((ro) => (
                    <tr key={ro.id}>
                      <td style={{ fontWeight: 600 }}>{ro.service_name}</td>
                      <td>{ro.country_name}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                        {ro.phone_number}
                      </td>
                      <td>
                        {ro.sms_code ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#10b981', fontSize: '0.95rem', background: 'rgba(16, 185, 129, 0.15)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                              {ro.sms_code}
                            </span>
                            <button
                              onClick={() => copyToClipboard(ro.sms_code)}
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '0.15rem 0.35rem', fontSize: '0.7rem' }}
                              title="Copy OTP"
                            >
                              Copy
                            </button>
                          </div>
                        ) : ro.status === 'waiting' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#f59e0b', fontSize: '0.78rem', fontWeight: 600 }}>
                            <RefreshCwIcon size={12} className="animate-spin" />
                            <span>Waiting for OTP...</span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge badge-${ro.status === 'code_received' || ro.status === 'completed' ? 'success' : ro.status === 'waiting' ? 'warning' : 'ghost'}`}>
                          {ro.status === 'code_received' ? 'Received' : ro.status}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>₹{parseFloat(ro.sell_price_inr || 0).toFixed(2)}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(ro.created_at).toLocaleString()}
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

  return null;
}
