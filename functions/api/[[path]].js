const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const SESSION_COOKIE = 'appvault_session';
const SESSION_TTL = 60 * 60 * 12;

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cacheable = request.method === 'GET' && !request.headers.has('cookie') && !request.headers.has('range') && /^\/api\/(categories|apps(?:\/[^/]+)?|media\/(?:icons|screenshots)\/[^/]+)$/.test(url.pathname);
  const cache = globalThis.caches?.default;
  const key = new Request(url.toString());
  if (cacheable && cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const result = await route(context);
  const response = new Response(result.body, result);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('referrer-policy', 'same-origin');
  if (cacheable && response.ok && !response.headers.get('cache-control')?.includes('private')) {
    // Short bounded staleness after publish/unpublish; never cache admin data.
    response.headers.set('cache-control', 'public, max-age=0, s-maxage=30');
    if (cache) context.waitUntil(cache.put(key, response.clone()));
  }
  return response;
}

async function route(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const method = request.method.toUpperCase();

  try {
    const bytes = Number(request.headers.get('content-length') || 0);
    const limit = path === 'admin/uploads/part' ? 25 * 1024 * 1024 : path === 'admin/apps' ? 48 * 1024 * 1024 : 32 * 1024;
    if (bytes > limit) return json({ error: 'Request is too large.' }, 413);
    if (method === 'OPTIONS') return new Response(null, { status: 204 });

    // Public API
    if (method === 'GET' && path === 'categories') return await getCategories(env);
    if (method === 'GET' && path === 'apps') return await getApps(env, url);
    if (method === 'GET' && path.startsWith('apps/')) return await getApp(env, decodeURIComponent(path.slice(5)));
    if (['GET', 'HEAD'].includes(method) && path.startsWith('download/')) return await downloadApp(env, request, decodeURIComponent(path.slice(9)), context);
    if (['GET', 'HEAD'].includes(method) && path.startsWith('media/')) return await serveMedia(env, request, decodeKey(path.slice(6)));
    if (method === 'POST' && path === 'contact') return await createContact(env, request);

    // Admin auth routes
    if (method === 'POST' && path === 'admin/login') return await adminLogin(env, request);
    if (method === 'POST' && path === 'admin/logout') return sameOrigin(request) ? adminLogout() : json({ error: 'Origin check failed.' }, 403);
    if (method === 'GET' && path === 'admin/me') return await adminMe(env, request);

    if (path.startsWith('admin/')) {
      const auth = await requireAdmin(env, request);
      if (auth instanceof Response) return auth;
      if (!sameOrigin(request)) return json({ error: 'Origin check failed.' }, 403);

      if (method === 'GET' && path === 'admin/stats') return await adminStats(env);
      if (method === 'GET' && path === 'admin/apps') return await adminApps(env);
      if (method === 'POST' && path === 'admin/apps') return await createApp(env, request);
      if ((method === 'PATCH' || method === 'DELETE') && /^admin\/apps\/\d+$/.test(path)) {
        const id = Number(path.split('/').pop());
        return await (method === 'PATCH' ? updateApp(env, request, id) : deleteApp(env, id));
      }
      if (method === 'POST' && path === 'admin/categories') return await createCategory(env, request);
      if (method === 'GET' && path === 'admin/messages') return await adminMessages(env);
      if (method === 'DELETE' && /^admin\/messages\/\d+$/.test(path)) {
        await needDb(env).prepare('DELETE FROM contact_messages WHERE id = ?').bind(Number(path.split('/').pop())).run();
        return json({ ok: true });
      }
      if (method === 'POST' && path === 'admin/uploads/start') return await startMultipart(env, request);
      if (method === 'PUT' && path === 'admin/uploads/part') return await uploadPart(env, request, url);
      if (method === 'POST' && path === 'admin/uploads/complete') return await completeMultipart(env, request);
      if (method === 'POST' && path === 'admin/uploads/abort') return await abortMultipart(env, request);
    }

    return json({ error: 'Not found.' }, 404);
  } catch (error) {
    console.error('AppVault API request failed', error?.name || 'Error');
    const message = String(error?.message || error || 'Unexpected server error');
    if (error instanceof URIError || error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400);
    if (/Images must|Use PNG|Image content/.test(message)) return json({ error: message }, 400);
    if (/no such table|D1_ERROR|binding/i.test(message)) {
      return json({ error: 'Service temporarily unavailable. Please try again shortly.' }, 503);
    }
    return json({ error: 'Unexpected server error.' }, 500);
  }
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function needDb(env) {
  if (!env.DB) throw new Error('DB binding missing');
  return env.DB;
}

function needBucket(env) {
  if (!env.APPS_BUCKET) throw new Error('APPS_BUCKET binding missing');
  return env.APPS_BUCKET;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function validSlug(input = '') {
  return String(input).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}

function mediaUrl(key) {
  if (!key) return null;
  return '/api/media/' + String(key).split('/').map(encodeURIComponent).join('/');
}

function decodeKey(value) {
  return String(value).split('/').map(part => decodeURIComponent(part)).join('/');
}

function appRow(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    developer: row.developer,
    package_name: row.package_name,
    version: row.version,
    android_version: row.android_version,
    short_description: row.short_description,
    description: row.description,
    changelog: row.changelog,
    category_id: row.category_id,
    category_name: row.category_name,
    category_slug: row.category_slug,
    file_size: Number(row.file_size || 0),
    featured: Boolean(row.featured),
    status: row.status,
    downloads_count: Number(row.downloads_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
    icon_url: mediaUrl(row.icon_key)
  };
}

async function getCategories(env) {
  const db = needDb(env);
  const result = await db.prepare(`
    SELECT c.id, c.name, c.slug, c.description, c.icon, c.created_at,
           COUNT(CASE WHEN a.status = 'published' THEN 1 END) AS app_count
    FROM categories c
    LEFT JOIN apps a ON a.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE ASC
  `).all();
  return json({ categories: (result.results || []).map(x => ({ ...x, app_count: Number(x.app_count || 0) })) });
}

async function getApps(env, url) {
  const db = needDb(env);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 120);
  const category = (url.searchParams.get('category') || '').trim().slice(0, 90);
  const featured = url.searchParams.get('featured');
  const sort = url.searchParams.get('sort') || 'latest';
  const limit = clampInt(url.searchParams.get('limit'), 1, 60, 24);
  const offset = clampInt(url.searchParams.get('offset'), 0, 100000, 0);

  const where = [`a.status = 'published'`];
  const params = [];
  if (q) {
    where.push(`(a.name LIKE ? COLLATE NOCASE OR a.developer LIKE ? COLLATE NOCASE OR a.short_description LIKE ? COLLATE NOCASE)`);
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (category) { where.push(`c.slug = ?`); params.push(category); }
  if (featured === '1') { where.push(`a.featured = 1`); }

  const order = sort === 'popular' ? 'a.downloads_count DESC, a.created_at DESC'
    : sort === 'name' ? 'a.name COLLATE NOCASE ASC'
    : 'a.created_at DESC';

  const result = await db.prepare(`
    SELECT a.*, c.name AS category_name, c.slug AS category_slug
    FROM apps a
    LEFT JOIN categories c ON c.id = a.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return json({ apps: (result.results || []).map(appRow), limit, offset });
}

async function getApp(env, slug) {
  const db = needDb(env);
  const row = await db.prepare(`
    SELECT a.*, c.name AS category_name, c.slug AS category_slug
    FROM apps a LEFT JOIN categories c ON c.id = a.category_id
    WHERE a.slug = ? AND a.status = 'published' LIMIT 1
  `).bind(slug).first();
  if (!row) return json({ error: 'App not found.' }, 404);

  const shots = await db.prepare(`SELECT object_key, sort_order FROM screenshots WHERE app_id = ? ORDER BY sort_order ASC, id ASC`).bind(row.id).all();
  const app = appRow(row);
  app.screenshots = (shots.results || []).map(x => ({ url: mediaUrl(x.object_key), sort_order: x.sort_order }));
  return json({ app });
}

async function createContact(env, request) {
  if (!sameOrigin(request)) return json({ error: 'Origin check failed.' }, 403);
  const limited = await rateLimit(env, request, 'contact', 5, 3600);
  if (limited) return limited;
  const db = needDb(env);
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim().slice(0, 80);
  const email = String(body.email || '').trim().slice(0, 160);
  const message = String(body.message || '').trim().slice(0, 3000);
  if (!name || !message || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid name, email and message.' }, 400);
  await db.prepare(`INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)`).bind(name, email, message).run();
  return json({ ok: true }, 201);
}

async function downloadApp(env, request, slug, context) {
  const db = needDb(env);
  const bucket = needBucket(env);
  const app = await db.prepare(`SELECT id, name, version, apk_key FROM apps WHERE slug = ? AND status = 'published' LIMIT 1`).bind(slug).first();
  if (!app) return json({ error: 'App not found.' }, 404);
  const safeName = `${String(app.name).replace(/[^a-z0-9._-]+/gi, '-')}-${String(app.version || 'latest').replace(/[^a-z0-9._-]+/gi, '-')}.apk`;
  const response = await serveR2(bucket, request, app.apk_key, {
    disposition: `attachment; filename="${safeName}"`,
    cache: 'private, max-age=0'
  });
  // Count download starts, not HEAD probes or resumed chunks. Do not delay the file.
  if (response.ok && request.method === 'GET' && !request.headers.has('range')) {
    context.waitUntil(db.prepare(`UPDATE apps SET downloads_count = downloads_count + 1 WHERE id = ?`).bind(app.id).run().catch(() => {}));
  }
  return response;
}

async function serveMedia(env, request, key) {
  if (!/^(icons|screenshots)\/[a-zA-Z0-9._-]+$/.test(key) || key.includes('..')) return json({ error: 'Invalid media key.' }, 400);
  // An APK or draft asset must not be exposed through an unprotected storage URL.
  const row = await needDb(env).prepare(`SELECT id FROM apps WHERE status = 'published' AND icon_key = ? UNION ALL SELECT s.app_id FROM screenshots s JOIN apps a ON a.id = s.app_id WHERE a.status = 'published' AND s.object_key = ? LIMIT 1`).bind(key, key).first();
  if (!row) {
    const auth = await requireAdmin(env, request);
    if (auth instanceof Response) return json({ error: 'File not found.' }, 404);
  }
  return serveR2(needBucket(env), request, key, { cache: row ? 'public, max-age=60' : 'private, no-store' });
}

async function serveR2(bucket, request, key, options = {}) {
  const head = await bucket.head(key);
  if (!head) return json({ error: 'File not found.' }, 404);
  const headers = new Headers();
  if (typeof head.writeHttpMetadata === 'function') head.writeHttpMetadata(headers);
  headers.set('etag', head.httpEtag || head.etag || '');
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', options.cache || 'public, max-age=3600');
  if (options.disposition) headers.set('content-disposition', options.disposition);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', "default-src 'none'; sandbox");
  if (request.headers.get('if-none-match') === headers.get('etag')) return new Response(null, { status: 304, headers });
  if (request.method === 'HEAD') {
    headers.set('content-length', String(head.size));
    return new Response(null, { headers });
  }

  const ifRange = request.headers.get('if-range');
  const rangeHeader = !ifRange || ifRange === headers.get('etag') ? request.headers.get('range') : null;
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (match) {
      let start, end;
      if (match[1] === '' && match[2] !== '') {
        const suffix = Math.min(Number(match[2]), head.size);
        start = head.size - suffix;
        end = head.size - 1;
      } else {
        start = Number(match[1]);
        end = match[2] === '' ? head.size - 1 : Math.min(Number(match[2]), head.size - 1);
      }
      if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && start <= end && start < head.size) {
        const length = end - start + 1;
        const obj = await bucket.get(key, { range: { offset: start, length } });
        if (!obj) return json({ error: 'File not found.' }, 404);
        headers.set('content-range', `bytes ${start}-${end}/${head.size}`);
        headers.set('content-length', String(length));
        return new Response(obj.body, { status: 206, headers });
      }
    }
    headers.set('content-range', `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }

  const obj = await bucket.get(key);
  if (!obj) return json({ error: 'File not found.' }, 404);
  headers.set('content-length', String(head.size));
  return new Response(obj.body, { status: 200, headers });
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return request.headers.get('sec-fetch-site') !== 'cross-site' && (!origin || origin === new URL(request.url).origin);
}

async function rateLimit(env, request, scope, limit, seconds) {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / seconds);
  const address = request.headers.get('cf-connecting-ip') || 'unknown';
  const digest = bytesToB64Url(await sha256(`${env.SESSION_SECRET || 'appvault'}:${scope}:${window}:${address}`));
  const row = await needDb(env).prepare(`INSERT INTO request_limits (key, count, expires) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`).bind(digest, (window + 1) * seconds).first();
  await needDb(env).prepare('DELETE FROM request_limits WHERE expires < ?').bind(now - 86400).run();
  return row.count > limit ? json({ error: 'Too many attempts. Please try again later.' }, 429, { 'retry-after': String((window + 1) * seconds - now) }) : null;
}

