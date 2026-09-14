import { getSupabaseAdmin } from './supabase';

export async function getReferralStats(userId: string, env?: any) {
  const supabase = getSupabaseAdmin(env);

  const { data: codeData } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'referral_codes_map')
    .maybeSingle();

  let codesMap: Record<string, string> = {};
  try {
    if (codeData?.value) {
      codesMap = typeof codeData.value === 'string' ? JSON.parse(codeData.value) : codeData.value;
    }
  } catch {}

  let referralCode = codesMap[userId];
  if (!referralCode) {
    referralCode = 'REF' + Math.random().toString(36).substring(2, 8).toUpperCase();
    codesMap[userId] = referralCode;
    await supabase.from('settings').upsert({
      key: 'referral_codes_map',
      value: JSON.stringify(codesMap),
      updated_at: new Date().toISOString(),
    });
  }

  const { data: registryData } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'referrals_registry')
    .maybeSingle();

  let allReferrals: any[] = [];
  try {
    if (registryData?.value) {
      allReferrals = typeof registryData.value === 'string' ? JSON.parse(registryData.value) : registryData.value;
    }
  } catch {}

  const myReferrals = allReferrals.filter((r: any) => r.referrerId === userId);
  const totalEarned = myReferrals.reduce((sum: number, r: any) => sum + (r.totalBonusEarned || 0), 0);

  return {
    referralCode,
    referralLink: `https://otpwala.me/?ref=${referralCode}`,
    totalReferrals: myReferrals.length,
    activeReferrals: myReferrals.length,
    totalCommissionEarned: totalEarned,
    pendingCommission: 0,
    commissionRate: 20,
    recentReferrals: myReferrals.slice(-10).map((r: any) => ({
      name: r.referredName || 'User',
      date: r.joinedAt,
      earned: r.totalBonusEarned || 0,
    })),
  };
}

export async function attributeReferral(userId: string, referralCode: string, env?: any) {
  const supabase = getSupabaseAdmin(env);

  const { data: codeData } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'referral_codes_map')
    .maybeSingle();

  let codesMap: Record<string, string> = {};
  try {
    if (codeData?.value) {
      codesMap = typeof codeData.value === 'string' ? JSON.parse(codeData.value) : codeData.value;
    }
  } catch {}

  let referrerId: string | null = null;
  for (const [uid, code] of Object.entries(codesMap)) {
    if (code.toLowerCase() === referralCode.toLowerCase()) {
      referrerId = uid;
      break;
    }
  }

  if (!referrerId || referrerId === userId) {
    return { success: false, message: 'Invalid or self referral code' };
  }

  const { data: registryData } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'referrals_registry')
    .maybeSingle();

  let allReferrals: any[] = [];
  try {
    if (registryData?.value) {
      allReferrals = typeof registryData.value === 'string' ? JSON.parse(registryData.value) : registryData.value;
    }
  } catch {}

  if (allReferrals.some((r: any) => r.referredUserId === userId)) {
    return { success: false, message: 'User already referred' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', userId)
    .maybeSingle();

  allReferrals.push({
    referrerId,
    referredUserId: userId,
    referredName: profile?.full_name || (profile?.email ? profile.email.split('@')[0] : 'User'),
    joinedAt: new Date().toISOString(),
    totalBonusEarned: 0,
  });

  await supabase.from('settings').upsert({
    key: 'referrals_registry',
    value: JSON.stringify(allReferrals),
    updated_at: new Date().toISOString(),
  });

  return { success: true, referrerCode: referralCode };
}
