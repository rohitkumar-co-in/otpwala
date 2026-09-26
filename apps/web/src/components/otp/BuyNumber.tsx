import { useState, useEffect, useRef } from 'react';
import { getServices, getServiceCountries, getPrice, buyNumber as apiBuyNumber, getOrderStatus, cancelOrder, retryOrder, getWallet, getOrders } from '../../lib/api';
import { toast } from '../../lib/toast';
import { getActiveCurrency, formatCurrencyAmount, type Currency, DEFAULT_USD_TO_INR_RATE } from '../../lib/currency';
import { ISO_TO_DIAL_CODE } from '../../lib/phone';
import countryDirectory from '../../data/tiger-country-directory.json';
import {
  ShoppingCartIcon,
  SearchIcon,
  ArrowLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  CheckIcon,
  RefreshCwIcon,
  CopyIcon,
  AlertCircleIcon,
  HourglassIcon,
  ShieldIcon,
  StarIcon,
  XIcon,
} from '../ui/Icons';

type Step = 'service' | 'country' | 'confirm' | 'waiting' | 'received' | 'expired' | 'messages';

const normalizeCountryName = (name: unknown) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const countryDialCodeByName = new Map(countryDirectory.countries.map((country) => [normalizeCountryName(country.name), country.phoneCode]));

function getCountryDialCode(country: any): string {
  if (!country) return '';
  const isoDialCode = ISO_TO_DIAL_CODE[String(country.iso || '').toLowerCase()];
  if (isoDialCode) return `+${isoDialCode}`;
  const localDialCode = countryDialCodeByName.get(normalizeCountryName(country.name));
  return String(country.phoneCode || localDialCode || '');
}

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
  toast.success(message, 'Order Update');
}

export function renderServiceIcon(serviceOrCode: any, size = 26) {
  const isObj = typeof serviceOrCode === 'object' && serviceOrCode !== null;
  const code = (isObj ? serviceOrCode.code : serviceOrCode || '').toLowerCase().trim();
  const name = isObj ? serviceOrCode.name : code;
  const iconUrl = isObj ? serviceOrCode.iconUrl : null;
  const tigerIconUrl = iconUrl || '/api/catalog/service-icon/unknown';

  return (
    <img
      src={tigerIconUrl}
      alt={name || 'Service'}
      width={size}
      height={size}
      style={{ objectFit: 'contain', display: 'block', maxWidth: `${size}px`, maxHeight: `${size}px`, borderRadius: '50%' }}
      loading="lazy"
      onError={(e) => {
        if (!e.currentTarget.src.endsWith('/unknown')) e.currentTarget.src = '/api/catalog/service-icon/unknown';
      }}
    />
  );
}

