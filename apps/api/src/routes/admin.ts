import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { tigerSms } from '../services/tigerSms.js';
import { creditBalance } from '../services/wallet.js';
import {
  invalidatePricingCache,
  getZeroMarkupUserIds,
  setZeroMarkupUser,
} from '../services/pricing.js';
import {
  getCatalogFilterConfig,
  setServiceActiveStatus,
  setCountryActiveStatus,
  setDisabledCatalog,
  setFeaturedService,
  setFeaturedCountry,
} from '../services/catalogFilter.js';
import { testTelegramConnection } from '../services/telegram.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';

const serviceIcons: Record<string, string> = require('../data/tigerServiceIcons.json');
const countryFlags: Record<string, { id: number; name: string; iso: string; flagUrl: string }> = require('../data/countryFlags.json');

const router = Router();

// All admin routes require admin role
router.use(adminMiddleware);

/**
 * GET /api/admin/dashboard
 * Admin overview stats.
 */
router.get('/dashboard', async (_req: AuthenticatedRequest, res) => {
  try {
    const [
      { count: totalUsers },
      { count: totalOrders },
      revenueResult,
      todayOrdersResult,
      activeOrdersResult,
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('orders').select('sell_price_inr').in('status', ['completed', 'code_received']),
      supabaseAdmin.from('orders').select('sell_price_inr')
        .gte('created_at', new Date().toISOString().split('T')[0])
        .in('status', ['completed', 'code_received']),
      supabaseAdmin.from('orders').select('*', { count: 'exact', head: true })
        .eq('status', 'waiting'),
    ]);

    const totalRevenue = (revenueResult.data || []).reduce(
      (sum: number, o: any) => sum + parseFloat(o.sell_price_inr || 0), 0
    );
    const revenueToday = (todayOrdersResult.data || []).reduce(
      (sum: number, o: any) => sum + parseFloat(o.sell_price_inr || 0), 0
    );

    // Get Tiger SMS balance with strict 2s timeout so dashboard NEVER hangs
    let tigerBalance = 0;
    try {
      const balPromise = tigerSms.getBalance();
      const timeoutPromise = new Promise<{ balance: string }>((_, reject) =>
        setTimeout(() => reject(new Error('Tiger SMS getBalance timeout')), 2000)
      );
      const bal = await Promise.race([balPromise, timeoutPromise]);
      tigerBalance = parseFloat(bal.balance) || 0;
    } catch {
      tigerBalance = 0;
    }

    res.json({
      success: true,
      data: {
        totalUsers: totalUsers || 0,
        totalOrders: totalOrders || 0,
        totalRevenue,
        tigerBalance,
        ordersToday: todayOrdersResult.data?.length || 0,
        revenueToday,
        activeOrders: activeOrdersResult.count || 0,
      },
    });
  } catch (e) {
    console.error('Admin dashboard error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
});

/**
 * GET /api/admin/users
 * List all users with pagination.
 */
router.get('/users', async (req: AuthenticatedRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search as string;

    let query = supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      const trimmedSearch = search.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedSearch);
      if (isUuid) {
        query = query.or(`id.eq.${trimmedSearch},email.ilike.%${trimmedSearch}%,full_name.ilike.%${trimmedSearch}%`);
      } else {
        query = query.or(`email.ilike.%${trimmedSearch}%,full_name.ilike.%${trimmedSearch}%`);
      }
    }

    const { data, count, error } = await query;
    if (error) throw error;

    // Fetch auth users from Supabase Auth to retrieve full_name, avatar, and last_sign_in_at
    const authMap: Record<string, { name?: string | null; avatar_url?: string | null; last_sign_in_at?: string | null; created_at?: string | null }> = {};
    try {
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (authData?.users) {
        authData.users.forEach((au) => {
          authMap[au.id] = {
            name: au.user_metadata?.full_name || au.user_metadata?.name || null,
            avatar_url: au.user_metadata?.avatar_url || au.user_metadata?.picture || null,
            last_sign_in_at: au.last_sign_in_at || null,
            created_at: au.created_at || null,
          };
        });
      }
    } catch (authErr) {
      console.error('Error fetching Supabase auth users list:', authErr);
    }

    const zeroMarkupUsers = await getZeroMarkupUserIds();
    const usersWithMarkup = (data || []).map((u: any) => {
      const authInfo = authMap[u.id] || {};
      const resolvedName = (u.full_name && u.full_name.trim()) || authInfo.name || null;
      const lastLogin = authInfo.last_sign_in_at || null;
      const registeredAt = u.created_at || authInfo.created_at || new Date().toISOString();
      const amountLeft = parseFloat(u.wallet_balance || 0) || 0;
      const totalSpent = parseFloat(u.total_spent || 0) || 0;

      return {
        ...u,
        wallet_balance: amountLeft,
        total_spent: totalSpent,
        full_name: resolvedName,
        name: resolvedName,
        avatar_url: authInfo.avatar_url || null,
        last_sign_in_at: lastLogin,
        created_at: registeredAt,
        has_zero_markup: zeroMarkupUsers.has(u.id),
      };
    });

    res.json({ success: true, data: { users: usersWithMarkup, total: count || 0 } });
  } catch (e) {
    console.error('Admin users error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

/**
 * GET /api/admin/users/:id/details
 * Detailed user inspection: returns user profile, amount left, spending, orders, and recent transactions.
 */
router.get('/users/:id/details', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (profileErr || !profile) {
      res.status(404).json({ success: false, error: 'User profile not found' });
      return;
    }

    let authMeta: any = {};
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(id);
      if (authUser?.user) {
        authMeta = {
          name: authUser.user.user_metadata?.full_name || authUser.user.user_metadata?.name || null,
          avatar_url: authUser.user.user_metadata?.avatar_url || authUser.user.user_metadata?.picture || null,
          last_sign_in_at: authUser.user.last_sign_in_at || null,
          created_at: authUser.user.created_at || profile.created_at,
          email: authUser.user.email || profile.email,
        };
      }
    } catch (authErr) {
      console.error('Error fetching user auth details:', authErr);
    }

    const zeroMarkupUsers = await getZeroMarkupUserIds();

    const [txRes, ordersRes] = await Promise.all([
      supabaseAdmin
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('orders')
        .select('id, service_name, country_name, phone_number, price_inr, status, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const amountLeft = parseFloat(profile.wallet_balance || 0) || 0;
    const totalSpent = parseFloat(profile.total_spent || 0) || 0;
    const resolvedName = (profile.full_name && profile.full_name.trim()) || authMeta.name || null;

    res.json({
      success: true,
      data: {
        user: {
          ...profile,
          wallet_balance: amountLeft,
          total_spent: totalSpent,
          full_name: resolvedName,
          name: resolvedName,
          avatar_url: authMeta.avatar_url || null,
          last_sign_in_at: authMeta.last_sign_in_at || null,
          created_at: profile.created_at || authMeta.created_at,
          has_zero_markup: zeroMarkupUsers.has(id),
        },
        transactions: txRes.data || [],
        orders: ordersRes.data || [],
      },
    });
  } catch (e: any) {
    console.error('Admin user details error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch user details' });
  }
});

/**
 * POST /api/admin/users/:id/zero-markup
 * Toggle zero markup (Tiger SMS cost rate) for a specific user.
 * Body: { hasZeroMarkup: boolean }
 */
router.post('/users/:id/zero-markup', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { hasZeroMarkup } = req.body;

    const updated = await setZeroMarkupUser(id, !!hasZeroMarkup);
    res.json({
      success: true,
      data: { userId: id, hasZeroMarkup: updated },
      message: updated
        ? 'User granted zero-markup (Tiger SMS cost rate).'
        : 'User returned to standard markup rate.',
    });
  } catch (e: any) {
    console.error('Admin zero-markup error:', e);
    res.status(500).json({ success: false, error: 'Failed to update user markup rate' });
  }
});

