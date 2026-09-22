(() => {
  if (document.body?.dataset.page !== 'admin') return;

  const $ = (selector, root = document) => root.querySelector(selector);

  const SDK_TO_ANDROID = {
    21: 'Android 5.0+', 22: 'Android 5.1+', 23: 'Android 6.0+',
    24: 'Android 7.0+', 25: 'Android 7.1+', 26: 'Android 8.0+',
    27: 'Android 8.1+', 28: 'Android 9+', 29: 'Android 10+',
    30: 'Android 11+', 31: 'Android 12+', 32: 'Android 12L+',
    33: 'Android 13+', 34: 'Android 14+', 35: 'Android 15+', 36: 'Android 16+'
  };

  const slugify = (value = '') => String(value)
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 90);

  function usableLabel(value) {
    if (Array.isArray(value)) return usableLabel(value.find(Boolean));
    if (value && typeof value === 'object') {
      return usableLabel(value.default || value.en || value['en-US'] || Object.values(value).find(Boolean));
    }
    const text = String(value || '').trim();
    if (!text || /^resource(id)?:/i.test(text) || /^@string\//i.test(text)) return '';
    return text;
  }

  function filenameName(fileName = '') {
    return fileName.replace(/\.apk$/i, '').replace(/[-_.]+/g, ' ')
      .replace(/\b(v?\d+(?:\.\d+){1,4})\b/gi, '').replace(/\s+/g, ' ')
      .trim().replace(/\b\w/g, c => c.toUpperCase());
  }

  function filenameVersion(fileName = '') {
    const m = String(fileName).match(/(?:^|[-_.\s])v?(\d+(?:\.\d+){1,4})(?:[-_.\s]|\.apk$)/i);
    return m?.[1] || '';
  }

  function readPath(obj, paths) {
    for (const path of paths) {
      let cur = obj;
      for (const key of path) cur = cur?.[key];
      if (cur !== undefined && cur !== null && String(cur).trim() !== '') return cur;
    }
    return '';
  }

  function getMinSdk(info = {}) {
    const raw = readPath(info, [
      ['usesSdk', 'minSdkVersion'], ['usesSdk', 'minSdk'], ['usesSdk', 'android:minSdkVersion'],
      ['minSdkVersion'], ['minSdk'], ['manifest', 'usesSdk', 'minSdkVersion'],
      ['manifest', 'usesSdk', 'android:minSdkVersion']
    ]);
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }

  function setValue(input, value) {
    if (!input || value === undefined || value === null || String(value).trim() === '') return false;
    input.value = String(value).trim();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function firstIcon(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return firstIcon(value.find(Boolean));
    if (typeof value === 'object') return firstIcon(value.default || value.icon || value.png || value[0] || Object.values(value).find(Boolean));
    return '';
  }

  function iconToFile(value, fileName) {
    try {
      let data = firstIcon(value);
      if (!data) return null;
      if (!/^data:/i.test(data)) data = `data:image/png;base64,${data.replace(/^base64,/i, '')}`;
      const match = /^data:([^;]+);base64,(.+)$/i.exec(data);
      if (!match) return null;
      const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
      return new File([bytes], fileName, { type: match[1] || 'image/png' });
    } catch {
      return null;
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Could not load APK parser from ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensureParser() {
    if (typeof window.AppInfoParser === 'function') return window.AppInfoParser;
    const sources = [
      'https://cdn.jsdelivr.net/npm/app-info-parser@1.1.6/dist/app-info-parser.min.js',
      'https://unpkg.com/app-info-parser@1.1.6/dist/app-info-parser.min.js'
    ];
    for (const src of sources) {
      try {
        await loadScript(src);
        if (typeof window.AppInfoParser === 'function') return window.AppInfoParser;
      } catch {}
    }
    throw new Error('APK metadata parser could not be loaded');
  }

  function attach() {
    const form = $('#app-form');
    const apkInput = $('#app-apk');
    if (!form || !apkInput || apkInput.dataset.autofillReady === '1') return;
    apkInput.dataset.autofillReady = '1';

    const status = document.createElement('span');
    status.className = 'help';
    status.id = 'apk-meta-status';
    status.textContent = 'Choose an APK. AppVault will read its app name, App ID, version, Android requirement and icon automatically.';
    apkInput.insertAdjacentElement('afterend', status);

    const developerInput = form.elements.namedItem('developer');
    const savedDeveloper = localStorage.getItem('appvault_default_developer') || '';
    if (developerInput && savedDeveloper && !developerInput.value) developerInput.value = savedDeveloper;
    developerInput?.addEventListener('change', () => {
      const value = String(developerInput.value || '').trim();
      if (value) localStorage.setItem('appvault_default_developer', value);
    });

    apkInput.addEventListener('change', async () => {
      const file = apkInput.files?.[0];
      if (!file) return;

      const nameInput = form.elements.namedItem('name');
      const slugInput = form.elements.namedItem('slug');
      const packageInput = form.elements.namedItem('package_name');
      const versionInput = form.elements.namedItem('version');
      const androidInput = form.elements.namedItem('android_version');
      const iconInput = form.elements.namedItem('icon');

      const fallbackName = filenameName(file.name) || 'Android App';
      const fallbackVersion = filenameVersion(file.name);
      status.textContent = 'Reading APK metadata…';

      try {
        const Parser = await ensureParser();
        const info = await new Parser(file).parse();

        const appName = usableLabel(info?.application?.label) || usableLabel(info?.label) || fallbackName;
        const packageName = String(readPath(info, [
          ['package'], ['packageName'], ['manifest', 'package']
        ]) || '').trim();
        const versionName = String(readPath(info, [
          ['versionName'], ['version', 'name'], ['manifest', 'versionName'], ['manifest', 'android:versionName']
        ]) || fallbackVersion).trim();
        const minSdk = getMinSdk(info);

        setValue(nameInput, appName);
        if (slugInput && !slugInput.dataset.touched) setValue(slugInput, slugify(appName));
        setValue(packageInput, packageName);
        setValue(versionInput, versionName);
        if (minSdk) setValue(androidInput, SDK_TO_ANDROID[minSdk] || `Android API ${minSdk}+`);

        let iconOk = false;
        const iconFile = iconToFile(info?.icon, `${slugify(appName) || 'app'}-icon.png`);
        window.__appVaultAutoIconFile = iconFile || null;
        if (iconFile && iconInput && typeof DataTransfer === 'function') {
          try {
            const dt = new DataTransfer();
            dt.items.add(iconFile);
            iconInput.files = dt.files;
            iconInput.dispatchEvent(new Event('change', { bubbles: true }));
            iconOk = true;
          } catch {}
        }

        const loaded = [
          packageName ? 'App ID' : '',
          versionName ? `v${versionName}` : '',
          minSdk ? (SDK_TO_ANDROID[minSdk] || `API ${minSdk}+`) : '',
          iconFile ? 'icon' : ''
        ].filter(Boolean).join(' · ');

        status.textContent = loaded
          ? `APK metadata loaded: ${loaded}. Review the fields before publishing.`
          : 'APK opened, but this file did not expose the expected metadata. Review the fields manually.';

        if (iconFile && !iconOk) status.textContent += ' Icon was extracted and will be attached automatically when you publish.';
      } catch (error) {
        setValue(nameInput, fallbackName);
        if (slugInput && !slugInput.dataset.touched) setValue(slugInput, slugify(fallbackName));
        if (fallbackVersion) setValue(versionInput, fallbackVersion);
        window.__appVaultAutoIconFile = null;
        status.textContent = fallbackVersion
          ? `APK parser could not read the manifest. Version ${fallbackVersion} was taken from the filename; other technical fields need review.`
          : 'Could not read this APK metadata. Try another APK build or refresh the page and select the file again.';
        console.warn('APK metadata autofill failed:', error);
      }
    });

    form.addEventListener('submit', () => {
      const value = String(developerInput?.value || '').trim();
      if (value) localStorage.setItem('appvault_default_developer', value);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
