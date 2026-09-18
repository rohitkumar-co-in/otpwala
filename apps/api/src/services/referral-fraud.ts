/**
 * Referral Fraud Detection Engine (Express API)
 * Evaluates IP collision, IPv6 /64 prefix matching, shared security log history,
 * reciprocal referral loops, and velocity limits to prevent self-referral & sybil abuse.
 */

export interface FraudCheckResult {
  allowed: boolean;
  status: 'clean' | 'suspicious' | 'blocked';
  score: number;
  reasons: string[];
}

export function normalizeIp(ip?: string | null): string {
  if (!ip) return '';
  let clean = ip.trim();
  if (clean.startsWith('[') && clean.includes(']')) {
    clean = clean.slice(1, clean.indexOf(']'));
  } else if (clean.includes('.') && clean.includes(':')) {
    const parts = clean.split(':');
    if (parts.length === 2 && parts[0].includes('.')) {
      clean = parts[0];
    }
  }
  if (clean.toLowerCase().startsWith('::ffff:')) {
    clean = clean.slice(7);
  }
  return clean.toLowerCase();
}

export function extractSubnetPrefix(ip: string): { type: 'ipv4' | 'ipv6' | 'unknown'; prefix: string } {
  const clean = normalizeIp(ip);
  if (!clean) return { type: 'unknown', prefix: '' };

  if (clean.includes('.')) {
    const octets = clean.split('.');
    if (octets.length >= 3) {
      return { type: 'ipv4', prefix: `${octets[0]}.${octets[1]}.${octets[2]}` };
    }
    return { type: 'ipv4', prefix: clean };
  }

  if (clean.includes(':')) {
    const parts = clean.split(':');
    const prefixParts = parts.slice(0, 4).filter(Boolean);
    if (prefixParts.length >= 3) {
      return { type: 'ipv6', prefix: prefixParts.join(':') };
    }
    return { type: 'ipv6', prefix: clean };
  }

  return { type: 'unknown', prefix: clean };
}

export function compareNetworkIps(
  ip1?: string | null,
  ip2?: string | null
): { match: boolean; level: 'exact' | 'ipv6_prefix' | 'ipv4_subnet' | 'none'; description?: string } {
  const n1 = normalizeIp(ip1);
  const n2 = normalizeIp(ip2);

  if (!n1 || !n2) {
    return { match: false, level: 'none' };
  }

  if (n1 === n2) {
    return {
      match: true,
      level: 'exact',
      description: `Identical IP address match (${n1})`,
    };
  }

  const s1 = extractSubnetPrefix(n1);
  const s2 = extractSubnetPrefix(n2);

  if (s1.type === 'ipv6' && s2.type === 'ipv6' && s1.prefix && s2.prefix) {
    if (s1.prefix === s2.prefix) {
      return {
        match: true,
        level: 'ipv6_prefix',
        description: `Shared IPv6 /64 mobile carrier prefix (${s1.prefix}:*)`,
      };
    }
  }

  if (s1.type === 'ipv4' && s2.type === 'ipv4' && s1.prefix && s2.prefix) {
    if (s1.prefix === s2.prefix) {
      return {
        match: true,
        level: 'ipv4_subnet',
        description: `Shared IPv4 /24 subnet (${s1.prefix}.*)`,
      };
    }
  }

  return { match: false, level: 'none' };
}