/**
 * POST /api/admin/users/:id/credit
 * Manually credit a user's wallet.
 * Body: { amount: 100, description: "Manual top-up" }
 */
router.post('/users/:id/credit', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { amount, description } = req.body;
    const amountNum = parseFloat(amount);

    if (!amountNum || amountNum <= 0) {
      res.status(400).json({ success: false, error: 'Invalid amount' });
      return;
    }

    const newBalance = await creditBalance(
      id,
      amountNum,
      'admin_credit',
      description || `Admin credit by ${req.userEmail}`
    );

    res.json({ success: true, data: { newBalance } });
  } catch (e) {
    console.error('Admin credit error:', e);
    res.status(500).json({ success: false, error: 'Failed to credit user' });
  }
});

/**
 * POST /api/admin/users/:id/ban
 * Toggle ban status.
 * Body: { banned: true }
 */
router.post('/users/:id/ban', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { banned } = req.body;

    await supabaseAdmin
      .from('profiles')
      .update({ is_banned: !!banned, updated_at: new Date().toISOString() })
      .eq('id', id);

    res.json({ success: true, message: banned ? 'User banned' : 'User unbanned' });
  } catch (e) {
    console.error('Admin ban error:', e);
    res.status(500).json({ success: false, error: 'Failed to update user status' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Retired: the Pages API runs the reviewed data-erasure workflow, which
 * pseudonymizes personal data while retaining financial records.
 */
router.delete('/users/:id', async (req: AuthenticatedRequest, res) => {
  void req;
  res.status(410).json({ success: false, error: 'This legacy endpoint is retired. Use the reviewed data-erasure workflow in the Pages admin application.' });
});

/**
 * POST /api/admin/users/bulk-ban
 * Bulk ban or unban selected users.
 * Body: { userIds: string[], banned: boolean }
 */
router.post('/users/bulk-ban', async (req: AuthenticatedRequest, res) => {
  try {
    const { userIds, banned } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ success: false, error: 'No users selected.' });
      return;
    }

    // Filter out calling admin
    const targets = userIds.filter((uid: string) => uid !== req.userId);
    if (targets.length === 0) {
      res.status(400).json({ success: false, error: 'Cannot ban your own account.' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ is_banned: !!banned, updated_at: new Date().toISOString() })
      .in('id', targets)
      .neq('role', 'admin') // Cannot ban admins
      .neq('role', 'superadmin'); // Cannot ban superadmins

    if (error) throw error;

    res.json({
      success: true,
      message: `${targets.length} user(s) ${banned ? 'banned' : 'unbanned'} successfully.`
    });
  } catch (e: any) {
    console.error('Admin bulk ban error:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to update users' });
  }
});

