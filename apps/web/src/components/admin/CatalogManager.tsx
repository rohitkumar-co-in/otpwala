import { useState, useEffect } from 'react';
import {
  getAdminCatalog,
  toggleAdminService,
  toggleFeaturedService,
  toggleFeaturedCountry,
  toggleAdminCountry,
  batchUpdateAdminCatalog,
} from '../../lib/api';
import {
  SmartphoneIcon,
  GlobeIcon,
  RefreshCwIcon,
  SearchIcon,
  StarIcon,
  CheckIcon,
  XIcon,
  AlertCircleIcon,
  CheckCircleIcon,
} from '../ui/Icons';
import { renderServiceIcon } from '../otp/BuyNumber';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';

const getCachedCatalog = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem('otpwala_admin_catalog_cache');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export default function CatalogManager() {
  const cached = getCachedCatalog();
  const [activeTab, setActiveTab] = useState<'services' | 'countries'>('services');
  const [services, setServices] = useState<any[]>(cached?.services || []);
  const [countries, setCountries] = useState<any[]>(cached?.countries || []);
  const [stats, setStats] = useState<any>(cached?.stats || null);
  const [loading, setLoading] = useState(!cached?.services && !cached?.countries);
  const [hasLoaded, setHasLoaded] = useState(Boolean(cached?.services || cached?.countries));
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [sortBy, setSortBy] = useState<'featured' | 'name_asc' | 'name_desc'>('featured');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [recentRefresh, setRecentRefresh] = useState(false);

  const loadCatalog = async (isManual = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminCatalog();
      setServices(data.services || []);
      setCountries(data.countries || []);
      setStats(data.stats || null);

      try {
        sessionStorage.setItem('otpwala_admin_catalog_cache', JSON.stringify({
          services: data.services || [],
          countries: data.countries || [],
          stats: data.stats || null,
        }));
      } catch {}
      setHasLoaded(true);

      if (isManual) {
        setRecentRefresh(true);
        setTimeout(() => setRecentRefresh(false), 2500);
        toast.success('Catalog services and countries refreshed.', 'Catalog Refreshed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load catalog settings');
      if (isManual) {
        toast.error(err.message || 'Failed to load catalog settings', 'Refresh Failed');
      }
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const handleToggleService = async (code: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    // Optimistic UI update
    setServices((prev) =>
      prev.map((s) => (s.code === code ? { ...s, enabled: nextStatus } : s))
    );
    setActionLoading(`svc-${code}`);
    setError(null);
    try {
      await toggleAdminService(code, nextStatus);
      setStats((prev: any) =>
        prev
          ? {
              ...prev,
              enabledServices: nextStatus
                ? prev.enabledServices + 1
                : prev.enabledServices - 1,
            }
          : prev
      );
    } catch (err: any) {
      // Revert optimistic update
      setServices((prev) =>
        prev.map((s) => (s.code === code ? { ...s, enabled: currentStatus } : s))
      );
      setError(err.message || 'Failed to update service status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleCountry = async (id: number, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    // Optimistic UI update
    setCountries((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: nextStatus } : c))
    );
    setActionLoading(`cnt-${id}`);
    setError(null);
    try {
      await toggleAdminCountry(id, nextStatus);
      setStats((prev: any) =>
        prev
          ? {
              ...prev,
              enabledCountries: nextStatus
                ? prev.enabledCountries + 1
                : prev.enabledCountries - 1,
            }
          : prev
      );
    } catch (err: any) {
      // Revert optimistic update
      setCountries((prev) =>
        prev.map((c) => (c.id === id ? { ...c, enabled: currentStatus } : c))
      );
      setError(err.message || 'Failed to update country status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleFeatured = async (code: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    setServices((prev) => prev.map((s) => s.code === code ? { ...s, featured: nextStatus } : s));
    setActionLoading(`featured-${code}`);
    setError(null);
    try {
      await toggleFeaturedService(code, nextStatus);
      setSuccess(`${code.toUpperCase()} ${nextStatus ? 'added to' : 'removed from'} featured services.`);
    } catch (err: any) {
      setServices((prev) => prev.map((s) => s.code === code ? { ...s, featured: currentStatus } : s));
      setError(err.message || 'Failed to update featured service');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleFeaturedCountry = async (id: number, name: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    setCountries((prev) => prev.map((country) => country.id === id ? { ...country, featured: nextStatus } : country));
    setActionLoading(`featured-country-${id}`);
    setError(null);
    try {
      await toggleFeaturedCountry(id, nextStatus);
      setSuccess(`${name} ${nextStatus ? 'added to' : 'removed from'} popular countries.`);
    } catch (err: any) {
      setCountries((prev) => prev.map((country) => country.id === id ? { ...country, featured: currentStatus } : country));
      setError(err.message || 'Failed to update popular country');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBatchAction = async (action: string, description: string) => {
    const confirmed = await showConfirm({
      title: 'Confirm Catalog Update',
      message: `Are you sure you want to ${description}? This will update the catalog visibility for all users immediately.`,
      confirmText: 'Apply Batch Update',
      cancelText: 'Cancel',
      type: 'warning',
    });
    if (!confirmed) return;
    setActionLoading(action);
    setError(null);
    setSuccess(null);
    try {
      await batchUpdateAdminCatalog(action);
      setSuccess(`Executed: ${description}`);
      await loadCatalog();
    } catch (err: any) {
      setError(err.message || 'Failed to perform batch update');
    } finally {
      setActionLoading(null);
    }
  };

  // Filter & sort list
  const filteredServices = services
    .filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.code.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (filterState === 'enabled') return s.enabled;
      if (filterState === 'disabled') return !s.enabled;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const filteredCountries = countries
    .filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        String(c.id).includes(search);
      if (!matchesSearch) return false;
      if (filterState === 'enabled') return c.enabled;
      if (filterState === 'disabled') return !c.enabled;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const activeServicesCount = stats?.enabledServices ?? services.filter((s) => s.enabled).length;
  const activeCountriesCount = stats?.enabledCountries ?? countries.filter((c) => c.enabled).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)' }}>
            Catalog & <span className="text-gradient">Visibility Controls</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Choose which services and countries are visible and purchasable for customers on OTPWala
          </p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => loadCatalog(true)}
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

      {/* Loading banner when fetching fresh configuration */}
      {loading && !hasLoaded && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.85rem 1.25rem',
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
          marginBottom: '0.5rem',
        }}>
          <RefreshCwIcon size={16} className="animate-spin" color="var(--accent-primary)" />
          <span>Loading SMS catalog services &amp; countries...</span>
        </div>
      )}

      {/* Metrics & Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <div
          className="card glass-card"
          onClick={() => { setActiveTab('services'); setSearch(''); }}
          style={{
            padding: '1.25rem',
            cursor: 'pointer',
            border: activeTab === 'services' ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
            background: activeTab === 'services' ? 'var(--accent-glow)' : 'var(--bg-card)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              SMS Services Catalog
            </span>
            <SmartphoneIcon size={20} color="var(--accent-primary)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--accent-primary)' }}>
              {loading && !hasLoaded ? '...' : activeServicesCount}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {loading && !hasLoaded ? 'Loading...' : `/ ${services.length} Enabled`}
            </span>
          </div>
          <div style={{ marginTop: '0.5rem', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '999px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                background: 'var(--accent-gradient)',
                width: `${services.length ? (activeServicesCount / services.length) * 100 : 0}%`,
              }}
            ></div>
          </div>
        </div>

        <div
          className="card glass-card"
          onClick={() => { setActiveTab('countries'); setSearch(''); }}
          style={{
            padding: '1.25rem',
            cursor: 'pointer',
            border: activeTab === 'countries' ? '2px solid #10b981' : '1px solid var(--border-subtle)',
            background: activeTab === 'countries' ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-card)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Countries & Regions
            </span>
            <GlobeIcon size={20} color="#34d399" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: '#34d399' }}>
              {loading && !hasLoaded ? '...' : activeCountriesCount}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {loading && !hasLoaded ? 'Loading...' : `/ ${countries.length} Enabled`}
            </span>
          </div>
          <div style={{ marginTop: '0.5rem', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '999px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                background: '#10b981',
                width: `${countries.length ? (activeCountriesCount / countries.length) * 100 : 0}%`,
              }}
            ></div>
          </div>
        </div>
      </div>

      {/* Tabs & Controls */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          {/* Tab Selector */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn btn-sm ${activeTab === 'services' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setActiveTab('services'); setSearch(''); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <SmartphoneIcon size={14} />
              <span>Services ({services.length})</span>
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'countries' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setActiveTab('countries'); setSearch(''); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <GlobeIcon size={14} />
              <span>Countries ({countries.length})</span>
            </button>
          </div>

          {/* Quick Batch Presets */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {activeTab === 'services' ? (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={actionLoading !== null}
                  onClick={() => handleBatchAction('enable_all_services', 'Enable All Services')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <CheckIcon size={13} />
                  <span>Enable All</span>
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--error)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  disabled={actionLoading !== null}
                  onClick={() => handleBatchAction('disable_all_services', 'Disable All Services')}
                >
                  <XIcon size={13} />
                  <span>Disable All</span>
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={actionLoading !== null}
                  onClick={() => handleBatchAction('enable_all_countries', 'Enable All Countries')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <CheckIcon size={13} />
                  <span>Enable All</span>
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--error)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  disabled={actionLoading !== null}
                  onClick={() => handleBatchAction('disable_all_countries', 'Disable All Countries')}
                >
                  <XIcon size={13} />
                  <span>Disable All</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <input
              type="text"
              aria-label={`Search ${activeTab === 'services' ? 'services' : 'countries'}`}
              placeholder={`Search ${activeTab === 'services' ? 'services (e.g. WhatsApp, tg)...' : 'countries (e.g. India, 22)...'}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
              style={{ width: '100%', paddingLeft: '2.5rem' }}
            />
            <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, display: 'flex', alignItems: 'center' }}>
              <SearchIcon size={15} />
            </span>
          </div>

          <select
            aria-label="Filter catalog status"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value as any)}
            className="input"
            style={{ width: 'auto', minWidth: '150px' }}
          >
            <option value="all">All ({activeTab === 'services' ? services.length : countries.length})</option>
            <option value="enabled">Enabled Only ({activeTab === 'services' ? activeServicesCount : activeCountriesCount})</option>
            <option value="disabled">Disabled Only</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="input"
            style={{ width: 'auto', minWidth: '160px' }}
            aria-label="Sort catalog items"
          >
            <option value="featured">Featured First</option>
            <option value="name_asc">Name: A to Z</option>
            <option value="name_desc">Name: Z to A</option>
          </select>
        </div>

        {/* Content Listing */}
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading catalog from provider...
          </div>
        ) : activeTab === 'services' ? (
          /* Services Card Grid */
          filteredServices.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No services match your search or filter.
            </div>
          ) : (
            <div className="admin-catalog-card-grid">
              {filteredServices.map((s) => (
                <article key={s.code} className={`card admin-catalog-card ${s.enabled ? '' : 'is-disabled'}`}>
                  <button
                    type="button"
                    onClick={() => handleToggleFeatured(s.code, !!s.featured)}
                    disabled={actionLoading === `featured-${s.code}`}
                    className={`admin-catalog-feature ${s.featured ? 'is-featured' : ''}`}
                    title={s.featured ? 'Remove from featured services' : 'Feature this service at the top'}
                    aria-label={s.featured ? `Remove ${s.name} from featured services` : `Feature ${s.name}`}
                  >
                    <StarIcon size={13} color="currentColor" />
                    <span>{s.featured ? 'Featured' : 'Feature'}</span>
                  </button>
                  <div className="admin-catalog-card-icon">{renderServiceIcon(s, 50)}</div>
                  <div className="admin-catalog-card-name" title={s.name}>{s.name}</div>
                  <div className="admin-catalog-card-code">Code: {s.code}</div>
                  <button
                    type="button"
                    onClick={() => handleToggleService(s.code, s.enabled)}
                    disabled={actionLoading === `svc-${s.code}`}
                    className={`catalog-visibility-toggle ${s.enabled ? 'is-enabled' : 'is-disabled'}`}
                    title="Click to toggle live visibility"
                  >
                    {s.enabled ? <CheckIcon size={12} /> : <XIcon size={12} />}
                    <span>{s.enabled ? 'Enabled' : 'Disabled'}</span>
                  </button>
                </article>
              ))}
            </div>
          )
        ) : (
          /* Countries Grid */
          filteredCountries.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No countries match your search or filter.
            </div>
          ) : (
            <div className="admin-catalog-card-grid">
              {filteredCountries.map((c) => (
                <article key={c.id} className={`card admin-catalog-card ${c.enabled ? '' : 'is-disabled'}`}>
                  <button
                    type="button"
                    onClick={() => handleToggleFeaturedCountry(c.id, c.name, !!c.featured)}
                    disabled={actionLoading === `featured-country-${c.id}`}
                    className={`admin-catalog-feature ${c.featured ? 'is-featured' : ''}`}
                    title={c.featured ? 'Remove from popular countries' : 'Show in the Popular countries section'}
                    aria-label={c.featured ? `Remove ${c.name} from popular countries` : `Add ${c.name} to popular countries`}
                  >
                    <StarIcon size={13} color="currentColor" />
                    <span>{c.featured ? 'Popular' : 'Make Popular'}</span>
                  </button>
                  <div className="admin-catalog-card-icon">
                    <img
                      src={c.flagUrl || `/api/catalog/country-flag/${String(c.iso || 'un').toLowerCase()}`}
                      alt={`${c.name} flag`}
                      width="50"
                      height="50"
                      loading="lazy"
                      onError={(e) => {
                        const fallback = `/api/catalog/country-flag/${String(c.iso || 'un').toLowerCase()}`;
                        if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                      }}
                    />
                  </div>
                  <div className="admin-catalog-card-name" title={c.name}>{c.name}</div>
                  <div className="admin-catalog-card-code">Country ID: {c.id}</div>
                  <button
                    type="button"
                    onClick={() => handleToggleCountry(c.id, c.enabled)}
                    disabled={actionLoading === `cnt-${c.id}`}
                    className={`catalog-visibility-toggle ${c.enabled ? 'is-enabled' : 'is-disabled'}`}
                    title="Click to toggle country visibility"
                  >
                    {c.enabled ? <CheckIcon size={12} /> : <XIcon size={12} />}
                    <span>{c.enabled ? 'Enabled' : 'Disabled'}</span>
                  </button>
                </article>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
