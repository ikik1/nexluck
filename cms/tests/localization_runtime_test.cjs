const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cms = path.resolve(__dirname, '..');
const messages = JSON.parse(fs.readFileSync(path.resolve(cms, '../localization/cms.json'), 'utf8')).ru;
let onChange;
let destination;
const context = vm.createContext({
  window: { NexLuckI18n: { t: () => 'English management UI' } },
  document: {
    documentElement: { lang: 'ru' },
    getElementById(id) {
      return id === 'cms-website-messages'
        ? { textContent: JSON.stringify(messages) }
        : { addEventListener(type, handler) { assert.equal(type, 'change'); onChange = handler; } };
    }
  },
  location: {
    href: 'https://example.test/cms/preview/12/?token=private-token&standalone=1&lang=en',
    assign(url) { destination = new URL(url); }
  },
  URL
});
vm.runInContext(fs.readFileSync(path.join(cms, 'core/static/cms/website-language.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(cms, 'frontend/src/i18n.js'), 'utf8')
  .replace('export const t =', 'globalThis.translate ='), context);
assert.equal(context.translate('Loading catalog...'), 'Загрузка каталога...');
assert.equal(context.translate('Promotion'), 'Акция');
assert.equal(context.translate('Never translate saved casino or player names'), 'Never translate saved casino or player names');
assert.equal(context.translate('Widget renderer is not installed: {kind}', { kind: 'original.module-id' }),
  'Обработчик виджета не установлен: original.module-id');
onChange({ target: { value: 'ru' } });
assert.equal(destination.searchParams.get('lang'), 'ru');
assert.equal(destination.searchParams.get('token'), 'private-token');
assert.equal(destination.searchParams.get('standalone'), '1');
onChange({ target: { value: 'pt-BR' } });
assert.equal(destination.searchParams.get('lang'), 'pt-BR');
assert.equal(destination.searchParams.get('token'), 'private-token');
delete context.window.CMSWebsiteI18n;
assert.equal(context.translate('Promotion'), 'English management UI');
console.log('CMS website messages, async-widget locale isolation, interpolation and URL switching passed');