/**
 * POST /api/admin/users/bulk-delete
 * Retired alongside the single-user legacy deletion endpoint.
 */
router.post('/users/bulk-delete', async (req: AuthenticatedRequest, res) => {
  void req;
  res.status(410).json({ success: false, error: 'This legacy endpoint is retired. Use the reviewed data-erasure workflow in the Pages admin application.' });
});

/**
 * GET /api/admin/pricing
 * Get all pricing rules.
 */
router.get('/pricing', async (_req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('pricing_rules')
      .select('*')
      .order('priority', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    console.error('Admin pricing error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch pricing rules' });
  }
});

/**
 * POST /api/admin/pricing
 * Create or update a pricing rule.
 * Body: { service_code, country_code, markup_type, markup_value, priority }
 */
router.post('/pricing', async (req: AuthenticatedRequest, res) => {
  try {
    const { id, service_code, country_code, markup_type, markup_value, priority, is_active } = req.body;

    const record = {
      service_code: service_code || null,
      country_code: country_code !== undefined ? parseInt(country_code) : null,
      markup_type,
      markup_value: parseFloat(markup_value),
      priority: parseInt(priority) || 0,
      is_active: is_active !== false,
      updated_at: new Date().toISOString(),
    };

    if (id) {
      // Update existing
      const { error } = await supabaseAdmin
        .from('pricing_rules')
        .update(record)
        .eq('id', id);
      if (error) throw error;
    } else {
      // Create new
      const { error } = await supabaseAdmin
        .from('pricing_rules')
        .insert(record);
      if (error) throw error;
    }

    // Invalidate pricing cache
    invalidatePricingCache();

    res.json({ success: true, message: 'Pricing rule saved' });
  } catch (e) {
    console.error('Admin pricing save error:', e);
    res.status(500).json({ success: false, error: 'Failed to save pricing rule' });
  }
});

