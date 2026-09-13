const { tigerSms } = require('./apps/api/dist/services/tigerSms.js');
const fs = require('fs');

// Standard mapping for SMS-Activate / Tiger SMS country IDs to ISO alpha-2 codes
const ID_TO_ISO = {
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
  97: 'bt', 98: 'mv', 99: 'cf', 100: 'ge', 101: 'bj', 102: 'td', 103: 'me', 104: 'ba',
  105: 'sl', 106: 'mk', 107: 'bi', 108: 'mw', 109: 'lr', 110: 'ne', 111: 'dj', 112: 'cm',
  113: 'gw', 114: 'km', 115: 'lr', 116: 'rw', 117: 'pt', 118: 'so', 119: 'zm', 120: 'zw',
  121: 'so', 122: 'mr', 123: 'tg', 124: 'bw', 125: 'gq', 126: 'sz', 127: 'ls', 128: 'cg',
  129: 'st', 130: 'sc', 131: 'cv', 132: 'er', 133: 'ss', 134: 'st', 135: 'km', 136: 'gw',
  137: 'na', 138: 'mw', 139: 'ao', 140: 'bi', 141: 'rw', 142: 'km', 143: 'gq', 144: 'cf',
  145: 'td', 146: 'dj', 147: 'er', 148: 'et', 149: 'so', 150: 'tz', 151: 'ug', 152: 'ke',
  153: 'zm', 154: 'zw', 155: 'al', 156: 'am', 157: 'ad', 158: 'ag', 159: 'bs', 160: 'bh',
  161: 'bb', 162: 'bz', 163: 'bo', 164: 'bn', 165: 'cr', 166: 'cu', 167: 'dm', 168: 'do',
  169: 'ec', 170: 'sv', 171: 'fj', 172: 'gd', 173: 'gt', 174: 'gy', 175: 'au', 176: 'hn',
  177: 'is', 178: 'jm', 179: 'jp', 180: 'jo', 181: 'kw', 182: 'lu', 183: 'mt', 184: 'mc',
  185: 'no', 186: 'om', 187: 'us', 188: 'pa', 189: 'qa', 190: 'kn', 191: 'lc', 192: 'vc',
  193: 'ws', 194: 'sm', 195: 'sr', 196: 'ch', 197: 'sg', 198: 'to', 199: 'tt', 200: 'ae'
};

async function buildCountryFlags() {
  const countries = await tigerSms.getCountries();
  console.log('Total countries from Tiger SMS:', countries.length);
  const result = {};
  for (const c of countries) {
    const iso = ID_TO_ISO[c.id] || 'un';
    result[c.id] = {
      id: c.id,
      name: c.eng,
      iso: iso,
      flagUrl: `https://flagcdn.com/${iso}.svg`
    };
  }
  fs.writeFileSync('C:\\Users\\Rohit\\Desktop\\New folder\\otpwala\\apps\\api\\src\\data\\countryFlags.json', JSON.stringify(result, null, 2));
  console.log('Saved countryFlags.json!');
}

buildCountryFlags();
