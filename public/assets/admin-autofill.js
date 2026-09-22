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
      ['manifest', 'usesSdk', 'android:minSdkVersion'], ['application', 'minSdkVersion']
    ]);
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }

  function setValue(input, value, force = true) {
    if (!input || value === undefined || value === null || String(value).trim() === '') return false;
    if (!force && String(input.value || '').trim()) return false;
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

  function prettySegment(value = '') {
    const clean = String(value).replace(/[^a-z0-9]+/gi, ' ').trim();
    return clean ? clean.replace(/\b\w/g, c => c.toUpperCase()) : '';
  }

  function inferDeveloper(packageName, appName) {
    const saved = localStorage.getItem('appvault_default_developer') || '';
    if (saved) return saved;
    const common = new Set(['com','org','net','io','app','apps','android','co','dev']);
    const parts = String(packageName || '').split('.').filter(Boolean);
    const candidate = parts.find(p => !common.has(p.toLowerCase()) && !/^\d+$/.test(p));
    return prettySegment(candidate) || String(appName || '').trim();
  }

  function inferCategory(name, packageName) {
    const text = `${name} ${packageName}`.toLowerCase();
    const rules = [
      ['Games', /\b(game|games|gaming|runner|racing|puzzle|arcade)\b/],
      ['Social', /\b(social|chat|message|messenger|community|whatsapp|telegram)\b/],
      ['Photo & Video', /\b(photo|camera|video|editor|media|reel|tiktok|youtube|download|downloader)\b/],
      ['Education', /\b(learn|study|education|school|course|book|quiz)\b/],
      ['Business', /\b(business|seller|shop|store|commerce|invoice|office)\b/],
      ['Lifestyle', /\b(lifestyle|fitness|health|food|travel|weather)\b/],
      ['Entertainment', /\b(stream|music|movie|tv|entertainment|player)\b/],
      ['Tools', /\b(tool|utility|file|manager|vpn|browser|scanner|backup|cleaner)\b/]
    ];
    for (const [label, rx] of rules) if (rx.test(text)) return label;
    return 'Tools';
  }

  function selectCategory(select, label) {
    if (!select) return false;
    const option = [...select.options].find(o => String(o.textContent || '').trim().toLowerCase() === String(label).toLowerCase());
    if (!option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function attachIcon(iconInput, iconFile, host) {
    if (!iconInput || !iconFile) return false;
    window.__appVaultAutoIconFile = iconFile;
    let attached = false;
    if (typeof DataTransfer === 'function') {
      try {
        const dt = new DataTransfer();
        dt.items.add(iconFile);
        iconInput.files = dt.files;
        iconInput.dispatchEvent(new Event('change', { bubbles: true }));
        attached = Boolean(iconInput.files?.length);
      } catch {}
    }

    let preview = $('#apk-icon-preview');
    if (!preview) {
      preview = document.createElement('img');
      preview.id = 'apk-icon-preview';
      preview.alt = 'Extracted app icon';
      preview.style.cssText = 'width:64px;height:64px;border-radius:16px;object-fit:cover;margin-top:10px;border:1px solid rgba(255,255,255,.12)';
      host?.appendChild(preview);
    }
    preview.src = URL.createObjectURL(iconFile);
    return attached;
  }

  function moveApkFirst(form, apkInput) {
    const grid = $('.form-grid', form);
    const apkGroup = apkInput.closest('.form-group');
    if (!grid || !apkGroup) return;
    apkGroup.classList.add('full');
    grid.prepend(apkGroup);

    const note = document.createElement('div');
    note.className = 'form-group full';
    note.innerHTML = '<span class="help">Choose the APK first. AppVault will fill the technical fields below automatically; you only need to review them and write the descriptions.</span>';
    apkGroup.insertAdjacentElement('afterend', note);
  }

  function attach() {
    const form = $('#app-form');
    const apkInput = $('#app-apk');
    if (!form || !apkInput || apkInput.dataset.autofillReady === '1') return;
    apkInput.dataset.autofillReady = '1';

    moveApkFirst(form, apkInput);

    const status = document.createElement('span');
    status.className = 'help';
    status.id = 'apk-meta-status';
    status.textContent = 'Choose an APK to auto-fill app name, slug, developer, App ID, version, Android requirement, category and icon.';
    apkInput.insertAdjacentElement('afterend', status);

    const developerInput = form.elements.namedItem('developer');
    const categoryInput = form.elements.namedItem('category_id');
    const statusInput = form.elements.namedItem('status');
    if (statusInput) statusInput.value = 'published';

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
      const iconGroup = iconInput?.closest('.form-group');

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
        const developer = inferDeveloper(packageName, appName);
        const category = inferCategory(appName, packageName);

        setValue(nameInput, appName);
        if (slugInput && !slugInput.dataset.touched) setValue(slugInput, slugify(appName));
        setValue(packageInput, packageName);
        setValue(versionInput, versionName);
        if (minSdk) setValue(androidInput, SDK_TO_ANDROID[minSdk] || `Android API ${minSdk}+`);
        setValue(developerInput, developer, false);
        selectCategory(categoryInput, category);
        if (statusInput) statusInput.value = 'published';

        const iconFile = iconToFile(info?.icon, `${slugify(appName) || 'app'}-icon.png`);
        const iconAttached = iconFile ? attachIcon(iconInput, iconFile, iconGroup) : false;

        const loaded = [
          appName ? 'name' : '', packageName ? 'App ID' : '', versionName ? `v${versionName}` : '',
          minSdk ? (SDK_TO_ANDROID[minSdk] || `API ${minSdk}+`) : '', developer ? 'developer' : '',
          category ? category : '', iconFile ? 'icon' : ''
        ].filter(Boolean).join(' · ');

        status.textContent = loaded
          ? `Auto-filled: ${loaded}. You only need to review the details and add the descriptions.`
          : 'APK opened, but this file did not expose the expected metadata.';
        if (iconFile && !iconAttached) status.textContent += ' The icon was extracted and will be attached automatically where the browser allows it.';
      } catch (error) {
        setValue(nameInput, fallbackName);
        if (slugInput && !slugInput.dataset.touched) setValue(slugInput, slugify(fallbackName));
        if (fallbackVersion) setValue(versionInput, fallbackVersion);
        setValue(developerInput, inferDeveloper('', fallbackName), false);
        selectCategory(categoryInput, inferCategory(fallbackName, ''));
        if (statusInput) statusInput.value = 'published';
        window.__appVaultAutoIconFile = null;
        status.textContent = fallbackVersion
          ? `Manifest parser failed, but name and version ${fallbackVersion} were filled from the filename.`
          : 'Could not read this APK manifest. Refresh once and select the APK again; if it still fails, this APK format may not expose metadata to the browser parser.';
        console.warn('APK metadata autofill failed:', error);
      }
    });

    form.addEventListener('submit', () => {
      const value = String(developerInput?.value || '').trim();
      if (value) localStorage.setItem('appvault_default_developer', value);

      const iconInput = form.elements.namedItem('icon');
      const autoIcon = window.__appVaultAutoIconFile;
      if (autoIcon && iconInput && !iconInput.files?.length && typeof DataTransfer === 'function') {
        try {
          const dt = new DataTransfer();
          dt.items.add(autoIcon);
          iconInput.files = dt.files;
        } catch {}
      }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