/**
 * DELETE /api/admin/pricing/:id
 * Delete a pricing rule.
 */
router.delete('/pricing/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('pricing_rules').delete().eq('id', id);
    if (error) throw error;

    invalidatePricingCache();
    res.json({ success: true, message: 'Pricing rule deleted' });
  } catch (e) {
    console.error('Admin pricing delete error:', e);
    res.status(500).json({ success: false, error: 'Failed to delete pricing rule' });
  }
});

/**
 * GET /api/admin/settings
 * Get all platform settings.
 */
router.get('/settings', async (_req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('settings').select('*');
    if (error) throw error;

    const settings = Object.fromEntries(
      (data || []).map(r => [r.key, typeof r.value === 'string' ? r.value : JSON.stringify(r.value)])
    );

    res.json({ success: true, data: settings });
  } catch (e) {
    console.error('Admin settings error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

/**
 * POST /api/admin/settings
 * Update platform settings.
 * Body: { key: "usd_to_inr_rate", value: "86.50" } OR { settings: { [key]: value } }
 */
router.post('/settings', async (req: AuthenticatedRequest, res) => {
  try {
    const { key, value, settings } = req.body;

    if (settings && typeof settings === 'object') {
      const records = Object.entries(settings).map(([k, v]) => ({
        key: k,
        value: typeof v === 'string' ? v : JSON.stringify(v),
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabaseAdmin.from('settings').upsert(records);
      if (error) throw error;

      invalidatePricingCache();
      res.json({ success: true, message: 'Settings updated' });
      return;
    }

    if (!key) {
      res.status(400).json({ success: false, error: 'Missing key or settings object' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('settings')
      .upsert({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;

    // Invalidate caches
    invalidatePricingCache();

    res.json({ success: true, message: 'Setting updated' });
  } catch (e) {
    console.error('Admin settings save error:', e);
    res.status(500).json({ success: false, error: 'Failed to update setting' });
  }
});

/**
 * GET /api/admin/tiger-balance
 * Check Tiger SMS account balance.
 */
router.get('/tiger-balance', async (_req: AuthenticatedRequest, res) => {
  try {
    const balPromise = tigerSms.getBalance();
    const timeoutPromise = new Promise<{ balance: string; currency: number }>((_, reject) =>
      setTimeout(() => reject(new Error('Tiger SMS balance timeout')), 2500)
    );
    const balance = await Promise.race([balPromise, timeoutPromise]);
    res.json({ success: true, data: balance });
  } catch (e: any) {
    console.warn('Tiger balance error:', e?.message || e);
    res.status(503).json({ success: false, error: 'Failed to fetch Tiger SMS balance' });
  }
});

/**
 * GET /api/admin/orders
 * All platform orders with pagination.
 */
router.get('/orders', async (req: AuthenticatedRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const { data, count, error } = await supabaseAdmin
      .from('orders')
      .select('*, profiles(email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({ success: true, data: { orders: data, total: count || 0 } });
  } catch (e) {
    console.error('Admin orders error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

/**
 * GET /api/admin/payment-requests
 * Pending manual top-up requests.
 */
router.get('/payment-requests', async (_req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('payment_requests')
      .select('*, profiles(email)')
      .eq('status', 'created')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    console.error('Payment requests error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch payment requests' });
  }
});

/**
 * POST /api/admin/payment-requests/:id/approve
 * Approve a manual top-up request.
 */
router.post('/payment-requests/:id/approve', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const { error: approvalError } = await supabaseAdmin.rpc('approve_payment_request_atomic', {
      p_request_id: id,
      p_admin_id: req.userId || 'legacy-admin',
    });
    if (approvalError) throw approvalError;

    res.json({ success: true, message: 'Top-up approved and credited' });
  } catch (e) {
    console.error('Approve payment error:', e);
    res.status(500).json({ success: false, error: 'Failed to approve payment' });
  }
});

/**
 * POST /api/admin/payment-requests/:id/reject
 * Reject a manual top-up request (e.g. invalid UTR, fake deposit).
 */
router.post('/payment-requests/:id/reject', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const { data: request, error: fetchError } = await supabaseAdmin
      .from('payment_requests')
      .select('*')
      .eq('id', id)
      .eq('status', 'created')
      .single();

    if (fetchError || !request) {
      res.status(404).json({ success: false, error: 'Request not found or already processed' });
      return;
    }

    // Mark request as failed
    await supabaseAdmin
      .from('payment_requests')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    res.json({
      success: true,
      message: `Top-up request of ₹${request.amount_inr} has been rejected.${reason ? ' Reason: ' + reason : ''}`,
    });
  } catch (e) {
    console.error('Reject payment error:', e);
    res.status(500).json({ success: false, error: 'Failed to reject payment' });
  }
});

/**
 * GET /api/admin/catalog
 * Get full list of all services and countries with their enabled/disabled status.
 */
router.get('/catalog', async (_req: AuthenticatedRequest, res) => {
  try {
    const [servicesList, countriesList, filterConfig] = await Promise.all([
      tigerSms.getServicesList('en').catch(() => []),
      tigerSms.getCountries().catch(() => []),
      getCatalogFilterConfig(),
    ]);

    const disabledServicesSet = new Set(filterConfig.disabledServices);
    const disabledCountriesSet = new Set(filterConfig.disabledCountries);

    const services = servicesList.map((s) => {
      const normName = s.name.toLowerCase().trim();
      const iconId = serviceIcons[normName] || serviceIcons[s.code.toLowerCase()] || null;
      return {
        code: s.code,
        name: s.name,
        iconUrl: iconId ? `https://tiger-sms.com/img/service/${iconId}.svg` : 'https://tiger-sms.com/img/service/unknown.svg',
        enabled: !disabledServicesSet.has(s.code.toLowerCase()),
        featured: filterConfig.featuredServices.includes(s.code.toLowerCase()),
      };
    });

    const countries = countriesList.map((c) => {
      const flag = countryFlags[String(c.id)];
      return {
        id: c.id,
        name: c.eng,
        iso: flag ? flag.iso : 'un',
        flagUrl: flag ? flag.flagUrl : 'https://flagcdn.com/un.svg',
        enabled: !disabledCountriesSet.has(Number(c.id)),
        featured: filterConfig.featuredCountries.includes(Number(c.id)),
      };
    });

    res.json({
      success: true,
      data: {
        services,
        countries,
        stats: {
          totalServices: services.length,
          enabledServices: services.filter((s) => s.enabled).length,
          totalCountries: countries.length,
          enabledCountries: countries.filter((c) => c.enabled).length,
        },
      },
    });
  } catch (e) {
    console.error('Admin catalog error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch catalog status' });
  }
});

/**
 * POST /api/admin/catalog/service
 * Toggle or set a specific service enabled/disabled.
 * Body: { code: "tg", enabled: false }
 */
router.post('/catalog/service', async (req: AuthenticatedRequest, res) => {
  try {
    const { code, enabled } = req.body;
    if (!code || typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: 'Invalid code or enabled status' });
      return;
    }

    const updated = await setServiceActiveStatus(code, enabled);
    res.json({
      success: true,
      message: `Service ${code.toUpperCase()} is now ${enabled ? 'enabled' : 'disabled'}`,
      data: updated,
    });
  } catch (e) {
    console.error('Toggle service error:', e);
    res.status(500).json({ success: false, error: 'Failed to update service status' });
  }
});

router.post('/catalog/service/featured', async (req: AuthenticatedRequest, res) => {
  try {
    const { code, featured } = req.body;
    if (!code || typeof featured !== 'boolean') {
      res.status(400).json({ success: false, error: 'Invalid code or featured status' });
      return;
    }
    const updated = await setFeaturedService(code, featured);
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('Toggle featured service error:', e);
    res.status(500).json({ success: false, error: 'Failed to update featured service' });
  }
});

router.post('/catalog/country/featured', async (req: AuthenticatedRequest, res) => {
  try {
    const { id, featured } = req.body;
    if (!Number.isFinite(Number(id)) || typeof featured !== 'boolean') {
      res.status(400).json({ success: false, error: 'Invalid id or featured status' });
      return;
    }
    const updated = await setFeaturedCountry(Number(id), featured);
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('Toggle featured country error:', e);
    res.status(500).json({ success: false, error: 'Failed to update featured country' });
  }
});

/**
 * POST /api/admin/catalog/country
 * Toggle or set a specific country enabled/disabled.
 * Body: { id: 22, enabled: false }
 */
router.post('/catalog/country', async (req: AuthenticatedRequest, res) => {
  try {
    const { id, enabled } = req.body;
    if (id === undefined || typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: 'Invalid id or enabled status' });
      return;
    }

    const updated = await setCountryActiveStatus(Number(id), enabled);
    res.json({
      success: true,
      message: `Country ID ${id} is now ${enabled ? 'enabled' : 'disabled'}`,
      data: updated,
    });
  } catch (e) {
    console.error('Toggle country error:', e);
    res.status(500).json({ success: false, error: 'Failed to update country status' });
  }
});

/**
 * POST /api/admin/catalog/batch
 * Batch enable or disable services or countries.
 * Body: { action: "enable_all_services" | "disable_all_services" | ... }
 */
router.post('/catalog/batch', async (req: AuthenticatedRequest, res) => {
  try {
    const { action } = req.body;

    const [allServices, allCountries] = await Promise.all([
      tigerSms.getServicesList('en').catch(() => []),
      tigerSms.getCountries().catch(() => []),
    ]);

    if (action === 'enable_all_services') {
      await setDisabledCatalog([]);
    } else if (action === 'disable_all_services') {
      await setDisabledCatalog(allServices.map((s) => s.code));
    } else if (action === 'enable_all_countries') {
      await setDisabledCatalog(undefined, []);
    } else if (action === 'disable_all_countries') {
      await setDisabledCatalog(undefined, allCountries.map((c) => c.id));
    } else {
      res.status(400).json({ success: false, error: 'Unknown batch action' });
      return;
    }

    res.json({ success: true, message: `Batch action "${action}" executed successfully` });
  } catch (e) {
    console.error('Batch catalog error:', e);
    res.status(500).json({ success: false, error: 'Failed to process batch catalog update' });
  }
});

/**
 * POST /api/admin/telegram/test
 * Test Telegram notification connection.
 * Body: { botToken?: string, chatId?: string }
 */
router.post('/telegram/test', async (req: AuthenticatedRequest, res) => {
  try {
    const { botToken, chatId } = req.body;
    const result = await testTelegramConnection(botToken, chatId);
    res.json(result);
  } catch (e: any) {
    console.error('Telegram test error:', e);
    res.status(400).json({ success: false, error: e.message || 'Failed to send test message via Telegram' });
  }
});

/**
 * GET /api/admin/payment-requests
 * List all manual deposit / payment requests.
 */
router.get('/payment-requests', async (_req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('payment_requests')
      .select('*, profiles:user_id(email, full_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const normalized = (data || []).map((req: any) => {
      const s = String(req.status || '').toLowerCase().trim();
      const normalizedStatus =
        s === 'paid' || s === 'approved' || s === 'completed' || s === 'success'
          ? 'approved'
          : s === 'failed' || s === 'rejected' || s === 'cancelled'
          ? 'rejected'
          : 'pending';

      return {
        ...req,
        amount: parseFloat(req.amount ?? req.amount_inr ?? 0),
        amount_inr: parseFloat(req.amount_inr ?? req.amount ?? 0),
        transaction_id: req.transaction_id || req.gateway_payment_id || '',
        gateway_payment_id: req.gateway_payment_id || req.transaction_id || '',
        payment_method: req.payment_method || req.gateway || 'upi',
        gateway: req.gateway || req.payment_method || 'upi',
        status: normalizedStatus,
      };
    });

    res.json({ success: true, data: normalized });
  } catch (e: any) {
    console.error('Error fetching admin payment requests:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to fetch payment requests' });
  }
});

/**
 * POST /api/admin/payment-requests/:id/approve
 * Approve deposit and credit user wallet balance.
 */
router.post('/payment-requests/:id/approve', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { data: request, error: fetchErr } = await supabaseAdmin
      .from('payment_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !request) {
      res.status(404).json({ success: false, error: 'Payment request not found' });
      return;
    }

    const { error: approvalError } = await supabaseAdmin.rpc('approve_payment_request_atomic', {
      p_request_id: id,
      p_admin_id: req.userId || 'legacy-admin',
    });
    if (approvalError) throw approvalError;

    res.json({ success: true, message: 'Deposit approved and credited successfully' });
  } catch (e: any) {
    console.error('Error approving payment request:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to approve payment request' });
  }
});

