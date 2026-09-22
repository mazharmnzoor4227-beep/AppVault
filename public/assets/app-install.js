(() => {
  if (document.body?.dataset.page !== 'app') return;

  const slug = decodeURIComponent(location.pathname.replace(/\/+$/, '').split('/').pop() || '');
  if (!slug || slug === 'app') return;

  const style = document.createElement('style');
  style.textContent = `
    .app-install-box{margin-top:16px;padding:14px;border:1px solid #dedfe2;border-radius:10px;background:#fafafa}
    .app-install-box .btn{width:100%;min-height:48px}
    .app-install-box p{margin:8px 0 0;color:#747980;font-size:12px;line-height:1.5}
    .app-install-mobile{display:none}
    @media(max-width:760px){
      .app-heading{flex-wrap:wrap!important}
      .app-install-mobile{display:block!important;flex:0 0 100%;width:100%;margin-top:14px}
      .detail-side .app-install-box{display:none}
    }
  `;
  document.head.appendChild(style);

  function installMarkup(extraClass = '') {
    const box = document.createElement('div');
    box.className = `app-install-box ${extraClass}`.trim();
    const link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = `/api/download/${encodeURIComponent(slug)}`;
    link.setAttribute('download', '');
    link.textContent = 'Install APK';
    const note = document.createElement('p');
    note.textContent = 'Android will download the APK first. Open the downloaded file and confirm installation when your phone asks.';
    box.append(link, note);
    return box;
  }

  function enhance() {
    const detail = document.getElementById('app-detail');
    if (!detail) return false;
    const heading = detail.querySelector('.app-heading');
    const downloadCard = detail.querySelector('.download-card');
    if (!heading || !downloadCard) return false;

    if (!heading.querySelector('.app-install-mobile')) {
      heading.appendChild(installMarkup('app-install-mobile'));
    }

    const existing = downloadCard.querySelector('a[href*="/api/download/"]');
    if (existing) {
      existing.textContent = 'Install APK';
      existing.setAttribute('download', '');
      const note = downloadCard.querySelector('.download-note');
      if (note) note.textContent = 'Tap Install APK to download the file. Android will ask you to confirm before installing it.';
    } else if (!downloadCard.querySelector('.app-install-box')) {
      downloadCard.appendChild(installMarkup());
    }
    return true;
  }

  if (enhance()) return;
  const observer = new MutationObserver(() => {
    if (enhance()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
