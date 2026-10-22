(function (root) {
  'use strict';
  const languages = ['en', 'ru', 'pt-PT', 'pt-BR', 'es'];
  const formatLocales = { en: 'en-GB', ru: 'ru-RU', 'pt-PT': 'pt-PT', 'pt-BR': 'pt-BR', es: 'es-ES' };
  const preferenceKey = 'nexluck.ui.language';
  const cookieName = 'nexluck_language';
  const catalog = root.NexLuckMessages;
  if (!catalog || !languages.every(language => catalog[language])) {
    throw new Error('NexLuck translation catalog must load before the localization runtime.');
  }
  const cookie = document.cookie.split('; ').find(value => value.startsWith(cookieName + '='));
  const preference = cookie ? cookie.slice(cookieName.length + 1) : 'en';
  let locale = languages.includes(preference) ? preference : 'en';
  let storageError = '';
  try {
    const stored = localStorage.getItem(preferenceKey);
    if (languages.includes(stored)) locale = stored;
  } catch (error) {
    storageError = 'Language preference could not be read from browser storage.';
    console.error(storageError, error);
  }
  document.documentElement.lang = locale;

  function t(source, parameters = {}) {
    const value = catalog[locale][source] ?? catalog.en[source] ?? source;
    return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (match, name) =>
      Object.hasOwn(parameters, name) ? String(parameters[name]) : match) : source;
  }

  function escape(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function translateStatic(container = document) {
    container.querySelectorAll('[data-i18n]').forEach(node => {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    for (const attribute of ['title', 'placeholder', 'aria-label']) {
      container.querySelectorAll('[data-i18n-' + attribute + ']').forEach(node => {
        node.setAttribute(attribute, t(node.getAttribute('data-i18n-' + attribute)));
      });
    }
  }

  function setLocale(value) {
    if (!languages.includes(value)) throw new RangeError('Unsupported UI language: ' + value);
    if (value === locale) return;
    if (!root.dispatchEvent(new CustomEvent('nexluck:before-language-change', {
      cancelable: true, detail: { locale: value }
    }))) return;
    try {
      localStorage.setItem(preferenceKey, value);
    } catch (error) {
      console.error('Language preference could not be saved.', error);
      root.alert(t('Language preference could not be saved. Check browser storage permissions.'));
      return;
    }
    document.cookie = cookieName + '=' + value + '; Path=/; Max-Age=31536000; SameSite=Lax' +
      (location.protocol === 'https:' ? '; Secure' : '');
    location.reload();
  }

  function mountSelector(container) {
    const label = document.createElement('label');
    label.className = 'language-choice';
    const select = document.createElement('select');
    select.setAttribute('aria-label', t('UI language'));
    select.title = t('UI language');
    select.dataset.languageSelector = '';
    [['en', 'EN', 'English'], ['ru', 'RU', 'Русский'], ['pt-PT', 'PT', 'Português (Portugal)'],
      ['pt-BR', 'BR', 'Português (Brasil)'], ['es', 'ES', 'Español (España)']].forEach(([value, name, title]) => {
      const option = new Option(name, value);
      option.title = title;
      option.lang = value;
      select.add(option);
    });
    select.value = locale;
    select.addEventListener('change', () => {
      const value = select.value;
      select.value = locale;
      setLocale(value);
    });
    label.append(select);
    container.append(label);
    if (storageError) {
      const warning = document.createElement('span');
      warning.setAttribute('role', 'alert');
      warning.textContent = t(storageError);
      container.append(warning);
    }
    return select;
  }

  root.NexLuckI18n = {
    t, escape, html: (source, parameters) => escape(t(source, parameters)),
    get locale() { return locale; },
    get formatLocale() { return formatLocales[locale]; },
    setLocale, mountSelector, translateStatic
  };
  document.addEventListener('DOMContentLoaded', () => translateStatic());
})(window);
