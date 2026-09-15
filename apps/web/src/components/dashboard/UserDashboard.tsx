import { useState, useEffect } from 'react';
import { getWallet, getOrders } from '../../lib/api';
import { formatPhoneNumber } from '../../lib/phone';
import {
  DollarIcon,
  ClipboardListIcon,
  ClockIcon,
  ShoppingCartIcon,
  SmartphoneIcon,
  CheckIcon,
  XIcon,
} from '../ui/Icons';

export default function UserDashboard() {
  const [balance, setBalance] = useState(0);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const [walletData, ordersData] = await Promise.all([
        getWallet(),
        getOrders(5, 0),
      ]);
      setBalance(parseFloat(walletData.balance) || 0);
      setRecentOrders(ordersData.orders || []);
      setSummary(ordersData.summary || { totalOrders: ordersData.total || 0 });
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  const activeOrders = recentOrders.filter(o => o.status === 'waiting');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem' }}>Dashboard</h2>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <StatCard
          icon={<DollarIcon size={24} color="var(--success)" />}
          label="Wallet Balance"
          value={`₹${balance.toFixed(2)}`}
          color="var(--success)"
        />
        <StatCard
          icon={<ClipboardListIcon size={24} color="var(--accent-primary)" />}
          label="Total Orders"
          value={String(summary.totalOrders || 0)}
          color="var(--accent-primary)"
        />
        <StatCard
          icon={<ClockIcon size={24} color="var(--warning)" />}
          label="Active Orders"
          value={String(summary.activeOrders || 0)}
          color="var(--warning)"
        />
        <StatCard
          icon={<CheckIcon size={24} color="var(--success)" />}
          label="OTP Delivered"
          value={String(summary.otpDelivered || 0)}
          color="var(--success)"
        />
        <StatCard
          icon={<XIcon size={24} color="var(--error)" />}
          label="OTP Not Received"
          value={String(summary.otpNotReceived || 0)}
          color="var(--error)"
        />
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <a href="/dashboard/buy" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <ShoppingCartIcon size={16} />
          <span>Buy Number</span>
        </a>
        <a href="/dashboard/wallet" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <DollarIcon size={16} />
          <span>Add Balance</span>
        </a>
        <a href="/dashboard/orders" className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <ClipboardListIcon size={16} />
          <span>View All Orders</span>
        </a>
      </div>

      {/* Active Orders */}
      {activeOrders.length > 0 && (
        <div>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ClockIcon size={18} color="var(--warning)" />
            <span>Active Orders</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {activeOrders.map(order => (
              <ActiveOrderCard key={order.id} order={order} />
            ))}
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <ClipboardListIcon size={18} color="var(--accent-primary)" />
          <span>Recent Orders</span>
        </h3>
        {recentOrders.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No orders yet. <a href="/dashboard/buy" style={{ color: 'var(--accent-primary)' }}>Buy your first number!</a>
          </div>
        ) : (
          <div className="table-container">
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
                {recentOrders.map(order => (
                  <tr key={order.id}>
                    <td style={{ fontWeight: 600 }}>{order.service_name}</td>
                    <td><strong>{order.country_name || 'Unknown country'}</strong><small style={{ display: 'block', color: 'var(--text-muted)' }}>Country code: {order.country_code ?? '—'}</small></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                      <span><small style={{ display: 'block', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>Phone number</small>{formatPhoneNumber(order.phone_number, order.country_code).display || order.phone_number}</span>
                    </td>
                    <td><StatusBadge status={order.status} /></td>
                    <td>₹{parseFloat(order.sell_price_inr).toFixed(2)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {new Date(order.created_at).toLocaleDateString()}
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

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
      <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{label}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)', color }}>{value}</div>
      </div>
    </div>
  );
}

function ActiveOrderCard({ order }: { order: any }) {
  return (
    <a href={`/dashboard/buy?active=${order.id}`} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', textDecoration: 'none', color: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SmartphoneIcon size={18} color="var(--accent-primary)" />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{order.service_name} — {order.country_name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {order.phone_number}
          </div>
        </div>
      </div>
      <StatusBadge status={order.status} />
    </a>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    waiting: { label: 'Waiting', className: 'badge badge-warning', icon: <ClockIcon size={12} /> },
    code_received: { label: 'Code Received', className: 'badge badge-success', icon: <CheckIcon size={12} /> },
    completed: { label: 'OTP Received', className: 'badge badge-success', icon: <CheckIcon size={12} /> },
    cancelled: { label: 'Cancelled', className: 'badge badge-error', icon: <XIcon size={12} /> },
    refunded: { label: 'Refunded', className: 'badge badge-info', icon: <DollarIcon size={12} /> },
    expired: { label: 'Expired', className: 'badge badge-ghost', icon: <XIcon size={12} /> },
  };

  const badge = config[status] || { label: status, className: 'badge badge-ghost', icon: null };

  return (
    <span className={badge.className} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
      {badge.icon}
      <span>{badge.label}</span>
    </span>
  );
}
