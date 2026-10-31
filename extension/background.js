import { findDuplicateGroups, findOriginal, searchTabs, tabUrl } from "./lib/duplicates.js";
import { addToList, getSettings, setSettings } from "./lib/settings.js";
import { domainOf, isDedupable, normalizeUrl } from "./lib/url.js";

const ALLOW_ONCE_MS = 15_000;
const SETTLE_MS = 3_000;
const STARTUP_QUIET_MS = 5_000;
const RECENT_MAX = 30;

const lastUrl = new Map();
const settling = new Map();
const allowOnce = new Map();
const allowedTabs = new Map();
const inFlight = new Set();
let quietUntil = 0;

const ready = chrome.tabs.query({}).then((tabs) => {
  for (const t of tabs) lastUrl.set(t.id, tabUrl(t));
});

// Chrome restores the previous session on startup; don't close restored tabs.
chrome.runtime.onStartup.addListener(() => {
  quietUntil = Date.now() + STARTUP_QUIET_MS;
});

function grantAllowOnce(url) {
  allowOnce.set(normalizeUrl(url), Date.now() + ALLOW_ONCE_MS);
}

function consumeAllowance(tabId, url) {
  const key = normalizeUrl(url);
  if (allowedTabs.get(tabId) === key) return true;
  allowedTabs.delete(tabId);
  const until = allowOnce.get(key);
  if (!until) return false;
  allowOnce.delete(key);
  if (until < Date.now()) return false;
  allowedTabs.set(tabId, key);
  return true;
}

async function checkNavigation(tab, url) {
  if (inFlight.has(tab.id)) return;
  inFlight.add(tab.id);
  try {
    await ready;
    const prev = lastUrl.get(tab.id);
    lastUrl.set(tab.id, url);
    if (prev === url || tab.discarded || Date.now() < quietUntil) return;
    if ((settling.get(tab.id) ?? 0) > Date.now()) return;
    if (consumeAllowance(tab.id, url)) return;
    const settings = await getSettings();
    if (settings.paused) return;
    const tabs = await chrome.tabs.query({});
    const original = findOriginal({ ...tab, url, pendingUrl: undefined }, tabs, settings);
    if (!original) return;
    settling.set(tab.id, Date.now() + SETTLE_MS);
    await resolveDuplicate(tab, url, prev, original, settings);
  } catch (err) {
    console.warn("No Dupe Tabs: failed to handle navigation", err);
  } finally {
    inFlight.delete(tab.id);
  }
}

async function resolveDuplicate(tab, url, prev, original, settings) {
  // A tab that already showed a real page is sent back to it. tabs.goBack is
  // unreliable here: browser-initiated navigations aren't committed yet when
  // onUpdated reports the new URL, so going back would skip a page.
  const closed = !prev || !isDedupable(prev);
  if (closed) await chrome.tabs.remove(tab.id).catch(() => {});
  else await chrome.tabs.update(tab.id, { url: prev });

  if (closed && settings.moveOriginal === "toDuplicate" && !original.pinned) {
    const index = original.windowId === tab.windowId && original.index < tab.index ? tab.index - 1 : tab.index;
    await chrome.tabs.move(original.id, { windowId: tab.windowId, index }).catch(() => {});
  }
  await focusTab(original);
  if (settings.reloadOriginal) await chrome.tabs.reload(original.id);
  await recordPrevented(url, original);
  if (settings.notify) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Switched to an already-open tab",
      message: original.title || url,
    });
  }
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  const { windowId } = await chrome.tabs.get(tab.id);
  await chrome.windows.update(windowId, { focused: true });
}

async function recordPrevented(url, original) {
  const { recent = [], preventedCount = 0 } = await chrome.storage.local.get(["recent", "preventedCount"]);
  recent.unshift({ url, title: original.title || url, at: Date.now() });
  await chrome.storage.local.set({ recent: recent.slice(0, RECENT_MAX), preventedCount: preventedCount + 1 });
}

async function closeDuplicates() {
  const [settings, tabs] = await Promise.all([getSettings(), chrome.tabs.query({})]);
  const ids = findDuplicateGroups(tabs, settings).flatMap((g) => g.duplicates.map((t) => t.id));
  if (ids.length) await chrome.tabs.remove(ids);
  return ids.length;
}

async function togglePause() {
  const { paused } = await getSettings();
  await setSettings({ paused: !paused });
  return !paused;
}