export async function evaluateReferralFraud(
  referrerId: string,
  refereeId: string,
  currentIp: string,
  currentIsp: string | null = null,
  currentUserAgent: string | null = null,
  supabase: any
): Promise<FraudCheckResult> {
  const reasons: string[] = [];
  let score = 0;

  if (referrerId === refereeId) {
    return {
      allowed: false,
      status: 'blocked',
      score: 100,
      reasons: ['Self-referral: Attempted to claim own referral code'],
    };
  }

  const cleanCurrentIp = normalizeIp(currentIp);

  let referrerProfile: any = null;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('signup_ip, last_login_ip, last_login_isp, user_agent:raw_user_meta_data->session_user_agent')
      .eq('id', referrerId)
      .maybeSingle();
    referrerProfile = data;
  } catch {}

  let refereeProfile: any = null;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('signup_ip, last_login_ip, last_login_isp')
      .eq('id', refereeId)
      .maybeSingle();
    refereeProfile = data;
  } catch {}

  if (cleanCurrentIp && referrerProfile) {
    const checkLastIp = compareNetworkIps(cleanCurrentIp, referrerProfile.last_login_ip);
    const checkSignupIp = compareNetworkIps(cleanCurrentIp, referrerProfile.signup_ip);

    if (checkLastIp.level === 'exact' || checkSignupIp.level === 'exact') {
      score += 90;
      reasons.push('Direct IP collision: Current device IP matches referrer IP');
    } else if (checkLastIp.level === 'ipv6_prefix' || checkSignupIp.level === 'ipv6_prefix') {
      score += 80;
      reasons.push('Subnet collision: Matches referrer IPv6 /64 cellular carrier prefix (same mobile tethering/hotspot)');
    } else if (checkLastIp.level === 'ipv4_subnet' || checkSignupIp.level === 'ipv4_subnet') {
      score += 45;
      reasons.push('Subnet proximity: Shares IPv4 /24 subnet with referrer');
    }
  }

  if (refereeProfile && referrerProfile) {
    const checkRefereeToReferrer = compareNetworkIps(refereeProfile.signup_ip, referrerProfile.signup_ip);
    if (checkRefereeToReferrer.level === 'exact') {
      score += 85;
      reasons.push('Registration collision: Referee account was created from exact same IP as referrer account');
    } else if (checkRefereeToReferrer.level === 'ipv6_prefix') {
      score += 75;
      reasons.push('Registration proximity: Both accounts created on same IPv6 /64 carrier prefix');
    }
  }

  if (cleanCurrentIp && supabase) {
    try {
      const { data: referrerLogs } = await supabase
        .from('user_security_logs')
        .select('id, ip_address')
        .eq('user_id', referrerId)
        .eq('ip_address', cleanCurrentIp)
        .limit(1);

      if (referrerLogs && referrerLogs.length > 0) {
        score += 85;
        reasons.push('Historical collision: Referrer has logged in from this exact IP address in the past');
      }
    } catch {}
  }

  if (supabase) {
    try {
      const { data: circularRef } = await supabase
        .from('referrals')
        .select('id')
        .eq('referrer_id', refereeId)
        .eq('referred_id', referrerId)
        .maybeSingle();

      if (circularRef) {
        score += 100;
        reasons.push('Circular referral loop: User was previously referred by this account');
      }
    } catch {}
  }

  if (cleanCurrentIp && supabase) {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentFromSameIp } = await supabase
        .from('referrals')
        .select('id')
        .eq('referrer_id', referrerId)
        .eq('attribution_ip', cleanCurrentIp)
        .gte('created_at', since);

      if (recentFromSameIp && recentFromSameIp.length >= 2) {
        score += 80;
        reasons.push(`Velocity limit exceeded: ${recentFromSameIp.length} accounts referred from this IP in the last 24h`);
      }
    } catch {}
  }

  if (currentUserAgent && referrerProfile?.user_agent && currentIsp && referrerProfile?.last_login_isp) {
    if (currentUserAgent === referrerProfile.user_agent && currentIsp === referrerProfile.last_login_isp) {
      score += 40;
      reasons.push('Device fingerprint match: Identical browser user-agent on same internet provider');
    }
  }

  let status: 'clean' | 'suspicious' | 'blocked' = 'clean';
  let allowed = true;

  if (score >= 75) {
    status = 'blocked';
    allowed = false;
  } else if (score >= 40) {
    status = 'suspicious';
    allowed = true;
  }

  return {
    allowed,
    status,
    score: Math.min(score, 100),
    reasons,
  };
}
