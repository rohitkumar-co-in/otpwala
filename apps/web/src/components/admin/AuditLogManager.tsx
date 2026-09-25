import { useEffect, useState, useMemo } from 'react';
import { getAdminAuditLogs } from '../../lib/api';
import { toast } from '../../lib/toast';
import {
  RefreshCwIcon,
  AlertCircleIcon,
  CheckIcon,
  SearchIcon,
  XIcon,
  EyeIcon,
  CopyIcon,
  DownloadIcon,
  ClockIcon,
  SettingsIcon,
  DollarIcon,
  UsersIcon,
  ShieldIcon,
  MessageCircleIcon,
} from '../ui/Icons';

interface AuditLog {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: any;
  ip_address: string | null;
  created_at: string;
  profiles?: {
    email?: string;
    full_name?: string;
  } | null;
}

const CATEGORY_CHIPS = [
  { label: 'All Actions', value: '', icon: ShieldIcon },
  { label: 'Settings', value: 'settings', icon: SettingsIcon },
  { label: 'Wallet & Funds', value: 'wallet', icon: DollarIcon },
  { label: 'Users & Roles', value: 'user', icon: UsersIcon },
  { label: 'Support', value: 'support', icon: MessageCircleIcon },
];

function getActionBadgeStyle(action: string): { bg: string; color: string; border: string } {
  if (action.startsWith('settings')) {
    return { bg: 'rgba(168, 85, 247, 0.12)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.25)' };
  }
  if (action.startsWith('wallet') || action.includes('credit') || action.includes('topup')) {
    return { bg: 'rgba(16, 185, 129, 0.12)', color: '#34d399', border: 'rgba(16, 185, 129, 0.25)' };
  }
  if (action.includes('ban') || action.includes('delete') || action.includes('erasure')) {
    return { bg: 'rgba(239, 68, 68, 0.12)', color: '#f87171', border: 'rgba(239, 68, 68, 0.25)' };
  }
  if (action.startsWith('user')) {
    return { bg: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.25)' };
  }
  if (action.startsWith('support')) {
    return { bg: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.25)' };
  }
  return { bg: 'rgba(148, 163, 184, 0.12)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.25)' };
}

function renderDetailsSummary(metadata: any) {
  if (!metadata || typeof metadata !== 'object' || Object.keys(metadata).length === 0) {
    return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.78rem' }}>No metadata</span>;
  }

  // Common pattern 1: Settings updated with keys array
  if (Array.isArray(metadata.keys) && metadata.keys.length > 0) {
    const visibleKeys = metadata.keys.slice(0, 3);
    const extraCount = metadata.keys.length - 3;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Updated <strong>{metadata.keys.length}</strong> configuration keys:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {visibleKeys.map((k: string) => (
            <span
              key={k}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                padding: '0.1rem 0.4rem',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {k}
            </span>
          ))}
          {extraCount > 0 && (
            <span
              style={{
                fontSize: '0.7rem',
                padding: '0.1rem 0.4rem',
                borderRadius: '4px',
                background: 'rgba(99, 102, 241, 0.12)',
                color: '#818cf8',
                fontWeight: 600,
              }}
            >
              +{extraCount} more
            </span>
          )}
        </div>
      </div>
    );
  }

  // Common pattern 2: Wallet credit / debit
  if (metadata.amount !== undefined || metadata.credit_source || metadata.reason) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.78rem' }}>
        {metadata.amount !== undefined && (
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Amount:</span>{' '}
            <strong style={{ color: '#34d399' }}>₹{metadata.amount}</strong>
          </div>
        )}
        {metadata.reason && (
          <div style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--text-muted)' }}>Reason:</span> {metadata.reason}
          </div>
        )}
      </div>
    );
  }

  // Common pattern 3: Generic object preview
  const keys = Object.keys(metadata);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
        {keys.slice(0, 3).map((k) => {
          const val = typeof metadata[k] === 'object' ? '{...}' : String(metadata[k]);
          return (
            <span
              key={k}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                padding: '0.12rem 0.4rem',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>{k}:</span> {val.length > 18 ? val.slice(0, 18) + '…' : val}
            </span>
          );
        })}
        {keys.length > 3 && (
          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', color: 'var(--text-muted)' }}>
            +{keys.length - 3} more
          </span>
        )}
      </div>
    </div>
  );
}

