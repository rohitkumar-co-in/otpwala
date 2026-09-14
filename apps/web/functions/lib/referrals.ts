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

  const userReferrals = allReferrals.filter((r: any) => r.referrerId === userId);
  
  const referredUsers = userReferrals.map((r: any) => ({
    name: r.referredName || 'User',
    joinedAt: r.joinedAt,
  }));

  const { data: bonusTxs } = await supabase
    .from('wallet_transactions')
    .select('id, description, amount, created_at')
    .eq('user_id', userId)
    .ilike('description', '%refer bonus%')
    .order('created_at', { ascending: false });

  const bonusLogs = (bonusTxs || []).map((tx: any) => ({
    id: tx.id,
    description: tx.description,
    amount: parseFloat(tx.amount || 0),
    createdAt: tx.created_at,
  }));

  const totalEarned = bonusLogs.reduce((sum, item) => sum + item.amount, 0);

  const myReferralRecord = allReferrals.find((r: any) => r.referredUserId === userId);
  const isReferred = !!myReferralRecord;
  let myReferrerCode: string | null = null;
  if (myReferralRecord) {
    for (const [code, uid] of Object.entries(codesMap)) {
      if (uid === myReferralRecord.referrerId) {
        myReferrerCode = code;
        break;
      }
    }
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('id', userId)
    .maybeSingle();

  const userCreatedAt = profileData?.created_at || new Date().toISOString();
  const elapsedHours = (Date.now() - new Date(userCreatedAt).getTime()) / (1000 * 60 * 60);
  const isWithin24Hours = elapsedHours <= 24;
  const hoursRemaining = Math.max(0, 24 - elapsedHours);
  const canClaimReferral = !isReferred && isWithin24Hours;

  const { data: settingsData } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', [
      'referral_bonus_tier1_percent',
      'referral_bonus_tier2_percent',
      'referral_bonus_tier3_percent',
      'referral_bonus_window_days',
    ]);
  const sMap = Object.fromEntries((settingsData || []).map((r: any) => [r.key, r.value]));
  const tier1 = parseFloat(sMap.referral_bonus_tier1_percent || '20');
  const tier2 = parseFloat(sMap.referral_bonus_tier2_percent || '5');
  const tier3 = parseFloat(sMap.referral_bonus_tier3_percent || '5');
  const windowDays = parseFloat(sMap.referral_bonus_window_days || '30');

  const bonusConfig = {
    tier1: isNaN(tier1) ? 20 : tier1,
    tier2: isNaN(tier2) ? 5 : tier2,
    tier3: isNaN(tier3) ? 5 : tier3,
    windowDays: isNaN(windowDays) || windowDays < 1 ? 30 : windowDays,
  };

  return {
    referralCode,
    totalEarned: Math.round(totalEarned * 100) / 100,
    totalReferrals: userReferrals.length,
    bonusConfig,
    referredUsers,
    bonusLogs,
    claimStatus: {
      isReferred,
      referrerCode: myReferrerCode,
      userCreatedAt,
      isWithin24Hours,
      isWithin48Hours: isWithin24Hours,
      hoursRemaining: Math.round(hoursRemaining * 10) / 10,
      canClaimReferral,
    },
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
