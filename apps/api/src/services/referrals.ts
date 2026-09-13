import { supabaseAdmin } from '../config/supabase.js';
import { creditBalance } from './wallet.js';

export interface ReferralRecord {
  referrerId: string;
  referredUserId: string;
  referredName: string;
  joinedAt: string;
  depositCount?: number;
  firstDepositDone?: boolean;
  firstDepositAt?: string;
  totalBonusEarned?: number;
}

export interface ReferralsData {
  referrals: ReferralRecord[];
}

export async function getReferralBonusConfig(): Promise<{ tier1: number; tier2: number; tier3: number; windowDays: number }> {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('key, value')
    .in('key', [
      'referral_bonus_tier1_percent',
      'referral_bonus_tier2_percent',
      'referral_bonus_tier3_percent',
      'referral_bonus_window_days',
    ]);

  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  const tier1 = parseFloat(map.referral_bonus_tier1_percent || '20');
  const tier2 = parseFloat(map.referral_bonus_tier2_percent || '5');
  const tier3 = parseFloat(map.referral_bonus_tier3_percent || '5');
  const windowDays = parseFloat(map.referral_bonus_window_days || '30');

  return {
    tier1: isNaN(tier1) ? 20 : tier1,
    tier2: isNaN(tier2) ? 5 : tier2,
    tier3: isNaN(tier3) ? 5 : tier3,
    windowDays: isNaN(windowDays) || windowDays < 1 ? 30 : windowDays,
  };
}

// In-memory cache for referrals registry
let cachedRegistry: ReferralRecord[] | null = null;
let cachedCodesMap: Record<string, string> | null = null;
let registryLastFetched = 0;
const CACHE_TTL = 30_000; // 30 seconds

async function getRegistry(): Promise<ReferralRecord[]> {
  const now = Date.now();
  if (cachedRegistry && now - registryLastFetched < CACHE_TTL) {
    return cachedRegistry;
  }

  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'referrals_registry')
    .maybeSingle();

  let records: ReferralRecord[] = [];
  try {
    if (data?.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      records = Array.isArray(parsed) ? parsed : (parsed.referrals || []);
    }
  } catch {
    records = [];
  }

  cachedRegistry = records;
  registryLastFetched = now;
  return cachedRegistry;
}

async function saveRegistry(records: ReferralRecord[]): Promise<void> {
  cachedRegistry = records;
  registryLastFetched = Date.now();

  await supabaseAdmin
    .from('settings')
    .upsert({
      key: 'referrals_registry',
      value: JSON.stringify(records),
      updated_at: new Date().toISOString(),
    });
}

async function getCodesMap(): Promise<Record<string, string>> {
  if (cachedCodesMap) return cachedCodesMap;

  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'referral_codes_map')
    .maybeSingle();

  let map: Record<string, string> = {};
  try {
    if (data?.value) {
      map = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    }
  } catch {
    map = {};
  }

  cachedCodesMap = map;
  return cachedCodesMap;
}

async function saveCodesMap(map: Record<string, string>): Promise<void> {
  cachedCodesMap = map;
  await supabaseAdmin
    .from('settings')
    .upsert({
      key: 'referral_codes_map',
      value: JSON.stringify(map),
      updated_at: new Date().toISOString(),
    });
}

/**
 * Generate or get a user's unique referral code.
 */
export async function getUserReferralCode(userId: string): Promise<string> {
  const codesMap = await getCodesMap();

  // Check if code already exists for this user
  for (const [code, uid] of Object.entries(codesMap)) {
    if (uid === userId) return code;
  }

  // Derive unique clean code: REF + first 6 chars of clean UUID
  const cleanId = userId.replace(/-/g, '').toUpperCase();
  let code = `REF${cleanId.substring(0, 6)}`;

  // In the extremely rare event of collision, take next slice
  if (codesMap[code] && codesMap[code] !== userId) {
    code = `REF${cleanId.substring(2, 8)}`;
  }

  codesMap[code] = userId;
  await saveCodesMap(codesMap);
  return code;
}

