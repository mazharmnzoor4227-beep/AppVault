(() => {
 const safe = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const appsCategoryUrl = slug => '/apps.html?category='+encodeURIComponent(slug);
 async function getCategories(){try{const r=await fetch('/api/categories');return r.ok?(await r.json()).categories:[]}catch{return []}}
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

 if(document.body.dataset.page==='home') buildHomeCategoryTabs();
})();
