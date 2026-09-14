const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      if (dirPath.endsWith('.astro') || dirPath.endsWith('.tsx') || dirPath.endsWith('.ts')) {
        callback(dirPath);
      }
    }
  });
}

walkDir('apps/web/src', file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace profile?.role === 'admin'
  content = content.replace(/profile\?\.role === 'admin'/g, "(profile?.role === 'admin' || profile?.role === 'superadmin')");
  
  // Replace profile.role === 'admin'
  content = content.replace(/profile\.role === 'admin'/g, "(profile.role === 'admin' || profile.role === 'superadmin')");

  // Replace existingProfile?.role === 'admin'
  content = content.replace(/existingProfile\?\.role === 'admin'/g, "(existingProfile?.role === 'admin' || existingProfile?.role === 'superadmin')");

  // Replace existingProfile.role === 'admin'
  content = content.replace(/existingProfile\.role === 'admin'/g, "(existingProfile.role === 'admin' || existingProfile.role === 'superadmin')");

  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log('Updated ' + file);
  }
});
