# Interface and website localization

Supported languages are English (`en`), Russian (`ru`), Portuguese for Portugal
(`pt-PT`), Portuguese for Brazil (`pt-BR`) and Spanish for Spain (`es`).
The compact header selector uses EN, RU, PT, BR and ES respectively.

`crm.json` and `cms.json` are the editable UI catalogs. English source strings
are stable translation keys; identifiers, user-entered content, casino names
and stored enum values are not translated in storage.

After editing a catalog, run:

```sh
python3 localization/build_catalog.py
```

Validate catalog consistency and the shared selector with:

```sh
python3 -m unittest discover -s localization
node localization/runtime_test.cjs
python3 crm/api/test/localization_browser_test.py
```

Commit the resulting `catalog.js` with the JSON change. `runtime.js` supplies
explicit text interpolation, escaped HTML helpers and the shared interface
language selector. CRM loads these resources from `/localization/`; CMS exposes
the same resources through `/cms/i18n/`. Both use the browser preference
`nexluck.ui.language` and the `nexluck_language` cookie. English is the default.
The interface language is separate from a casino website's content language.

Use `NexLuckI18n.t(source, {name: value})` for plain text or React children.
Use `NexLuckI18n.html` when inserting a translation into an HTML string.
Templates explicitly mark static text with `data-i18n` and text attributes with
`data-i18n-title`, `data-i18n-placeholder` or `data-i18n-aria-label`.
No business content is traversed or automatically translated.

Language changes send a cancelable `nexluck:before-language-change` event so
editors can protect unsaved work before the preference is saved and the page
reloads. Unsupported languages are rejected. Missing translations use their
English source, never an unrelated language or altered business identifier.

CRM clients send a supported locale in `Accept-Language`. Regional variants are
preserved for Portuguese; bare `pt` defaults to Portugal and `es-ES` selects `es`.
Error messages are localized;
JSON field names, protocol codes and successful business records stay unchanged.
Responses identify their language with `Content-Language`.

## Publishing

Build the catalog before packaging CRM or CMS. Publish the root `localization/`
directory alongside `crm/` in both the public webroot and private CRM API
release: the browser needs the generated scripts and the Ruby API reads
`crm.json`. CMS images copy this directory automatically from the repository
build context. Apply CMS migrations before starting the upgraded application;
module translations are persisted by `0003_contentblock_translations`.

Website content languages are independent of the shared interface setting.
Choose a language in CMS module Properties to edit that locale's overrides, then
save and publish. Casino pages select content with `?lang=en`, `?lang=ru`,
`?lang=pt-PT`, `?lang=pt-BR` or `?lang=es`.
Properties without an override retain their English content. These overrides are
authored content, not automatic translations of user-entered website text.