export function renderCountryFlag(country: any, width = 28, _height = 18) {
  if (!country) return null;
  const iso = (country.iso || 'un').toUpperCase();
  const fallbackUrl = `/api/catalog/country-flag/${iso.toLowerCase()}`;
  const flagUrl = country.flagUrl || fallbackUrl;

  return (
    <img
      src={flagUrl}
      alt={country.name || iso}
      width={width}
      height={width}
      style={{
        width,
        height: width,
        aspectRatio: '1',
        borderRadius: '50%',
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

export type ServiceSortOption = 'featured' | 'name_asc' | 'name_desc';
export type CountrySortOption = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_desc';

function LoadMoreSentinel({ onLoadMore }: { onLoadMore: () => void }) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
    }, { rootMargin: '320px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore]);

  return <div ref={sentinelRef} style={{ minHeight: '1px' }} aria-hidden="true" />;
}

export default function BuyNumber() {
  const [step, setStep] = useState<Step>('service');
  const [services, setServices] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [priceInfo, setPriceInfo] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [otpData, setOtpData] = useState<any>(null);
  const [cancelDenied, setCancelDenied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(1200);
  const [loading, setLoading] = useState(false);
  const [buyingCountryId, setBuyingCountryId] = useState<number | null>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [countryLoadFailed, setCountryLoadFailed] = useState(false);
  const [serviceSort, setServiceSort] = useState<ServiceSortOption>('featured');
  const [countrySort, setCountrySort] = useState<CountrySortOption>('name_asc');
  const [countryFilter, setCountryFilter] = useState<'all' | 'cheap'>('all');
  const [copied, setCopied] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [allServicesLoaded, setAllServicesLoaded] = useState(false);
  const [totalServicesCount, setTotalServicesCount] = useState(0);
  const [serviceVisibleCount, setServiceVisibleCount] = useState(30);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [showAllCountries, setShowAllCountries] = useState(false);
  const [allCountries, setAllCountries] = useState<any[]>([]);
  const [loadingAllCountries, setLoadingAllCountries] = useState(false);
  const [currency, setCurrency] = useState<Currency>(getActiveCurrency());
  const [usdRate, setUsdRate] = useState<number>(DEFAULT_USD_TO_INR_RATE);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countryRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countryRequestIdRef = useRef(0);
  const countryRetryCountRef = useRef(0);
  const [countryVisibleCount, setCountryVisibleCount] = useState(30);
  const servicesRefreshRef = useRef(false);
  const purchaseInFlightRef = useRef(false);
  const purchaseRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    loadServices();
    const servicesRefreshTimer = setInterval(() => {
      void loadServices(true);
    }, 10_000);
    checkActiveParam();
    loadWalletBalance();
    const handleCurrencyChange = (e: any) => {
      if (e.detail?.currency) setCurrency(e.detail.currency);
      if (e.detail?.rate) setUsdRate(Number(e.detail.rate));
    };
    window.addEventListener('otpwala:currency-change', handleCurrencyChange);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countryRetryRef.current) clearTimeout(countryRetryRef.current);
      clearInterval(servicesRefreshTimer);
      window.removeEventListener('otpwala:currency-change', handleCurrencyChange);
    };
  }, []);

  async function loadWalletBalance() {
    try {
      const data = await getWallet();
      setWalletBalance(parseFloat(String(data.balance)) || 0);
      if (data.config?.usdToInrRate) {
        setUsdRate(parseFloat(data.config.usdToInrRate) || 115);
      }
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

  async function loadServices(silent = false) {
    if (servicesRefreshRef.current) return;
    servicesRefreshRef.current = true;
    if (!silent) setServicesLoading(true);
    if (!silent) setError('');
    try {
      const allData = await getServices(false);
      if (Array.isArray(allData) && allData.length > 0) {
        setServices(allData);
        setTotalServicesCount(allData.length);
        setAllServicesLoaded(true);
      }
    } catch (err: any) {
      if (!silent) {
        console.warn('Failed to load services:', err);
      }
    } finally {
      setServicesLoading(false);
      servicesRefreshRef.current = false;
    }
  }

  async function loadServiceCountries(service: any, requestId: number) {
    setLoading(true);
    setCountryLoadFailed(false);
    try {
      const apiCountries = await getServiceCountries(service.code);
      if (requestId !== countryRequestIdRef.current) return;
      setCountries(apiCountries);
      setAllCountries(apiCountries);
      setShowAllCountries(true);
      setLoading(false);
      setCountryLoadFailed(false);
      countryRetryCountRef.current = 0;
    } catch (err: any) {
      if (requestId !== countryRequestIdRef.current) return;
      if (countryRetryCountRef.current < 2) {
        countryRetryCountRef.current += 1;
        countryRetryRef.current = setTimeout(() => {
          void loadServiceCountries(service, requestId);
        }, 5_000);
      } else {
        setLoading(false);
        setCountryLoadFailed(true);
        setError(err?.message || 'Could not load countries right now. Please try again.');
      }
    }
  }

  async function selectService(service: any) {
    countryRequestIdRef.current += 1;
    if (countryRetryRef.current) clearTimeout(countryRetryRef.current);
    const requestId = countryRequestIdRef.current;
    countryRetryCountRef.current = 0;
    setCountryLoadFailed(false);
    setSelectedService(service);
    setStep('country');
    setCountrySearch('');
    setCountryFilter('all');
    setCountrySort('name_asc');
    setCountryVisibleCount(30);
    setShowAllCountries(false);
    setAllCountries([]);
    setError('');
    void loadServiceCountries(service, requestId);
  }

  async function handleDirectBuy(country: any) {
    if (purchaseInFlightRef.current) return;
    setSelectedCountry(country);

    // Instant wallet check
    if (walletBalance !== null && country.priceInr && walletBalance < country.priceInr) {
      const price = formatCurrencyAmount(country.priceInr, currency, usdRate);
      const balance = formatCurrencyAmount(walletBalance, currency, usdRate);
      setError(`Insufficient wallet balance. This number costs ${price}, but your current balance is ${balance}.`);
      return;
    }

    purchaseInFlightRef.current = true;
    setBuyingCountryId(country.id);
    setError('');

    try {
      purchaseRequestIdRef.current ||= crypto.randomUUID();
      const data = await apiBuyNumber(selectedService.code, country.id, purchaseRequestIdRef.current);
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
      setCancelDenied(false);
      setOtpData(null);
      setSecondsLeft(1200);
      setStep('messages');
      purchaseRequestIdRef.current = null;
      startPolling(data.orderId);
      loadWalletBalance();
      loadRecentOrders();
    } catch (err: any) {
      const code = err?.code || '';
      if (code && code !== 'purchase_in_progress') purchaseRequestIdRef.current = null;
      const msg = (err?.message || '').toLowerCase();
      if (code === 'user_insufficient_funds' || msg.includes('insufficient wallet balance')) {
        const price = formatCurrencyAmount(country.priceInr || 0, currency, usdRate);
        setError(`Insufficient wallet balance. This number costs ${price}, but your current wallet balance is insufficient.`);
        return;
      }
      setError(err.message || 'Carrier numbers are temporarily unavailable for this country. Please choose another country or retry.');
    } finally {
      purchaseInFlightRef.current = false;
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
            setCancelDenied(false);
            setError('');
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
            setCancelDenied(false);
            setError('');
            setOrder((prev: any) => ({ ...prev, status: status.status }));
            if (pollRef.current) clearInterval(pollRef.current);
            loadWalletBalance();
            loadRecentOrders();
          } else if (status.status === 'waiting') {
            setOrder((prev: any) => ({ ...prev, ...status, status: 'waiting' }));
          }
        }
      } catch {
        // Ignore poll errors
      }
    }, 3000);
  }

  async function handleCancel() {
    if (!order) return;
    setError('');
    setCancelDenied(false);
    setLoading(true);
    try {
      await cancelOrder(order.orderId);
      if (pollRef.current) clearInterval(pollRef.current);
      setOrder((prev: any) => ({ ...prev, status: 'cancelled' }));
      setOtpData(null);
      setStep('messages');
      showSuccessToast('Cancellation confirmed. Your OTPWala wallet refund is being processed.');
      loadWalletBalance();
      loadRecentOrders();
    } catch (err: any) {
      const providerRejectedCancel = err?.code === 'EARLY_CANCEL_DENIED';
      const unexpectedCancelResponse = err?.code === 'INVALID_API_RESPONSE';
      if (['EARLY_CANCEL_DENIED', 'BAD_STATUS', 'NO_ACTIVATION', 'INVALID_STATUS', 'SMS_RECEIVED', 'INVALID_API_RESPONSE'].includes(err?.code)) {
        try {
          const status = await getOrderStatus(order.orderId);
          if (status?.smsCode || status?.status === 'code_received') {
            setOrder((prev: any) => ({ ...prev, ...status, status: 'code_received' }));
            setOtpData(status);
            setCancelDenied(false);
            setError('');
            if (pollRef.current) clearInterval(pollRef.current);
          } else if (status?.status === 'cancelled' || status?.status === 'expired') {
            setOrder((prev: any) => ({ ...prev, ...status, status: status.status }));
            setCancelDenied(false);
            setError('');
            if (pollRef.current) clearInterval(pollRef.current);
            loadWalletBalance();
            loadRecentOrders();
          } else {
            setOrder((prev: any) => ({ ...prev, ...status, status: 'waiting' }));
            setCancelDenied(providerRejectedCancel || ['BAD_STATUS', 'NO_ACTIVATION', 'INVALID_STATUS'].includes(err?.code));
            setError(providerRejectedCancel
              ? 'OTPWala still shows this number as waiting. Cancellation was declined, so no refund was issued.'
              : unexpectedCancelResponse
                ? 'The cancellation service returned an invalid response. The latest status is still waiting, so no refund was issued.'
              : 'Cancellation is not confirmed yet. The number remains active and no refund was issued.');
          }
        } catch {
          setCancelDenied(providerRejectedCancel || ['BAD_STATUS', 'NO_ACTIVATION', 'INVALID_STATUS'].includes(err?.code));
          setError(providerRejectedCancel
              ? 'Cancellation was declined, and OTPWala could not check the latest order status. No refund was issued.'
            : unexpectedCancelResponse
              ? 'The cancellation service returned an invalid response, and the latest order status could not be verified. No refund has been assumed; refresh the order status before trying again.'
              : 'OTPWala could not confirm cancellation. The number remains active and no refund was issued.');
        }
        return;
      }
      setError(err.message || 'Failed to cancel order');
    } finally {
      setLoading(false);
    }
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
  const visibleServices = sortedServices.slice(0, serviceVisibleCount);

  useEffect(() => {
    setServiceVisibleCount(30);
  }, [searchQuery, serviceSort]);

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
        <div className="responsive-buy-controls" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
            <input
              type="text"
              className="input"
              aria-label="Search services"
              placeholder="Search services (WhatsApp, Telegram, Google, ChatGPT...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '2.5rem', height: '46px', fontSize: '0.95rem' }}
            />
            <span style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, display: 'flex', alignItems: 'center' }}>
              <SearchIcon size={16} />
            </span>
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear service search"
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

        {servicesLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1rem', color: 'var(--text-muted)' }}>
            <div className="spinner spinner-lg"></div>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Loading services…</span>
          </div>
        ) : loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner spinner-lg"></div>
          </div>
        ) : !allServicesLoaded ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <p style={{ margin: '0 0 1rem' }}>Services are not available yet.</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadServices()}>Try Again</button>
          </div>
        ) : sortedServices.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            No services found matching "{searchQuery}".
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.85rem' }}>
            {visibleServices.map((service) => (
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
                  borderRadius: '50%',
                  background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '0.5rem',
                    transition: 'transform var(--transition-fast)',
                  padding: 0,
                  }}
                >
                  {renderServiceIcon(service, 48)}
                </div>

                <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={service.name}>
                  {service.name}
                </div>

              </button>
            ))}
            {visibleServices.length < sortedServices.length && <LoadMoreSentinel onLoadMore={() => setServiceVisibleCount((count) => Math.min(count + 30, sortedServices.length))} />}
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

  const highDeliveryCountries = filteredCountries
    .filter((country) => country.isHighDelivery)
    .sort((a, b) => (a.deliveryRank || 999) - (b.deliveryRank || 999));

  const popularCountries = filteredCountries
    .filter((country) => !country.isHighDelivery && country.isPopular)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Only the regular A-Z group responds to the customer's sort choice.
  const sortedCountries = filteredCountries.filter((country) => !country.isHighDelivery && !country.isPopular).sort((a, b) => {
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

  const countryGroups = [
    { id: 'delivery', label: 'Highest delivery rate', note: 'Based on live availability', countries: highDeliveryCountries, color: 'var(--success)' },
    { id: 'popular', label: 'Popular countries', note: 'Starred by OTPWala admin', countries: popularCountries, color: '#f59e0b' },
    { id: 'all', label: 'All countries', note: 'Your selected sorting applies only here', countries: sortedCountries, color: 'var(--accent-primary)' },
  ].filter((group) => group.countries.length > 0);
  const totalCountryCount = highDeliveryCountries.length + popularCountries.length + sortedCountries.length;
  let countrySlotsRemaining = countryVisibleCount;
  const visibleCountryGroups = countryGroups.map((group) => {
    const groupCountries = group.countries.slice(0, Math.max(0, countrySlotsRemaining));
    countrySlotsRemaining -= groupCountries.length;
    return { ...group, countries: groupCountries };
  }).filter((group) => group.countries.length > 0);

  // ─── Step: Select Country ───
  if (step === 'country') {
    return (
      <div className="buy-country-view" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="buy-country-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div className="buy-country-title-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => { countryRequestIdRef.current += 1; if (countryRetryRef.current) clearTimeout(countryRetryRef.current); setLoading(false); setStep('service'); setCountrySearch(''); }}
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
                  borderRadius: '50%',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              >
                {renderServiceIcon(selectedService, 36)}
              </div>
              <h2 className="buy-country-title" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', margin: 0 }}>
                {selectedService?.name}: <span className="text-gradient">Select Country</span>
              </h2>
            </div>
          </div>

          {/* Search & Sort Countries */}
          <div className="buy-country-controls" style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="buy-country-search" style={{ position: 'relative', width: '220px' }}>
              <input
                type="text"
                className="input input-sm"
                aria-label="Search countries"
                placeholder="Search countries..."
                value={countrySearch}
                onChange={(e) => { setCountrySearch(e.target.value); setCountryVisibleCount(30); }}
                style={{ width: '100%', paddingLeft: '2.2rem' }}
              />
              <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, display: 'flex', alignItems: 'center' }}>
                <SearchIcon size={14} />
              </span>
            </div>

            <select
              aria-label="Sort countries"
              value={countrySort}
              onChange={(e) => { setCountrySort(e.target.value as CountrySortOption); setCountryVisibleCount(30); }}
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
            { id: 'cheap', label: `Budget (≤ ${formatCurrencyAmount(50, currency, usdRate)}) (${(allCountries.length ? allCountries : countries).filter(c => (c.priceInr || 0) <= 50).length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setCountryFilter(tab.id as any);
                setCountryVisibleCount(30);
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

        <p style={{ margin: '-0.5rem 0 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
          The listed price is deducted when a number is reserved. If no OTP arrives, an eligible refund is added to your OTPWala wallet after cancellation or expiry is confirmed.
        </p>

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
            {countryLoadFailed && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={loading}
                onClick={() => {
                  if (!selectedService) return;
                  countryRetryCountRef.current = 0;
                  setError('');
                  void loadServiceCountries(selectedService, countryRequestIdRef.current);
                }}
              >
                Try Again
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1rem', color: 'var(--text-muted)' }}>
            <div className="spinner spinner-lg"></div>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Loading countries…</span>
          </div>
        ) : totalCountryCount === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            {countrySearch
              ? <>No countries found matching "{countrySearch}".</>
              : 'No countries are currently available for this service.'}
          </div>
        ) : (
          <>
            <div className="country-card-groups">
              {visibleCountryGroups.map((group) => (
                <section key={group.id} className="country-card-group" aria-label={group.label}>
                  <div className="country-card-group-heading">
                    {group.id === 'popular' ? <StarIcon size={15} color={group.color} /> : <CheckCircleIcon size={15} color={group.color} />}
                    <span style={{ fontWeight: 800, color: group.color }}>{group.label}</span>
                    <span className="country-card-group-note">{group.note}</span>
                  </div>
                  <div className="country-card-grid">
                    {group.countries.map((country) => {
                      const price = country.priceInr > 0 ? formatCurrencyAmount(country.priceInr, currency, usdRate) : null;
                      return (
                        <article key={country.id} className="card country-option-card">
                          <div className="country-option-heading">
                            {renderCountryFlag(country, 38, 38)}
                            <div className="country-option-name-wrap">
                              <div className="country-option-name">{country.name}</div>
                              {group.id === 'delivery' && <span className="country-option-rank">Top delivery #{country.deliveryRank}</span>}
                              {group.id === 'popular' && <span className="country-option-popular"><StarIcon size={11} color="#f59e0b" /> Popular</span>}
                            </div>
                          </div>
                          <div className="country-option-details">
                            <div className="country-option-stock">
                              <span>Available</span>
                              <strong>{country.available.toLocaleString()}</strong>
                            </div>
                            <div className="country-option-price">
                              <span>Price</span>
                              <strong>{price || 'N/A'}</strong>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDirectBuy(country)}
                            disabled={buyingCountryId === country.id}
                            className="btn btn-primary btn-sm country-option-buy"
                          >
                            {buyingCountryId === country.id ? (
                              <><RefreshCwIcon size={13} className="animate-spin" /><span>Buying...</span></>
                            ) : (
                              <><ShoppingCartIcon size={14} /><span>Buy Number</span></>
                            )}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          {countryVisibleCount < totalCountryCount && (
            <LoadMoreSentinel onLoadMore={() => setCountryVisibleCount((count) => Math.min(count + 30, totalCountryCount))} />
          )}
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
    const isExpired = order?.status === 'expired' || step === 'expired';
    const isCancelled = order?.status === 'cancelled';
    const hasOtp = !!(order?.smsCode || otpData?.smsCode);
    const smsCode = order?.smsCode || otpData?.smsCode || '';
    const smsText = order?.smsText || otpData?.smsText || '';

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
                ? 'linear-gradient(135deg, var(--success-bg), var(--bg-card) 58%)'
                : isExpired || isCancelled
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.06), var(--bg-card))'
                : 'var(--bg-card)',
              border: hasOtp
                ? '1px solid rgba(16, 185, 129, 0.45)'
                : isExpired || isCancelled
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
                    borderRadius: '50%',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                >
                  {renderServiceIcon(selectedService || { code: order?.serviceCode, name: order?.serviceName }, 40)}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                    {order?.serviceName || selectedService?.name || 'SMS Verification'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {renderCountryFlag(selectedCountry || { iso: order?.countryIso, name: order?.countryName }, 28, 18)}
                    <span>{order?.countryName || selectedCountry?.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>•</span>
                    <span style={{ fontWeight: 600, color: 'var(--success)' }}>{formatCurrencyAmount(parseFloat(order?.priceInr || 0), currency, usdRate)}</span>
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
                    <span>{cancelDenied ? 'Cancellation denied · still waiting' : 'Checking live every 3s'}</span>
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
                {(isExpired || isCancelled) && (
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
                    <span>{isCancelled ? 'Cancelled' : 'Expired'}</span>
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
                  const countryDialCode = getCountryDialCode(selectedCountry || { name: order?.countryName });
                  const dialCodeDigits = countryDialCode.replace(/\D/g, '');
                  const providerNumberDigits = apiPhoneNumber.replace(/\D/g, '');
                  const phoneNumberOnly = dialCodeDigits && providerNumberDigits.startsWith(dialCodeDigits)
                    ? providerNumberDigits.slice(dialCodeDigits.length)
                    : providerNumberDigits || apiPhoneNumber;
                  const displayedPhoneNumber = apiPhoneNumber
                    ? `${countryDialCode ? `${countryDialCode} ` : ''}${phoneNumberOnly}`
                    : 'Generating...';
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span
                          onClick={() => apiPhoneNumber && copyToClipboard(phoneNumberOnly)}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'clamp(1.25rem, 4vw, 1.6rem)',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            letterSpacing: '0.02em',
                            wordBreak: 'break-all',
                            cursor: order?.phoneNumber ? 'pointer' : 'default',
                          }}
                          title={apiPhoneNumber ? `Click to copy ${phoneNumberOnly}` : undefined}
                        >
                          {displayedPhoneNumber}
                        </span>
                        {apiPhoneNumber && (
                          <button
                            onClick={() => copyToClipboard(phoneNumberOnly)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}
                            title={`Copy number only: ${phoneNumberOnly}`}
                          >
                            {copied ? <CheckIcon size={13} color="#10b981" /> : <CopyIcon size={13} />}
                            <span>{copied ? 'Copied!' : 'Copy Number'}</span>
                          </button>
                        )}
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0.6rem 0 0', lineHeight: 1.4 }}>
                        {countryDialCode ? <>If the app asks for a country code separately, enter <b>{countryDialCode}</b> there, then enter the number above in the phone number field. </> : <>Use this OTPWala number exactly as shown. </>}
                        Use it in <b>{order?.serviceName || 'your app'}</b>.
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
                  background: hasOtp ? 'var(--success-bg)' : isExpired || isCancelled ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.06)',
                  border: hasOtp ? '1px solid rgba(16, 185, 129, 0.45)' : isExpired || isCancelled ? '1px solid rgba(239, 68, 68, 0.3)' : '1px dashed rgba(245, 158, 11, 0.4)',
                }}
              >
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: hasOtp ? '#10b981' : isExpired || isCancelled ? '#ef4444' : '#f59e0b', marginBottom: '0.45rem', fontWeight: 700 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    {hasOtp ? <CheckCircleIcon size={15} /> : isExpired || isCancelled || cancelDenied ? <XIcon size={15} /> : <HourglassIcon size={15} />}
                    {hasOtp ? 'OTP Received' : isCancelled ? 'Cancelled' : isExpired ? 'Order Expired' : cancelDenied ? 'Cancellation Denied' : 'Waiting for OTP Code'}
                  </span>
                </div>

                {isWaiting && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: '#f59e0b' }}>
                      <RefreshCwIcon size={20} className="animate-spin" />
                      <span style={{ fontWeight: 700, fontSize: '1rem' }}>Waiting for SMS to arrive...</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {secondsLeft > 0 ? (
                        <>
                          <span>Activation window:</span>
                          <strong style={{ fontFamily: 'var(--font-mono)', color: secondsLeft < 180 ? '#ef4444' : '#f59e0b', fontSize: '0.95rem' }}>
                            {mins}:{secs.toString().padStart(2, '0')}
                          </strong>
                        </>
                      ) : <span>Checking the latest OTPWala order status...</span>}
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
                          color: 'var(--success)',
                          letterSpacing: '0.12em',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--success-border)',
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
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', background: 'var(--bg-input)', padding: '0.5rem 0.75rem', borderRadius: '6px', marginTop: '0.4rem', border: '1px solid var(--border-subtle)', lineHeight: 1.45 }}>
                        "{smsText}"
                      </div>
                    )}
                  </div>
                )}

                {(isExpired || isCancelled) && (
                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: '0 0 0.5rem', fontWeight: 600 }}>
                      {isCancelled ? 'OTPWala confirmed that this number was cancelled.' : 'No SMS code arrived within 20 minutes.'}
                    </p>
                    <p style={{ color: '#15803d', fontSize: '0.8rem', margin: 0 }}>
                      The number price is deducted when reserved. If no OTP arrives, an eligible refund is added to your OTPWala wallet after cancellation or expiry is confirmed. Wallet updates can take 5 to 10 minutes.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.78rem', color: isExpired || isCancelled ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: '0.35rem' }}><ShieldIcon size={15} aria-hidden="true" />The number price is deducted when reserved. If no OTP arrives, an eligible refund is added to your OTPWala wallet after cancellation or expiry is confirmed. Wallet updates can take 5 to 10 minutes.</span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {isWaiting && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                    {cancelDenied && (
                      <span style={{ color: '#f59e0b', fontSize: '0.75rem', maxWidth: '300px', textAlign: 'right' }}>
                        Your cancellation request was declined. The number is still waiting; you may try again.
                      </span>
                    )}
                    <button
                      onClick={handleCancel}
                      disabled={loading}
                      className="btn btn-danger btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}
                    >
                      <XIcon size={13} />
                      <span>
                        {loading
                          ? 'Cancelling...'
                          : cancelDenied
                          ? 'Try Cancel Again'
                          : 'Request Cancellation'}
                      </span>
                    </button>
                  </div>
                )}
                {hasOtp && (
                  <>
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
                {(isExpired || isCancelled) && (
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
            <div className="table-container responsive-card-table">
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Country</th>
                    <th>Number</th>
                    <th>Status</th>
                    <th>Price</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((ro) => (
                    <tr key={ro.id}>
                      <td data-label="Service" style={{ fontWeight: 600 }}>{ro.service_name}</td>
                      <td data-label="Country">{ro.country_name}</td>
                      <td data-label="Phone Number" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                        {ro.phone_number}
                      </td>
                      <td data-label="Status">
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
                        ) : (
                          <span className={`badge ${['code_received', 'completed'].includes(ro.status) ? 'badge-success' : ro.status === 'waiting' ? 'badge-warning' : ['cancelled', 'expired'].includes(ro.status) ? 'badge-error' : 'badge-warning'}`} style={{ fontWeight: 700 }}>
                            {['code_received', 'completed'].includes(ro.status) ? 'OTP Received' : ro.status.replace('_', ' ')}
                          </span>
                        )}
                      </td>
                      <td data-label="Price" style={{ fontWeight: 600 }}>
                        <span className={`order-price-emphasis ${ro.refund_status === 'refunded' || ro.status === 'refunded' ? 'is-refund' : ro.sms_code ? 'is-debit' : ro.status === 'waiting' ? 'is-waiting' : ''}`}>
                          {ro.refund_status === 'refunded' || ro.status === 'refunded' ? 'Refunded: ' : ro.sms_code ? '−' : ''}{formatCurrencyAmount(Number(ro.net_price_inr ?? ro.sell_price_inr ?? 0), currency, usdRate)}
                        </span>
                      </td>
                      <td data-label="Date" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
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