function parseCookies(request) {
  const raw = request.headers.get('cookie') || '';
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return i < 0 ? [v, ''] : [v.slice(0, i), v.slice(i + 1)];
  }));
}

function bytesToB64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64UrlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const raw = atob(s);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return new Uint8Array(sig);
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function createSession(email, secret) {
  const payload = new TextEncoder().encode(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL }));
  const encoded = bytesToB64Url(payload);
  const signature = bytesToB64Url(await hmac(encoded, secret));
  return `${encoded}.${signature}`;
}

async function verifySession(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = await hmac(parts[0], secret);
  let actual;
  try { actual = b64UrlToBytes(parts[1]); } catch { return null; }
  if (!equalBytes(expected, actual)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64UrlToBytes(parts[0])));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

async function requireAdmin(env, request) {
  if (!env.SESSION_SECRET || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return json({ error: 'Admin secrets are not configured in Cloudflare yet.' }, 503);
  const token = parseCookies(request)[SESSION_COOKIE];
  const payload = await verifySession(token, env.SESSION_SECRET);
  if (!payload || String(payload.email).toLowerCase() !== String(env.ADMIN_EMAIL).toLowerCase()) return json({ error: 'Unauthorized.' }, 401);
  return payload;
}

async function adminLogin(env, request) {
  if (!sameOrigin(request)) return json({ error: 'Origin check failed.' }, 403);
  if (!env.SESSION_SECRET || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return json({ error: 'Set ADMIN_EMAIL, ADMIN_PASSWORD and SESSION_SECRET in Cloudflare first.' }, 503);
  const limited = await rateLimit(env, request, 'login', 20, 900);
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const emailOk = equalBytes(await sha256(email), await sha256(String(env.ADMIN_EMAIL).trim().toLowerCase()));
  const passOk = equalBytes(await sha256(password), await sha256(String(env.ADMIN_PASSWORD)));
  if (!emailOk || !passOk) return json({ error: 'Invalid email or password.' }, 401);
  const token = await createSession(email, env.SESSION_SECRET);
  return json({ ok: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}` });
}

function adminLogout() {
  return json({ ok: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
}

async function adminMe(env, request) {
  const auth = await requireAdmin(env, request);
  if (auth instanceof Response) return auth;
  return json({ email: auth.email });
}

async function adminStats(env) {
  const db = needDb(env);
  const [apps, downloads, categories, messages] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM apps`).first(),
    db.prepare(`SELECT COALESCE(SUM(downloads_count), 0) AS n FROM apps`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM categories`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM contact_messages`).first()
  ]);
  return json({ apps: Number(apps?.n || 0), downloads: Number(downloads?.n || 0), categories: Number(categories?.n || 0), messages: Number(messages?.n || 0) });
}

