const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const locales = { en: 'en-GB', ru: 'ru-RU', 'pt-PT': 'pt-PT', 'pt-BR': 'pt-BR', es: 'es-ES' };
const source = fs.readFileSync(path.join(__dirname, 'runtime.js'), 'utf8');

function setup(locale, allowChange = true) {
  const storage = new Map([['nexluck.ui.language', locale]]);
  let reloads = 0;
  const document = {
    cookie: '',
    documentElement: {},
    addEventListener() {},
    createElement() {
      return {
        children: [], options: [], dataset: {}, attributes: {},
        append(child) { this.children.push(child); },
        add(option) { this.options.push(option); },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, handler) { this[name] = handler; }
      };
    }
  };
  const window = {
    NexLuckMessages: Object.fromEntries(Object.keys(locales).map(language => [
      language, { 'UI language': 'Language ' + language }
    ])),
    dispatchEvent(event) {
      assert.equal(event.type, 'nexluck:before-language-change');
      assert.equal(event.options.cancelable, true);
      return allowChange;
    }
  };
  vm.runInNewContext(source, {
    window, document, console,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    location: { protocol: 'https:', reload() { reloads++; } },
    Option: function (text, value) { this.text = text; this.value = value; },
    CustomEvent: function (type, options) { this.type = type; this.options = options; }
  });
  const container = document.createElement('span');
  const select = window.NexLuckI18n.mountSelector(container);
  return { i18n: window.NexLuckI18n, document, storage, select, container, reloads: () => reloads };
}

for (const [locale, formatLocale] of Object.entries(locales)) {
  const state = setup(locale);
  assert.equal(state.i18n.locale, locale);
  assert.equal(state.document.documentElement.lang, locale);
  assert.equal(state.i18n.formatLocale, formatLocale);
  assert.equal(state.select.value, locale);
  assert.equal(state.select.attributes['aria-label'], 'Language ' + locale);
  assert.equal(state.select.title, 'Language ' + locale);
  assert.equal(Array.from(state.select.options, option => option.text).join('/'), 'EN/RU/PT/BR/ES');
  assert.equal(Array.from(state.select.options, option => option.value).join(','), Object.keys(locales).join(','));
  assert.ok(state.select.options.every(option => option.lang === option.value && option.title));
  assert.equal(state.container.children[0].children.length, 1);
  const next = locale === 'es' ? 'pt-BR' : 'es';
  state.select.value = next;
  state.select.change();
  assert.equal(state.storage.get('nexluck.ui.language'), next);
  assert.ok(state.document.cookie.startsWith('nexluck_language=' + next + ';'));
  assert.ok(state.document.cookie.endsWith('; Secure'));
  assert.equal(state.reloads(), 1);
}

const canceled = setup('pt-BR', false);
canceled.select.value = 'pt-PT';
canceled.select.change();
assert.equal(canceled.select.value, 'pt-BR');
assert.equal(canceled.storage.get('nexluck.ui.language'), 'pt-BR');
assert.equal(canceled.document.cookie, '');
assert.equal(canceled.reloads(), 0);
assert.throws(() => canceled.i18n.setLocale('fr'), { name: 'RangeError' });
assert.equal(setup('invalid').i18n.locale, 'en');
console.log('Shared EN/RU/PT/BR/ES selector, region formats, persistence and cancellation passed.');
