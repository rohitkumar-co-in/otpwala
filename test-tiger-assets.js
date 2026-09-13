async function findCountryAssets() {
  const testIds = [
    // US is country 12, Russia is country 0, etc.
    'us', 'ru', 'in', 'gb', 'de', 'nl', 'fr', 'cn',
    '1', '2', '0', '12', '74', '187'
  ];
  
  const folders = [
    'https://tiger-sms.com/img/country/',
    'https://tiger-sms.com/img/countries/',
    'https://tiger-sms.com/img/flags/',
    'https://tiger-sms.com/img/flag/',
    'https://tiger-sms.com/img/c/',
    'https://tiger-sms.com/img/svg/',
    'https://tiger-sms.com/img/service/',
    'https://tiger-sms.com/tenants/tiger-sms_com/img/',
    'https://tiger-sms.com/tenants/tiger-sms_com/img/flags/',
    'https://tiger-sms.com/tenants/tiger-sms_com/img/country/',
    'https://tiger-sms.com/storage/img/'
  ];

  for (const folder of folders) {
    for (const id of testIds) {
      for (const ext of ['.svg', '.png', '.webp']) {
        const url = folder + id + ext;
        try {
          const res = await fetch(url, { method: 'HEAD' });
          if (res.status === 200 && res.headers.get('content-type')?.includes('image')) {
            console.log('FOUND:', url, res.headers.get('content-type'));
            return;
          }
        } catch {}
      }
    }
  }
  console.log('Done scanning common folders.');
}
findCountryAssets();
