(() => {
  if (document.body?.dataset.page !== 'admin') return;

  const $ = (selector, root = document) => root.querySelector(selector);

  const SDK_TO_ANDROID = {
    21: 'Android 5.0+',
    22: 'Android 5.1+',
    23: 'Android 6.0+',
    24: 'Android 7.0+',
    25: 'Android 7.1+',
    26: 'Android 8.0+',
    27: 'Android 8.1+',
    28: 'Android 9+',
    29: 'Android 10+',
    30: 'Android 11+',
    31: 'Android 12+',
    32: 'Android 12L+',
    33: 'Android 13+',
    34: 'Android 14+',
    35: 'Android 15+',
    36: 'Android 16+'
  };

  const slugify = (value = '') => String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);

  function usableLabel(value) {
    if (Array.isArray(value)) return usableLabel(value.find(Boolean));
    if (value && typeof value === 'object') {
      return usableLabel(value.default || value.en || Object.values(value).find(Boolean));
    }
    const text = String(value || '').trim();
    if (!text || /^resource(id)?:/i.test(text) || /^@string\//i.test(text)) return '';
    return text;
  }

  function filenameName(fileName = '') {
    return fileName
      .replace(/\.apk$/i, '')
      .replace(/[-_.]+/g, ' ')
      .replace(/\b(v?\d+(?:\.\d+){1,4})\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function getMinSdk(info = {}) {
    const raw = info?.usesSdk?.minSdkVersion ?? info?.usesSdk?.minSdk ?? info?.minSdkVersion ?? info?.minSdk;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }

  function setIfEmpty(input, value) {
    if (!input || !value || String(input.value || '').trim()) return false;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function draftDescription(name, categoryName) {
    const category = categoryName && categoryName !== 'Select a category' ? categoryName : 'Android';
    return `${name} is an Android app listed in the ${category} category. This page provides the uploaded APK together with version details, Android requirements, screenshots and update information. Review the app details before installing and only download software you trust and are permitted to use.`;
  }

  function draftShort(name) {
    return `Download ${name} for Android with version details, requirements and updates.`;
  }

  function base64ToFile(dataUrl, fileName) {
    try {
      const match = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ''));
      if (!match) return null;
      const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
      return new File([bytes], fileName, { type: match[1] || 'image/png' });
    } catch {
      return null;
    }
  }

  function attach() {
    const form = $('#app-form');
    const apkInput = $('#app-apk');
    if (!form || !apkInput || apkInput.dataset.autofillReady === '1') return;
    apkInput.dataset.autofillReady = '1';

    const status = document.createElement('span');
    status.className = 'help';
    status.id = 'apk-meta-status';
    status.textContent = 'Choose an APK to auto-fill app name, package ID, version and Android requirement.';
    apkInput.insertAdjacentElement('afterend', status);

    const developerInput = form.elements.namedItem('developer');
    const savedDeveloper = localStorage.getItem('appvault_default_developer') || '';
    if (developerInput && savedDeveloper && !developerInput.value) developerInput.value = savedDeveloper;
    developerInput?.addEventListener('change', () => {
      const value = String(developerInput.value || '').trim();
      if (value) localStorage.setItem('appvault_default_developer', value);
    });

    const categoryInput = form.elements.namedItem('category_id');
    const fillDraftText = (name) => {
      const shortInput = form.elements.namedItem('short_description');
      const descInput = form.elements.namedItem('description');
      const categoryName = categoryInput?.selectedOptions?.[0]?.textContent?.trim() || '';
      setIfEmpty(shortInput, draftShort(name));
      setIfEmpty(descInput, draftDescription(name, categoryName));
    };

    apkInput.addEventListener('change', async () => {
      const file = apkInput.files?.[0];
      if (!file) return;
      status.textContent = 'Reading APK metadata…';

      const nameInput = form.elements.namedItem('name');
      const slugInput = form.elements.namedItem('slug');
      const packageInput = form.elements.namedItem('package_name');
      const versionInput = form.elements.namedItem('version');
      const androidInput = form.elements.namedItem('android_version');
      const iconInput = form.elements.namedItem('icon');

      let parsedName = filenameName(file.name) || 'Android App';

      try {
        if (typeof window.AppInfoParser !== 'function') throw new Error('APK parser did not load');
        const info = await new window.AppInfoParser(file).parse();
        parsedName = usableLabel(info?.application?.label) || usableLabel(info?.label) || parsedName;

        setIfEmpty(nameInput, parsedName);
        setIfEmpty(slugInput, slugify(parsedName));
        setIfEmpty(packageInput, String(info?.package || '').trim());
        setIfEmpty(versionInput, String(info?.versionName || '').trim());

        const minSdk = getMinSdk(info);
        if (minSdk) setIfEmpty(androidInput, SDK_TO_ANDROID[minSdk] || `Android API ${minSdk}+`);

        if (info?.icon && iconInput && !iconInput.files?.length && typeof DataTransfer === 'function') {
          const iconFile = base64ToFile(info.icon, `${slugify(parsedName) || 'app'}-icon.png`);
          if (iconFile) {
            const dt = new DataTransfer();
            dt.items.add(iconFile);
            iconInput.files = dt.files;
            iconInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        fillDraftText(parsedName);
        status.textContent = `Metadata loaded${minSdk ? ` · min SDK ${minSdk}` : ''}. Please review the generated fields before publishing.`;
      } catch (error) {
        setIfEmpty(nameInput, parsedName);
        setIfEmpty(slugInput, slugify(parsedName));
        fillDraftText(parsedName);
        status.textContent = 'Could not read all APK metadata. Name and draft text were filled from the filename; review the fields manually.';
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
