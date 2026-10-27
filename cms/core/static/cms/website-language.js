(() => {
  const messages = JSON.parse(document.getElementById('cms-website-messages').textContent);
  window.CMSWebsiteI18n = {
    locale: document.documentElement.lang,
    t(source, params = {}) {
      return (messages[source] || source).replace(/\{(\w+)\}/g, (match, key) => params[key] ?? match);
    }
  };
})();
