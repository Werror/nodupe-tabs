import { test } from "node:test";
import assert from "node:assert/strict";
import { findDuplicateGroups, findOriginal, searchTabs } from "../../extension/lib/duplicates.js";
import { isExempt, matchOptionsFor } from "../../extension/lib/rules.js";
import { DEFAULTS } from "../../extension/lib/settings.js";

const s = (patch = {}) => ({ ...DEFAULTS, ...patch });
const tab = (id, url, extra = {}) => ({ id, url, windowId: 1, groupId: -1, pinned: false, ...extra });

test("findOriginal finds an exact match and ignores itself", () => {
  const tabs = [tab(1, "https://a.com/x"), tab(2, "https://b.com"), tab(3, "https://a.com/x")];
  assert.equal(findOriginal(tabs[2], tabs, s()).id, 1);
  assert.equal(findOriginal(tabs[1], tabs, s()), null);
});

test("findOriginal uses pendingUrl of the candidate", () => {
  const tabs = [tab(1, "https://a.com/x"), { ...tab(2, ""), pendingUrl: "https://a.com/x" }];
  assert.equal(findOriginal(tabs[1], tabs, s()).id, 1);
});

test("findOriginal prefers pinned, then oldest", () => {
  const tabs = [tab(5, "https://a.com"), tab(9, "https://a.com", { pinned: true }), tab(3, "https://a.com"), tab(10, "https://a.com")];
  assert.equal(findOriginal(tabs[3], tabs, s()).id, 9);
  assert.equal(findOriginal(tabs[3], tabs.slice(0, 1).concat(tabs.slice(2)), s()).id, 3);
});

test("query and hash only ignored when configured", () => {
  const tabs = [tab(1, "https://a.com/x?p=1#h"), tab(2, "https://a.com/x?p=2")];
  assert.equal(findOriginal(tabs[1], tabs, s()), null);
  assert.equal(findOriginal(tabs[1], tabs, s({ ignoreQuery: true })), null);
  assert.equal(findOriginal(tabs[1], tabs, s({ ignoreQuery: true, ignoreHash: true })).id, 1);
});

test("per-prefix rules add ignore flags for matching URLs only", () => {
  const settings = s({ rules: [{ prefix: "docs.example.com/guide", ignoreHash: true, ignoreQuery: true }] });
  assert.deepEqual(matchOptionsFor("https://docs.example.com/guide/a?x#y", settings), { ignoreHash: true, ignoreQuery: true });
  assert.deepEqual(matchOptionsFor("https://docs.example.com/other?x", settings), { ignoreHash: false, ignoreQuery: false });
  const tabs = [tab(1, "https://docs.example.com/guide/a#one"), tab(2, "https://www.docs.example.com/guide/a?ref=2")];
  assert.equal(findOriginal(tabs[1], tabs, settings), null, "www vs non-www hosts differ in the URL itself");
  const tabs2 = [tab(1, "https://docs.example.com/guide/a#one"), tab(2, "https://docs.example.com/guide/a?ref=2")];
  assert.equal(findOriginal(tabs2[1], tabs2, settings).id, 1);
});

test("allow list exempts matching URLs; block list dedupes only matching URLs", () => {
  assert.equal(isExempt("https://mail.google.com/x", s({ list: ["mail.google.com"] })), true);
  assert.equal(isExempt("https://a.com", s({ list: ["mail.google.com"] })), false);
  assert.equal(isExempt("https://a.com", s({ listMode: "block", list: ["github.com"] })), true);
  assert.equal(isExempt("https://github.com/x", s({ listMode: "block", list: ["GitHub.com"] })), false);
  assert.equal(isExempt("chrome://newtab/", s()), true);
});

test("single-tab domains treat any page on the domain as a duplicate", () => {
  const settings = s({ singleTabDomains: ["www.youtube.com"], list: ["youtube.com"] });
  const tabs = [tab(1, "https://youtube.com/watch?v=1"), tab(2, "https://www.youtube.com/feed")];
  assert.equal(findOriginal(tabs[1], tabs, settings).id, 1);
});

test("scope limits matching to the same window or tab group", () => {
  const tabs = [tab(1, "https://a.com"), tab(2, "https://a.com", { windowId: 2 }), tab(3, "https://a.com", { groupId: 7 })];
  assert.equal(findOriginal(tabs[1], tabs, s({ scope: "window" })), null);
  assert.equal(findOriginal(tabs[2], tabs, s({ scope: "window" })).id, 1);
  assert.equal(findOriginal(tabs[2], tabs, s({ scope: "group" })), null);
  assert.equal(findOriginal(tabs[1], tabs, s({ scope: "all" })).id, 1);
});

test("incognito and normal tabs never match each other", () => {
  const tabs = [tab(1, "https://a.com"), tab(2, "https://a.com", { incognito: true })];
  assert.equal(findOriginal(tabs[1], tabs, s()), null);
});

test("findDuplicateGroups groups duplicates and never marks pinned tabs", () => {
  const tabs = [
    tab(1, "https://a.com"),
    tab(2, "https://a.com/"),
    tab(3, "https://a.com", { pinned: true }),
    tab(4, "https://b.com"),
    tab(5, "https://c.com"),
    tab(6, "https://c.com"),
  ];
  const groups = findDuplicateGroups(tabs, s());
  assert.equal(groups.length, 2);
  const a = groups.find((g) => g.original.id === 3);
  assert.deepEqual(a.duplicates.map((t) => t.id).sort(), [1, 2]);
  const c = groups.find((g) => g.original.id === 5);
  assert.deepEqual(c.duplicates.map((t) => t.id), [6]);
});

test("searchTabs ANDs terms over title and URL, pinned first", () => {
  const tabs = [
    { id: 1, title: "Bug 123 crash", url: "https://nvbugs/1", lastAccessed: 3 },
    { id: 2, title: "Docs", url: "https://docs/crash", lastAccessed: 5, pinned: true },
    { id: 3, title: "Other", url: "https://x", lastAccessed: 9 },
  ];
  assert.deepEqual(searchTabs(tabs, "crash").map((t) => t.id), [2, 1]);
  assert.deepEqual(searchTabs(tabs, "bug crash").map((t) => t.id), [1]);
  assert.deepEqual(searchTabs(tabs, "").map((t) => t.id), [2, 3, 1]);
});
