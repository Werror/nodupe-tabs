import { findDuplicateGroups, searchTabs, tabUrl } from "../lib/duplicates.js";
import { getSettings, setSettings } from "../lib/settings.js";
import { domainOf } from "../lib/url.js";

const $ = (id) => document.getElementById(id);
const state = { tabs: [], settings: null, recent: [], activeTab: null, view: "tabs", selected: 0 };

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

function favicon(url) {
  const img = el("img", { className: "icon", alt: "" });
  if (url && /^(https?|data):/.test(url)) img.src = url;
  else img.classList.add("blank");
  img.onerror = () => img.classList.add("blank");
  return img;
}

function row({ iconUrl, title, sub, onOpen, actions = [] }) {
  const li = el(
    "li",
    { className: "row", title: sub },
    favicon(iconUrl),
    el("div", { className: "text" }, el("div", { className: "title", textContent: title || sub }), el("div", { className: "sub", textContent: sub })),
    ...actions.map(([label, tip, handler]) =>
      el("button", {
        className: "act",
        type: "button",
        textContent: label,
        title: tip,
        onclick: (e) => {
          e.stopPropagation();
          handler();
        },
      }),
    ),
  );
  li.addEventListener("click", onOpen);
  li.open = onOpen;
  return li;
}

const send = (msg) => chrome.runtime.sendMessage(msg);

async function switchTo(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  window.close();
}

async function closeTab(tab) {
  await chrome.tabs.remove(tab.id);
  await load();
}

const tabRow = (tab) =>
  row({
    iconUrl: tab.favIconUrl,
    title: tab.title,
    sub: tabUrl(tab),
    onOpen: () => switchTo(tab),
    actions: [["\u2715", "Close tab", () => closeTab(tab)]],
  });

const empty = (text) => el("li", { className: "empty", textContent: text });

function renderList() {
  const list = $("list");
  list.replaceChildren();
  const query = $("search").value;
  const groups = findDuplicateGroups(state.tabs, state.settings);
  $("close-all").hidden = state.view !== "duplicates" || groups.length === 0;

  if (state.view === "tabs") {
    const hits = searchTabs(state.tabs, query);
    list.append(...(hits.length ? hits.map(tabRow) : [empty("No matching tabs")]));
  } else if (state.view === "duplicates") {
    const shown = groups.filter((g) => searchTabs([g.original, ...g.duplicates], query).length);
    if (!shown.length) list.append(empty("No duplicate tabs"));
    for (const g of shown) {
      list.append(el("li", { className: "group", textContent: `${g.duplicates.length + 1} tabs: ${g.original.title || tabUrl(g.original)}` }));
      list.append(tabRow(g.original), ...g.duplicates.map(tabRow));
    }
  } else {
    const recent = state.recent.filter((r) => searchTabs([r], query).length);
    if (!recent.length) list.append(empty("Nothing prevented yet"));
    for (const r of recent) {
      list.append(
        row({
          title: r.title,
          sub: r.url,
          onOpen: () => send({ type: "openAllowed", url: r.url }),
          actions: [["Open again", "Open in a new tab even though it is a duplicate", () => send({ type: "openAllowed", url: r.url })]],
        }),
      );
    }
  }
  state.selected = Math.min(state.selected, Math.max(0, list.querySelectorAll(".row").length - 1));
  highlight();
}

function highlight() {
  $("list")
    .querySelectorAll(".row")
    .forEach((r, i) => r.classList.toggle("selected", i === state.selected));
  $("list").querySelector(".row.selected")?.scrollIntoView({ block: "nearest" });
}

function renderChrome() {
  const groups = findDuplicateGroups(state.tabs, state.settings);
  $("count-tabs").textContent = state.tabs.length;
  $("count-dupes").textContent = groups.reduce((n, g) => n + g.duplicates.length, 0) || "";
  const pause = $("pause");
  pause.textContent = state.settings.paused ? "Paused" : "On";
  pause.title = state.settings.paused ? "Resume duplicate prevention" : "Pause duplicate prevention";
  pause.classList.toggle("paused", state.settings.paused);
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));

  const exempt = $("exempt");
  const url = state.activeTab ? tabUrl(state.activeTab) : "";
  const domain = domainOf(url);
  const { listMode, list } = state.settings;
  const listed = list.some((e) => url.toLowerCase().includes(e.toLowerCase()));
  exempt.hidden = !/^https?:/.test(url) || !domain || (listMode === "allow" ? listed : !listed);
  exempt.textContent = `Allow duplicates on ${domain}`;
}

async function load() {
  const [tabs, settings, local, [activeTab]] = await Promise.all([
    chrome.tabs.query({}),
    getSettings(),
    chrome.storage.local.get({ recent: [] }),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  Object.assign(state, { tabs, settings, recent: local.recent, activeTab });
  renderChrome();
  renderList();
}

$("search").addEventListener("input", () => {
  state.selected = 0;
  renderList();
});
$("search").addEventListener("keydown", (e) => {
  const rows = $("list").querySelectorAll(".row");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const step = e.key === "ArrowDown" ? 1 : -1;
    state.selected = (state.selected + step + rows.length) % Math.max(rows.length, 1);
    highlight();
  } else if (e.key === "Enter") {
    rows[state.selected]?.open();
  }
});
document.querySelector("nav").addEventListener("click", (e) => {
  const view = e.target.closest("button")?.dataset.view;
  if (!view) return;
  state.view = view;
  state.selected = 0;
  renderChrome();
  renderList();
  $("search").focus();
});
$("pause").addEventListener("click", async () => {
  await setSettings({ paused: !state.settings.paused });
  await load();
});
$("options").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("exempt").addEventListener("click", async () => {
  await send({ type: "exemptSite", url: tabUrl(state.activeTab) });
  await load();
});
$("close-all").addEventListener("click", async () => {
  await send({ type: "closeDuplicates" });
  await load();
});

load();