/**
 * POST /api/admin/payment-requests/:id/reject
 * Reject a deposit request.
 */
router.post('/payment-requests/:id/reject', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const updateRes = await supabaseAdmin
      .from('payment_requests')
      .update({ status: 'rejected', admin_notes: reason || null, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateRes.error) {
      await supabaseAdmin
        .from('payment_requests')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', id);
    }

    res.json({ success: true, message: 'Deposit request rejected' });

  } catch (e: any) {
    console.error('Error rejecting payment request:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to reject payment request' });
  }
});

/**
 * POST /api/admin/catalog/country
 * Toggle or set a specific country enabled/disabled.
 * Body: { id: 22, enabled: false }
 */
router.post('/catalog/country', async (req: AuthenticatedRequest, res) => {
  try {
    const { id, enabled } = req.body;
    if (id === undefined || typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: 'Invalid id or enabled status' });
      return;
    }

    const updated = await setCountryActiveStatus(Number(id), enabled);
    res.json({
      success: true,
      message: `Country ID ${id} is now ${enabled ? 'enabled' : 'disabled'}`,
      data: updated,
    });
  } catch (e) {
    console.error('Toggle country error:', e);
    res.status(500).json({ success: false, error: 'Failed to update country status' });
  }
});

/**
 * POST /api/admin/catalog/batch
 * Batch enable or disable services or countries.
 * Body: { action: "enable_all_services" | "disable_all_services" | ... }
 */