/**
 * Attribute a new user to a referrer code within 48 hours of account registration.
 * Rules:
 * - Must be within 48 hours of account creation.
 * - Cannot be changed once entered (permanent lock).
 * - Cannot self-refer.
 */
export async function attributeReferral(
  referredUserId: string,
  referralCode: string
): Promise<{ success: boolean; message: string; referrerCode?: string }> {
  if (!referralCode || !referredUserId) {
    return { success: false, message: 'Referral code is required.' };
  }

  const cleanCode = referralCode.trim().toUpperCase();
  const codesMap = await getCodesMap();
  const referrerId = codesMap[cleanCode];

  // Disallow non-existent code
  if (!referrerId) {
    return { success: false, message: 'Invalid referral code. Please check and try again.' };
  }

  // Disallow self-referral
  if (referrerId === referredUserId) {
    return { success: false, message: 'You cannot claim your own referral code.' };
  }

  // Fetch referred user's profile to verify registration timestamp and eligibility
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, email, created_at')
    .eq('id', referredUserId)
    .maybeSingle();

  if (!profile) {
    return { success: false, message: 'User profile not found.' };
  }

  // Strict 24-hour window from account registration
  const registeredTime = new Date(profile.created_at).getTime();
  const now = Date.now();
  const elapsedHours = (now - registeredTime) / (1000 * 60 * 60);

  if (elapsedHours > 24) {
    return {
      success: false,
      message: 'Eligibility window expired. Referral codes can strictly only be claimed within 24 hours of account registration.',
    };
  }

  const registry = await getRegistry();

  // Check if user has already claimed a referral code
  const alreadyLinked = registry.some((r) => r.referredUserId === referredUserId);
  if (alreadyLinked) {
    return {
      success: false,
      message: 'A referral code has already been claimed on this account. It is permanently locked and cannot be changed.',
    };
  }

  // Fetch referred user's name
  let userName = 'Friend';
  if (profile.full_name?.trim()) {
    userName = profile.full_name.trim();
  } else if (profile.email) {
    userName = profile.email.split('@')[0];
  }

  registry.push({
    referrerId,
    referredUserId,
    referredName: userName,
    joinedAt: new Date().toISOString(),
    firstDepositDone: false,
    totalBonusEarned: 0,
  });

  await saveRegistry(registry);
  return {
    success: true,
    message: `Referral code ${cleanCode} successfully linked! It is now permanently locked to your account.`,
    referrerCode: cleanCode,
  };
}

/**
 * Process referral deposit commission.
 * Rules:
 * - 1st deposit: Tier 1 % (configured in admin tab, default 20%)
 * - 2nd deposit: Tier 2 % (configured in admin tab, default 5%) — ONLY if within 30 days of account creation
 * - 3rd deposit: Tier 3 % (configured in admin tab, default 5%) — ONLY if within 30 days of account creation
 * - 4th deposit and beyond: 0% bonus
 * - Credited as non-withdrawable platform balance via wallet credit.
 */
