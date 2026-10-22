(() => {
  const messages = JSON.parse(document.getElementById('cms-website-messages').textContent);
  window.CMSWebsiteI18n = {
    locale: document.documentElement.lang,
    t(source, params = {}) {
      return (messages[source] || source).replace(/\{(\w+)\}/g, (match, key) => params[key] ?? match);
    }
  };
  document.getElementById('website-language').addEventListener('change', event => {
    const url = new URL(location.href);
    url.searchParams.set('lang', event.target.value);
    location.assign(url.href);
  });
})();
