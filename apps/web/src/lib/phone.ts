// Comprehensive international phone number formatter & parser for OTP numbers

export const ISO_TO_DIAL_CODE: Record<string, string> = {
  us: '1', ca: '1', ru: '7', kz: '7', eg: '20', za: '27', gr: '30', nl: '31',
  be: '32', fr: '33', es: '34', hu: '36', it: '39', ro: '40', ch: '41', at: '43',
  gb: '44', uk: '44', dk: '45', se: '46', no: '47', pl: '48', de: '49', pe: '51',
  mx: '52', cu: '53', ar: '54', br: '55', cl: '56', co: '57', ve: '58', my: '60',
  au: '61', id: '62', ph: '63', nz: '64', sg: '65', th: '66', jp: '81', kr: '82',
  vn: '84', cn: '86', tr: '90', in: '91', pk: '92', af: '93', lk: '94', mm: '95',
  ir: '98', ss: '211', ma: '212', dz: '213', tn: '216', ly: '218', gm: '220',
  sn: '221', mr: '222', ml: '223', gn: '224', ci: '225', bf: '226', ne: '227',
  tg: '228', bj: '229', mu: '230', lr: '231', sl: '232', gh: '233', ng: '234',
  td: '235', cf: '236', cm: '237', cv: '238', st: '239', gq: '240', ga: '241',
  cg: '242', cd: '243', ao: '244', gw: '245', sc: '248', sd: '249', rw: '250',
  et: '251', so: '252', dj: '253', ke: '254', tz: '255', ug: '256', bi: '257',
  mz: '258', zm: '260', mg: '261', zw: '263', na: '264', mw: '265', ls: '266',
  bw: '267', sz: '268', km: '269', pt: '351', lu: '352', ie: '353', is: '354',
  al: '355', mt: '356', cy: '357', fi: '358', bg: '359', lt: '370', lv: '371',
  ee: '372', md: '373', am: '374', by: '375', ad: '376', mc: '377', sm: '378',
  ua: '380', rs: '381', me: '382', hr: '385', si: '386', ba: '387', mk: '389',
  cz: '420', sk: '421', li: '423', fk: '500', bz: '501', gt: '502', sv: '503',
  hn: '504', ni: '505', cr: '506', pa: '507', pm: '508', ht: '509', gp: '590',
  bo: '591', gy: '592', ec: '593', gf: '594', py: '595', mq: '596', sr: '597',
  uy: '598', cw: '599', tl: '670', nf: '672', bn: '673', nr: '674', pg: '675',
  to: '676', sb: '677', vu: '678', fj: '679', pw: '680', wf: '681', ck: '682',
  nu: '683', ws: '685', ki: '686', nc: '687', tv: '688', pf: '689', tk: '690',
  fm: '691', mh: '692', kp: '850', hk: '852', mo: '853', kh: '855', la: '856',
  bd: '880', tw: '886', mv: '960', lb: '961', jo: '962', sy: '963', iq: '964',
  kw: '965', sa: '966', ye: '967', om: '968', ps: '970', ae: '971', il: '972',
  bh: '973', qa: '974', bt: '975', mn: '976', np: '977', tj: '992', tm: '993',
  az: '994', ge: '995', kg: '996', uz: '998',
};

// Common catalog country IDs to ISO
export const PROVIDER_COUNTRY_ID_TO_ISO: Record<number, string> = {
  0: 'ru', 1: 'ua', 2: 'kz', 3: 'cn', 4: 'ph', 5: 'mm', 6: 'id', 7: 'my', 8: 'ke',
  9: 'tz', 10: 'vn', 11: 'kg', 12: 'us', 13: 'il', 14: 'hk', 15: 'pl', 16: 'gb',
  17: 'mg', 18: 'cg', 19: 'ng', 20: 'mo', 21: 'eg', 22: 'in', 23: 'ie', 24: 'kh',
  25: 'la', 26: 'ht', 27: 'ci', 28: 'gm', 29: 'rs', 30: 'ye', 31: 'za', 32: 'ro',
  33: 'co', 34: 'ee', 35: 'az', 36: 'ca', 37: 'ma', 38: 'gh', 39: 'ar', 40: 'uz',
  41: 'cm', 42: 'tg', 43: 'de', 44: 'lt', 45: 'hr', 46: 'se', 47: 'iq', 48: 'nl',
  49: 'lv', 50: 'at', 51: 'by', 52: 'th', 53: 'sa', 54: 'mx', 55: 'tw', 56: 'es',
  57: 'ir', 58: 'dz', 59: 'si', 60: 'bd', 61: 'sn', 62: 'tr', 63: 'cz', 64: 'lk',
  65: 'pe', 66: 'pk', 67: 'nz', 68: 'gn', 69: 'ml', 70: 've', 71: 'et', 72: 'mn',
  73: 'br', 74: 'af', 75: 'ug', 76: 'ao', 77: 'cy', 78: 'fr', 79: 'pg', 80: 'mz',
  81: 'np', 82: 'be', 83: 'bg', 84: 'hu', 85: 'it', 86: 'py', 87: 'id', 88: 'tn',
  89: 'so', 90: 'cl', 91: 'bf', 92: 'lb', 93: 'ga', 94: 'al', 95: 'uy', 96: 'mu',
  97: 'bt', 98: 'mv', 99: 'cf', 100: 'ge', 187: 'us',
};

