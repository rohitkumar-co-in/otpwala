import { useState, useEffect, useRef } from 'react';
import { getServices, getServiceCountries, getPrice, buyNumber as apiBuyNumber, getOrderStatus, cancelOrder, completeOrder, retryOrder } from '../../lib/api';
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
  ZapIcon,
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
} from '../ui/BrandIcons';

type Step = 'service' | 'country' | 'confirm' | 'waiting' | 'received' | 'expired';

export function renderServiceIcon(serviceOrCode: any, size = 26) {
  const isObj = typeof serviceOrCode === 'object' && serviceOrCode !== null;
  const iconUrl = isObj ? serviceOrCode.iconUrl : null;
  const code = (isObj ? serviceOrCode.code : serviceOrCode || '').toLowerCase();
  const name = isObj ? serviceOrCode.name : code;

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

  // Fallback brand vector SVGs if iconUrl not present yet
  if (code === 'wa' || code === 'wa2') return <WhatsAppIcon size={size} style={{ color: '#25D366' }} />;
  if (code === 'tg' || code === 'eh') return <TelegramIcon size={size} style={{ color: '#229ED9' }} />;
  if (code === 'go' || code === 'gch' || code === 'gms' || code === 'gpy' || code === 'gf') return <GoogleIcon size={size} style={{ color: '#EA4335' }} />;
  if (code === 'ig') return <InstagramIcon size={size} style={{ color: '#E1306C' }} />;
  if (code === 'dr') return <OpenAIIcon size={size} style={{ color: '#10A37F' }} />;
  if (code === 'fb') return <FacebookIcon size={size} style={{ color: '#1877F2' }} />;
  if (code === 'tw') return <TwitterXIcon size={size} style={{ color: '#FFFFFF' }} />;
  if (code === 'lf') return <TikTokIcon size={size} style={{ color: '#FE2C55' }} />;
  if (code === 'mm') return <MicrosoftIcon size={size} style={{ color: '#00A4EF' }} />;
  if (code === 'wx') return <AppleIcon size={size} style={{ color: '#E5E7EB' }} />;

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
  const c = code.toLowerCase();
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
  return 'var(--accent-glow)';
}

const QUICK_CHIPS = [
  { code: 'wa', label: 'WhatsApp' },
  { code: 'tg', label: 'Telegram' },
  { code: 'go', label: 'Google' },
  { code: 'ig', label: 'Instagram' },
  { code: 'dr', label: 'ChatGPT' },
  { code: 'fb', label: 'Facebook' },
  { code: 'tw', label: 'Twitter / X' },
  { code: 'am', label: 'Amazon' },
  { code: 'mm', label: 'Microsoft' },
  { code: 'nf', label: 'Netflix' },
];