router.post('/catalog/batch', async (req: AuthenticatedRequest, res) => {
  try {
    const { action } = req.body;

    const [allServices, allCountries] = await Promise.all([
      tigerSms.getServicesList('en').catch(() => []),
      tigerSms.getCountries().catch(() => []),
    ]);

    if (action === 'enable_all_services') {
      await setDisabledCatalog([]);
    } else if (action === 'disable_all_services') {
      await setDisabledCatalog(allServices.map((s) => s.code));
    } else if (action === 'enable_all_countries') {
      await setDisabledCatalog(undefined, []);
    } else if (action === 'disable_all_countries') {
      await setDisabledCatalog(undefined, allCountries.map((c) => c.id));
    } else {
      res.status(400).json({ success: false, error: 'Unknown batch action' });
      return;
    }

    res.json({ success: true, message: `Batch action "${action}" executed successfully` });
  } catch (e) {
    console.error('Batch catalog error:', e);
    res.status(500).json({ success: false, error: 'Failed to process batch catalog update' });
  }
});

/**
 * POST /api/admin/telegram/test
 * Test Telegram notification connection.
 * Body: { botToken?: string, chatId?: string }
 */
router.post('/telegram/test', async (req: AuthenticatedRequest, res) => {
  try {
    const { botToken, chatId } = req.body;
    const result = await testTelegramConnection(botToken, chatId);
    res.json(result);
  } catch (e: any) {
    console.error('Telegram test error:', e);
    res.status(400).json({ success: false, error: e.message || 'Failed to send test message via Telegram' });
  }
});

