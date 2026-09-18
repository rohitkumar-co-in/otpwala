import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeIp,
  extractSubnetPrefix,
  compareNetworkIps,
  evaluateReferralFraud,
} from './referral-fraud.ts';

test('normalizeIp handles standard, port-appended, and IPv4-mapped addresses', () => {
  assert.equal(normalizeIp(' 192.168.1.50 '), '192.168.1.50');
  assert.equal(normalizeIp('192.168.1.50:8080'), '192.168.1.50');
  assert.equal(normalizeIp('::ffff:103.21.244.2'), '103.21.244.2');
  assert.equal(normalizeIp('[2409:40e4:69:4a84::1]:443'), '2409:40e4:69:4a84::1');
  assert.equal(normalizeIp(null), '');
  assert.equal(normalizeIp(undefined), '');
});

test('extractSubnetPrefix isolates IPv4 /24 and IPv6 /64 prefixes', () => {
  const v4 = extractSubnetPrefix('103.21.244.15');
  assert.equal(v4.type, 'ipv4');
  assert.equal(v4.prefix, '103.21.244');

  const v6 = extractSubnetPrefix('2409:40e4:69:4a84:9513:ecff:fe2b:1111');
  assert.equal(v6.type, 'ipv6');
  assert.equal(v6.prefix, '2409:40e4:69:4a84');
});

test('compareNetworkIps detects exact, IPv6 /64 carrier hotspot, and IPv4 /24 matches', () => {
  // 1. Exact match
  const exact = compareNetworkIps('103.21.244.5', '103.21.244.5');
  assert.equal(exact.match, true);
  assert.equal(exact.level, 'exact');

  // 2. IPv6 /64 cellular hotspot match (e.g. Jio/Airtel mobile tethering)
  const v6Hotspot = compareNetworkIps(
    '2409:40e4:69:4a84:9513:ecff:fe2b:1111',
    '2409:40e4:69:4a84:1020:3040:5060:7080'
  );
  assert.equal(v6Hotspot.match, true);
  assert.equal(v6Hotspot.level, 'ipv6_prefix');

  // 3. IPv4 /24 subnet match
  const v4Subnet = compareNetworkIps('103.21.244.10', '103.21.244.99');
  assert.equal(v4Subnet.match, true);
  assert.equal(v4Subnet.level, 'ipv4_subnet');

  // 4. Completely different networks
  const diff = compareNetworkIps('103.21.244.10', '49.36.120.4');
  assert.equal(diff.match, false);
  assert.equal(diff.level, 'none');
});

test('evaluateReferralFraud rejects self-referral outright', async () => {
  const result = await evaluateReferralFraud('user-123', 'user-123', '103.21.244.5', null, null, {} as any);
  assert.equal(result.allowed, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.score, 100);
});

test('evaluateReferralFraud blocks exact IP collision between referrer and referee', async () => {
  const mockSupabase = {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: async () => {
                if (id === 'referrer-1') {
                  return { data: { signup_ip: '103.21.244.5', last_login_ip: '103.21.244.5' }, error: null };
                }
                return { data: { signup_ip: '103.21.244.5', last_login_ip: '103.21.244.5' }, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'referrals') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'user_security_logs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };

  const result = await evaluateReferralFraud(
    'referrer-1',
    'referee-2',
    '103.21.244.5', // Same exact IP as referrer
    'Reliance Jio',
    'Mozilla/5.0 Chrome/120',
    mockSupabase as any
  );

  assert.equal(result.allowed, false);
  assert.equal(result.status, 'blocked');
  assert.ok(result.score >= 75);
  assert.ok(result.reasons.some((r) => r.includes('Direct IP collision')));
});

test('evaluateReferralFraud blocks IPv6 /64 mobile hotspot sharing', async () => {
  const mockSupabase = {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: async () => {
                if (id === 'referrer-1') {
                  return { data: { signup_ip: '2409:40e4:69:4a84:1111:2222:3333:4444' }, error: null };
                }
                return { data: { signup_ip: '2409:40e4:69:4a84:5555:6666:7777:8888' }, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'referrals') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'user_security_logs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };

  const result = await evaluateReferralFraud(
    'referrer-1',
    'referee-2',
    '2409:40e4:69:4a84:5555:6666:7777:8888',
    'Airtel 5G',
    'Mozilla/5.0 iPhone',
    mockSupabase as any
  );

  assert.equal(result.allowed, false);
  assert.equal(result.status, 'blocked');
  assert.ok(result.score >= 75);
  assert.ok(result.reasons.some((r) => r.includes('IPv6 /64 cellular carrier prefix')));
});

test('evaluateReferralFraud allows clean referral between independent users', async () => {
  const mockSupabase = {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: async () => {
                if (id === 'referrer-1') {
                  return { data: { signup_ip: '49.36.120.4', last_login_ip: '49.36.120.4' }, error: null };
                }
                return { data: { signup_ip: '103.21.244.80', last_login_ip: '103.21.244.80' }, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'referrals') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
              gte: () => ({
                // velocity limit
                then: (resolve: any) => resolve({ count: 0, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'user_security_logs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };

  const result = await evaluateReferralFraud(
    'referrer-1',
    'referee-2',
    '103.21.244.80',
    'Tata Play Fiber',
    'Mozilla/5.0 Windows NT 10.0',
    mockSupabase as any
  );

  assert.equal(result.allowed, true);
  assert.equal(result.status, 'clean');
  assert.equal(result.score, 0);
  assert.equal(result.reasons.length, 0);
});