export default function AuditLogManager() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [recentRefresh, setRecentRefresh] = useState(false);
  const [error, setError] = useState('');

  // Inspection modal state
  const [inspectLog, setInspectLog] = useState<AuditLog | null>(null);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  const load = async (isManual = false, filterOverride?: string) => {
    setLoading(true);
    setError('');
    const query = filterOverride !== undefined ? filterOverride : actionFilter;
    try {
      const data = await getAdminAuditLogs(100, 0, query);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      if (isManual) {
        setRecentRefresh(true);
        setTimeout(() => setRecentRefresh(false), 2500);
        toast.success('Audit trail refreshed.', 'Audit Refreshed');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load audit records');
      if (isManual) {
        toast.error(err.message || 'Unable to load audit records', 'Refresh Failed');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCategorySelect = (catValue: string) => {
    setActiveCategory(catValue);
    setActionFilter(catValue);
    setSearchInput(catValue);
    load(false, catValue);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActionFilter(searchInput);
    setActiveCategory('');
    load(false, searchInput);
  };

  const handleClearFilter = () => {
    setSearchInput('');
    setActionFilter('');
    setActiveCategory('');
    load(false, '');
  };

  const handleCopyPayload = (metadata: any) => {
    navigator.clipboard.writeText(JSON.stringify(metadata, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
    toast.success('Audit payload copied to clipboard.');
  };

  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
    toast.success(`Copied IP: ${ip}`);
  };

  const handleDownloadPayload = (log: AuditLog) => {
    const filename = `audit-log-${log.id.slice(0, 8)}-${log.action}.json`;
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filename}`);
  };

  const handleExportAllLogs = () => {
    if (logs.length === 0) {
      toast.error('No logs available to export.');
      return;
    }
    const filename = `otpwala-admin-audit-trail-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${logs.length} audit records.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>
              Admin <span className="text-gradient">Audit Trail</span>
            </h1>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.2rem 0.6rem',
                borderRadius: '9999px',
                background: 'rgba(99, 102, 241, 0.12)',
                color: '#818cf8',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <ShieldIcon size={12} />
              IMMUTABLE SEC-AUDIT
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
            Cryptographically sealed, append-only record of privileged administrator operations. Showing {logs.length} of {total} records.
          </p>
        </div>

        {/* Global actions */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={handleExportAllLogs}
            disabled={logs.length === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            title="Download audit records as JSON"
          >
            <DownloadIcon size={14} />
            <span>Export Trail</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              borderColor: recentRefresh ? '#10b981' : undefined,
              color: recentRefresh ? '#34d399' : undefined,
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
                <span>Refresh</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          padding: '0.85rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          background: 'var(--bg-surface)',
        }}
      >
        {/* Category Quick Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: '0.2rem', fontWeight: 600 }}>
            Quick Filter:
          </span>
          {CATEGORY_CHIPS.map((chip) => {
            const Icon = chip.icon;
            const isSelected = activeCategory === chip.value && (chip.value !== '' || actionFilter === '');
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleCategorySelect(chip.value)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.78rem',
                  fontWeight: isSelected ? 600 : 500,
                  padding: '0.3rem 0.65rem',
                  borderRadius: '6px',
                  border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  color: isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={13} />
                <span>{chip.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Input Row */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
            <div
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <SearchIcon size={15} />
            </div>
            <input
              className="input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search action, e.g. settings.update, wallet.credit, user.ban..."
              aria-label="Filter audit action"
              style={{
                paddingLeft: '2.2rem',
                paddingRight: searchInput ? '2rem' : '0.75rem',
                width: '100%',
                fontSize: '0.85rem',
              }}
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearFilter}
                style={{
                  position: 'absolute',
                  right: '0.6rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px',
                }}
                title="Clear filter"
              >
                <XIcon size={14} />
              </button>
            )}
          </div>
          <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>
            Search
          </button>
          {actionFilter && (
            <button className="btn btn-secondary btn-sm" type="button" onClick={handleClearFilter} disabled={loading}>
              Clear
            </button>
          )}
        </form>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircleIcon size={18} /> {error}
        </div>
      )}

      {/* Main Audit Records Table Card */}
      <div
        className="card"
        style={{
          padding: 0,
          overflow: 'hidden',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
        }}
      >
        <div className="responsive-card-table" style={{ overflowX: 'auto', width: '100%' }}>
          <table
            style={{
              width: '100%',
              minWidth: '1020px',
              borderCollapse: 'collapse',
              fontSize: '0.84rem',
              textAlign: 'left',
            }}
          >
            <caption className="sr-only">Privileged administrator actions ordered from newest to oldest</caption>
            <thead>
              <tr
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderBottom: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <th scope="col" style={{ padding: '0.85rem 1rem', width: '160px' }}>
                  Timestamp
                </th>
                <th scope="col" style={{ padding: '0.85rem 1rem', width: '180px' }}>
                  Actor
                </th>
                <th scope="col" style={{ padding: '0.85rem 1rem', width: '150px' }}>
                  Action
                </th>
                <th scope="col" style={{ padding: '0.85rem 1rem', width: '140px' }}>
                  Target
                </th>
                <th scope="col" style={{ padding: '0.85rem 1rem', minWidth: '320px' }}>
                  Details & Payload Preview
                </th>
                <th scope="col" style={{ padding: '0.85rem 1rem', width: '120px' }}>
                  IP Address
                </th>
                <th scope="col" style={{ padding: '0.85rem 1rem', width: '80px', textAlign: 'center' }}>
                  Inspect
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const dateObj = new Date(log.created_at);
                const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                const timeStr = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const badgeStyle = getActionBadgeStyle(log.action);
                const actorEmail = log.profiles?.email || (log.actor_id ? `${log.actor_id.slice(0, 8)}...` : 'System');

                return (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background 0.15s ease',
                    }}
                    className="audit-row"
                  >
                    {/* Timestamp */}
                    <td data-label="Timestamp" style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.82rem' }}>{dateStr}</span>
                        <span
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.74rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          <ClockIcon size={11} /> {timeStr}
                        </span>
                      </div>
                    </td>

                    {/* Actor */}
                    <td data-label="Actor" style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            background: log.profiles?.email ? 'rgba(99, 102, 241, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                            color: log.profiles?.email ? '#818cf8' : '#94a3b8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            flexShrink: 0,
                          }}
                        >
                          {log.profiles?.email ? log.profiles.email[0].toUpperCase() : 'S'}
                        </div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              fontSize: '0.8rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={log.profiles?.email || log.actor_id || 'System'}
                          >
                            {actorEmail}
                          </div>
                          {log.profiles?.full_name && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{log.profiles.full_name}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Action */}
                    <td data-label="Action" style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '0.25rem 0.55rem',
                          borderRadius: '6px',
                          background: badgeStyle.bg,
                          color: badgeStyle.color,
                          border: `1px solid ${badgeStyle.border}`,
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {log.action}
                      </span>
                    </td>

                    {/* Target */}
                    <td data-label="Target" style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: '0.78rem',
                            color: 'var(--text-secondary)',
                            textTransform: 'capitalize',
                          }}
                        >
                          {log.target_type || 'N/A'}
                        </span>
                        {log.target_id && (
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.72rem',
                              color: 'var(--text-muted)',
                              background: 'rgba(255, 255, 255, 0.03)',
                              padding: '0.05rem 0.35rem',
                              borderRadius: '4px',
                              width: 'fit-content',
                            }}
                            title={log.target_id}
                          >
                            {log.target_id.length > 12 ? `${log.target_id.slice(0, 10)}…` : log.target_id}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Details / Payload Summary */}
                    <td
                      data-label="Details & Payload Preview"
                      style={{
                        padding: '0.85rem 1rem',
                        verticalAlign: 'middle',
                        cursor: 'pointer',
                      }}
                      onClick={() => setInspectLog(log)}
                      title="Click to inspect full JSON payload"
                    >
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          padding: '0.45rem 0.65rem',
                          minHeight: '38px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.5rem',
                          transition: 'border-color 0.15s ease',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>{renderDetailsSummary(log.metadata)}</div>
                        <span
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.72rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            flexShrink: 0,
                            opacity: 0.7,
                          }}
                        >
                          <EyeIcon size={12} />
                        </span>
                      </div>
                    </td>

                    {/* IP Address */}
                    <td data-label="IP Address" style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                      {log.ip_address ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {log.ip_address}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyIp(log.ip_address!);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: copiedIp === log.ip_address ? '#34d399' : 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            title="Copy IP"
                          >
                            {copiedIp === log.ip_address ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>N/A</span>
                      )}
                    </td>

                    {/* Inspect Button */}
                    <td data-label="Inspect" style={{ padding: '0.85rem 1rem', textAlign: 'center', verticalAlign: 'middle' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setInspectLog(log)}
                        style={{
                          padding: '0.35rem 0.6rem',
                          fontSize: '0.75rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}
                        title="View complete record details"
                      >
                        <EyeIcon size={13} />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && logs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--text-muted)' }}>
            <ShieldIcon size={36} color="var(--text-muted)" style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>No Audit Records Found</div>
            <p style={{ fontSize: '0.82rem', margin: '0.35rem 0 1rem' }}>
              {actionFilter ? `No logs matched the filter "${actionFilter}".` : 'No administrative actions recorded yet.'}
            </p>
            {actionFilter && (
              <button className="btn btn-secondary btn-sm" type="button" onClick={handleClearFilter}>
                Clear Filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* Payload Inspection Modal */}
      {inspectLog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
          onClick={() => setInspectLog(null)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(99, 102, 241, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#818cf8',
                  }}
                >
                  <ShieldIcon size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                    Audit Record Inspector
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    ID: {inspectLog.id}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectLog(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <XIcon size={20} />
              </button>
            </div>

            {/* Modal Content / Metadata Grid */}
            <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>Action</div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: getActionBadgeStyle(inspectLog.action).color,
                    }}
                  >
                    {inspectLog.action}
                  </span>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>Timestamp</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {new Date(inspectLog.created_at).toLocaleString()}
                  </div>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>Actor</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                    {inspectLog.profiles?.email || inspectLog.actor_id || 'System'}
                  </div>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>Target & IP</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                    <strong>{inspectLog.target_type}</strong>
                    {inspectLog.target_id ? ` (${inspectLog.target_id.slice(0, 8)}…)` : ''}
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      IP: {inspectLog.ip_address || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Formatted JSON Payload Inspector */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Full JSON Metadata Payload
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={() => handleCopyPayload(inspectLog.metadata)}
                      style={{
                        padding: '0.25rem 0.55rem',
                        fontSize: '0.72rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      {copiedPayload ? <CheckIcon size={12} color="#34d399" /> : <CopyIcon size={12} />}
                      <span>{copiedPayload ? 'Copied!' : 'Copy JSON'}</span>
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={() => handleDownloadPayload(inspectLog)}
                      style={{
                        padding: '0.25rem 0.55rem',
                        fontSize: '0.72rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <DownloadIcon size={12} />
                      <span>Download</span>
                    </button>
                  </div>
                </div>

                <pre
                  style={{
                    background: '#090d16',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '1rem',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-mono)',
                    color: '#e2e8f0',
                    lineHeight: '1.5',
                    maxHeight: '320px',
                    overflowY: 'auto',
                    overflowX: 'auto',
                    margin: 0,
                  }}
                >
                  <code>{JSON.stringify(inspectLog.metadata || {}, null, 2)}</code>
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--border-subtle)',
                background: 'rgba(255, 255, 255, 0.01)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setInspectLog(null)}>
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
