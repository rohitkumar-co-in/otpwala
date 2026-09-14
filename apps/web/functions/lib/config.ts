export function getConfig(env?: any) {
  return {
    TIGER_SMS_API_KEY: (env && env.TIGER_SMS_API_KEY) || '8M88REBMRFIWqIpesEjxpvbKBCXJ70ws',
    TIGER_SMS_BASE_URL: (env && env.TIGER_SMS_BASE_URL) || 'https://api.tiger-sms.com',
    SUPABASE_URL: (env && env.SUPABASE_URL) || 'https://kphenpvtivxtilcclpnk.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: (env && env.SUPABASE_SERVICE_ROLE_KEY) || 'sb_secret_NoCvHNJYSpWCnuLNoeBQxw_db-kYnv3',
    SUPABASE_ANON_KEY: (env && env.PUBLIC_SUPABASE_ANON_KEY) || 'sb_publishable_bOyDl0ja3ZtK81KCZsLJAg_Zs4vOUsL',
  };
}
