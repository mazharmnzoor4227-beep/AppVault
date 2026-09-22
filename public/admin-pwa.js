(() => {
  if (document.body?.dataset.page !== 'admin') return;

  const installButton = document.getElementById('install-admin-app');
  const installStatus = document.getElementById('install-admin-status');
  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  function setInstalledState() {
    if (!installButton) return;
    installButton.textContent = 'Installed';
    installButton.disabled = true;
    if (installStatus) installStatus.textContent = 'AppVault Admin is installed on this device. Open it from your home screen like a normal app.';
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin/' });
    } catch (error) {
      console.warn('Admin PWA service worker registration failed:', error);
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (installButton) {
      installButton.disabled = false;
      installButton.textContent = 'Install Admin App';
    }
    if (installStatus) installStatus.textContent = 'Ready to install. Tap the button to add AppVault Admin to your home screen.';
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setInstalledState();
  });

  installButton?.addEventListener('click', async () => {
    if (isStandalone()) return setInstalledState();

    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      await prompt.prompt();
      const result = await prompt.userChoice.catch(() => null);
      if (result?.outcome === 'accepted') {
        if (installStatus) installStatus.textContent = 'Installation accepted. AppVault Admin will appear on your home screen.';
      } else {
        if (installStatus) installStatus.textContent = 'Installation was not completed. You can try again from the browser menu.';
      }
      return;
    }

    if (installStatus) {
      installStatus.textContent = 'If the install prompt is not shown, open the browser menu (⋮) and choose “Install app” or “Add to Home screen”.';
    }
  });

  registerServiceWorker();
  if (isStandalone()) setInstalledState();
})();
