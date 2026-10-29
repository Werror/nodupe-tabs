import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const EXTENSION = path.resolve(import.meta.dirname, "../../extension");
const HEADLESS = process.env.HEADLESS !== "0";
const STARTUP_QUIET_MS = 5_500;

let context, worker, server, base, extensionId, userDataDir;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(probe, predicate, message, timeout = 6000) {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    value = await probe();
    if (predicate(value)) return value;
    await sleep(100);
  }
  assert.fail(`${message}; last value: ${JSON.stringify(value)}`);
}

const sw = (fn, arg) => worker.evaluate(fn, arg);
const tabs = () =>
  sw(async () => (await chrome.tabs.query({})).map((t) => ({ id: t.id, url: t.pendingUrl || t.url, active: t.active })));
const urls = (list, p) => list.filter((t) => t.url === base + p);
const setSettings = (patch) => sw((p) => chrome.storage.sync.set(p), patch);
const open = (p) => sw((url) => chrome.tabs.create({ url }).then((t) => t.id), base + p);
const status = (id) => sw((id) => chrome.tabs.get(id).then((t) => t.status, () => "gone"), id);
const badge = () => sw(() => chrome.action.getBadgeText({}));

async function openAndLoad(p) {
  const id = await open(p);
  await waitFor(() => status(id), (s) => s === "complete" || s === "gone", `tab ${p} to load`);
  return id;
}
const waitGone = (id, why) => waitFor(() => status(id), (s) => s === "gone", why);
async function assertStays(id) {
  await sleep(800);
  assert.equal(await status(id), "complete", "tab should stay open");
}

async function openPopup() {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await page.waitForSelector("#list li");
  return page;
}

before(async () => {
  server = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(`<!doctype html><title>Page ${req.url}</title><h1>${req.url}</h1><a id="to-a" href="/a">to a</a>`);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://localhost:${server.address().port}`;

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodupe-e2e-"));
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      ...(HEADLESS ? ["--headless=new"] : []),
    ],
  });
  const isOurs = (w) => w.url().endsWith("/background.js");
  worker = context.serviceWorkers().find(isOurs);
  while (!worker) {
    const w = await context.waitForEvent("serviceworker");
    if (isOurs(w)) worker = w;
  }
  extensionId = new URL(worker.url()).host;
  await sleep(STARTUP_QUIET_MS);
});

after(async () => {
  await context?.close();
  server?.close();
  if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await sw(async () => {
    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();
    const existing = await chrome.tabs.query({});
    const [win] = await chrome.windows.getAll();
    if (win) await chrome.tabs.create({ windowId: win.id, url: "about:blank" });
    else await chrome.windows.create({ url: "about:blank" });
    if (existing.length) await chrome.tabs.remove(existing.map((t) => t.id));
  });
  await sleep(300);
});

test("a new tab for an already-open URL is closed and the original is focused", async () => {
  const a = await openAndLoad("/a");
  await openAndLoad("/b");
  const dupe = await open("/a");
  await waitGone(dupe, "duplicate tab closed");
  await waitFor(tabs, (l) => l.find((t) => t.id === a)?.active, "original tab active");
  assert.equal(urls(await tabs(), "/a").length, 1);
});

test("navigating an existing tab to an open URL sends it back instead of closing it", async () => {
  const a = await openAndLoad("/a");
  const c = await openAndLoad("/c");
  await sw(({ id, url }) => chrome.tabs.update(id, { url }), { id: c, url: base + "/a" });
  await waitFor(
    tabs,
    (l) => l.find((t) => t.id === a)?.active && l.find((t) => t.id === c)?.url === base + "/c",
    "tab went back to /c and /a is focused",
  );
});

test("clicking a link to an open URL keeps the page you were on", async () => {
  const a = await openAndLoad("/a");
  const page = await context.newPage();
  await page.goto(base + "/c");
  await page.click("#to-a");
  await waitFor(tabs, (l) => l.find((t) => t.id === a)?.active, "/a is focused");
  await page.waitForURL(base + "/c");
  assert.equal(urls(await tabs(), "/a").length, 1);
});

test("query strings only matter when ignoreQuery is off", async () => {
  await openAndLoad("/q?x=1");
  await assertStays(await openAndLoad("/q?x=2"));
  await setSettings({ ignoreQuery: true });
  await waitGone(await open("/q?x=3"), "query-only duplicate closed");
});

test("allow-listed URLs and pause let duplicates through; badge counts them", async () => {
  await setSettings({ list: ["/allowed"] });
  await openAndLoad("/allowed");
  await assertStays(await openAndLoad("/allowed"));

  await setSettings({ list: [], paused: true });
  await waitFor(badge, (t) => t === "off", "badge shows paused");
  await openAndLoad("/p");
  await assertStays(await openAndLoad("/p"));

  await setSettings({ paused: false });
  await waitFor(badge, (t) => t === "2", "badge counts two duplicates");
});

test("single-tab domains keep one tab per site", async () => {
  await setSettings({ singleTabDomains: ["localhost"] });
  await openAndLoad("/one");
  await waitGone(await open("/two"), "second page on same domain closed");
});

test("same-window scope allows the URL in another window", async () => {
  await setSettings({ scope: "window" });
  await openAndLoad("/w");
  const other = await sw((url) => chrome.windows.create({ url }).then((w) => w.tabs[0].id), base + "/w");
  await assertStays(other);
});

test("popup lists duplicates and closes them all", async () => {
  await setSettings({ paused: true });
  await openAndLoad("/d");
  await openAndLoad("/d");
  await setSettings({ paused: false });
  const popup = await openPopup();
  await popup.click('nav button[data-view="duplicates"]');
  assert.equal((await popup.textContent("#count-dupes")).trim(), "1");
  await popup.click("#close-all");
  await waitFor(tabs, (l) => urls(l, "/d").length === 1, "duplicates closed");
});

test("popup search filters tabs, and Recently prevented can reopen a duplicate", async () => {
  await openAndLoad("/alpha");
  await openAndLoad("/beta");
  await waitGone(await open("/alpha"), "duplicate closed");

  const popup = await openPopup();
  await popup.fill("#search", "beta");
  await waitFor(
    () => popup.$$eval("#list .row .sub", (els) => els.map((e) => e.textContent)),
    (l) => l.length === 1 && l[0].endsWith("/beta"),
    "search shows only /beta",
  );
  await popup.fill("#search", "");
  await popup.click('nav button[data-view="recent"]');
  await popup.click("#list .row .act");
  await waitFor(tabs, (l) => urls(l, "/alpha").length === 2, "duplicate reopened");
  await sleep(800);
  assert.equal(urls(await tabs(), "/alpha").length, 2, "reopened duplicate stays open");
});