async function adminApps(env) {
  const db = needDb(env);
  const result = await db.prepare(`
    SELECT a.*, c.name AS category_name, c.slug AS category_slug
    FROM apps a LEFT JOIN categories c ON c.id = a.category_id
    ORDER BY a.created_at DESC
  `).all();
  return json({ apps: (result.results || []).map(appRow) });
}

async function adminMessages(env) {
  const db = needDb(env);
  const result = await db.prepare(`SELECT id, name, email, message, status, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 250`).all();
  return json({ messages: result.results || [] });
}

async function createCategory(env, request) {
  const db = needDb(env);
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim().slice(0, 80);
  const slug = validSlug(body.slug || name);
  const description = String(body.description || '').trim().slice(0, 260);
  const icon = String(body.icon || 'grid').trim().slice(0, 30);
  if (!name || !slug) return json({ error: 'Category name is required.' }, 400);
  try {
    const result = await db.prepare(`INSERT INTO categories (name, slug, description, icon) VALUES (?, ?, ?, ?)`).bind(name, slug, description, icon).run();
    return json({ ok: true, id: result.meta?.last_row_id }, 201);
  } catch (e) {
    if (/unique/i.test(String(e))) return json({ error: 'That category slug already exists.' }, 409);
    throw e;
  }
}

