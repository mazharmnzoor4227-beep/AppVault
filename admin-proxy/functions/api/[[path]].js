const PUBLIC_ORIGIN = 'https://appvault-a4j.pages.dev';

export async function onRequest({ request }) {
  const incoming = new URL(request.url);

  if (!incoming.pathname.startsWith('/api/')) {
    return new Response('Not found', { status: 404 });
  }

  // Check the browser's origin before rewriting it for the upstream API.
  const origin = request.headers.get('origin');
  if ((origin && origin !== incoming.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return new Response('Origin check failed', { status: 403 });
  }

  const target = new URL(incoming.pathname + incoming.search, PUBLIC_ORIGIN);
  const headers = new Headers(request.headers);

  // The public API keeps same-origin protection on admin mutations. This
  // private admin gateway intentionally rewrites Origin before forwarding.
  headers.set('origin', PUBLIC_ORIGIN);
  headers.set('referer', PUBLIC_ORIGIN + '/');
  headers.delete('host');
  headers.delete('cf-connecting-ip');

  const init = {
    method: request.method,
    headers,
    redirect: 'manual'
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  const upstream = await fetch(new Request(target.toString(), init));
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set('cache-control', 'no-store');
  responseHeaders.set('x-content-type-options', 'nosniff');
  responseHeaders.set('x-frame-options', 'DENY');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  });
}
