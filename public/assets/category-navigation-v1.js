(() => {
  const page = document.body?.dataset.page || '';
  const qs = new URLSearchParams(location.search);
  const selectedCategory = (qs.get('category') || '').trim();

  const safe = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  async function getCategories() {
    try {
      const res = await fetch('/api/categories', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('categories unavailable');
      const data = await res.json();
      return Array.isArray(data.categories) ? data.categories : [];
    } catch {
      return [];
    }
  }

  function appsCategoryUrl(slug) {
    return `/apps.html?category=${encodeURIComponent(slug)}`;
  }

  function routeCategoryCards(root = document) {
    root.querySelectorAll?.('a.category-card').forEach(link => {
      const href = link.getAttribute('href') || '';
      let slug = '';
      const match = href.match(/\/category\/([^/?#]+)/);
      if (match) {
        try { slug = decodeURIComponent(match[1]); } catch { slug = match[1]; }
      }
      if (!slug) {
        try { slug = new URL(href, location.origin).searchParams.get('category') || ''; } catch {}
      }
      if (!slug) return;
      link.href = appsCategoryUrl(slug);
      link.dataset.categorySlug = slug;
    });
  }

  async function buildHomeCategoryTabs() {
    const nav = document.querySelector('.play-tabs');
    if (!nav) return;
    const categories = await getCategories();
    const all = `<a class="play-chip active" href="/apps.html">All</a>`;
    const categoryLinks = categories.map(cat =>
      `<a class="play-chip" href="${appsCategoryUrl(cat.slug)}" data-category-slug="${safe(cat.slug)}">${safe(cat.name)}</a>`
    ).join('');
    nav.innerHTML = all + categoryLinks;
  }

  async function enhanceAppsPage() {
    if (page !== 'apps' || !selectedCategory) return;
    const categories = await getCategories();
    const cat = categories.find(item => item.slug === selectedCategory);
    const heading = document.querySelector('.page-hero h1');
    const copy = document.querySelector('.page-hero p');
    if (heading) heading.textContent = cat?.name || 'Category';
    if (copy) copy.textContent = cat
      ? (Number(cat.app_count || 0) > 0
        ? `Showing only apps published in ${cat.name}.`
        : `No apps are available in ${cat.name} yet.`)
      : 'No apps are available in this category yet.';
    if (cat) document.title = `${cat.name} — AppVault`;

    const grid = document.getElementById('apps-grid');
    if (!grid) return;

    const applyEmptyState = () => {
      const empty = grid.querySelector('.empty-state');
      if (!empty) return;
      if (grid.querySelector('.app-card')) return;
      if (empty.dataset.categoryEmpty === '1') return;
      empty.dataset.categoryEmpty = '1';
      empty.innerHTML = `<b>Not available</b>${cat ? `No apps have been published in ${safe(cat.name)} yet.` : 'No apps have been published in this category yet.'}`;
    };

    applyEmptyState();
    const observer = new MutationObserver(applyEmptyState);
    observer.observe(grid, { childList: true, subtree: true });
  }

  routeCategoryCards();
  const linkObserver = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('a.category-card')) routeCategoryCards(node.parentElement || document);
        else routeCategoryCards(node);
      }
    }
  });
  linkObserver.observe(document.documentElement, { childList: true, subtree: true });

  if (page === 'home') buildHomeCategoryTabs();
  enhanceAppsPage();
})();
