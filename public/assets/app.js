const AppVault = (() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const state = { categories: [], apps: [] };

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function fmtBytes(bytes = 0) {
    const n = Number(bytes || 0);
    if (!n) return '—';
    const units = ['B','KB','MB','GB'];
    let value = n, i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
  }

  function fmtNumber(n = 0) {
    return new Intl.NumberFormat(undefined, { notation: Number(n) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(Number(n || 0));
  }

  function slugify(s = '') {
    return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
  }

  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    const type = response.headers.get('content-type') || '';
    const body = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = typeof body === 'object' && body?.error ? body.error : `Request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  function header() {
    const host = $('#site-header');
    if (!host) return;
    const page = document.body.dataset.page || '';
    const links = [
      ['home','/','Home'],
      ['apps','/apps.html','Apps'],
      ['categories','/categories.html','Categories'],
      ['about','/about.html','About'],
      ['contact','/contact.html','Contact']
    ];
    host.innerHTML = `
      <header class="site-header">
        <div class="container nav">
          <a class="brand" href="/" aria-label="AppVault home"><span class="brand-mark"></span><span>AppVault</span></a>
          <nav class="nav-links" aria-label="Primary">
            ${links.map(([key,href,label]) => `<a class="${page === key ? 'active' : ''}" href="${href}">${label}</a>`).join('')}
          </nav>
          <div class="nav-actions"><a class="btn btn-secondary" href="/apps.html">Browse apps</a></div>
          <button class="menu-btn" id="menu-btn" aria-label="Open menu" aria-expanded="false">☰</button>
        </div>
        <div class="container mobile-menu" id="mobile-menu">
          ${links.map(([key,href,label]) => `<a class="${page === key ? 'active' : ''}" href="${href}">${label}</a>`).join('')}
        </div>
      </header>`;
    $('#menu-btn')?.addEventListener('click', e => {
      const menu = $('#mobile-menu');
      const open = menu.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', String(open));
      e.currentTarget.textContent = open ? '✕' : '☰';
    });
  }

  function footer() {
    const host = $('#site-footer');
    if (!host) return;
    host.innerHTML = `
      <footer class="site-footer">
        <div class="container footer-grid">
          <div class="footer-brand">
            <a class="brand" href="/"><span class="brand-mark"></span><span>AppVault</span></a>
            <p>A clean home for useful Android apps. Every listing is built around clear details, safe navigation and a direct download experience.</p>
          </div>
          <div class="footer-col"><h4>Explore</h4><a href="/apps.html">All apps</a><a href="/categories.html">Categories</a><a href="/apps.html?sort=latest">Latest</a></div>
          <div class="footer-col"><h4>Company</h4><a href="/about.html">About</a><a href="/contact.html">Contact</a></div>
          <div class="footer-col"><h4>Legal</h4><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div>
        </div>
        <div class="container footer-bottom"><span>© ${new Date().getFullYear()} AppVault.</span><span>Built for fast, direct app discovery.</span></div>
      </footer>`;
  }

  function initReveal() {
    const items = $$('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) return items.forEach(el => el.classList.add('in'));
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
    }), { threshold: .12 });
    items.forEach(el => io.observe(el));
  }

  function initTilt(root = document) {
    return; // Keep cards still; no pointer-driven transforms or listeners.
    if (matchMedia('(pointer: coarse)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    $$('.tilt', root).forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', `${x * 100}%`);
        card.style.setProperty('--my', `${y * 100}%`);
        card.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 5}deg) rotateY(${(x - 0.5) * 6}deg) translateY(-3px)`;
      });
      card.addEventListener('pointerleave', () => card.style.transform = '');
    });
  }

  function iconMarkup(app, className = 'app-icon') {
    if (app.icon_url) return `<img class="${className}" src="${escapeHtml(app.icon_url)}" alt="${escapeHtml(app.name)} icon" loading="lazy">`;
    return `<div class="${className} fallback">${escapeHtml((app.name || 'A').slice(0,1).toUpperCase())}</div>`;
  }

  function appCard(app) {
    return `<a class="app-card" href="/app.html?slug=${encodeURIComponent(app.slug)}">
      ${iconMarkup(app)}
      <h3>${escapeHtml(app.name)}</h3>
      <p>${escapeHtml(app.short_description || 'View app details, version information and download options.')}</p>
      <div class="app-card-meta"><span>${escapeHtml(app.category_name || 'App')}</span><span>${fmtNumber(app.downloads_count)} downloads</span></div>
    </a>`;
  }

  function categoryIcon(icon = 'grid') {
    const map = { tool:'⚙', users:'◉', image:'▧', play:'▶', gamepad:'✦', book:'▤', briefcase:'▣', sparkles:'✧', grid:'◆' };
    return map[icon] || map.grid;
  }

  function categoryCard(cat) {
    return `<a class="category-card" href="/apps.html?category=${encodeURIComponent(cat.slug)}">
      <div class="cat-icon">${categoryIcon(cat.icon)}</div>
      <h3>${escapeHtml(cat.name)}</h3>
      <p>${escapeHtml(cat.description || 'Explore apps in this category.')}</p>
      <small>${fmtNumber(cat.app_count)} ${Number(cat.app_count) === 1 ? 'app' : 'apps'}</small>
    </a>`;
  }

  function loadingGrid(count = 4) { return Array.from({length: count}, () => '<div class="skeleton"></div>').join(''); }
  function empty(title, text) { return `<div class="empty-state"><b>${escapeHtml(title)}</b>${escapeHtml(text)}</div>`; }

  async function loadCategories() {
    if (state.categories.length) return state.categories;
    const data = await request('/api/categories');
    state.categories = data.categories || [];
    return state.categories;
  }

  async function initHome() {
    const featured = $('#featured-apps');
    const latest = $('#latest-apps');
    const cats = $('#home-categories');
    if (featured) featured.innerHTML = loadingGrid(4);
    if (latest) latest.innerHTML = loadingGrid(4);
    try {
      const [featuredData, latestData, categories] = await Promise.all([
        request('/api/apps?featured=1&limit=4'),
        request('/api/apps?sort=latest&limit=4'),
        loadCategories()
      ]);
      if (featured) featured.innerHTML = featuredData.apps?.length ? featuredData.apps.map(appCard).join('') : empty('More to discover soon', 'Explore the latest additions to the app library.');
      if (latest) latest.innerHTML = latestData.apps?.length ? latestData.apps.map(appCard).join('') : empty('No apps published yet', 'Your newest published apps will appear here automatically.');
      if (cats) cats.innerHTML = categories.slice(0,8).map(categoryCard).join('');
      initTilt(featured || document); initTilt(latest || document); initReveal();
    } catch (err) {
      if (featured) featured.innerHTML = empty('Temporarily unavailable', 'Please refresh the page in a moment.');
      if (latest) latest.innerHTML = empty('Could not load apps', 'Please try again shortly.');
      if (cats) cats.innerHTML = '';
    }
  }

  async function initApps() {
    const grid = $('#apps-grid');
    const search = $('#app-search');
    const category = $('#category-filter');
    const sort = $('#sort-filter');
    if (!grid) return;
    grid.innerHTML = loadingGrid(8);
    try {
      const categories = await loadCategories();
      category.innerHTML = `<option value="">All categories</option>${categories.map(c => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('')}`;
      const params = new URLSearchParams(location.search);
      search.value = params.get('q') || '';
      category.value = params.get('category') || '';
      sort.value = params.get('sort') || 'latest';
      let timer, generation = 0, offset = 0;
      const more = document.createElement('button');
      more.className = 'btn btn-secondary load-more hidden'; more.textContent = 'Load more';
      grid.after(more);
      const load = async (append = false) => {
        const current = ++generation;
        if (!append) { offset = 0; grid.innerHTML = loadingGrid(8); }
        more.disabled = true;
        const qs = new URLSearchParams({ q: search.value.trim(), category: category.value, sort: sort.value, limit: '24', offset: String(offset) });
        const displayQs = new URLSearchParams({q:search.value.trim(),category:category.value,sort:sort.value});
        history.replaceState({}, '', `${location.pathname}?${displayQs}`);
        const selected = categories.find(c => c.slug === category.value);
        const heading = $('.page-hero h1'); if (heading) heading.textContent = selected?.name || 'All apps';
        try {
          const data = await request(`/api/apps?${qs}`);
          if (current !== generation) return;
          const html = data.apps?.length ? data.apps.map(appCard).join('') : '';
          if (append) grid.insertAdjacentHTML('beforeend', html);
          else grid.innerHTML = html || empty('Nothing here yet', 'Try another search or explore a different category.');
          offset += data.apps?.length || 0;
          more.classList.toggle('hidden', (data.apps?.length || 0) < 24);
          initTilt(grid);
        } catch (e) { if (current === generation) { if (append) toast(e.message, true); else grid.innerHTML = empty('Could not load apps', e.message); } }
        finally { if (current === generation) more.disabled = false; }
      };
      more.addEventListener('click', () => load(true));
      search.addEventListener('input', () => { clearTimeout(timer); ++generation; timer = setTimeout(() => load(), 260); });
      category.addEventListener('change', () => load()); sort.addEventListener('change', () => load());
      await load();
    } catch (e) { grid.innerHTML = empty('Could not load apps', e.message); }
  }

  async function initCategories() {
    const grid = $('#categories-grid');
    if (!grid) return;
    grid.innerHTML = loadingGrid(8);
    try {
      const categories = await loadCategories();
      grid.innerHTML = categories.length ? categories.map(categoryCard).join('') : empty('No categories yet', 'Create the first category in the admin dashboard.');
      initReveal();
    } catch (e) { grid.innerHTML = empty('Could not load categories', e.message); }
  }

  function pathTail(prefix) {
    const p = decodeURIComponent(location.pathname.replace(/\/+$/, ''));
    const i = p.indexOf(prefix);
    return i >= 0 ? p.slice(i + prefix.length).split('/')[0] : '';
  }

  async function initCategory() {
    const slug = pathTail('/category/');
    const title = $('#category-title');
    const desc = $('#category-description');
    const grid = $('#category-apps');
    if (!slug || !grid) return;
    grid.innerHTML = loadingGrid(8);
    try {
      const categories = await loadCategories();
      const cat = categories.find(c => c.slug === slug);
      if (title) title.textContent = cat?.name || 'Category';
      if (desc) desc.textContent = cat?.description || 'Browse apps in this category.';
      document.title = `${cat?.name || 'Category'} — AppVault`;
      const data = await request(`/api/apps?category=${encodeURIComponent(slug)}&limit=60`);
      grid.innerHTML = data.apps?.length ? data.apps.map(appCard).join('') : empty('No apps here yet', 'Published apps in this category will appear here.');
      initTilt(grid);
    } catch (e) { grid.innerHTML = empty('Could not load category', e.message); }
  }

  async function initAppDetail() {
    const slug = pathTail('/app/');
    const host = $('#app-detail');
    if (!slug || !host) return;
    host.innerHTML = `<div class="detail-main"><div class="skeleton"></div><div class="skeleton" style="margin-top:18px"></div></div><div class="skeleton"></div>`;
    try {
      const data = await request(`/api/apps/${encodeURIComponent(slug)}`);
      const app = data.app;
      document.title = `${app.name} — AppVault`;
      const screenshots = (app.screenshots || []).map(s => `<img src="${escapeHtml(s.url)}" alt="${escapeHtml(app.name)} screenshot" loading="lazy">`).join('');
      host.innerHTML = `
        <div class="detail-main">
          <div class="detail-card app-heading">
            ${iconMarkup(app)}
            <div><span class="badge">${escapeHtml(app.category_name || 'App')}</span><h1>${escapeHtml(app.name)}</h1><p>${escapeHtml(app.short_description || '')}</p></div>
          </div>
          ${screenshots ? `<section class="content-block"><h2>Screenshots</h2><div class="screenshot-strip">${screenshots}</div></section>` : ''}
          <section class="content-block"><h2>About this app</h2><div class="prose">${escapeHtml(app.description || 'No description has been added yet.')}</div></section>
          ${app.changelog ? `<section class="content-block"><h2>What's new</h2><div class="prose">${escapeHtml(app.changelog)}</div></section>` : ''}
          <section class="content-block"><h2>More like this</h2><div class="apps-grid" id="related-apps">${loadingGrid(4)}</div></section>
        </div>
        <aside class="detail-side">
          <div class="detail-card download-card">
            <div class="meta-grid">
              <div class="meta-item"><small>Version</small><b>${escapeHtml(app.version || '—')}</b></div>
              <div class="meta-item"><small>Size</small><b>${fmtBytes(app.file_size)}</b></div>
              <div class="meta-item"><small>Android</small><b>${escapeHtml(app.android_version || '—')}</b></div>
              <div class="meta-item"><small>Downloads</small><b>${fmtNumber(app.downloads_count)}</b></div>
              <div class="meta-item"><small>Developer</small><b>${escapeHtml(app.developer || '—')}</b></div>
              <div class="meta-item"><small>Package</small><b>${escapeHtml(app.package_name || '—')}</b></div>
            </div>
            <div style="height:18px"></div>
            <a class="btn btn-primary" href="/api/download/${encodeURIComponent(app.slug)}">Download APK</a>
            <p class="download-note">The download starts directly from AppVault storage. Only install apps you trust and have the right to use.</p>
            <div class="ad-slot" data-ad-slot="app-download"></div>
          </div>
        </aside>`;
      const related = $('#related-apps');
      try {
        const more = await request(`/api/apps?category=${encodeURIComponent(app.category_slug || '')}&limit=5`);
        const filtered = (more.apps || []).filter(x => x.slug !== app.slug).slice(0,4);
        related.innerHTML = filtered.length ? filtered.map(appCard).join('') : empty('No related apps yet', 'More apps will appear as the catalog grows.');
        initTilt(related);
      } catch { related.innerHTML = ''; }
    } catch (e) { host.innerHTML = empty(e.status === 404 ? 'App not found' : 'Could not load app', e.message); }
  }

  async function initContact() {
    const form = $('#contact-form');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const button = $('button[type="submit"]', form);
      const status = $('#contact-status');
      button.disabled = true; button.textContent = 'Sending…';
      try {
        const payload = Object.fromEntries(new FormData(form));
        await request('/api/contact', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
        form.reset(); status.textContent = 'Message sent. Thank you.'; status.style.color = 'var(--success)';
      } catch (err) { status.textContent = err.message; status.style.color = 'var(--danger)'; }
      finally { button.disabled = false; button.textContent = 'Send message'; }
    });
  }

  function toast(message, error = false) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = message; el.className = `toast show${error ? ' error' : ''}`;
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 3300);
  }

  async function uploadApk(file, progress) {
    if (!file.name.toLowerCase().endsWith('.apk') || file.size > 1024 * 1024 * 1024) throw new Error('Choose an APK no larger than 1 GB.');
    const started = await request('/api/admin/uploads/start', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ filename:file.name, content_type:file.type || 'application/vnd.android.package-archive', size:file.size }) });
    const chunkSize = 20 * 1024 * 1024;
    const parts = [];
    const total = Math.ceil(file.size / chunkSize);
    try {
    for (let i = 0; i < total; i++) {
      const start = i * chunkSize, end = Math.min(file.size, start + chunkSize);
      const blob = file.slice(start, end);
      const result = await request(`/api/admin/uploads/part?key=${encodeURIComponent(started.key)}&uploadId=${encodeURIComponent(started.uploadId)}&partNumber=${i + 1}`, {
        method:'PUT', headers:{'content-type':'application/octet-stream'}, body:blob
      });
      parts.push({ partNumber:i + 1, etag:result.etag });
      progress?.(((i + 1) / total) * 100);
    }
    const complete = await request('/api/admin/uploads/complete', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ key:started.key, uploadId:started.uploadId, parts }) });
    return complete.key;
    } catch (error) {
      await request('/api/admin/uploads/abort', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({key:started.key,uploadId:started.uploadId}) }).catch(() => {});
      throw error;
    }
  }

  async function initAdmin() {
    const login = $('#admin-login');
    const shell = $('#admin-shell');
    if (!login || !shell) return;

    const showLogin = () => { login.classList.remove('hidden'); shell.classList.add('hidden'); state.apps = []; $('#admin-app-list').replaceChildren(); $('#message-list').replaceChildren(); $('#edit-dialog')?.close(); };
    const showShell = () => { login.classList.add('hidden'); shell.classList.remove('hidden'); };

    async function checkSession() {
      try { await request('/api/admin/me'); showShell(); await refreshDashboard(); }
      catch { showLogin(); }
    }

    $('#login-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const button = $('button[type="submit"]', e.currentTarget);
      button.disabled = true; button.textContent = 'Signing in…';
      try {
        const payload = Object.fromEntries(new FormData(e.currentTarget));
        await request('/api/admin/login', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
        e.target.reset(); showShell(); await refreshDashboard();
      } catch (err) { toast(err.message, true); }
      finally { button.disabled = false; button.textContent = 'Sign in'; }
    });

    $('#logout-btn')?.addEventListener('click', async () => {
      try { await request('/api/admin/logout', { method:'POST' }); } catch { toast('Sign out failed. Please try again.', true); return; }
      showLogin();
    });

    $$('.admin-nav button').forEach(btn => btn.addEventListener('click', () => {
      $$('.admin-nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('[data-admin-view]').forEach(v => v.classList.add('hidden'));
      $(`[data-admin-view="${btn.dataset.target}"]`)?.classList.remove('hidden');
    }));

    $('#category-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.currentTarget;
      const payload = Object.fromEntries(new FormData(form));
      payload.slug = slugify(payload.slug || payload.name);
      try {
        await request('/api/admin/categories', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
        form.reset(); toast('Category created'); await loadAdminCategories();
      } catch (err) { toast(err.message, true); }
    });

    $('#app-name')?.addEventListener('input', e => {
      const slug = $('#app-slug'); if (slug && !slug.dataset.touched) slug.value = slugify(e.target.value);
    });
    $('#app-slug')?.addEventListener('input', e => e.currentTarget.dataset.touched = '1');

    $('#app-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.currentTarget;
      const submit = $('button[type="submit"]', form);
      const apk = $('#app-apk')?.files?.[0];
      if (!apk) return toast('Choose an APK file first.', true);
      submit.disabled = true; submit.textContent = 'Uploading…';
      const wrap = $('#upload-progress-wrap'), bar = $('#upload-progress');
      wrap?.classList.remove('hidden'); if (bar) bar.style.width = '0%';
      try {
        const apkKey = await uploadApk(apk, pct => { if (bar) bar.style.width = `${pct}%`; });
        submit.textContent = 'Saving app…';
        const fd = new FormData(form);
        fd.delete('apk');
        fd.set('apk_key', apkKey);
        fd.set('file_size', String(apk.size));
        fd.set('slug', slugify(fd.get('slug') || fd.get('name')));
        fd.set('featured', fd.get('featured') ? '1' : '0');
        const result = await request('/api/admin/apps', { method:'POST', body:fd });
        form.reset(); $('#app-slug').dataset.touched = ''; if (bar) bar.style.width = '0%';
        toast(`${result.app.name} published`); await refreshDashboard();
      } catch (err) { toast(err.message, true); }
      finally { submit.disabled = false; submit.textContent = 'Publish app'; wrap?.classList.add('hidden'); }
    });

    $('#edit-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const id = e.currentTarget.dataset.id;
      const payload = Object.fromEntries(new FormData(e.currentTarget));
      payload.slug = slugify(payload.slug || payload.name);
      payload.featured = $('#edit-featured').checked ? 1 : 0;
      const button = $('button[type="submit"]', e.currentTarget);
      button.disabled = true;
      try {
        const replacement = $('#edit-apk')?.files?.[0];
        if (replacement) payload.apk_key = await uploadApk(replacement, pct => { button.textContent = `Uploading ${Math.round(pct)}%`; });
        await request(`/api/admin/apps/${id}`, { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
        $('#edit-dialog').close(); toast('App updated'); await refreshDashboard();
      } catch (err) { toast(err.message, true); }
      finally { button.disabled = false; button.textContent = 'Save changes'; }
    });
    $('#edit-close')?.addEventListener('click', () => $('#edit-dialog').close());

    async function loadAdminCategories() {
      const data = await request('/api/categories');
      const options = (data.categories || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
      $('#app-category').innerHTML = options;
      $('#edit-category').innerHTML = options;
      const table = $('#category-list');
      table.innerHTML = (data.categories || []).map(c => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.slug)}</td><td>${fmtNumber(c.app_count)}</td></tr>`).join('') || `<tr><td colspan="3">No categories.</td></tr>`;
      return data.categories || [];
    }

    async function loadAdminApps() {
      const data = await request('/api/admin/apps');
      state.apps = data.apps || [];
      const table = $('#admin-app-list');
      table.innerHTML = state.apps.map(app => `<tr>
        <td><div class="admin-app-identity">${iconMarkup(app)}<div><strong>${escapeHtml(app.name)}</strong><small>${escapeHtml(app.category_name || 'Uncategorized')}</small></div></div></td><td>${escapeHtml(app.version || '—')}</td><td><span class="status-pill ${app.status === 'draft' ? 'draft' : ''}">${escapeHtml(app.status)}</span></td><td>${fmtNumber(app.downloads_count)}</td>
        <td><div class="table-actions"><button class="btn btn-secondary btn-small" data-edit="${app.id}">Edit</button><button class="btn btn-secondary btn-small" data-toggle="${app.id}" data-status="${app.status}">${app.status === 'published' ? 'Unpublish' : 'Publish'}</button><button class="btn btn-danger btn-small" data-delete="${app.id}">Delete</button></div></td>
      </tr>`).join('') || `<tr><td colspan="5">No apps yet.</td></tr>`;
      $$('[data-edit]', table).forEach(btn => btn.addEventListener('click', () => openEdit(btn.dataset.edit)));
      $$('[data-toggle]', table).forEach(btn => btn.addEventListener('click', async () => {
        try { await request(`/api/admin/apps/${btn.dataset.toggle}`, { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({ status:btn.dataset.status === 'published' ? 'draft' : 'published' }) }); toast('Status updated'); await refreshDashboard(); }
        catch (e) { toast(e.message, true); }
      }));
      $$('[data-delete]', table).forEach(btn => btn.addEventListener('click', async () => {
        const app = state.apps.find(a => String(a.id) === String(btn.dataset.delete));
        if (!confirm(`Delete ${app?.name || 'this app'} and its stored files?`)) return;
        try { await request(`/api/admin/apps/${btn.dataset.delete}`, { method:'DELETE' }); toast('App deleted'); await refreshDashboard(); }
        catch (e) { toast(e.message, true); }
      }));
    }

    function openEdit(id) {
      const app = state.apps.find(a => String(a.id) === String(id));
      if (!app) return;
      const f = $('#edit-form'); f.dataset.id = app.id;
      if ($('#edit-apk')) $('#edit-apk').value = '';
      const set = (name,val) => { const el = f.elements[name]; if (el) el.value = val ?? ''; };
      ['name','slug','developer','package_name','version','android_version','short_description','description','changelog','status','category_id'].forEach(k => set(k, app[k]));
      $('#edit-featured').checked = Boolean(app.featured);
      $('#edit-dialog').showModal();
    }

    async function loadMessages() {
      const data = await request('/api/admin/messages');
      const table = $('#message-list');
      table.innerHTML = (data.messages || []).map(m => `<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.email)}</td><td style="max-width:380px;white-space:normal">${escapeHtml(m.message)}</td><td>${escapeHtml(m.created_at)}<button class="btn btn-secondary btn-small" data-delete-message="${m.id}" type="button">Delete message</button></td></tr>`).join('') || `<tr><td colspan="4">No messages.</td></tr>`;
    }

    $('#message-list')?.addEventListener('click', async event => {
      const button = event.target.closest('[data-delete-message]');
      if (!button || !confirm('Permanently delete this contact message?')) return;
      button.disabled = true;
      try { await request(`/api/admin/messages/${button.dataset.deleteMessage}`, {method:'DELETE'}); await refreshDashboard(); }
      catch (error) { toast(error.message, true); button.disabled = false; }
    });

    async function refreshDashboard() {
      try {
        const [stats] = await Promise.all([request('/api/admin/stats'), loadAdminCategories(), loadAdminApps(), loadMessages()]);
        $('#stat-apps').textContent = fmtNumber(stats.apps);
        $('#stat-downloads').textContent = fmtNumber(stats.downloads);
        $('#stat-categories').textContent = fmtNumber(stats.categories);
        $('#stat-messages').textContent = fmtNumber(stats.messages);
      } catch (err) {
        if (err.status === 401) return showLogin();
        toast(err.message, true);
      }
    }

    await checkSession();
  }

  async function boot() {
    header(); footer(); initReveal(); initTilt();
    const page = document.body.dataset.page;
    if (page === 'home') await initHome();
    if (page === 'apps') await initApps();
    if (page === 'categories') await initCategories();
    if (page === 'category') await initCategory();
    if (page === 'app') await initAppDetail();
    if (page === 'contact') await initContact();
    if (page === 'admin') await initAdmin();
  }

  return { boot };
})();

document.addEventListener('DOMContentLoaded', AppVault.boot);
