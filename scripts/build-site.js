const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public');
const output = path.join(root, 'dist');
const client = path.join(output, 'client');
const server = path.join(output, 'server');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(server, { recursive: true });
fs.cpSync(source, client, { recursive: true });

const worker = `export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
`;

fs.writeFileSync(path.join(server, 'index.js'), worker);
console.log(`Prepared static site: ${client}`);