function extensionOf(name = '') {
  const m = String(name).toLowerCase().match(/\.[a-z0-9]{1,8}$/);
  return m ? m[0] : '';
}

function isFile(value) {
  return value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && typeof value.stream === 'function';
}

async function saveImage(bucket, file, prefix) {
  if (!isFile(file) || !file.size) return null;
  if (file.size > 10 * 1024 * 1024) throw new Error('Images must be 10 MB or smaller.');
  const types = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
  if (!types[file.type]) throw new Error('Use PNG, JPEG or WebP images.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const valid = file.type === 'image/png' ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
    : file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
  if (!valid) throw new Error('Image content does not match its file type.');
  const ext = types[file.type];
  const key = `${prefix}/${Date.now()}-${crypto.randomUUID()}${ext}`;
  await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  return key;
}

async function createApp(env, request) {
  const db = needDb(env);
  const bucket = needBucket(env);
  const form = await request.formData();
  const name = String(form.get('name') || '').trim().slice(0, 100);
  const slug = validSlug(form.get('slug') || name);
  const developer = String(form.get('developer') || '').trim().slice(0, 100);
  const packageName = String(form.get('package_name') || '').trim().slice(0, 180);
  const version = String(form.get('version') || '').trim().slice(0, 50);
  const androidVersion = String(form.get('android_version') || '').trim().slice(0, 60);
  const shortDescription = String(form.get('short_description') || '').trim().slice(0, 180);
  const description = String(form.get('description') || '').trim().slice(0, 10000);
  const changelog = String(form.get('changelog') || '').trim().slice(0, 5000);
  const categoryId = Number(form.get('category_id')) || null;
  const apkKey = String(form.get('apk_key') || '').trim();
  const fileSize = Math.max(0, Number(form.get('file_size')) || 0);
  const featured = String(form.get('featured')) === '1' ? 1 : 0;
  const status = String(form.get('status')) === 'draft' ? 'draft' : 'published';

  if (!name || !slug || !version || !shortDescription || !description || !apkKey || !apkKey.startsWith('apks/')) return json({ error: 'Missing required app fields.' }, 400);
  const apk = await bucket.head(apkKey);
  if (!apk) return json({ error: 'Uploaded APK could not be found in R2.' }, 400);

  const stagedKeys = [];
  try {
    const iconKey = await saveImage(bucket, form.get('icon'), 'icons');
    if (iconKey) stagedKeys.push(iconKey);
    const screenshots = form.getAll('screenshots').filter(x => isFile(x) && x.size).slice(0, 12);
    const shotKeys = [];
    for (const file of screenshots) {
      const key = await saveImage(bucket, file, 'screenshots');
      shotKeys.push(key); stagedKeys.push(key);
    }
    const inserted = await db.prepare(`
      INSERT INTO apps (name, slug, developer, package_name, version, android_version, short_description, description, changelog, category_id, apk_key, icon_key, file_size, featured, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(name, slug, developer, packageName, version, androidVersion, shortDescription, description, changelog, categoryId, apkKey, iconKey, apk.size, featured, status).run();
    const appId = Number(inserted.meta?.last_row_id);
    const statements = [];
    for (let i = 0; i < shotKeys.length; i++) {
      const key = shotKeys[i];
      statements.push(db.prepare(`INSERT INTO screenshots (app_id, object_key, sort_order) VALUES (?, ?, ?)`).bind(appId, key, i));
    }
    if (statements.length) await db.batch(statements);
    return json({ ok: true, app: { id: appId, name, slug } }, 201);
  } catch (e) {
    // Only remove staged images if no listing references them.
    for (const key of stagedKeys) {
      const referenced = await db.prepare('SELECT id FROM apps WHERE icon_key = ? UNION ALL SELECT id FROM screenshots WHERE object_key = ? LIMIT 1').bind(key,key).first();
      if (!referenced) await bucket.delete(key);
    }
    if (/unique/i.test(String(e))) return json({ error: 'That app slug already exists.' }, 409);
    throw e;
  }
}

async function updateApp(env, request, id) {
  const db = needDb(env);
  const existing = await db.prepare(`SELECT * FROM apps WHERE id = ?`).bind(id).first();
  if (!existing) return json({ error: 'App not found.' }, 404);
  const body = await request.json().catch(() => ({}));
  const allowed = {
    name: v => String(v).trim().slice(0, 100),
    slug: v => validSlug(v),
    developer: v => String(v).trim().slice(0, 100),
    package_name: v => String(v).trim().slice(0, 180),
    version: v => String(v).trim().slice(0, 50),
    android_version: v => String(v).trim().slice(0, 60),
    short_description: v => String(v).trim().slice(0, 180),
    description: v => String(v).trim().slice(0, 10000),
    changelog: v => String(v).trim().slice(0, 5000),
    category_id: v => Number(v) || null,
    featured: v => Number(v) ? 1 : 0,
    status: v => String(v) === 'draft' ? 'draft' : 'published'
  };
  const sets = [], values = [];
  if (body.apk_key !== undefined) {
    if (!/^apks\/[a-zA-Z0-9._-]+\.apk$/.test(String(body.apk_key))) return json({ error: 'Invalid APK key.' }, 400);
    const apk = await needBucket(env).head(body.apk_key);
    if (!apk) return json({ error: 'Uploaded APK was not found.' }, 400);
    sets.push('apk_key = ?', 'file_size = ?'); values.push(body.apk_key, apk.size);
  }
  for (const [key, transform] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(body, key)) { sets.push(`${key} = ?`); values.push(transform(body[key])); }
  }
  if (!sets.length) return json({ ok: true });
  sets.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);
  try {
    await db.prepare(`UPDATE apps SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
    return json({ ok: true });
  } catch (e) {
    if (/unique/i.test(String(e))) return json({ error: 'That app slug already exists.' }, 409);
    throw e;
  }
}

async function deleteApp(env, id) {
  const db = needDb(env);
  const bucket = needBucket(env);
  const app = await db.prepare(`SELECT apk_key, icon_key FROM apps WHERE id = ?`).bind(id).first();
  if (!app) return json({ error: 'App not found.' }, 404);
  const shots = await db.prepare(`SELECT object_key FROM screenshots WHERE app_id = ?`).bind(id).all();
  const keys = [app.apk_key, app.icon_key, ...(shots.results || []).map(x => x.object_key)].filter(Boolean);
  if (keys.length) await bucket.delete(keys);
  await db.prepare(`DELETE FROM apps WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

async function startMultipart(env, request) {
  const bucket = needBucket(env);
  const body = await request.json().catch(() => ({}));
  const filename = String(body.filename || 'app.apk').slice(0, 160);
  const size = Number(body.size || 0);
  if (!filename.toLowerCase().endsWith('.apk') || !Number.isSafeInteger(size) || size <= 0 || size > 1024 * 1024 * 1024) return json({ error: 'Choose an APK no larger than 1 GB.' }, 400);
  const key = `apks/${Date.now()}-${crypto.randomUUID()}.apk`;
  const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: 'application/vnd.android.package-archive' }, customMetadata: { originalName: filename } });
  return json({ key, uploadId: upload.uploadId }, 201);
}

async function uploadPart(env, request, url) {
  const bucket = needBucket(env);
  const key = url.searchParams.get('key') || '';
  const uploadId = url.searchParams.get('uploadId') || '';
  const partNumber = Number(url.searchParams.get('partNumber'));
  if (!key.startsWith('apks/') || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000 || !request.body) return json({ error: 'Invalid upload part.' }, 400);
  const upload = bucket.resumeMultipartUpload(key, uploadId);
  const part = await upload.uploadPart(partNumber, request.body);
  return json({ partNumber: part.partNumber, etag: part.etag });
}

async function completeMultipart(env, request) {
  const bucket = needBucket(env);
  const body = await request.json().catch(() => ({}));
  const key = String(body.key || '');
  const uploadId = String(body.uploadId || '');
  const parts = Array.isArray(body.parts) ? body.parts.map(p => ({ partNumber: Number(p.partNumber), etag: String(p.etag || '') })).filter(p => p.partNumber > 0 && p.etag) : [];
  if (!key.startsWith('apks/') || !uploadId || !parts.length) return json({ error: 'Invalid multipart completion request.' }, 400);
  parts.sort((a, b) => a.partNumber - b.partNumber);
  const upload = bucket.resumeMultipartUpload(key, uploadId);
  await upload.complete(parts);
  return json({ ok: true, key });
}

async function abortMultipart(env, request) {
  const bucket = needBucket(env);
  const body = await request.json().catch(() => ({}));
  const key = String(body.key || ''), uploadId = String(body.uploadId || '');
  if (!key.startsWith('apks/') || !uploadId) return json({ error: 'Invalid upload.' }, 400);
  await bucket.resumeMultipartUpload(key, uploadId).abort();
  return json({ ok: true });
}