/**
 * GET /api/admin/payment-requests
 * List all manual deposit / payment requests.
 */
router.get('/payment-requests', async (_req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('payment_requests')
      .select('*, profiles:user_id(email, full_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const normalized = (data || []).map((req: any) => {
      const s = String(req.status || '').toLowerCase().trim();
      const normalizedStatus =
        s === 'paid' || s === 'approved' || s === 'completed' || s === 'success'
          ? 'approved'
          : s === 'failed' || s === 'rejected' || s === 'cancelled'
          ? 'rejected'
          : 'pending';

      return {
        ...req,
        amount: parseFloat(req.amount ?? req.amount_inr ?? 0),
        amount_inr: parseFloat(req.amount_inr ?? req.amount ?? 0),
        transaction_id: req.transaction_id || req.gateway_payment_id || '',
        gateway_payment_id: req.gateway_payment_id || req.transaction_id || '',
        payment_method: req.payment_method || req.gateway || 'upi',
        gateway: req.gateway || req.payment_method || 'upi',
        status: normalizedStatus,
      };
    });

    res.json({ success: true, data: normalized });
  } catch (e: any) {
    console.error('Error fetching admin payment requests:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to fetch payment requests' });
  }
});

/**
 * POST /api/admin/payment-requests/:id/approve
 * Approve deposit and credit user wallet balance.
 */
