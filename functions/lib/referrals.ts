import { getSupabaseAdmin } from './supabase';
import { evaluateReferralFraud } from './referral-fraud';

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
    for (const [k, v] of Object.entries(codesMap)) {
      if (v === userId) {
        referralCode = k;
        break;
      }
    }
  }

  // Check profiles table for existing referral_code
  if (!referralCode) {
    try {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('id', userId)
        .maybeSingle();
      if (userProfile?.referral_code) {
        referralCode = userProfile.referral_code.trim().toUpperCase();
        codesMap[userId] = referralCode;
        codesMap[referralCode] = userId;
        await supabase.from('settings').upsert({
          key: 'referral_codes_map',
          value: JSON.stringify(codesMap),
          updated_at: new Date().toISOString(),
        });
      }
    } catch {}
  }

  if (!referralCode) {
    referralCode = 'REF' + Math.random().toString(36).substring(2, 8).toUpperCase();
    codesMap[userId] = referralCode;
    codesMap[referralCode] = userId;
    await supabase.from('settings').upsert({
      key: 'referral_codes_map',
      value: JSON.stringify(codesMap),
      updated_at: new Date().toISOString(),
    });
    try {
      await supabase.from('profiles').update({ referral_code: referralCode }).eq('id', userId);
    } catch {}
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
    for (const [k, v] of Object.entries(codesMap)) {
      if (v === myReferralRecord.referrerId) {
        myReferrerCode = k;
        break;
      } else if (k === myReferralRecord.referrerId) {
        myReferrerCode = typeof v === 'string' ? v : null;
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

export async function attributeReferral(
  userId: string,
  referralCode: string,
  clientContext?: { ip?: string | null; isp?: string | null; userAgent?: string | null },
  env?: any
) {
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

  const cleanCode = referralCode.trim().toUpperCase();
  let referrerId: string | null = null;

  // 1. Try direct lookup if codesMap has code as key
  if (codesMap[cleanCode]) {
    referrerId = codesMap[cleanCode];
  }

  // 2. Try lookup if codesMap has userId as key and code as value
  if (!referrerId) {
    for (const [uid, code] of Object.entries(codesMap)) {
      if (typeof code === 'string' && code.toUpperCase() === cleanCode) {
        referrerId = uid;
        break;
      }
    }
  }

  // 3. Fallback: check profiles table by referral_code
  if (!referrerId) {
    try {
      const { data: refProfile } = await supabase
        .from('profiles')
        .select('id, referral_code')
        .ilike('referral_code', cleanCode)
        .maybeSingle();

      if (refProfile?.id) {
        referrerId = refProfile.id;
        codesMap[cleanCode] = referrerId;
        codesMap[referrerId] = cleanCode;
        await supabase.from('settings').upsert({
          key: 'referral_codes_map',
          value: JSON.stringify(codesMap),
          updated_at: new Date().toISOString(),
        });
      }
    } catch {}
  }

  if (!referrerId) {
    return { success: false, message: 'Invalid referral code.' };
  }

  if (referrerId === userId) {
    return { success: false, message: 'You cannot claim your own referral code.' };
  }

  // ─── 4. Referral Fraud & Multi-Account Detection ───
  const fraudResult = await evaluateReferralFraud(
    referrerId,
    userId,
    clientContext?.ip || '',
    clientContext?.isp || null,
    clientContext?.userAgent || null,
    supabase
  );

  if (!fraudResult.allowed) {
    try {
      await supabase.from('referral_fraud_logs').insert({
        referrer_id: referrerId,
        referee_id: userId,
        referral_code: cleanCode,
        ip_address: clientContext?.ip || '127.0.0.1',
        isp: clientContext?.isp || null,
        user_agent: clientContext?.userAgent || null,
        fraud_score: fraudResult.score,
        reasons: fraudResult.reasons,
        action_taken: 'blocked',
      });
    } catch {}

    return {
      success: false,
      message: 'This referral code cannot be applied: self-referrals or accounts sharing the same network/device are not eligible for referral rewards.',
    };
  }

  // If suspicious, record audit log for review
  if (fraudResult.status === 'suspicious') {
    try {
      await supabase.from('referral_fraud_logs').insert({
        referrer_id: referrerId,
        referee_id: userId,
        referral_code: cleanCode,
        ip_address: clientContext?.ip || '127.0.0.1',
        isp: clientContext?.isp || null,
        user_agent: clientContext?.userAgent || null,
        fraud_score: fraudResult.score,
        reasons: fraudResult.reasons,
        action_taken: 'flagged_for_review',
      });
    } catch {}
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
    return { success: false, message: 'A referral code has already been claimed on this account.' };
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
    fraudStatus: fraudResult.status,
    fraudScore: fraudResult.score,
  });

  await supabase.from('settings').upsert({
    key: 'referrals_registry',
    value: JSON.stringify(allReferrals),
    updated_at: new Date().toISOString(),
  });

  // Sync to public.referrals table
  try {
    await supabase
      .from('referrals')
      .upsert({
        referrer_id: referrerId,
        referred_id: userId,
        referral_code: cleanCode,
        deposit_count: 0,
        bonus_paid_1: false,
        bonus_paid_2: false,
        bonus_paid_3: false,
        fraud_status: fraudResult.status,
        fraud_score: fraudResult.score,
        fraud_reasons: fraudResult.reasons,
        attribution_ip: clientContext?.ip || null,
        attribution_isp: clientContext?.isp || null,
        attribution_user_agent: clientContext?.userAgent || null,
      }, { onConflict: 'referred_id' });
  } catch {}

  return { success: true, referrerCode: cleanCode };
}

/**
 * Process referral deposit commission with anti-fraud protection
 */
export async function processReferralDepositBonus(depositingUserId: string, depositAmount: number, env?: any): Promise<void> {
  if (!depositAmount || depositAmount <= 0) return;
  const supabase = getSupabaseAdmin(env);

  try {
    const { data: refRecord } = await supabase
      .from('referrals')
      .select('referrer_id, fraud_status, fraud_reasons, deposit_count')
      .eq('referred_id', depositingUserId)
      .maybeSingle();

    if (!refRecord || !refRecord.referrer_id) return;
    if (refRecord.referrer_id === depositingUserId) return;

    // Block bonus payout if flagged as fraudulent or suspicious
    if (refRecord.fraud_status && refRecord.fraud_status !== 'clean') {
      try {
        await supabase.from('referral_fraud_logs').insert({
          referrer_id: refRecord.referrer_id,
          referee_id: depositingUserId,
          fraud_score: 85,
          reasons: refRecord.fraud_reasons || [`Referral marked as ${refRecord.fraud_status}`],
          action_taken: 'commission_denied',
          ip_address: '0.0.0.0',
        });
      } catch {}
      return;
    }

    const currentCount = (refRecord.deposit_count || 0) + 1;
    if (currentCount > 3) return;

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

    let bonusPercent = 0;
    if (currentCount === 1) {
      bonusPercent = isNaN(tier1) ? 20 : tier1;
    } else {
      bonusPercent = currentCount === 2 ? (isNaN(tier2) ? 5 : tier2) : (isNaN(tier3) ? 5 : tier3);
    }

    const bonusAmount = Math.round((depositAmount * (bonusPercent / 100)) * 100) / 100;
    if (bonusAmount <= 0) return;

    const desc = `Referral deposit bonus from friend +₹${bonusAmount.toFixed(2)}`;
    await supabase.rpc('post_wallet_transaction', {
      p_user_id: refRecord.referrer_id,
      p_amount: bonusAmount,
      p_type: 'admin_grant',
      p_description: desc,
      p_reference_type: 'referral_bonus',
      p_reference_id: depositingUserId,
      p_idempotency_key: `refbonus:${depositingUserId}:${currentCount}`,
    });

    const updatePayload: Record<string, any> = {
      deposit_count: currentCount,
      updated_at: new Date().toISOString(),
    };
    if (currentCount === 1) updatePayload.bonus_paid_1 = true;
    if (currentCount === 2) updatePayload.bonus_paid_2 = true;
    if (currentCount === 3) updatePayload.bonus_paid_3 = true;

    await supabase.from('referrals').update(updatePayload).eq('referred_id', depositingUserId);
  } catch (err) {
    console.error('Failed to process referral deposit bonus:', err);
  }
}
