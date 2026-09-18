import { useState, useEffect } from 'react';
import { getAdminPricing, saveAdminPricing, deleteAdminPricing, getServices, getCountries, getAdminSettings, saveAdminSettingsBatch } from '../../lib/api';
import {
  CalculatorIcon,
  RefreshCwIcon,
  Edit2Icon,
  Trash2Icon,
  GlobeIcon,
  SmartphoneIcon,
  CheckIcon,
  XIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  TagIcon,
  SaveIcon,
} from '../ui/Icons';
import { renderServiceIcon } from '../otp/BuyNumber';

interface PricingRule {
  id?: string;
  service_code: string | null;
  country_code: number | null;
  markup_type: 'percentage' | 'fixed';
  markup_value: number;
  priority: number;
  is_active: boolean;
}

export default function PricingManager() {
  const [rules, setRules] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [formData, setFormData] = useState<PricingRule>({
    service_code: null,
    country_code: null,
    markup_type: 'percentage',
    markup_value: 20,
    priority: 0,
    is_active: true,
  });

  // Profit Calculator state
  const [calcBaseUsd, setCalcBaseUsd] = useState<number>(0.25);
  const [rateMode, setRateMode] = useState<'tiger_default' | 'custom'>('custom');
  const [tigerDefaultRate, setTigerDefaultRate] = useState<number>(85.0);
  const [calcExchangeRate, setCalcExchangeRate] = useState<number>(86.5);
  const [calcMarkupType, setCalcMarkupType] = useState<'percentage' | 'fixed'>('percentage');
  const [calcMarkupValue, setCalcMarkupValue] = useState<number>(25);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pricingData, servicesData, countriesData, settingsData] = await Promise.all([
        getAdminPricing().catch(() => []),
        getServices().catch(() => []),
        getCountries().catch(() => []),
        getAdminSettings().catch(() => ({})),
      ]);
      setRules(pricingData || []);
      setServices(servicesData || []);
      setCountries(countriesData || []);

      if (settingsData?.dollar_rate_mode) {
        setRateMode(settingsData.dollar_rate_mode === 'tiger_default' ? 'tiger_default' : 'custom');
      }
      if (settingsData?.tiger_default_rate) {
        setTigerDefaultRate(parseFloat(settingsData.tiger_default_rate) || 85.0);
      }
      if (settingsData?.custom_dollar_rate) {
        setCalcExchangeRate(parseFloat(settingsData.custom_dollar_rate));
      } else if (settingsData?.usd_to_inr_rate) {
        setCalcExchangeRate(parseFloat(settingsData.usd_to_inr_rate));
      }
      const loadedMarkup = settingsData?.default_markup_percentage ?? settingsData?.default_markup_percent ?? settingsData?.default_markup_value;
      if (loadedMarkup !== undefined && loadedMarkup !== null && loadedMarkup !== '') {
        const parsed = parseFloat(loadedMarkup);
        if (!isNaN(parsed)) {
          setCalcMarkupValue(parsed);
        }
      }
      if (settingsData?.default_markup_type) {
        setCalcMarkupType(settingsData.default_markup_type === 'fixed' ? 'fixed' : 'percentage');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load pricing rules');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePricingSettings = async () => {
    setSavingRate(true);
    setError(null);
    setSuccess(null);
    const effectiveRate = rateMode === 'tiger_default' ? tigerDefaultRate : calcExchangeRate;
    try {
      await saveAdminSettingsBatch({
        dollar_rate_mode: rateMode,
        tiger_default_rate: tigerDefaultRate.toString(),
        custom_dollar_rate: calcExchangeRate.toString(),
        usd_to_inr_rate: effectiveRate.toString(),
        usdt_inr_rate: effectiveRate.toString(),
        default_markup_percentage: calcMarkupValue.toString(),
        default_markup_percent: calcMarkupValue.toString(),
        default_markup_type: calcMarkupType,
        default_markup_value: calcMarkupValue.toString(),
      });
      setSuccess(
        `All pricing settings saved successfully! Dollar exchange rate set to ₹${effectiveRate.toFixed(2)} and default profit margin set to ${calcMarkupValue}${calcMarkupType === 'percentage' ? '%' : '₹'}. Pricing cache refreshed!`
      );
    } catch (err: any) {
      setError(err.message || 'Failed to save pricing settings');
    } finally {
      setSavingRate(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingRule(null);
    setFormData({
      service_code: null,
      country_code: null,
      markup_type: calcMarkupType,
      markup_value: calcMarkupValue || 30,
      priority: 0,
      is_active: true,
    });
    setShowModal(true);
  };

  const openEditModal = (rule: any) => {
    setEditingRule(rule);
    setFormData({
      id: rule.id,
      service_code: rule.service_code || null,
      country_code: rule.country_code !== null ? Number(rule.country_code) : null,
      markup_type: rule.markup_type || 'percentage',
      markup_value: parseFloat(rule.markup_value) || 0,
      priority: rule.priority || 0,
      is_active: rule.is_active !== false,
    });
    setShowModal(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveAdminPricing({
        ...formData,
        service_code: formData.service_code === '' ? null : formData.service_code,
        country_code: formData.country_code === null || (formData.country_code as any) === '' ? null : Number(formData.country_code),
        markup_value: Number(formData.markup_value),
        priority: Number(formData.priority),
      });
      setSuccess('Pricing rule saved successfully!');
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this pricing rule?')) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteAdminPricing(id);
      setSuccess('Rule deleted successfully!');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete rule');
    }
  };

  const handleToggleActive = async (rule: any) => {
    try {
      await saveAdminPricing({
        ...rule,
        is_active: !rule.is_active,
      });
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update rule status');
    }
  };

  // Calculations for preview
  const effectiveExchangeRate = rateMode === 'tiger_default' ? tigerDefaultRate : calcExchangeRate;
  const baseCostInr = calcBaseUsd * effectiveExchangeRate;
  const userPriceInr = calcMarkupType === 'percentage'
    ? baseCostInr * (1 + calcMarkupValue / 100)
    : baseCostInr + calcMarkupValue;
  const profitInr = userPriceInr - baseCostInr;
  const profitMarginPercent = baseCostInr > 0 ? (profitInr / userPriceInr) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)' }}>
            Profit <span className="text-gradient">Margin Rules</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Set global baseline rates or create service-specific override rules to guarantee your profit
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={loadData}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            <RefreshCwIcon size={14} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={openCreateModal} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>+</span>
            <span>Add Override Rule</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSavePricingSettings}
            disabled={savingRate}
            title="Saves the global fallback dollar rate and markup percentage to platform settings"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
          >
            <SaveIcon size={14} />
            <span>{savingRate ? 'Saving...' : 'Save Baseline Rate & Margin'}</span>
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

      {/* Interactive Margin Calculator */}
      <div className="card glass-card" style={{ padding: '1.5rem', border: '1px solid var(--border-glow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <CalculatorIcon size={20} color="var(--accent-primary)" />
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Global Baseline Rate & Live Profit Simulator</h2>
              <span className="badge badge-accent" style={{ fontSize: '0.7rem' }}>Global Fallback</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.35rem 0 0 0' }}>
              Defines the baseline USD exchange rate and default profit margin for all services when no specific override rule is found below.
            </p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
              Tiger Base Cost (USD)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={calcBaseUsd}
              onChange={(e) => setCalcBaseUsd(parseFloat(e.target.value) || 0)}
              className="input"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Dollar Rate Option
              </label>
              <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                {rateMode === 'tiger_default' ? 'Tiger Default Active' : 'Custom Active'}
              </span>
            </div>
            
            {/* Mode selection toggle */}
            <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.4rem' }}>
              <button
                type="button"
                className={`btn btn-xs ${rateMode === 'tiger_default' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRateMode('tiger_default')}
                style={{ flex: 1, fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
              >
                Tiger Default (₹{tigerDefaultRate})
              </button>
              <button
                type="button"
                className={`btn btn-xs ${rateMode === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRateMode('custom')}
                style={{ flex: 1, fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
              >
                Custom Rate
              </button>
            </div>

            <div>
              {rateMode === 'tiger_default' ? (
                <input
                  type="text"
                  disabled
                  value={`₹${tigerDefaultRate.toFixed(2)} / USD (Tiger Default)`}
                  className="input"
                  style={{ width: '100%', opacity: 0.85, fontSize: '0.85rem', background: 'var(--bg-input)' }}
                />
              ) : (
                <input
                  type="number"
                  step="0.01"
                  value={calcExchangeRate}
                  onChange={(e) => setCalcExchangeRate(parseFloat(e.target.value) || 1)}
                  className="input"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  placeholder="e.g. 86.50"
                />
              )}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
              Markup Type
            </label>
            <select
              value={calcMarkupType}
              onChange={(e) => setCalcMarkupType(e.target.value as any)}
              className="input"
              style={{ width: '100%' }}
            >
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed Amount (₹)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
              Markup Value {calcMarkupType === 'percentage' ? '(%)' : '(₹)'}
            </label>
            <input
              type="number"
              step="1"
              value={calcMarkupValue}
              onChange={(e) => setCalcMarkupValue(parseFloat(e.target.value) || 0)}
              className="input"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Live Simulation Results */}
        <div style={{
          marginTop: '1.25rem',
          padding: '1rem',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-md)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          textAlign: 'center',
          border: '1px solid var(--border-subtle)'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Base Cost (INR)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>₹{baseCostInr.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>End-User Price</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '0.2rem' }}>
              ₹{userPriceInr.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Your Profit per Number</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399', marginTop: '0.2rem' }}>
              +₹{profitInr.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Effective Profit Margin</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8', marginTop: '0.2rem' }}>
              {profitMarginPercent.toFixed(1)}%
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              (Profit ÷ End-User Price)
            </div>
          </div>
        </div>

        {/* Card Action Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginTop: '1.25rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--border-subtle)',
        }}>
          <div>
            <div style={{ fontSize: '0.825rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              Global Baseline: ₹{effectiveExchangeRate.toFixed(2)} / USD &nbsp;|&nbsp; Fallback Margin: {calcMarkupValue}{calcMarkupType === 'percentage' ? '%' : '₹'}
            </div>
            <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Applies to all services without specific override rules below. Does not modify individual rules.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSavePricingSettings}
            disabled={savingRate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1.35rem', fontWeight: 600 }}
          >
            <SaveIcon size={16} />
            <span>{savingRate ? 'Saving Baseline...' : 'Save Baseline Rate & Margin'}</span>
          </button>
        </div>
      </div>

      {/* Rules Table */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Specific Service & Country Override Rules</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
              Custom rules that override the global baseline above for selected services or countries. Each rule is saved individually.
            </p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openCreateModal} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>+</span>
            <span>Add Override Rule</span>
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading pricing rules...
          </div>
        ) : rules.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center' }}>
            <TagIcon size={36} color="var(--text-muted)" style={{ margin: '0 auto 0.5rem auto' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No Custom Pricing Rules Configured</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: '400px', margin: '0.5rem auto 1rem auto' }}>
              The platform is currently using fallback default settings ({calcMarkupValue}{calcMarkupType === 'percentage' ? '%' : '₹'} margin). Add your first rule to adjust profits.
            </p>
            <button className="btn btn-primary btn-sm" onClick={openCreateModal}>
              + Add First Pricing Rule
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem' }}>Priority</th>
                  <th style={{ padding: '0.75rem' }}>Service</th>
                  <th style={{ padding: '0.75rem' }}>Country</th>
                  <th style={{ padding: '0.75rem' }}>Markup</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} style={{ borderBottom: '1px solid var(--border-subtle)', opacity: rule.is_active ? 1 : 0.5 }}>
                    <td style={{ padding: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      #{rule.priority || 0}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {rule.service_code ? (() => {
                        const matchedService = services.find((s) => s.code.toLowerCase() === rule.service_code?.toLowerCase());
                        return (
                          <span className="badge badge-info" style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.25rem 0.55rem' }}>
                            {renderServiceIcon(matchedService || rule.service_code, 16)}
                            <span>{matchedService ? matchedService.name : rule.service_code.toUpperCase()}</span>
                          </span>
                        );
                      })() : (
                        <span className="badge badge-ghost" style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          <GlobeIcon size={12} />
                          <span>All Services</span>
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {rule.country_code !== null && rule.country_code !== undefined ? (() => {
                        const matchedCountry = countries.find((c) => Number(c.id) === Number(rule.country_code));
                        const iso = matchedCountry?.iso || 'un';
                        return (
                          <span className="badge badge-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.25rem 0.55rem' }}>
                            <img
                              src={matchedCountry?.flagUrl || `https://tiger-sms.com/img/country/${iso.toUpperCase()}.svg`}
                              alt={matchedCountry?.name || String(rule.country_code)}
                              width="18"
                              height="13"
                              style={{ borderRadius: '2px', objectFit: 'cover', boxShadow: '0 0 0 1px rgba(255,255,255,0.1)' }}
                              onError={(e) => {
                                const fb = `https://flagcdn.com/${iso.toLowerCase()}.svg`;
                                if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                              }}
                            />
                            <span>{matchedCountry ? matchedCountry.name : `Country #${rule.country_code}`}</span>
                          </span>
                        );
                      })() : (
                        <span className="badge badge-ghost" style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          <GlobeIcon size={12} />
                          <span>All Countries</span>
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--success)' }}>
                      {rule.markup_type === 'percentage'
                        ? `+${rule.markup_value}%`
                        : `+₹${parseFloat(rule.markup_value).toFixed(2)}`}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <button
                        onClick={() => handleToggleActive(rule)}
                        className={`badge ${rule.is_active ? 'badge-success' : 'badge-ghost'}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        title="Click to toggle active/inactive"
                      >
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEditModal(rule)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                          <Edit2Icon size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--error)' }}
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          <Trash2Icon size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="modal-backdrop" style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div className="card glass-card" style={{ maxWidth: '520px', width: '100%', padding: '1.75rem', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                {editingRule ? 'Edit Pricing Rule' : 'Create Pricing Rule'}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>
                <XIcon size={14} />
              </button>
            </div>

            <form onSubmit={handleSaveRule} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Target Service
                </label>
                <select
                  value={formData.service_code || ''}
                  onChange={(e) => setFormData({ ...formData, service_code: e.target.value || null })}
                  className="input"
                  style={{ width: '100%' }}
                >
                  <option value="">All Services (Global default)</option>
                  {services.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code.toUpperCase()})
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Leave as "All Services" for a fallback rule across entire catalog
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Target Country
                </label>
                <select
                  value={formData.country_code !== null ? formData.country_code : ''}
                  onChange={(e) => setFormData({ ...formData, country_code: e.target.value ? Number(e.target.value) : null })}
                  className="input"
                  style={{ width: '100%' }}
                >
                  <option value="">All Countries (Global default)</option>
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (ID: {c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                    Markup Type
                  </label>
                  <select
                    value={formData.markup_type}
                    onChange={(e) => setFormData({ ...formData, markup_type: e.target.value as any })}
                    className="input"
                    style={{ width: '100%' }}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed INR (₹)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                    Markup Value {formData.markup_type === 'percentage' ? '(%)' : '(₹)'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={formData.markup_value}
                    onChange={(e) => setFormData({ ...formData, markup_value: parseFloat(e.target.value) || 0 })}
                    className="input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                    Rule Priority
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                    className="input"
                    style={{ width: '100%' }}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Higher number wins (e.g. 10 overrides 0)
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.75rem' }}>
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    />
                    <span style={{ fontSize: '0.875rem' }}>Active Immediately</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving ? 'Saving...' : editingRule ? 'Update Override Rule' : 'Create Override Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
