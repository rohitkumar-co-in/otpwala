import 'dotenv/config';

export const env = {
  // Tiger SMS
  TIGER_SMS_API_KEY: process.env.TIGER_SMS_API_KEY || '',
  TIGER_SMS_BASE_URL: process.env.TIGER_SMS_BASE_URL || 'https://api.tiger-sms.com',

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Razorpay
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',

  // Server
  API_PORT: parseInt(process.env.API_PORT || '3001', 10),
  WEB_URL: process.env.WEB_URL || 'http://localhost:4321',
  NODE_ENV: process.env.NODE_ENV || 'development',
} as const;

// Validate required env vars at startup
const required = ['TIGER_SMS_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
for (const key of required) {
  if (!env[key]) {
    console.warn(`[WARN] Missing required environment variable: ${key}`);
  }
}
