export function getConfig(env?: any) {
  const processValue = (key: string) => typeof process !== 'undefined' ? process.env?.[key] : undefined;
  const read = (key: string): string => String((env && env[key]) || processValue(key) || '').trim();
  const required = (key: string): string => {
    const value = read(key);
    if (!value) throw new Error(`Missing required server configuration: ${key}`);
    return value;
  };

  return {
    TIGER_SMS_API_KEY: required('TIGER_SMS_API_KEY'),
    TIGER_SMS_BASE_URL: read('TIGER_SMS_BASE_URL') || 'https://api.tiger-sms.com',
    SUPABASE_URL: required('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_ANON_KEY: read('PUBLIC_SUPABASE_ANON_KEY'),
  };
}
