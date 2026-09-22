(() => {
  if (document.body?.dataset.page !== 'app-v2') return;

  const host = document.getElementById('app-detail-v2');
  if (!host) return;

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const slug = decodeURIComponent(location.pathname.replace(/\/+$/, '').split('/').pop() || '');

  function fmtBytes(bytes = 0) {
    const n = Number(bytes || 0);
    if (!n) return '—';
    const units = ['B','KB','MB','GB'];
    let value = n, i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
  }

  function fmtNumber(value = 0) {
    return new Intl.NumberFormat(undefined, { notation:Number(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits:1 }).format(Number(value || 0));
  }

  function icon(app, className = 'store-app-icon') {
    if (app.icon_url) return `<img class="${className}" src="${esc(app.icon_url)}" alt="${esc(app.name)} icon">`;
    return `<div class="${className} fallback">${esc((app.name || 'A').slice(0,1).toUpperCase())}</div>`;
  }

  async function getJson(url) {
    const res = await fetch(url, { credentials:'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function relatedCard(app) {
    return `<a class="store-related-card" href="/app/${encodeURIComponent(app.slug)}">
      ${app.icon_url ? `<img src="${esc(app.icon_url)}" alt="${esc(app.name)} icon" loading="lazy">` : `<div class="fallback">${esc((app.name || 'A').slice(0,1).toUpperCase())}</div>`}
      <div><h3>${esc(app.name)}</h3><p>${esc(app.category_name || 'Android app')} · ${fmtNumber(app.downloads_count)} downloads</p></div>
    </a>`;
  }

  function installUrl(app) { return `/api/download/${encodeURIComponent(app.slug)}`; }

  function render(app) {
    document.title = `${app.name} — AppVault`;

    const shots = (app.screenshots || []).map((shot, i) => `
      <img class="store-shot" src="${esc(shot.url)}" alt="${esc(app.name)} screenshot ${i + 1}" loading="lazy" data-lightbox>
    `).join('');

    const video = app.video_url ? `
      <div class="store-video-wrap">
        <video controls preload="metadata" playsinline src="${esc(app.video_url)}"></video>
      </div>` : '';

    host.innerHTML = `
      <div class="store-app-shell">
        <div class="store-main">
          <section class="store-app-head">
            ${icon(app)}
            <div>
              <h1 class="store-app-name">${esc(app.name)}</h1>
              <p class="store-app-by">${esc(app.developer || app.category_name || 'Android app')}</p>
              <div class="store-badges">
                ${app.category_name ? `<span class="store-badge">${esc(app.category_name)}</span>` : ''}
                ${app.version ? `<span class="store-badge">Version ${esc(app.version)}</span>` : ''}
                ${app.android_version ? `<span class="store-badge">${esc(app.android_version)}</span>` : ''}
              </div>
            </div>
            <p class="store-app-summary">${esc(app.short_description || 'Download the latest Android APK and view app details below.')}</p>
          </section>

          <section class="store-section">
            <div class="store-section-head"><h2>Preview</h2>${(app.screenshots || []).length ? `<span class="store-badge">${app.screenshots.length} screenshots</span>` : ''}</div>
            ${video}
            ${shots ? `<div class="store-gallery">${shots}</div>` : `<div class="store-gallery-empty">Screenshots will appear here when they are added from the admin dashboard.</div>`}
          </section>

          <section class="store-section">
            <div class="store-section-head"><h2>About this app</h2></div>
            <div class="prose">${esc(app.description || 'No description has been added yet.')}</div>
          </section>

          ${app.changelog ? `<section class="store-section"><div class="store-section-head"><h2>What's new</h2></div><div class="prose">${esc(app.changelog)}</div></section>` : ''}

          <section class="store-section">
            <div class="store-section-head"><h2>App info</h2></div>
            <div class="store-info-list">
              <div class="store-info-row"><small>Version</small><b>${esc(app.version || '—')}</b></div>
              <div class="store-info-row"><small>Size</small><b>${fmtBytes(app.file_size)}</b></div>
              <div class="store-info-row"><small>Android</small><b>${esc(app.android_version || '—')}</b></div>
              <div class="store-info-row"><small>Downloads</small><b>${fmtNumber(app.downloads_count)}</b></div>
              <div class="store-info-row"><small>Developer</small><b>${esc(app.developer || '—')}</b></div>
              <div class="store-info-row"><small>Package</small><b>${esc(app.package_name || '—')}</b></div>
            </div>
          </section>

          <section class="store-section">
            <div class="store-section-head"><h2>You may also like</h2><a class="link-arrow" href="/apps.html">See all apps →</a></div>
            <div class="store-related" id="store-related"><div class="store-gallery-empty">Loading suggestions…</div></div>
          </section>
        </div>

        <aside class="store-install-card">
          <div class="store-stats">
            <div class="store-stat"><small>Version</small><b>${esc(app.version || '—')}</b></div>
            <div class="store-stat"><small>Size</small><b>${fmtBytes(app.file_size)}</b></div>
            <div class="store-stat"><small>Android</small><b>${esc(app.android_version || '—')}</b></div>
            <div class="store-stat"><small>Downloads</small><b>${fmtNumber(app.downloads_count)}</b></div>
          </div>
          <a class="btn btn-primary" href="${installUrl(app)}" download>Install APK</a>
          <p class="store-install-note">The APK downloads first. Android will then ask you to confirm installation. Only install apps you trust and have permission to use.</p>
        </aside>
      </div>

      <div class="store-mobile-install"><a class="btn btn-primary" href="${installUrl(app)}" download>Install APK</a></div>
    `;

    bindLightbox();
    loadRelated(app);
  }

  async function loadRelated(app) {
    const target = document.getElementById('store-related');
    if (!target) return;
    try {
      const query = app.category_slug ? `?category=${encodeURIComponent(app.category_slug)}&limit=8` : '?sort=popular&limit=8';
      const data = await getJson(`/api/apps${query}`);
      const apps = (data.apps || []).filter(x => x.slug !== app.slug).slice(0,4);
      target.innerHTML = apps.length ? apps.map(relatedCard).join('') : `<div class="store-gallery-empty">More app suggestions will appear as the catalog grows.</div>`;
    } catch {
      target.innerHTML = `<div class="store-gallery-empty">Suggestions are unavailable right now.</div>`;
    }
  }

  function bindLightbox() {
    let dialog = document.getElementById('store-lightbox');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'store-lightbox';
      dialog.className = 'store-lightbox';
      dialog.innerHTML = `<button class="store-lightbox-close" type="button" aria-label="Close">×</button><img alt="App screenshot preview">`;
      document.body.appendChild(dialog);
      dialog.querySelector('.store-lightbox-close').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    }
    document.querySelectorAll('[data-lightbox]').forEach(img => img.addEventListener('click', () => {
      dialog.querySelector('img').src = img.src;
      dialog.showModal();
    }));
  }

  async function init() {
    if (!slug || slug === 'app') {
      host.innerHTML = '<div class="store-gallery-empty">App link is invalid.</div>';
      return;
    }
    host.innerHTML = '<div class="store-gallery-empty">Loading app details…</div>';
    try {
      const data = await getJson(`/api/apps/${encodeURIComponent(slug)}`);
      render(data.app);
    } catch (error) {
      host.innerHTML = `<div class="store-gallery-empty"><b>Could not open this app.</b><br>${esc(error.message)}</div>`;
    }
  }

  init();
})();
