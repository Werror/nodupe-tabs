const NEVER_DEDUPE = [/^about:blank$/i, /^chrome:\/\/(newtab|new-tab-page)\/?$/i, /^edge:\/\/newtab\/?$/i, /^chrome-search:/i];

export function parseUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function normalizeUrl(raw, { ignoreHash = false, ignoreQuery = false } = {}) {
  const u = parseUrl(raw);
  if (!u) return raw || "";
  if (ignoreHash) u.hash = "";
  if (ignoreQuery) u.search = "";
  let href = u.href;
  if (href.endsWith("#")) href = href.slice(0, -1);
  if (href.endsWith("?")) href = href.slice(0, -1);
  if (!u.search && !u.hash && u.pathname.length > 1 && href.endsWith("/")) href = href.slice(0, -1);
  return href;
}

export function domainOf(raw) {
  const u = parseUrl(raw);
  return u ? u.hostname.toLowerCase().replace(/^www\./, "") : "";
}

export function stripForPrefix(raw) {
  const u = parseUrl(raw);
  if (!u) return (raw || "").toLowerCase();
  return (u.host.replace(/^www\./, "") + u.pathname).toLowerCase();
}

export function isDedupable(raw) {
  return !!raw && !NEVER_DEDUPE.some((re) => re.test(raw));
}