export async function processReferralDepositBonus(depositingUserId: string, depositAmount: number): Promise<void> {
  if (!depositAmount || depositAmount <= 0) return;

  const registry = await getRegistry();
  const referralIndex = registry.findIndex((r) => r.referredUserId === depositingUserId);

  if (referralIndex === -1) {
    // User was not referred
    return;
  }

  const referral = registry[referralIndex];
  const referrerId = referral.referrerId;

  if (!referrerId || referrerId === depositingUserId) return;

  const currentCount = (referral.depositCount || 0) + 1;
  referral.depositCount = currentCount;

  // Only 1st, 2nd, and 3rd deposits receive referral commissions
  if (currentCount > 3) {
    await saveRegistry(registry);
    return;
  }

  const { tier1, tier2, tier3, windowDays } = await getReferralBonusConfig();
  let bonusPercent = 0;

  if (currentCount === 1) {
    bonusPercent = tier1;
    referral.firstDepositDone = true;
    referral.firstDepositAt = new Date().toISOString();
  } else if (currentCount === 2 || currentCount === 3) {
    // 2nd and 3rd deposit bonus can ONLY be rewarded if deposited within the configured window (e.g. 30 days) of account creation
    const joinTime = new Date(referral.joinedAt).getTime();
    const nowTime = Date.now();
    const daysSinceAccountCreation = (nowTime - joinTime) / (1000 * 60 * 60 * 24);

    if (daysSinceAccountCreation <= windowDays) {
      bonusPercent = currentCount === 2 ? tier2 : tier3;
    } else {
      // Exceeded configured eligibility window of account creation — no reward
      await saveRegistry(registry);
      return;
    }
  }

  const bonusAmount = Math.round((depositAmount * (bonusPercent / 100)) * 100) / 100;
  if (bonusAmount <= 0) {
    await saveRegistry(registry);
    return;
  }

  referral.totalBonusEarned = (referral.totalBonusEarned || 0) + bonusAmount;
  await saveRegistry(registry);

  const cleanName = referral.referredName || 'Friend';
  // Requested format: "1 refer bonus from X +y amount added to your account"
  const description = `1 refer bonus from ${cleanName} + ₹${bonusAmount.toFixed(2)} added to your account`;

  try {
    await creditBalance(
      referrerId,
      bonusAmount,
      'admin_credit',
      description
    );
  } catch (err) {
    console.error(`Failed to credit referral bonus to ${referrerId}:`, err);
  }
}

/**
 * Get comprehensive referral stats for a specific user:
 * - Referral Code & Link
 * - Total Bonus Earned
 * - Total Friends Joined
 * - Active Bonus Tiers Configuration
 * - List of Joined Users (SHOWING ONLY Name and Date of Joining as strictly requested)
 * - Deposit Bonus logs
 */
export async function getReferralStats(userId: string): Promise<{
  referralCode: string;
  totalEarned: number;
  totalReferrals: number;
  bonusConfig: { tier1: number; tier2: number; tier3: number; windowDays: number };
  referredUsers: Array<{ name: string; joinedAt: string }>;
  bonusLogs: Array<{ id: string; description: string; amount: number; createdAt: string }>;
  claimStatus: {
    isReferred: boolean;
    referrerCode: string | null;
    userCreatedAt: string;
    isWithin24Hours: boolean;
    isWithin48Hours: boolean;
    hoursRemaining: number;
    canClaimReferral: boolean;
  };
}> {
  const referralCode = await getUserReferralCode(userId);
  const bonusConfig = await getReferralBonusConfig();
  const registry = await getRegistry();

  // Filter referrals made by this user
  const userReferrals = registry.filter((r) => r.referrerId === userId);

  // PRIVACY REQUIREMENT: Show ONLY name and date of joining
  const referredUsers = userReferrals.map((r) => ({
    name: r.referredName || 'User',
    joinedAt: r.joinedAt,
  }));

  // Fetch bonus logs from wallet_transactions
  const { data: bonusTxs } = await supabaseAdmin
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

  // Check if current user has claimed a referral code
  const myReferralRecord = registry.find((r) => r.referredUserId === userId);
  const isReferred = !!myReferralRecord;
  const codesMap = await getCodesMap();
  let myReferrerCode: string | null = null;
  if (myReferralRecord) {
    for (const [code, uid] of Object.entries(codesMap)) {
      if (uid === myReferralRecord.referrerId) {
        myReferrerCode = code;
        break;
      }
    }
  }

  // Calculate 24-hour registration window
  const { data: profileData } = await supabaseAdmin
    .from('profiles')
    .select('created_at')
    .eq('id', userId)
    .maybeSingle();

  const userCreatedAt = profileData?.created_at || new Date().toISOString();
  const elapsedHours = (Date.now() - new Date(userCreatedAt).getTime()) / (1000 * 60 * 60);
  const isWithin24Hours = elapsedHours <= 24;
  const hoursRemaining = Math.max(0, 24 - elapsedHours);
  const canClaimReferral = !isReferred && isWithin24Hours;

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
