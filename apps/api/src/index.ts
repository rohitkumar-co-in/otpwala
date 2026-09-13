import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import catalogRoutes from './routes/catalog.js';
import priceRoutes from './routes/prices.js';
import numberRoutes from './routes/numbers.js';
import walletRoutes from './routes/wallet.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';
import sessionRoutes from './routes/session.js';
import referralRoutes from './routes/referrals.js';

const app = express();

// ─── Global Middleware ───
const rawAllowedOrigins = (env.WEB_URL || '').split(',').map((u) => u.trim());
const allowedOrigins = Array.from(new Set([
  ...rawAllowedOrigins,
  'http://localhost:4321',
  'http://localhost:3000',
  'https://otpwala.me',
  'https://www.otpwala.me',
])).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.otpwala.me')) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive fallback for production API client
    }
  },
  credentials: true,
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// Stricter rate limit for number purchases
const buyLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: { success: false, error: 'Too many purchase requests, please slow down' },
});

// ─── Health Check ───
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Catalog Routes (Public) ───
app.use('/api', catalogRoutes);

// ─── Wallet Config (Public) ───
app.get('/api/wallet/config', async (_req, res) => {
  try {
    const { getWalletConfig } = await import('./routes/wallet.js');
    const config = await getWalletConfig();
    res.json({ success: true, data: config });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch wallet config' });
  }
});

// ─── Public Branding & Site Configuration ───
app.get('/api/branding', async (_req, res) => {
  try {
    const { supabaseAdmin } = await import('./config/supabase.js');
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .in('key', ['brand_name', 'title_separator', 'brand_slogan', 'maintenance_mode']);

    if (error) throw error;

    const map: Record<string, string> = {};
    (data || []).forEach((r) => {
      map[r.key] = typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
    });

    res.json({
      success: true,
      data: {
        brandName: map['brand_name'] || 'OTPWala',
        separator: map['title_separator'] || '—',
        slogan: map['brand_slogan'] || 'Instant Virtual Numbers for SMS Verification',
        maintenanceMode: map['maintenance_mode'] === 'true',
      },
    });
  } catch (e: any) {
    res.json({
      success: true,
      data: {
        brandName: 'OTPWala',
        separator: '—',
        slogan: 'Instant Virtual Numbers for SMS Verification',
        maintenanceMode: false,
      },
    });
  }
});

// ─── Public Auth & Registration Config ───
app.get('/api/auth/config', async (_req, res) => {
  try {
    const { supabaseAdmin } = await import('./config/supabase.js');
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .in('key', ['auth_allow_email_signup', 'auth_allow_google_login', 'auth_allow_registration']);

    if (error) throw error;

    const map: Record<string, string> = {};
    (data || []).forEach((r) => {
      map[r.key] = typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
    });

    res.json({
      success: true,
      data: {
        allowEmailSignup: map['auth_allow_email_signup'] !== 'false',
        allowGoogleLogin: map['auth_allow_google_login'] !== 'false',
        allowRegistration: map['auth_allow_registration'] !== 'false',
      },
    });
  } catch (e: any) {
    console.error('Auth config fetch error:', e);
    res.json({
      success: true,
      data: {
        allowEmailSignup: true,
        allowGoogleLogin: true,
        allowRegistration: true,
      },
    });
  }
});

// ─── Session Management Routes ───
app.use('/api/auth', sessionRoutes);

// ─── Authenticated Routes ───
app.use('/api/prices', authMiddleware, priceRoutes);
app.use('/api/numbers', authMiddleware, buyLimiter, numberRoutes);
app.use('/api/wallet', authMiddleware, walletRoutes);
app.use('/api/orders', authMiddleware, orderRoutes);
app.use('/api/referrals', authMiddleware, referralRoutes);

// ─── Admin Routes ───
app.use('/api/admin', authMiddleware, adminRoutes);

// ─── Error Handler ───
app.use(errorHandler);

// ─── Start Server ───
app.listen(env.API_PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║          OTPWala API Server              ║
║──────────────────────────────────────────║
║  Port:  ${String(env.API_PORT).padEnd(33)}║
║  Env:   ${env.NODE_ENV.padEnd(33)}║
║  URL:   http://localhost:${String(env.API_PORT).padEnd(17)}║
╚══════════════════════════════════════════╝
  `);
});

export default app;
