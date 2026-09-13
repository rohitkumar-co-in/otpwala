async function showJs() {
  const res = await fetch('https://tiger-sms.com/tenants/tiger-sms_com/js/bnw-favorites.js?id=971aeaf33ea65a0b91ecfeffa6f34d5e');
  const text = await res.text();
  console.log(text);
}
showJs();