router.post('/payment-requests/:id/approve', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { data: request, error: fetchErr } = await supabaseAdmin
      .from('payment_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !request) {
      res.status(404).json({ success: false, error: 'Payment request not found' });
      return;
    }

    const { error: approvalError } = await supabaseAdmin.rpc('approve_payment_request_atomic', {
      p_request_id: id,
      p_admin_id: req.userId || 'legacy-admin',
    });
    if (approvalError) throw approvalError;

    res.json({ success: true, message: 'Deposit approved and credited successfully' });
  } catch (e: any) {
    console.error('Error approving payment request:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to approve payment request' });
  }
});

/**
 * POST /api/admin/payment-requests/:id/reject
 * Reject a deposit request.
 */
router.post('/payment-requests/:id/reject', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const updateRes = await supabaseAdmin
      .from('payment_requests')
      .update({ status: 'rejected', admin_notes: reason || null, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateRes.error) {
      await supabaseAdmin
        .from('payment_requests')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', id);
    }

    res.json({ success: true, message: 'Deposit request rejected' });
  } catch (e: any) {
    console.error('Error rejecting payment request:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to reject payment request' });
  }
});

/**
 * GET /api/admin/recharges
 * Fetch wallet recharge history (topups and admin credits) across all users.
 */
router.get('/recharges', async (req: AuthenticatedRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search as string || '';

    // First, if there's a search term (like email), we might need to find the user IDs first.
    let userIds: string[] = [];
    if (search.trim()) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('email', `%${search.trim()}%`)
        .limit(50);
      if (profiles && profiles.length > 0) {
        userIds = profiles.map(p => p.id);
      } else {
        // If search doesn't match any user, return empty
        return res.json({ success: true, data: { recharges: [], total: 0 } });
      }
    }

    let query = supabaseAdmin
      .from('wallet_transactions')
      .select('*, profiles(email, full_name)', { count: 'exact' })
      .in('type', ['topup', 'admin_credit']);

    if (userIds.length > 0) {
      query = query.in('user_id', userIds);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Normalize output
    const recharges = (data || []).map((tx: any) => ({
      ...tx,
      email: tx.profiles?.email || 'Unknown',
      name: tx.profiles?.full_name || 'Unknown',
    }));

    res.json({ success: true, data: { recharges, total: count || 0 } });
  } catch (e: any) {
    console.error('Error fetching recharge history:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to fetch recharge history' });
  }
});

export default router;
