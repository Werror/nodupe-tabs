import { dedupeKey, isExempt, matchOptionsFor } from "./rules.js";

export function tabUrl(tab) {
  return tab.pendingUrl || tab.url || "";
}

function scopeKey(tab, scope) {
  if (scope === "window") return `w${tab.windowId}`;
  if (scope === "group") return `w${tab.windowId}:g${tab.groupId ?? -1}`;
  return "all";
}

function preferOriginal(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? a : b;
  return a.id <= b.id ? a : b;
}

export function findOriginal(candidate, tabs, settings) {
  const url = tabUrl(candidate);
  if (!url || isExempt(url, settings)) return null;
  const options = matchOptionsFor(url, settings);
  const key = dedupeKey(url, settings, options);
  const scope = scopeKey(candidate, settings.scope);
  let original = null;
  for (const tab of tabs) {
    if (tab.id === candidate.id || !!tab.incognito !== !!candidate.incognito) continue;
    const other = tabUrl(tab);
    if (!other || scopeKey(tab, settings.scope) !== scope) continue;
    if (dedupeKey(other, settings, options) !== key) continue;
    original = original ? preferOriginal(original, tab) : tab;
  }
  return original;
}

export function findDuplicateGroups(tabs, settings) {
  const groups = new Map();
  for (const tab of tabs) {
    const url = tabUrl(tab);
    if (!url || isExempt(url, settings)) continue;
    const key = `${tab.incognito ? "i" : "n"}|${scopeKey(tab, settings.scope)}|${dedupeKey(url, settings)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tab);
  }
  const result = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const original = members.reduce(preferOriginal);
    const duplicates = members.filter((t) => t !== original && !t.pinned);
    if (duplicates.length) result.push({ original, duplicates });
  }
  return result;
}

export function searchTabs(tabs, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = terms.length
    ? tabs.filter((t) => {
        const hay = `${t.title || ""} ${tabUrl(t)}`.toLowerCase();
        return terms.every((term) => hay.includes(term));
      })
    : tabs.slice();
  return hits.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
}
