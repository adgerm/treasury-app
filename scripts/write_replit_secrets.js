const fs = require('fs');
const path = require('path');

const secretPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEYFILE || '/run/secrets/google_sa.json';
const json = process.env.GOOGLE_SA_JSON;

if (!json) {
  console.warn('GOOGLE_SA_JSON not set; skipping write.');
  process.exit(0);
}

const dir = path.dirname(secretPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
fs.writeFileSync(secretPath, json, 'utf8');
console.log('Wrote Google SA JSON to', secretPath);