export type ServiceSortOption = 'popular' | 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'delivery_desc';
export type CountrySortOption = 'popular' | 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'delivery_desc' | 'stock_desc';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [serviceSort, setServiceSort] = useState<ServiceSortOption>('popular');
  const [countrySort, setCountrySort] = useState<CountrySortOption>('popular');
  const [countryFilter, setCountryFilter] = useState<'all' | 'popular' | 'cheap'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadServices();
    checkActiveParam();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Timer countdown effect for waiting step
  useEffect(() => {
    if (step !== 'waiting') return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (pollRef.current) clearInterval(pollRef.current);
          setStep('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  async function checkActiveParam() {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const activeId = params.get('active');
    if (!activeId) return;

    try {
      const status = await getOrderStatus(activeId);
      if (status) {
        setOrder({
          orderId: status.orderId || activeId,
          phoneNumber: status.phoneNumber,
          serviceName: status.serviceName,
          countryName: status.countryName,
          priceInr: status.priceInr,
          createdAt: status.createdAt,
        });
        setSelectedService({ name: status.serviceName, code: '' });
        setSelectedCountry({ name: status.countryName, id: 0 });
        if (status.status === 'code_received' || status.smsCode) {
          setOtpData(status);
          setStep('received');
        } else if (status.status === 'waiting') {
          const elapsed = status.createdAt ? Math.floor((Date.now() - new Date(status.createdAt).getTime()) / 1000) : 0;
          setSecondsLeft(Math.max(0, 1200 - elapsed));
          setStep('waiting');
          startPolling(activeId);
        } else if (status.status === 'expired' || status.status === 'cancelled') {
          setStep('expired');
        }
      }
    } catch (err) {
      console.warn('Failed to resume active order:', err);
    }
  }

  async function loadServices() {
    try {
      const data = await getServices();
      setServices(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function selectService(service: any) {
    setSelectedService(service);
    setStep('country');
    setCountrySearch('');
    setCountryFilter('all');
    setCountrySort('popular');
    setLoading(true);
    setError('');
    try {
      const data = await getServiceCountries(service.code);
      setCountries(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function selectCountry(country: any) {
    setSelectedCountry(country);
    setStep('confirm');
    setLoading(true);
    setError('');
    try {
      const data = await getPrice(selectedService.code, country.id);
      setPriceInfo(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBuy() {
    setLoading(true);
    setError('');
    try {
      const data = await apiBuyNumber(selectedService.code, selectedCountry.id);
      setOrder(data);
      setSecondsLeft(1200);
      setStep('waiting');
      startPolling(data.orderId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startPolling(orderId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await getOrderStatus(orderId);
        if (status.smsCode || status.status === 'code_received') {
          setOtpData(status);
          setStep('received');
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (status.status === 'expired' || status.status === 'cancelled') {
          if (pollRef.current) clearInterval(pollRef.current);
          setStep('expired');
        }
      } catch {
        // Ignore poll errors
      }
    }, 3000);
  }

  async function handleCancel() {
    if (!order) return;
    setLoading(true);
    try {
      await cancelOrder(order.orderId);
      if (pollRef.current) clearInterval(pollRef.current);
      setStep('service');
      setOrder(null);
      setSelectedService(null);
      setSelectedCountry(null);
    } catch (err: any) {
      setError(err.message);
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
    } catch {}
  }

  async function handleRetry() {
    if (!order) return;
    setLoading(true);
    try {
      await retryOrder(order.orderId);
      setStep('waiting');
      setOtpData(null);
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

    if (selectedCategory === 'popular') return s.isPopular;
    if (selectedCategory === 'social') return s.category === 'social';
    if (selectedCategory === 'tech') return s.category === 'tech';
    if (selectedCategory === 'shopping') return s.category === 'shopping' || s.category === 'entertainment';
    return true;
  });

  const sortedServices = [...filteredServices].sort((a, b) => {
    if (serviceSort === 'name_asc') {
      return a.name.localeCompare(b.name);
    }
    if (serviceSort === 'name_desc') {
      return b.name.localeCompare(a.name);
    }
    if (serviceSort === 'price_asc') {
      const pA = a.minPriceInr ?? 9999;
      const pB = b.minPriceInr ?? 9999;
      if (pA !== pB) return pA - pB;
      return a.name.localeCompare(b.name);
    }
    if (serviceSort === 'price_desc') {
      const pA = a.minPriceInr ?? 0;
      const pB = b.minPriceInr ?? 0;
      if (pA !== pB) return pB - pA;
      return a.name.localeCompare(b.name);
    }
    if (serviceSort === 'delivery_desc') {
      const dA = a.deliveryRate ?? 90;
      const dB = b.deliveryRate ?? 90;
      if (dA !== dB) return dB - dA;
      return a.name.localeCompare(b.name);
    }
    // 'popular' default:
    if (a.isPopular !== b.isPopular) return a.isPopular ? -1 : 1;
    if (a.rank !== b.rank) return a.rank - b.rank;
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
              <option value="popular" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Popular Services</option>
              <option value="name_asc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Name (A to Z)</option>
              <option value="name_desc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Name (Z to A)</option>
              <option value="price_asc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Price: Low to High</option>
              <option value="price_desc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Price: High to Low</option>
              <option value="delivery_desc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Highest Delivery Rate</option>
            </select>
          </div>
        </div>

        {/* Quick Selection Chips */}
        <div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Popular Services:
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {QUICK_CHIPS.map((chip) => {
              const matched = services.find((s) => s.code.toLowerCase() === chip.code);
              return (
                <button
                  key={chip.code}
                  onClick={() => {
                    if (matched) selectService(matched);
                    else setSearchQuery(chip.label);
                  }}
                  className="btn btn-ghost btn-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    background: 'var(--bg-glass)',
                    border: '1px solid var(--border-subtle)',
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.825rem',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    {renderServiceIcon(matched || chip.code, 18)}
                  </span>
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
          {[
            { id: 'all', label: `All (${services.length})` },
            { id: 'popular', label: 'Popular Only' },
            { id: 'social', label: 'Social & Chat' },
            { id: 'tech', label: 'Tech & AI' },
            { id: 'shopping', label: 'Shopping & Media' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setSelectedCategory(tab.id); setSearchQuery(''); }}
              className={`btn btn-sm ${selectedCategory === tab.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 'var(--radius-full)', padding: '0.35rem 0.85rem' }}
            >
              {tab.label}
            </button>
          ))}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: '0.85rem' }}>
            {sortedServices.map((service) => (
              <button
                key={service.code}
                onClick={() => selectService(service)}
                className="card card-interactive"
                style={{
                  cursor: 'pointer',
                  textAlign: 'center',
                  padding: '1.25rem 0.9rem',
                  border: service.isPopular ? '1px solid var(--border-glow)' : '1px solid var(--border-subtle)',
                  background: 'var(--bg-card)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {service.isPopular && (
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
                    Top
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

                {/* Delivery Rate & Starting Price Pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: '#10b981',
                      background: 'rgba(16, 185, 129, 0.12)',
                      padding: '0.12rem 0.45rem',
                      borderRadius: 'var(--radius-full)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                    }}
                    title="SMS Delivery Rate"
                  >
                    <ZapIcon size={10} color="#10b981" />
                    {service.deliveryRate || 98}%
                  </span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-glass)',
                      padding: '0.12rem 0.45rem',
                      borderRadius: 'var(--radius-full)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    From ₹{service.minPriceInr ? service.minPriceInr.toFixed(2) : '—'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Filter countries in step 2
  const filteredCountries = countries.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      String(c.id).includes(countrySearch);
    if (!matchesSearch) return false;
    if (countryFilter === 'popular') return c.isPopular;
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
      return b.available - a.available;
    }
    if (countrySort === 'price_desc') {
      const pA = a.priceInr || 0;
      const pB = b.priceInr || 0;
      if (pA !== pB) return pB - pA;
      return b.available - a.available;
    }
    if (countrySort === 'delivery_desc') {
      const dA = a.deliveryRate ?? 90;
      const dB = b.deliveryRate ?? 90;
      if (dA !== dB) return dB - dA;
      return b.available - a.available;
    }
    if (countrySort === 'stock_desc') {
      return b.available - a.available;
    }
    // 'popular' default:
    if (a.isPopular !== b.isPopular) return a.isPopular ? -1 : 1;
    if (a.rank && b.rank && a.rank !== b.rank) return a.rank - b.rank;
    return b.available - a.available;
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
              <option value="popular" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Popular Countries</option>
              <option value="name_asc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Name (A to Z)</option>
              <option value="name_desc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Name (Z to A)</option>
              <option value="price_asc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Price: Low to High</option>
              <option value="price_desc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Price: High to Low</option>
              <option value="delivery_desc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Highest Delivery Rate</option>
              <option value="stock_desc" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>Most Available Stock</option>
            </select>
          </div>
        </div>

        {/* Quick Country Filter Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.65rem' }}>
          {[
            { id: 'all', label: `All Countries (${countries.length})` },
            { id: 'popular', label: `Popular Only (${countries.filter(c => c.isPopular).length})` },
            { id: 'cheap', label: `Budget (< ₹50) (${countries.filter(c => (c.priceInr || 0) <= 50).length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCountryFilter(tab.id as any)}
              className={`btn btn-sm ${countryFilter === tab.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 'var(--radius-full)', padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
            >
              {tab.label}
            </button>
          ))}
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
        ) : sortedCountries.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            No countries found matching "{countrySearch}".
          </div>
        ) : (
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
                    onClick={() => setCountrySort(countrySort === 'delivery_desc' ? 'popular' : 'delivery_desc')}
                    title="Click to sort by Highest Delivery Rate"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>Delivery Rate</span>
                      <ArrowUpDownIcon size={13} color={countrySort === 'delivery_desc' ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                    </div>
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setCountrySort(countrySort === 'stock_desc' ? 'popular' : 'stock_desc')}
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
                        {country.isPopular && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              padding: '0.1rem 0.35rem',
                              borderRadius: 'var(--radius-full)',
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: '#f59e0b',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.15rem',
                            }}
                          >
                            <StarIcon size={9} color="#f59e0b" />
                            Top
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: (country.deliveryRate || 95) >= 95 ? '#10b981' : '#f59e0b',
                          background: (country.deliveryRate || 95) >= 95 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <ZapIcon size={12} color={(country.deliveryRate || 95) >= 95 ? '#10b981' : '#f59e0b'} />
                        {country.deliveryRate ? `${country.deliveryRate.toFixed(1)}%` : '95.0%'}
                      </span>
                    </td>
                    <td><span className="badge badge-success">{country.available.toLocaleString()}</span></td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>
                      {country.priceInr > 0 ? `₹${country.priceInr.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={() => selectCountry(country)} className="btn btn-primary btn-sm">
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ─── Step: Confirm Purchase ───
  if (step === 'confirm') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 500 }}>
        <button onClick={() => setStep('country')} className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <ArrowLeftIcon size={14} />
          <span>Back</span>
        </button>
        
        <div className="card-glass" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: '1.5rem' }}>Confirm Purchase</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Service</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                {renderServiceIcon(selectedService, 20)}
                <span style={{ fontWeight: 600 }}>{selectedService?.name}</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Country</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                {renderCountryFlag(selectedCountry, 22, 15)}
                <span style={{ fontWeight: 600 }}>{selectedCountry?.name}</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Available Stock</span>
              <span className="badge badge-success">{priceInfo?.count?.toLocaleString() || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Price</span>
              <span style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--success)' }}>
                ₹{priceInfo?.priceInr?.toFixed(2) || '—'}
              </span>
            </div>
          </div>

          {error && (
            <div style={{ padding: '0.75rem 1rem', background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircleIcon size={16} />
              <span>{error}</span>
            </div>
          )}

          <button onClick={handleBuy} className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Purchasing...' : `Buy for ₹${priceInfo?.priceInr?.toFixed(2) || '—'}`}
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: Waiting for OTP ───
  if (step === 'waiting') {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const progressPercent = Math.max(0, Math.min(100, (secondsLeft / 1200) * 100));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '2rem 0', maxWidth: 520, margin: '0 auto' }}>
        <div className="card-glass" style={{ padding: '2.5rem 2rem', textAlign: 'center', width: '100%', borderRadius: '18px', border: '1px solid var(--border-glow)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <ClockIcon size={48} color="#f59e0b" className="pulse" />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.65rem', marginBottom: '0.35rem' }}>
            Waiting for <span className="text-gradient">SMS Code</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.45 }}>
            Send the OTP from your app to this temporary number. SMS code usually arrives in 10–60 seconds.
          </p>

          {/* Service & Country Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-glass)', padding: '0.45rem 1rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {renderServiceIcon(selectedService, 18)}
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{selectedService?.name || order?.serviceName}</span>
            </div>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {renderCountryFlag(selectedCountry, 20, 14)}
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{selectedCountry?.name || order?.countryName}</span>
            </div>
          </div>

          {/* Number Box */}
          <div style={{ background: 'var(--bg-glass-strong)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.25rem', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Your Temporary Virtual Number
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
              <span>{order?.phoneNumber}</span>
              <button
                onClick={() => copyToClipboard(order?.phoneNumber || '')}
                className="btn btn-secondary btn-sm"
                style={{ padding: '0.3rem 0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}
                title="Copy Phone Number"
              >
                {copied ? <CheckIcon size={14} color="#34d399" /> : <CopyIcon size={14} />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Countdown Timer & Progress Bar */}
          <div style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>⏳</span> Time Remaining:
              </span>
              <strong style={{ fontFamily: 'var(--font-mono)', color: secondsLeft < 180 ? '#ef4444' : '#f59e0b', fontSize: '1.05rem' }}>
                {mins}:{secs.toString().padStart(2, '0')}
              </strong>
            </div>
            {/* Progress bar */}
            <div style={{ height: '6px', width: '100%', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  background: secondsLeft < 180 ? '#ef4444' : 'linear-gradient(90deg, #f59e0b, #10b981)',
                  transition: 'width 1s linear',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span>100% Auto-Refund if expired</span>
              <span>₹{parseFloat(order?.priceInr || priceInfo?.priceInr || 0).toFixed(2)} Protected</span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleCancel} className="btn btn-danger btn-sm" disabled={loading} style={{ padding: '0.55rem 1.25rem', fontWeight: 600 }}>
              {loading ? 'Processing...' : 'Cancel Order & Instant Refund'}
            </button>
            <a
              href="/dashboard/buy"
              onClick={() => {
                if (pollRef.current) clearInterval(pollRef.current);
                setStep('service');
                setOrder(null);
              }}
              className="btn btn-ghost btn-sm"
            >
              Keep Running in Background
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Order Expired ───
  if (step === 'expired') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '2rem 0', maxWidth: 500, margin: '0 auto' }}>
        <div className="card-glass" style={{ padding: '2.5rem', textAlign: 'center', width: '100%', borderRadius: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <ClockIcon size={48} color="#ef4444" />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
            Order Expired &amp; <span style={{ color: '#34d399' }}>Refunded</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            No SMS code was received for <strong>{order?.phoneNumber || 'this number'}</strong> within the 20-minute window.
            <br />
            <strong style={{ color: '#34d399' }}>100% of the purchase amount has been automatically credited back to your wallet.</strong>
          </p>
          <button
            onClick={() => {
              setStep('service');
              setOrder(null);
              setOtpData(null);
            }}
            className="btn btn-primary"
            style={{ padding: '0.65rem 1.75rem', fontWeight: 700 }}
          >
            Buy Another Number
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: OTP Received ───
  if (step === 'received') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '2rem 0', maxWidth: 500, margin: '0 auto' }}>
        <div className="card-glass" style={{ padding: '2.5rem', textAlign: 'center', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <CheckCircleIcon size={48} color="var(--success)" />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: '0.5rem', color: 'var(--success)' }}>OTP Received!</h2>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-glass)', padding: '0.45rem 1rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {renderServiceIcon(selectedService, 18)}
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{selectedService?.name}</span>
            </div>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {renderCountryFlag(selectedCountry, 20, 14)}
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{selectedCountry?.name}</span>
            </div>
          </div>

          <div style={{ background: 'var(--bg-glass-strong)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1rem', cursor: 'pointer', border: '1px solid var(--success-border)' }} onClick={() => copyToClipboard(otpData?.smsCode || '')}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Verification Code (click to copy)</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.5rem', fontWeight: 800, color: 'var(--success)', letterSpacing: '0.15em' }}>
              {otpData?.smsCode}
            </div>
            {copied && (
              <div style={{ fontSize: '0.8rem', color: 'var(--success)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                <CheckIcon size={12} />
                <span>Copied!</span>
              </div>
            )}
          </div>

          {otpData?.smsText && (
            <div style={{ background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              "{otpData.smsText}"
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleComplete} className="btn btn-success btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <CheckIcon size={13} />
              <span>Done</span>
            </button>
            <button onClick={handleRetry} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <RefreshCwIcon size={13} />
              <span>Get Another SMS</span>
            </button>
            <button onClick={() => { setStep('service'); setOrder(null); setOtpData(null); }} className="btn btn-ghost btn-sm">
              Buy Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
