const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\Rohit\\.gemini\\antigravity-ide\\brain\\d351a601-cb77-4772-a62e-0751237e7653\\.system_generated\\steps\\705\\content.md', 'utf8');

const m = content.match(/<script type="application\/json"[^>]*data-kind="service"[^>]*>([\s\S]*?)<\/script>/);
if (m) {
  const arr = JSON.parse(m[1]);
  console.log('Total services parsed from Tiger SMS:', arr.length);
  // Each item is [id, name, count, iconId]
  const map = {};
  for (const item of arr) {
    // map by lowercase name
    map[item[1].toLowerCase().trim()] = item[3];
  }
  fs.writeFileSync('C:\\Users\\Rohit\\Desktop\\New folder\\otpwala\\apps\\api\\src\\data\\tigerServiceIcons.json', JSON.stringify(map, null, 2));
  console.log('Wrote tigerServiceIcons.json successfully!');
}