async function exemptSite(url) {
  const settings = await getSettings();
  if (settings.listMode === "block") {
    const lower = (url || "").toLowerCase();
    await setSettings({ list: settings.list.filter((e) => !lower.includes(e.toLowerCase())) });
    return true;
  }
  return addToList(domainOf(url));
}

async function openAllowed(url, fromTab) {
  if (!url) return;
  grantAllowOnce(url);
  await chrome.tabs.create(
    fromTab
      ? { url, windowId: fromTab.windowId, index: fromTab.index + 1, openerTabId: fromTab.id, active: false }
      : { url },
  );
}

let badgeTimer;
function scheduleBadge() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => updateBadge().catch((e) => console.warn("No Dupe Tabs: badge", e)), 150);
}

async function updateBadge() {
  const [settings, tabs] = await Promise.all([getSettings(), chrome.tabs.query({})]);
  const count = findDuplicateGroups(tabs, settings).reduce((n, g) => n + g.duplicates.length, 0);
  let title = "No Dupe Tabs";
  if (settings.paused) title += " (paused)";
  else if (count) title += `: ${count} duplicate tab${count === 1 ? "" : "s"}`;
  await chrome.action.setBadgeBackgroundColor({ color: settings.paused ? "#757575" : "#d32f2f" });
  await chrome.action.setBadgeText({ text: settings.paused ? "off" : count ? String(count) : "" });
  await chrome.action.setTitle({ title });
}

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.pendingUrl) checkNavigation(tab, tab.pendingUrl);
  scheduleBadge();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) checkNavigation(tab, changeInfo.url);
  if (changeInfo.url || changeInfo.groupId !== undefined || changeInfo.pinned !== undefined) scheduleBadge();
});
chrome.tabs.onRemoved.addListener((tabId) => {
  lastUrl.delete(tabId);
  settling.delete(tabId);
  allowedTabs.delete(tabId);
  scheduleBadge();
});
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  lastUrl.set(addedTabId, lastUrl.get(removedTabId));
  lastUrl.delete(removedTabId);
  scheduleBadge();
});
chrome.tabs.onAttached.addListener(scheduleBadge);
chrome.tabs.onDetached.addListener(scheduleBadge);
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "sync") scheduleBadge();
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "open-allowed", title: "Open link in new tab (allow duplicate)", contexts: ["link"] });
    chrome.contextMenus.create({ id: "exempt-site", title: "Allow duplicate tabs on this site", contexts: ["page"] });
    chrome.contextMenus.create({ id: "close-duplicates", title: "Close all duplicate tabs", contexts: ["action"] });
    chrome.contextMenus.create({ id: "toggle-pause", title: "Pause / resume duplicate prevention", contexts: ["action"] });
  });
  scheduleBadge();
});
chrome.runtime.onStartup.addListener(scheduleBadge);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open-allowed") openAllowed(info.linkUrl, tab);
  else if (info.menuItemId === "exempt-site") exemptSite(info.pageUrl);
  else if (info.menuItemId === "close-duplicates") closeDuplicates();
  else if (info.menuItemId === "toggle-pause") togglePause();
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "close-duplicates") return closeDuplicates();
  if (command === "toggle-pause") return togglePause();
  if (command === "exempt-site") {
    const target = tab ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (target?.url) return exemptSite(target.url);
  }
});

const escapeXml = (s) =>
  s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);

chrome.omnibox.setDefaultSuggestion({ description: "Switch to the best matching open tab" });
chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const hits = searchTabs(await chrome.tabs.query({}), text).slice(0, 8);
  suggest(
    hits.map((t) => ({
      content: `tab:${t.id}`,
      description: `${escapeXml(t.title || "")} - <url>${escapeXml(tabUrl(t))}</url>`,
    })),
  );
});
chrome.omnibox.onInputEntered.addListener(async (text) => {
  const id = /^tab:(\d+)$/.exec(text)?.[1];
  const tab = id
    ? await chrome.tabs.get(Number(id)).catch(() => null)
    : searchTabs(await chrome.tabs.query({}), text)[0];
  if (tab) await focusTab(tab);
});

const messageHandlers = {
  closeDuplicates: () => closeDuplicates(),
  togglePause: () => togglePause(),
  openAllowed: (msg) => openAllowed(msg.url),
  exemptSite: (msg) => exemptSite(msg.url),
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = messageHandlers[msg?.type];
  if (!handler) return false;
  Promise.resolve(handler(msg)).then(
    (result) => sendResponse({ ok: true, result }),
    (err) => sendResponse({ ok: false, error: String(err) }),
  );
  return true;
});
