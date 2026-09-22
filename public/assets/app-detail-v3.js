(() => {
  const page = document.body?.dataset.page;
  if (page !== 'app-v3') return;

  const host = document.getElementById('app-detail-v3');
  if (!host) return;

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const qsSlug = new URLSearchParams(location.search).get('slug') || '';
  let pathSlug = '';
  const pathMatch = location.pathname.match(/\/app\/([^/?#]+)/);
  if (pathMatch) {
    try { pathSlug = decodeURIComponent(pathMatch[1]); } catch { pathSlug = pathMatch[1]; }
  }
  const slug = String(qsSlug || pathSlug).trim();

  function fmtBytes(bytes = 0) {
    const n = Number(bytes || 0);
    if (!n) return '—';
    const units = ['B','KB','MB','GB'];
    let value = n, i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
  }

  function fmtNumber(value = 0) {
    return new Intl.NumberFormat(undefined, {
      notation: Number(value) >= 10000 ? 'compact' : 'standard',
      maximumFractionDigits: 1
    }).format(Number(value || 0));
  }

  async function getJson(url) {
    const response = await fetch(url, { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function appIcon(app, cls = 'v3-app-icon') {
    if (app.icon_url) return `<img class="${cls}" src="${esc(app.icon_url)}" alt="${esc(app.name)} icon">`;
    return `<div class="${cls} fallback">${esc((app.name || 'A').slice(0,1).toUpperCase())}</div>`;
  }

  function detailsUrl(app) {
    return `/app.html?slug=${encodeURIComponent(app.slug)}`;
  }

  function installUrl(app) {
    return `/api/download/${encodeURIComponent(app.slug)}`;
  }

  function suggestionCard(app) {
    return `<a class="v3-suggestion" data-app-slug="${esc(app.slug)}" href="${detailsUrl(app)}">
      ${appIcon(app, 'v3-suggestion-icon')}
      <div class="v3-suggestion-copy">
        <h3>${esc(app.name)}</h3>
        <p>${esc(app.category_name || app.developer || 'Android app')}</p>
      </div>
      <span class="v3-chevron">›</span>
    </a>`;
  }

  function render(app) {
    document.title = `${app.name} — AppVault`;
    const screenshots = (app.screenshots || []).map((shot, index) => `
      <button class="v3-shot-button" type="button" data-shot="${esc(shot.url)}" aria-label="Open screenshot ${index + 1}">
        <img class="v3-shot" src="${esc(shot.url)}" alt="${esc(app.name)} screenshot ${index + 1}" loading="lazy">
      </button>`).join('');

    host.innerHTML = `
      <article class="v3-product-page">
        <section class="v3-product-hero">
          <div class="v3-product-top">
            ${appIcon(app)}
            <div class="v3-product-title">
              <h1>${esc(app.name)}</h1>
              <p class="v3-developer">${esc(app.developer || app.category_name || 'Android app')}</p>
              <p class="v3-summary">${esc(app.short_description || 'Android app download and release details.')}</p>
            </div>
          </div>

          <a class="v3-install-button" href="${installUrl(app)}" download>Install APK</a>

          <div class="v3-facts" aria-label="App information">
            <div><b>${esc(app.version || '—')}</b><span>Version</span></div>
            <div><b>${fmtBytes(app.file_size)}</b><span>Size</span></div>
            <div><b>${esc(app.android_version || '—')}</b><span>Android</span></div>
            <div><b>${fmtNumber(app.downloads_count)}</b><span>Downloads</span></div>
          </div>
          <p class="v3-install-help">The APK downloads to your phone first. Open the downloaded file and Android will ask you to confirm installation.</p>
        </section>

        <section class="v3-panel v3-preview-panel">
          <div class="v3-panel-heading"><h2>Preview</h2>${(app.screenshots || []).length ? `<span>${app.screenshots.length} screenshots</span>` : ''}</div>
          ${screenshots ? `<div class="v3-shot-strip">${screenshots}</div>` : `<div class="v3-empty-preview">No screenshots have been added for this app yet.</div>`}
        </section>

        ${app.changelog ? `<section class="v3-panel"><div class="v3-panel-heading"><h2>What's new</h2></div><div class="v3-body-copy">${esc(app.changelog)}</div></section>` : ''}

        <section class="v3-panel">
          <div class="v3-panel-heading"><h2>About this app</h2></div>
          <div class="v3-body-copy">${esc(app.description || 'No description has been added yet.')}</div>
        </section>

        <section class="v3-panel">
          <div class="v3-panel-heading"><h2>App details</h2></div>
          <dl class="v3-details-list">
            <div><dt>App</dt><dd>${esc(app.name || '—')}</dd></div>
            <div><dt>Developer</dt><dd>${esc(app.developer || '—')}</dd></div>
            <div><dt>Category</dt><dd>${esc(app.category_name || '—')}</dd></div>
            <div><dt>Package</dt><dd>${esc(app.package_name || '—')}</dd></div>
            <div><dt>Version</dt><dd>${esc(app.version || '—')}</dd></div>
            <div><dt>Requires</dt><dd>${esc(app.android_version || '—')}</dd></div>
          </dl>
        </section>

        <section class="v3-panel">
          <div class="v3-panel-heading"><h2>You may also like</h2><a href="/apps.html">View all</a></div>
          <div class="v3-suggestions" id="v3-suggestions"><div class="v3-empty-preview">Loading suggestions…</div></div>
        </section>
      </article>

      <div class="v3-mobile-install"><a href="${installUrl(app)}" download>Install APK</a></div>
    `;

    bindScreenshots();
    loadSuggestions(app);
  }

  function bindScreenshots() {
    document.querySelectorAll('[data-shot]').forEach(button => {
      button.addEventListener('click', () => {
        let dialog = document.getElementById('v3-lightbox');
        if (!dialog) {
          dialog = document.createElement('dialog');
          dialog.id = 'v3-lightbox';
          dialog.className = 'v3-lightbox';
          dialog.innerHTML = `<button type="button" aria-label="Close">×</button><img alt="App screenshot preview">`;
          document.body.appendChild(dialog);
          dialog.querySelector('button').addEventListener('click', () => dialog.close());
          dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        }
        dialog.querySelector('img').src = button.dataset.shot;
        dialog.showModal();
      });
    });
  }

  async function loadSuggestions(app) {
    const target = document.getElementById('v3-suggestions');
    if (!target) return;
    try {
      const query = app.category_slug
        ? `/api/apps?category=${encodeURIComponent(app.category_slug)}&limit=8`
        : '/api/apps?sort=popular&limit=8';
      const data = await getJson(query);
      const suggestions = (data.apps || []).filter(item => item.slug !== app.slug).slice(0,4);
      target.innerHTML = suggestions.length
        ? suggestions.map(suggestionCard).join('')
        : `<div class="v3-empty-preview">More suggestions will appear as the library grows.</div>`;
    } catch {
      target.innerHTML = `<div class="v3-empty-preview">Suggestions are unavailable right now.</div>`;
    }
  }

  async function init() {
    if (!slug) {
      host.innerHTML = '<div class="v3-error"><b>App link is incomplete.</b><span>Return to the app library and open the app again.</span></div>';
      return;
    }
    host.innerHTML = '<div class="v3-loading">Loading app details…</div>';
    try {
      const data = await getJson(`/api/apps/${encodeURIComponent(slug)}`);
      render(data.app);
    } catch (error) {
      host.innerHTML = `<div class="v3-error"><b>Could not open this app.</b><span>${esc(error.message)}</span><a href="/apps.html">Back to apps</a></div>`;
    }
  }

  init();
})();
