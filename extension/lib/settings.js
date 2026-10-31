export const DEFAULTS = Object.freeze({
  paused: false,
  ignoreHash: false,
  ignoreQuery: false,
  scope: "all",
  listMode: "allow",
  list: [],
  singleTabDomains: [],
  rules: [],
  moveOriginal: "none",
  reloadOriginal: false,
  notify: false,
});

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export function setSettings(patch) {
  return chrome.storage.sync.set(patch);
}

export async function addToList(entry) {
  const { list } = await getSettings();
  if (!entry || list.includes(entry)) return false;
  await setSettings({ list: [...list, entry] });
  return true;
}
