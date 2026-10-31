import { domainOf, isDedupable, normalizeUrl, stripForPrefix } from "./url.js";

export function matchOptionsFor(url, settings) {
  let ignoreHash = !!settings.ignoreHash;
  let ignoreQuery = !!settings.ignoreQuery;
  if (ignoreHash && ignoreQuery) return { ignoreHash, ignoreQuery };
  const target = stripForPrefix(url);
  const rule = (settings.rules || []).find((r) => {
    const prefix = stripForPrefix(r.prefix.includes("://") ? r.prefix : `https://${r.prefix}`);
    return prefix && target.startsWith(prefix);
  });
  if (rule) {
    ignoreHash ||= !!rule.ignoreHash;
    ignoreQuery ||= !!rule.ignoreQuery;
  }
  return { ignoreHash, ignoreQuery };
}

function listMatches(url, list) {
  const lower = url.toLowerCase();
  return (list || []).some((entry) => entry && lower.includes(entry.toLowerCase()));
}

export function isExempt(url, settings) {
  if (!isDedupable(url)) return true;
  if (isSingleTabDomain(url, settings)) return false;
  const matched = listMatches(url, settings.list);
  return settings.listMode === "block" ? !matched : matched;
}

export function isSingleTabDomain(url, settings) {
  const domain = domainOf(url);
  return !!domain && (settings.singleTabDomains || []).some((d) => d.toLowerCase().replace(/^www\./, "") === domain);
}

export function dedupeKey(url, settings, options = matchOptionsFor(url, settings)) {
  if (isSingleTabDomain(url, settings)) return `domain:${domainOf(url)}`;
  return `url:${normalizeUrl(url, options)}`;
}

export function parseLines(text) {
  return [...new Set((text || "").split("\n").map((s) => s.trim()).filter(Boolean))];
}

export function parseRules(text) {
  const rules = [];
  const errors = [];
  (text || "").split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const [prefix, ...flags] = line.split(/\s+/);
    const lower = flags.map((f) => f.toLowerCase());
    if (!lower.length || lower.some((f) => f !== "query" && f !== "hash")) {
      errors.push(`Line ${i + 1}: expected "<url prefix> query|hash", got "${line}"`);
      return;
    }
    rules.push({ prefix, ignoreQuery: lower.includes("query"), ignoreHash: lower.includes("hash") });
  });
  return { rules, errors };
}

export function formatRules(rules) {
  return (rules || [])
    .map((r) => [r.prefix, r.ignoreQuery && "query", r.ignoreHash && "hash"].filter(Boolean).join(" "))
    .join("\n");
}
