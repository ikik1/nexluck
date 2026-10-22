export const t = (source, params = {}) =>
  (window.CMSWebsiteI18n || window.NexLuckI18n)?.t(source, params) || source;