// Sorted list of unique dialing codes from longest (3 digits) to shortest (1 digit)
const SORTED_DIAL_CODES: string[] = Array.from(
  new Set(Object.values(ISO_TO_DIAL_CODE))
).sort((a, b) => b.length - a.length || b.localeCompare(a));

export interface FormattedPhone {
  raw: string;
  dialCode: string;
  nationalNumber: string;
  display: string;    // e.g. "+1 9147469963"
  copyValue: string;  // e.g. "+19147469963"
}

/**
 * Formats a raw phone number with country calling code:
 * - display: "+1 9147469963"
 * - copyValue: "+19147469963"
 */
export function formatPhoneNumber(
  raw: string | undefined | null,
  countryHint?: string | number
): FormattedPhone {
  if (!raw) {
    return { raw: '', dialCode: '', nationalNumber: '', display: '', copyValue: '' };
  }

  const rawStr = String(raw).trim();
  const digits = rawStr.replace(/\D/g, '');

  if (!digits) {
    return {
      raw: rawStr,
      dialCode: '',
      nationalNumber: rawStr,
      display: rawStr,
      copyValue: rawStr,
    };
  }

  let expectedDialCode = '';

  // 1. Check country hint (ISO string or catalog country ID)
  if (countryHint !== undefined && countryHint !== null) {
    if (typeof countryHint === 'number') {
      const iso = PROVIDER_COUNTRY_ID_TO_ISO[countryHint];
      if (iso && ISO_TO_DIAL_CODE[iso]) {
        expectedDialCode = ISO_TO_DIAL_CODE[iso];
      }
    } else if (typeof countryHint === 'string') {
      const hintClean = countryHint.toLowerCase().trim();
      if (ISO_TO_DIAL_CODE[hintClean]) {
        expectedDialCode = ISO_TO_DIAL_CODE[hintClean];
      } else {
        const num = parseInt(hintClean, 10);
        if (!isNaN(num) && PROVIDER_COUNTRY_ID_TO_ISO[num]) {
          expectedDialCode = ISO_TO_DIAL_CODE[PROVIDER_COUNTRY_ID_TO_ISO[num]] || '';
        }
      }
    }
  }

  // 2. If known dial code matches the start of digits
  if (expectedDialCode && digits.startsWith(expectedDialCode) && digits.length > expectedDialCode.length) {
    const national = digits.slice(expectedDialCode.length);
    return {
      raw: rawStr,
      dialCode: expectedDialCode,
      nationalNumber: national,
      display: `+${expectedDialCode} ${national}`,
      copyValue: `+${expectedDialCode}${national}`,
    };
  }

  // 3. If known dial code does NOT match start (for example, local digits without a country code)
  if (expectedDialCode && !digits.startsWith(expectedDialCode)) {
    return {
      raw: rawStr,
      dialCode: expectedDialCode,
      nationalNumber: digits,
      display: `+${expectedDialCode} ${digits}`,
      copyValue: `+${expectedDialCode}${digits}`,
    };
  }

  // 4. Fallback: auto-detect country dial code from digits prefix (longest match first: 3-digit -> 2-digit -> 1-digit)
  for (const code of SORTED_DIAL_CODES) {
    if (digits.startsWith(code) && digits.length > code.length) {
      const national = digits.slice(code.length);
      return {
        raw: rawStr,
        dialCode: code,
        nationalNumber: national,
        display: `+${code} ${national}`,
        copyValue: `+${code}${national}`,
      };
    }
  }

  // 5. Default fallback if no known dial code prefix matched
  return {
    raw: rawStr,
    dialCode: '',
    nationalNumber: digits,
    display: `+${digits}`,
    copyValue: `+${digits}`,
  };
}
