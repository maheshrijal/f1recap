const fs = require('fs');
const path = require('path');

const OUTPUT_FILENAME = 'posthog-config.js';
const DEFAULT_HOST = 'https://app.posthog.com';

const publicKey = process.env.PUBLIC_POSTHOG_KEY || '';
const publicHost = process.env.PUBLIC_POSTHOG_HOST || '';

const outputPath = path.join(__dirname, '..', OUTPUT_FILENAME);

const content = `window.__POSTHOG__ = Object.freeze({
  key: ${JSON.stringify(publicKey)},
  host: ${JSON.stringify(publicHost || DEFAULT_HOST)}
});\n`;

fs.writeFileSync(outputPath, content, 'utf8');

if (!publicKey) {
  console.warn('[posthog-config] PUBLIC_POSTHOG_KEY is not set. Analytics will remain disabled.');
}

