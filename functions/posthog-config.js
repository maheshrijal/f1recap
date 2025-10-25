const DEFAULT_HOST = 'https://app.posthog.com';

export function onRequest({ env }) {
  const key = (env.PUBLIC_POSTHOG_KEY || '').trim();
  const rawHost = (env.PUBLIC_POSTHOG_HOST || '').trim();
  const host = rawHost ? rawHost.replace(/\/$/, '') : DEFAULT_HOST;

  const body = `window.__POSTHOG__ = Object.freeze({
  key: ${JSON.stringify(key)},
  host: ${JSON.stringify(host)}
});\n`;

  return new Response(body, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'x-content-type-options': 'nosniff'
    }
  });
}
