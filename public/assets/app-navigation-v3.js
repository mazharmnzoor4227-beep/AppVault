(() => {
  const toDetailsUrl = (slug) => `/app.html?slug=${encodeURIComponent(slug)}`;

  function extractSlug(link) {
    const explicit = link.dataset.appSlug;
    if (explicit) return explicit;
    const href = link.getAttribute('href') || '';
    const match = href.match(/\/app\/([^/?#]+)/);
    if (match) {
      try { return decodeURIComponent(match[1]); } catch { return match[1]; }
    }
    try {
      const url = new URL(href, location.origin);
      return url.searchParams.get('slug') || '';
    } catch { return ''; }
  }

  function wire(link) {
    if (!(link instanceof HTMLAnchorElement) || link.dataset.detailsWired === '1') return;
    const slug = extractSlug(link);
    if (!slug) return;
    link.dataset.detailsWired = '1';
    link.dataset.appSlug = slug;
    link.href = toDetailsUrl(slug);
    link.style.cursor = 'pointer';
    link.style.touchAction = 'manipulation';
    link.addEventListener('click', (event) => {
      if (event.button && event.button !== 0) return;
      event.preventDefault();
      location.assign(toDetailsUrl(slug));
    });
  }

  function scan(root = document) {
    root.querySelectorAll?.('a.app-card, a.store-related-card, a[data-app-slug]').forEach(wire);
  }

  scan();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('a.app-card, a.store-related-card, a[data-app-slug]')) wire(node);
        scan(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
