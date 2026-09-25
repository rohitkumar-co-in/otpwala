import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  getAdminUsers,
  getAdminUserDetails,
  getAdminUserExport,
  getAdminUserPurgeHistory,
  creditUser,
  banUser,
  setUserZeroMarkup,
  purgeUser,
  bulkBanUsers,
  bulkPurgeUsers,
  promoteAdmin,
  demoteAdmin,
} from '../../lib/api';
import type { AdminFundingSource, UserPurgeMode } from '../../lib/api';
import FundingSourcePicker from './FundingSourcePicker';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { promptAndDownloadUserData } from '../../lib/dataExport';
import {
  SearchIcon,
  RefreshCwIcon,
  CreditCardIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  XIcon,
  TrashIcon,
  EyeIcon,
  DownloadIcon,
} from '../ui/Icons';

export default function UserManager() {
  const [currentUserRole, setCurrentUserRole] = useState<string>('admin');
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [userSort, setUserSort] = useState<'recent' | 'alphabetical' | 'deposited'>('recent');
  const [userRole, setUserRole] = useState<'' | 'superadmin' | 'admin' | 'user'>('');
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [recentRefresh, setRecentRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Credit modal state
  const [creditUserTarget, setCreditUserTarget] = useState<any | null>(null);
  const [creditAmount, setCreditAmount] = useState<number>(100);
  const [creditReason, setCreditReason] = useState<string>('Manual Admin Credit');
  // Required, never defaulted: silent guesses are what made the balance sheet unclear.
  const [creditFundingSource, setCreditFundingSource] = useState<'' | AdminFundingSource>('');
  const [crediting, setCrediting] = useState(false);

  // Single delete confirmation modal state
  const [purgeTarget, setPurgeTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [purgeMode, setPurgeMode] = useState<UserPurgeMode>('history');
  const [purgeConfirmation, setPurgeConfirmation] = useState('');
  const [purgeHistory, setPurgeHistory] = useState<any[]>([]);
  const [purgeHistoryLoading, setPurgeHistoryLoading] = useState(false);

  // Bulk selection state
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showBulkPurgeModal, setShowBulkPurgeModal] = useState(false);
  const [bulkPurgeMode, setBulkPurgeMode] = useState<UserPurgeMode>('history');

  // Row ban action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  // User Inspect Modal state
  const [inspectTarget, setInspectTarget] = useState<any | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectDetails, setInspectDetails] = useState<{ user: any; transactions: any[]; orders: any[] } | null>(null);

  const handleInspectUser = async (user: any) => {
    setInspectTarget(user);
    setInspectLoading(true);
    setInspectDetails(null);
    try {
      const res = await getAdminUserDetails(user.id);
      setInspectDetails(res as any);
    } catch (err: any) {
      console.error('Error fetching user details:', err);
    } finally {
      setInspectLoading(false);
    }
  };

  const [exportingUserId, setExportingUserId] = useState<string | null>(null);

  const handleExportUser = async (user: any) => {
    if (!user || !user.id) return;
    setExportingUserId(user.id);
    try {
      const res = await getAdminUserExport(user.id);
      const payload = res?.data !== undefined ? res.data : res;
      const username = (user.email || user.id || 'user').split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_');
      await promptAndDownloadUserData(payload, `otpwala-user-dossier-${username}`);
    } catch (err: any) {
      console.error('Error exporting user dossier:', err);
      toast.error(err.message || 'Failed to export user dossier', 'Export Failed');
    } finally {
      setExportingUserId(null);
    }
  };

  const handleCopyUserId = async (userId: string) => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopiedUserId(userId);
      toast.success('User ID copied.', 'Copied');
      setTimeout(() => setCopiedUserId((current) => current === userId ? null : current), 1800);
    } catch {
      toast.error('Unable to copy user ID.', 'Copy Failed');
    }
  };

  const limit = pageSize;

  const loadUsers = async (isManual = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminUsers(limit, page * limit, search, userSort, userRole);
      setUsers(data?.users || []);
      setTotal(data?.total || 0);
      // Clean up selection of users no longer in list
      setSelectedUserIds((prev) => prev.filter((id) => (data?.users || []).some((u: any) => u.id === id)));
      if (isManual) {
        setRecentRefresh(true);
        setTimeout(() => setRecentRefresh(false), 2500);
        toast.success('User accounts and balances refreshed.', 'Users Refreshed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
      if (isManual) {
        toast.error(err.message || 'Failed to load users', 'Refresh Failed');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle().then(({ data }) => {
          if (data) setCurrentUserRole(data.role);
        });
      }
    });
  }, []);

  useEffect(() => {
    if (currentUserRole !== 'superadmin') return;
    setPurgeHistoryLoading(true);
    getAdminUserPurgeHistory()
      .then((data) => setPurgeHistory(data || []))
      .catch(() => setPurgeHistory([]))
      .finally(() => setPurgeHistoryLoading(false));
  }, [currentUserRole]);

  useEffect(() => {
    loadUsers();
  }, [page, pageSize, search, userSort, userRole]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  };

  // ─── Credit Balance ───
  const handleCreditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditUserTarget) return;
    if (creditAmount <= 0) {
      setError('Please enter a valid positive amount');
      return;
    }
    if (!creditFundingSource) {
      setError('Choose whether the funds were manually funded (money received) or added for free by admin.');
      return;
    }
    setCrediting(true);
    setError(null);
    setSuccess(null);
    try {
      await creditUser(creditUserTarget.id, creditAmount, creditReason, creditFundingSource);
      const msg = creditFundingSource === 'free_grant'
        ? `Added ₹${creditAmount} free funds to ${creditUserTarget.email} (not counted as revenue).`
        : `Recorded ₹${creditAmount} manual funding for ${creditUserTarget.email} as collected cash.`;
      setSuccess(msg);
      toast.success(msg, 'Wallet Credited');
      setCreditUserTarget(null);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to credit user');
      toast.error(err.message || 'Failed to credit user', 'Credit Failed');
    } finally {
      setCrediting(false);
    }
  };

  // ─── Single Ban / Unban ───
  const handleToggleBan = async (user: any) => {
    const action = user.is_banned ? 'unban' : 'ban';
    const confirmed = await showConfirm({
      title: user.is_banned ? 'Unban User Account' : 'Ban User Account',
      message: `Are you sure you want to ${action} ${user.email}? ${user.is_banned ? 'They will be allowed to log in and use the platform again.' : 'They will be immediately blocked from signing in and making orders.'}`,
      confirmText: user.is_banned ? 'Unban User' : 'Ban User',
      type: user.is_banned ? 'info' : 'danger',
    });
    if (!confirmed) return;

    const newBanned = !user.is_banned;
    setActionLoading(user.id);
    setError(null);
    setSuccess(null);

    // Optimistic update — instant UI response
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_banned: newBanned } : u));
    if (inspectTarget?.id === user.id) {
      setInspectTarget((prev: any) => prev ? { ...prev, is_banned: newBanned } : prev);
    }

    try {
      await banUser(user.id, newBanned);
      setSuccess(`User ${user.email} ${newBanned ? 'banned' : 'unbanned'} successfully.`);
    } catch (err: any) {
      // Revert on failure
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_banned: !newBanned } : u));
      if (inspectTarget?.id === user.id) {
        setInspectTarget((prev: any) => prev ? { ...prev, is_banned: !newBanned } : prev);
      }
      setError(err.message || `Failed to ${action} user`);
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Single Zero Markup Toggle ───
  const handleToggleZeroMarkup = async (user: any) => {
    const newStatus = !user.has_zero_markup;
    setActionLoading(`markup-${user.id}`);
    setError(null);
    setSuccess(null);
    // Optimistically update UI immediately
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, has_zero_markup: newStatus } : u));
    // Also update inspect panel if this user is open
    if (inspectTarget?.id === user.id) {
      setInspectTarget((prev: any) => prev ? { ...prev, has_zero_markup: newStatus } : prev);
    }
    try {
      await setUserZeroMarkup(user.id, newStatus);
      setSuccess(`Updated pricing for ${user.email}: ${newStatus ? '0% Markup (Tiger Cost) enabled' : 'Standard Markup restored'}.`);
    } catch (err: any) {
      // Revert on failure
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, has_zero_markup: !newStatus } : u));
      if (inspectTarget?.id === user.id) {
        setInspectTarget((prev: any) => prev ? { ...prev, has_zero_markup: !newStatus } : prev);
      }
      setError(err.message || 'Failed to update markup status');
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Single Role Toggle ───
  const handleToggleRole = async (user: any) => {
    const isPromoting = user.role !== 'admin' && user.role !== 'superadmin';
    const action = isPromoting ? 'promote' : 'demote';
    const confirmed = await showConfirm({
      title: isPromoting ? 'Promote to Admin' : 'Demote from Admin',
      message: `Are you sure you want to ${action} ${user.email}? ${isPromoting ? 'They will gain full access to administrative tools and platform settings.' : 'Their administrative privileges will be revoked.'}`,
      confirmText: isPromoting ? 'Promote to Admin' : 'Demote User',
      type: isPromoting ? 'warning' : 'danger',
    });
    if (!confirmed) return;

    setActionLoading(`role-${user.id}`);
    setError(null);
    setSuccess(null);

    const newRole = isPromoting ? 'admin' : 'user';

    // Optimistically update UI immediately
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: newRole } : u));
    if (inspectTarget?.id === user.id) {
      setInspectTarget((prev: any) => prev ? { ...prev, role: newRole } : prev);
    }
    try {
      if (isPromoting) {
        await promoteAdmin(user.id);
        setSuccess(`User ${user.email} promoted to admin.`);
      } else {
        await demoteAdmin(user.id);
        setSuccess(`User ${user.email} demoted to standard user.`);
      }
    } catch (err: any) {
      // Revert on failure
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: user.role } : u));
      if (inspectTarget?.id === user.id) {
        setInspectTarget((prev: any) => prev ? { ...prev, role: user.role } : prev);
      }
      setError(err.message || `Failed to ${action} user`);
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Single User Purge (Prerequisite: User must be banned first!) ───
  const handleConfirmPurge = async () => {
    if (!purgeTarget) return;

    if (!purgeTarget.is_banned) {
      setError('User must be banned first before purge.');
      setPurgeTarget(null);
      return;
    }
    const expectedConfirmation = purgeMode === 'complete' ? 'PURGE COMPLETELY' : 'PURGE WITH HISTORY';
    if (purgeConfirmation !== expectedConfirmation) {
      setError(`Type ${expectedConfirmation} to confirm this purge.`);
      return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await purgeUser(purgeTarget.id, purgeMode);
      setSuccess(purgeMode === 'history' ? `User data for ${purgeTarget.email} was purged and a non-personal history summary was retained.` : `All data for ${purgeTarget.email} was purged completely.`);
      
      // Optimistic update: instantly remove from UI
      setUsers((prev) => prev.filter((u) => u.id !== purgeTarget.id));
      setSelectedUserIds((prev) => prev.filter((id) => id !== purgeTarget.id));
      setPurgeTarget(null);
      setPurgeConfirmation('');
      if (purgeMode === 'history') {
        getAdminUserPurgeHistory().then((data) => setPurgeHistory(data || [])).catch(() => {});
      }
    } catch (err: any) {
      setError(err.message || 'Failed to purge user data');
    } finally {
      setDeleting(false);
    }
  };

  // ─── Bulk Selection Toggles ───
  const selectableUsers = users.filter((u) => u.role !== 'superadmin' && (u.role !== 'admin' || currentUserRole === 'superadmin'));
  const allSelectableChecked = selectableUsers.length > 0 && selectableUsers.every((u) => selectedUserIds.includes(u.id));

  const handleToggleSelectAll = () => {
    if (allSelectableChecked) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(selectableUsers.map((u) => u.id));
    }
  };

  const handleToggleSelectUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // ─── Bulk Ban / Unban ───
  const handleBulkBan = async (banned: boolean) => {
    if (selectedUserIds.length === 0) return;
    const actionLabel = banned ? 'ban' : 'unban';
    const confirmed = await showConfirm({
      title: banned ? 'Bulk Ban Users' : 'Bulk Unban Users',
      message: `Are you sure you want to ${actionLabel} ${selectedUserIds.length} selected user(s)?`,
      confirmText: banned ? 'Ban Selected' : 'Unban Selected',
      type: banned ? 'danger' : 'info',
    });
    if (!confirmed) return;

    setBulkActionLoading(true);
    setError(null);
    setSuccess(null);

    // Optimistic update — flip all selected users instantly
    const ids = new Set(selectedUserIds);
    setUsers((prev) => prev.map((u) => ids.has(u.id) ? { ...u, is_banned: banned } : u));

    try {
      const res = await bulkBanUsers(selectedUserIds, banned);
      setSuccess(res.message || `${selectedUserIds.length} user(s) ${banned ? 'banned' : 'unbanned'} successfully.`);
    } catch (err: any) {
      // Revert on failure
      setUsers((prev) => prev.map((u) => ids.has(u.id) ? { ...u, is_banned: !banned } : u));
      setError(err.message || `Failed to bulk ${actionLabel} users`);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // ─── Bulk Role Toggle ───
  const handleBulkRole = async (isPromoting: boolean) => {
    if (selectedUserIds.length === 0) return;
    const actionLabel = isPromoting ? 'promote to admin' : 'demote to standard user';
    const confirmed = await showConfirm({
      title: isPromoting ? 'Bulk Promote Users' : 'Bulk Demote Users',
      message: `Are you sure you want to ${actionLabel} ${selectedUserIds.length} selected user(s)?`,
      confirmText: isPromoting ? 'Promote Selected' : 'Demote Selected',
      type: isPromoting ? 'warning' : 'danger',
    });
    if (!confirmed) return;

    setBulkActionLoading(true);
    setError(null);
    setSuccess(null);

    const newRole = isPromoting ? 'admin' : 'user';
    const ids = new Set(selectedUserIds);

    // Optimistic update
    setUsers((prev) => prev.map((u) => ids.has(u.id) ? { ...u, role: newRole } : u));

    try {
      await Promise.all(
        selectedUserIds.map((id) => (isPromoting ? promoteAdmin(id) : demoteAdmin(id)))
      );
      setSuccess(`${selectedUserIds.length} user(s) successfully ${isPromoting ? 'promoted' : 'demoted'}.`);
    } catch (err: any) {
      await loadUsers();
      setError(err.message || `Failed to bulk ${actionLabel} users`);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // ─── Bulk Purge (Prerequisite: Users must be banned first!) ───
  const selectedUsersList = users.filter((u) => selectedUserIds.includes(u.id));
  const selectedBannedUsers = selectedUsersList.filter((u) => u.is_banned);
  const selectedAdminUsers = selectedUsersList.filter((u) => u.role === 'admin');
  const selectedUnbannedCount = selectedUsersList.length - selectedBannedUsers.length;

  const handleConfirmBulkPurge = async () => {
    if (selectedBannedUsers.length === 0) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      const idsToPurge = selectedBannedUsers.map((u) => u.id);
      await bulkPurgeUsers(idsToPurge, bulkPurgeMode);
      
      // Optimistic update: instantly remove from UI
      const idSet = new Set(idsToPurge);
      setUsers((prev) => prev.filter((u) => !idSet.has(u.id)));
      
      setSuccess(`${idsToPurge.length} banned user account(s) purged${bulkPurgeMode === 'history' ? ' with history retained' : ' completely'}.`);
      setSelectedUserIds([]);
      setShowBulkPurgeModal(false);
    } catch (err: any) {
      setError(err.message || 'Failed to purge selected users');
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)' }}>
            User <span className="text-gradient">Management</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Inspect registered accounts, issue wallet top-ups, restrict access, or delete banned accounts
          </p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => loadUsers(true)}
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

      {/* Search & Filters */}
      <div className="card" style={{ padding: '1rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              aria-label="Search users by email, name, or ID"
              placeholder="Search any user by email, full name, or user ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="input"
              style={{ width: '100%', paddingLeft: '2.5rem' }}
            />
            <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, display: 'flex', alignItems: 'center' }}>
              <SearchIcon size={15} />
            </span>
          </div>
          <button type="submit" className="btn btn-primary btn-sm">
            Search
          </button>
          <select
            aria-label="Sort users"
            value={userSort}
            onChange={(e) => { setUserSort(e.target.value as typeof userSort); setPage(0); }}
            className="input"
            style={{ width: 'auto', minWidth: '190px' }}
          >
            <option value="recent">Recently Joined</option>
            <option value="alphabetical">Alphabetical</option>
            <option value="deposited">Most Deposited</option>
          </select>
          <select
            aria-label="Filter users by role"
            value={userRole}
            onChange={(e) => { setUserRole(e.target.value as typeof userRole); setPage(0); }}
            className="input"
            style={{ width: 'auto', minWidth: '160px' }}
          >
            <option value="">All roles</option>
            <option value="superadmin">Superadmins</option>
            <option value="admin">Admins</option>
            <option value="user">Users</option>
          </select>
          <select
            aria-label="Users per page"
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            className="input"
            style={{ width: 'auto', minWidth: '145px' }}
          >
            {[25, 50, 100, 200].map((size) => <option key={size} value={size}>{size} users</option>)}
          </select>
          {(search || userRole) && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearchInput('');
                setSearch('');
                setUserRole('');
                setPage(0);
              }}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {currentUserRole === 'superadmin' && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Purged User History</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0.25rem 0 0' }}>Non-personal summaries retained only when the history option was selected.</p>
            </div>
            <span className="badge badge-secondary">{purgeHistory.length} record(s)</span>
          </div>
          {purgeHistoryLoading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading purge history...</div>
          ) : purgeHistory.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No retained purge history.</div>
          ) : (
            <div className="responsive-card-table" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead><tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.55rem' }}>Reference</th><th style={{ padding: '0.55rem' }}>Mode</th><th style={{ padding: '0.55rem' }}>Orders</th><th style={{ padding: '0.55rem' }}>Deposits</th><th style={{ padding: '0.55rem' }}>Purged At</th>
                </tr></thead>
                <tbody>{purgeHistory.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td data-label="Reference" style={{ padding: '0.55rem', fontFamily: 'var(--font-mono)' }}>{entry.user_reference}</td>
                    <td data-label="Mode" style={{ padding: '0.55rem' }}><span className="badge badge-warning">{entry.purge_mode}</span></td>
                    <td data-label="Orders" style={{ padding: '0.55rem' }}>{entry.orders_count}</td>
                    <td data-label="Deposits" style={{ padding: '0.55rem' }}>₹{Number(entry.total_deposits || 0).toFixed(2)}</td>
                    <td data-label="Purged At" style={{ padding: '0.55rem', color: 'var(--text-muted)' }}>{new Date(entry.purged_at).toLocaleString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Bulk Action Toolbar */}
      {selectedUserIds.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1.25rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.9rem' }}>
              {selectedUserIds.length} user(s) selected
            </span>
            {selectedUnbannedCount > 0 && (
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                ({selectedBannedUsers.length} banned, {selectedUnbannedCount} active)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* Smart Promote / Demote button */}
            {currentUserRole === 'superadmin' && (
              <button
                className="btn btn-secondary btn-sm"
                disabled={bulkActionLoading}
                onClick={() => handleBulkRole(selectedUserIds.length === selectedAdminUsers.length ? false : true)}
                style={{ fontSize: '0.8rem', color: selectedUserIds.length === selectedAdminUsers.length ? '#b45309' : '#1d4ed8' }}
              >
                {selectedUserIds.length === selectedAdminUsers.length
                  ? `Demote Selected (${selectedUserIds.length})`
                  : `Make Admin (${selectedUserIds.length})`}
              </button>
            )}

            {/* Smart single ban/unban button: unban if all selected are already banned, else ban */}
            <button
              className="btn btn-secondary btn-sm"
              disabled={bulkActionLoading}
              onClick={() => handleBulkBan(selectedUserIds.length === selectedBannedUsers.length ? false : true)}
              style={{ fontSize: '0.8rem', color: selectedUserIds.length === selectedBannedUsers.length ? '#15803d' : '#b91c1c' }}
            >
              {selectedUserIds.length === selectedBannedUsers.length
                ? `Unban Selected (${selectedUserIds.length})`
                : `Ban Selected (${selectedUserIds.length})`}
            </button>
            {selectedUserIds.length === 1 && (
              <>
                <a href={`/admin/users/details?id=${encodeURIComponent(selectedUsersList[0].id)}`} className="btn btn-secondary btn-sm" title="Open selected user details" aria-label="Open selected user details"><EyeIcon size={13} /></a>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleExportUser(selectedUsersList[0])} disabled={exportingUserId === selectedUsersList[0].id} title="Export selected user"><DownloadIcon size={13} /></button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setCreditUserTarget(selectedUsersList[0]); setCreditAmount(100); setCreditReason(''); setCreditFundingSource(''); }} title="Add funds to selected user"><CreditCardIcon size={13} /></button>
              </>
            )}
            {selectedBannedUsers.length > 0 && (
              <button
                className="btn btn-sm"
                disabled={bulkActionLoading}
                onClick={() => { setBulkPurgeMode('history'); setShowBulkPurgeModal(true); }}
                title="Purge selected banned users"
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  border: 'none',
                }}
              >
                <TrashIcon size={13} style={{ display: 'inline', marginRight: '4px' }} />
                Purge Selected ({selectedBannedUsers.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Showing <strong>{users.length}</strong> of <strong>{total}</strong> users
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No users found matching your search.
          </div>
        ) : (
          <div className="responsive-card-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 0.5rem', width: '38px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={allSelectableChecked}
                      onChange={handleToggleSelectAll}
                      title="Select / Deselect all non-admin users on this page"
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </th>
                  <th style={{ padding: '0.75rem' }}>User Profile</th>
                  <th style={{ padding: '0.75rem' }}>Balance</th>
                  <th style={{ padding: '0.75rem' }}>Role</th>
                  <th style={{ padding: '0.75rem' }}>Pricing Rate</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  <th style={{ padding: '0.75rem' }}>Registered</th>
                  <th style={{ padding: '0.75rem' }}>Last Login</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  const isAdmin = u.role === 'admin' || u.role === 'superadmin';
                  const isProtected = u.role === 'superadmin' || (u.role === 'admin' && currentUserRole !== 'superadmin');

                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: isSelected ? 'rgba(37, 99, 235, 0.03)' : 'transparent',
                      }}
                    >
                      <td data-label="Select" style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          disabled={isProtected}
                          checked={isSelected}
                          onChange={() => handleToggleSelectUser(u.id)}
                          title={isProtected ? 'This administrator account cannot be bulk modified' : 'Select user'}
                          style={{ cursor: isProtected ? 'not-allowed' : 'pointer', width: '16px', height: '16px' }}
                        />
                      </td>
                      <td data-label="User Profile" style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              alt=""
                              style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-subtle)' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '50%',
                                background: isAdmin ? 'rgba(37, 99, 235, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid var(--border-subtle)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                color: isAdmin ? '#60a5fa' : 'var(--text-primary)',
                                flexShrink: 0,
                              }}
                            >
                              {(u.name || u.full_name || u.email || 'U')[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                              <a href={`/admin/users/details?id=${encodeURIComponent(u.id)}`} style={{ color: 'inherit', textDecoration: 'none' }} title="Open user details">
                                {u.name || u.full_name || 'Anonymous User'}
                              </a>
                              {u.role === 'superadmin' ? (
                                <span className="badge badge-error" style={{ fontSize: '0.62rem', padding: '0.05rem 0.35rem' }}>
                                  Super Admin
                                </span>
                              ) : u.role === 'admin' ? (
                                <span className="badge badge-primary" style={{ fontSize: '0.62rem', padding: '0.05rem 0.35rem' }}>
                                  Admin
                                </span>
                              ) : null}
                            </div>
                            <a href={`/admin/users/details?id=${encodeURIComponent(u.id)}`} style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', textDecoration: 'none' }} title="Open user details">{u.email}</a>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              <span>ID: {u.id.substring(0, 16)}...</span>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleCopyUserId(u.id)}
                                title="Copy full user ID"
                                aria-label={`Copy user ID ${u.id}`}
                                style={{ padding: '0.15rem', minHeight: 'auto', color: copiedUserId === u.id ? 'var(--success)' : 'var(--text-muted)' }}
                              >
                                <CopyIcon size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Balance" style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(90px, 1fr))', gap: '0.5rem', minWidth: '210px' }}>
                          <div style={{ padding: '0.4rem 0.55rem', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Remaining</div>
                            <div style={{ fontWeight: 800, color: '#10b981', fontSize: '0.9rem', marginTop: '0.15rem' }}>₹{parseFloat(u.wallet_balance || 0).toFixed(2)}</div>
                          </div>
                          <div style={{ padding: '0.4rem 0.55rem', background: 'rgba(37, 99, 235, 0.06)', border: '1px solid rgba(37, 99, 235, 0.2)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Used</div>
                            <div style={{ fontWeight: 800, color: '#2563eb', fontSize: '0.9rem', marginTop: '0.15rem' }}>₹{parseFloat(u.total_spent || 0).toFixed(2)}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Role" style={{ padding: '0.75rem' }}>
                        <span className={`badge ${u.role === 'superadmin' ? 'badge-error' : isAdmin ? 'badge-primary' : 'badge-ghost'}`}>
                          {u.role === 'superadmin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'User'}
                        </span>
                      </td>
                      <td data-label="Pricing Rate" style={{ padding: '0.75rem' }}>
                        {isAdmin || u.role === 'superadmin' ? (
                          <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981' }}></span>
                            0% Markup (Tiger)
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.6rem',
                              background: u.has_zero_markup ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                              color: u.has_zero_markup ? '#10b981' : 'var(--text-muted)',
                              border: u.has_zero_markup ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid var(--border-subtle)',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              fontWeight: u.has_zero_markup ? 700 : 500,
                            }}
                            disabled={actionLoading === `markup-${u.id}`}
                            onClick={() => handleToggleZeroMarkup(u)}
                            title={u.has_zero_markup ? '0% Markup active (buys at Tiger SMS base cost). Click to revert to standard markup.' : 'Standard markup active. Click to enable 0% markup (Tiger SMS cost).'}
                          >
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: u.has_zero_markup ? '#10b981' : '#94a3b8' }}></span>
                            {actionLoading === `markup-${u.id}` ? '...' : u.has_zero_markup ? '0% Markup (Tiger)' : 'Standard Rate'}
                          </button>
                        )}
                      </td>
                      <td data-label="Status" style={{ padding: '0.75rem' }}>
                        {u.is_banned ? (
                          <span className="badge badge-error">Banned</span>
                        ) : (
                          <span className="badge badge-success">Active</span>
                        )}
                      </td>
                      <td data-label="Registered" style={{ padding: '0.75rem', fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                          {new Date(u.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td data-label="Last Login" style={{ padding: '0.75rem', fontSize: '0.8rem' }}>
                        {u.last_sign_in_at ? (
                          <>
                            <div style={{ fontWeight: 600, color: '#38bdf8' }}>
                              {new Date(u.last_sign_in_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                              {new Date(u.last_sign_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.75rem' }}>Never</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem', alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Previous
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Credit User Modal */}
      {creditUserTarget && (
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
          <div className="card glass-card" style={{ maxWidth: '440px', width: '100%', padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Add Funds to Wallet</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setCreditUserTarget(null)}>
                <XIcon size={14} />
              </button>
            </div>

            <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target User</div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem' }}>{creditUserTarget.email}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Current Balance: <strong style={{ color: '#34d399' }}>₹{parseFloat(creditUserTarget.wallet_balance || 0).toFixed(2)}</strong>
              </div>
            </div>

            <form onSubmit={handleCreditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Amount to Add (₹ INR)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-muted)' }}>
                    ₹
                  </span>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(parseFloat(e.target.value) || 0)}
                    className="input"
                    style={{ width: '100%', paddingLeft: '2rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {[50, 100, 200, 500, 1000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      onClick={() => setCreditAmount(amt)}
                    >
                      +₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              <FundingSourcePicker
                value={creditFundingSource}
                onChange={setCreditFundingSource}
                disabled={crediting}
              />

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Reason / Description
                </label>
                <input
                  type="text"
                  required
                  minLength={5}
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  className="input"
                  placeholder={creditFundingSource === 'free_grant' ? 'e.g. Goodwill credit for failed order #1234' : 'e.g. Customer paid ₹500 via UPI on 16 Sep'}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreditUserTarget(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={crediting || !creditFundingSource}>
                  {crediting ? 'Crediting...' : !creditFundingSource ? 'Choose funding source' : `Confirm ₹${creditAmount}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Single User Delete Confirmation Modal */}
      {purgeTarget && (
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
          <div className="card glass-card" style={{ maxWidth: '440px', width: '100%', padding: '1.75rem', border: '1px solid #ef4444' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ef4444', marginBottom: '1rem' }}>
              <AlertCircleIcon size={24} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Confirm User Purge</h3>
            </div>

            <p style={{ fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Purge all account data for <strong>{purgeTarget.email}</strong>?
            </p>

            <div style={{ display: 'grid', gap: '0.6rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.7rem', border: `1px solid ${purgeMode === 'history' ? '#f59e0b' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                <input type="radio" name="purge-mode" checked={purgeMode === 'history'} onChange={() => { setPurgeMode('history'); setPurgeConfirmation(''); }} />
                <span><strong>Keep purge history</strong><br /><small>Delete the user data but retain a non-personal summary of the purge.</small></span>
              </label>
              <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.7rem', border: `1px solid ${purgeMode === 'complete' ? '#dc2626' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                <input type="radio" name="purge-mode" checked={purgeMode === 'complete'} onChange={() => { setPurgeMode('complete'); setPurgeConfirmation(''); }} />
                <span><strong>Complete purge</strong><br /><small>Delete the user data and do not retain a purge-history row.</small></span>
              </label>
            </div>

            <div style={{
              background: '#fef2f2',
              border: '1px solid #fee2e2',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem',
              fontSize: '0.82rem',
              color: '#b91c1c',
              lineHeight: 1.45,
              marginBottom: '1.5rem',
            }}>
              <strong>Important:</strong> This cannot be undone. Orders, deposits, wallet transactions, support records, referrals, security logs, and the login account will be deleted. The account must be suspended first.
            </div>

            <input
              className="input"
              value={purgeConfirmation}
              onChange={(e) => setPurgeConfirmation(e.target.value)}
              placeholder={purgeMode === 'complete' ? 'Type PURGE COMPLETELY' : 'Type PURGE WITH HISTORY'}
              aria-label="Purge confirmation"
              style={{ width: '100%', marginBottom: '1.25rem' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={deleting}
                onClick={() => setPurgeTarget(null)}
              >
                No, Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={deleting}
                onClick={handleConfirmPurge}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  fontWeight: 700,
                  border: 'none',
                  padding: '0.5rem 1.1rem',
                }}
              >
                {deleting ? 'Purging...' : 'Confirm Purge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkPurgeModal && (
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
          <div className="card glass-card" style={{ maxWidth: '460px', width: '100%', padding: '1.75rem', border: '1px solid #ef4444' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ef4444', marginBottom: '1rem' }}>
              <AlertCircleIcon size={24} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Confirm Bulk Purge</h3>
            </div>

            <p style={{ fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: '1rem' }}>
              Purge data for <strong>{selectedBannedUsers.length}</strong> banned user(s)?
            </p>

            {selectedUnbannedCount > 0 && (
              <div style={{
                background: '#fffbeb',
                border: '1px solid #fef3c7',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
                fontSize: '0.8rem',
                color: '#b45309',
                marginBottom: '1rem',
              }}>
                <strong>Notice:</strong> {selectedUnbannedCount} active/unbanned user(s) in your selection will be skipped because users must be banned first.
              </div>
            )}

            <div style={{
              background: '#fef2f2',
              border: '1px solid #fee2e2',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem',
              fontSize: '0.82rem',
              color: '#b91c1c',
              lineHeight: 1.45,
              marginBottom: '1.5rem',
            }}>
              <strong>Important:</strong> Authentication and all user records will be purged. Every selected account must be suspended first.
            </div>

            <div style={{ display: 'grid', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.7rem', border: `1px solid ${bulkPurgeMode === 'history' ? '#f59e0b' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                <input type="radio" name="bulk-purge-mode" checked={bulkPurgeMode === 'history'} onChange={() => setBulkPurgeMode('history')} />
                <span><strong>Keep purge history</strong><br /><small>Delete selected users and retain non-personal summaries.</small></span>
              </label>
              <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.7rem', border: `1px solid ${bulkPurgeMode === 'complete' ? '#dc2626' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                <input type="radio" name="bulk-purge-mode" checked={bulkPurgeMode === 'complete'} onChange={() => setBulkPurgeMode('complete')} />
                <span><strong>Complete purge</strong><br /><small>Delete selected users without retaining purge summaries.</small></span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={deleting}
                onClick={() => setShowBulkPurgeModal(false)}
              >
                No, Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={deleting}
                onClick={handleConfirmBulkPurge}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  fontWeight: 700,
                  border: 'none',
                  padding: '0.5rem 1.1rem',
                }}
              >
                {deleting ? 'Purging...' : `Purge ${selectedBannedUsers.length} User(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Inspect / Balance Details Modal */}
      {inspectTarget && (
        <div className="modal-backdrop" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div className="card glass-card" style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {inspectTarget.avatar_url ? (
                  <img
                    src={inspectTarget.avatar_url}
                    alt=""
                    style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-subtle)' }}
                  />
                ) : (
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: 'rgba(37, 99, 235, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    color: '#60a5fa',
                  }}>
                    {(inspectTarget.name || inspectTarget.full_name || inspectTarget.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>{inspectTarget.name || inspectTarget.full_name || 'Anonymous User'}</span>
                    <span className={`badge ${inspectTarget.role === 'admin' ? 'badge-primary' : 'badge-ghost'}`} style={{ fontSize: '0.65rem' }}>
                      {inspectTarget.role || 'user'}
                    </span>
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{inspectTarget.email}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                    ID: {inspectTarget.id}
                  </div>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setInspectTarget(null)}>
                <XIcon size={16} />
              </button>
            </div>

            {/* Balance Overview Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1.5rem',
            }}>
              {/* Amount Left */}
              <div style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Amount Left
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#10b981', marginTop: '0.25rem' }}>
                  ₹{parseFloat(inspectDetails?.user?.wallet_balance ?? inspectTarget.wallet_balance ?? 0).toFixed(2)}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Available to spend
                </div>
              </div>

              {/* Total Spent */}
              <div style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Total Spent
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                  ₹{parseFloat(inspectDetails?.user?.total_spent ?? inspectTarget.total_spent ?? 0).toFixed(2)}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Lifetime order volume
                </div>
              </div>

              {/* Total Orders */}
              <div style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Orders Placed
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                  {inspectDetails?.user?.total_orders ?? inspectTarget.total_orders ?? 0}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Total purchases
                </div>
              </div>

              {/* Pricing Rate */}
              <div style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Pricing Policy
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: (inspectTarget.has_zero_markup || inspectTarget.role === 'admin') ? '#10b981' : 'var(--text-primary)', marginTop: '0.45rem' }}>
                  {(inspectTarget.has_zero_markup || inspectTarget.role === 'admin') ? '0% Markup (Tiger)' : 'Standard Markup'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Active pricing rule
                </div>
              </div>
            </div>

            {/* User Meta Row */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              fontSize: '0.8rem',
              marginBottom: '1.25rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Registered: </span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {new Date(inspectTarget.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Last Login: </span>
                <strong style={{ color: inspectTarget.last_sign_in_at ? '#38bdf8' : 'var(--text-muted)' }}>
                  {inspectTarget.last_sign_in_at
                    ? new Date(inspectTarget.last_sign_in_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                    : 'Never'}
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Status: </span>
                <span className={`badge ${inspectTarget.is_banned ? 'badge-error' : 'badge-success'}`} style={{ fontSize: '0.65rem' }}>
                  {inspectTarget.is_banned ? 'Banned' : 'Active'}
                </span>
              </div>
            </div>

            {/* Recent Balance History / Wallet Transactions */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.92rem', fontWeight: 700, margin: '0 0 0.65rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CreditCardIcon size={15} />
                <span>Recent Balance & Wallet Transactions</span>
              </h4>

              {inspectLoading ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <RefreshCwIcon size={16} className="animate-spin" style={{ display: 'inline', marginRight: '6px' }} />
                  Loading transactions...
                </div>
              ) : !inspectDetails?.transactions || inspectDetails.transactions.length === 0 ? (
                <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  No balance transactions recorded for this user yet.
                </div>
              ) : (
                <div className="responsive-card-table" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Type</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Amount</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Balance After</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Description</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectDetails.transactions.map((tx: any) => {
                        const isCredit = tx.type === 'topup' || tx.type === 'admin_credit' || tx.type === 'refund';
                        return (
                          <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td data-label="Type" style={{ padding: '0.5rem 0.75rem' }}>
                              <span className={`badge ${isCredit ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '0.65rem' }}>
                                {tx.type}
                              </span>
                            </td>
                            <td data-label="Amount" style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: isCredit ? '#10b981' : '#ef4444' }}>
                              {isCredit ? '+' : '-'}₹{parseFloat(tx.amount || 0).toFixed(2)}
                            </td>
                            <td data-label="Balance After" style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#38bdf8' }}>
                              ₹{parseFloat(tx.balance_after || 0).toFixed(2)}
                            </td>
                            <td data-label="Description" style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', maxWidth: '200px', overflowWrap: 'anywhere' }} title={tx.description}>
                              {tx.description || '—'}
                            </td>
                            <td data-label="Date" style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                              {new Date(tx.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}{' '}
                              {new Date(tx.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleExportUser(inspectTarget)}
                disabled={exportingUserId === inspectTarget.id}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                title="Export complete user data"
              >
                {exportingUserId === inspectTarget.id ? (
                  <RefreshCwIcon size={14} className="spin" />
                ) : (
                  <DownloadIcon size={14} />
                )}
                  <span>Export</span>
              </button>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setInspectTarget(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const target = inspectTarget;
                    setInspectTarget(null);
                    setCreditUserTarget(target);
                    setCreditAmount(100);
                    setCreditReason('Manual admin top-up');
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <CreditCardIcon size={14} />
                  <span>Credit User Balance</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
