const DEFAULT_HOST = 'https://app.posthog.com';

export function onRequest({ env }) {
  const key = (env.PUBLIC_POSTHOG_KEY || '').trim();
  const rawHost = (env.PUBLIC_POSTHOG_HOST || '').trim();
  const host = rawHost ? rawHost.replace(/\/$/, '') : DEFAULT_HOST;
  const rawUiHost = (env.PUBLIC_POSTHOG_UI_HOST || '').trim();
  const uiHost = rawUiHost ? rawUiHost.replace(/\/$/, '') : host;
  const environment = (env.PUBLIC_RUNTIME_ENV || '').trim() || 'production';
  const commitSha = (env.PUBLIC_COMMIT_SHA || env.CF_PAGES_COMMIT_SHA || '').trim();

  const body = `window.__POSTHOG__ = Object.freeze({
  key: ${JSON.stringify(key)},
  host: ${JSON.stringify(host)},
  uiHost: ${JSON.stringify(uiHost)},
  environment: ${JSON.stringify(environment)},
  commitSha: ${JSON.stringify(commitSha)}
});\n`;

  return new Response(body, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'x-content-type-options': 'nosniff'
    }
  });
}
