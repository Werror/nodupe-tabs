import { test } from "node:test";
import assert from "node:assert/strict";
import { domainOf, isDedupable, normalizeUrl, stripForPrefix } from "../../extension/lib/url.js";

test("normalizeUrl keeps hash and query by default", () => {
  assert.equal(normalizeUrl("https://a.com/x?y=1#z"), "https://a.com/x?y=1#z");
});

test("normalizeUrl drops hash and query when asked", () => {
  assert.equal(normalizeUrl("https://a.com/x?y=1#z", { ignoreHash: true }), "https://a.com/x?y=1");
  assert.equal(normalizeUrl("https://a.com/x?y=1#z", { ignoreQuery: true }), "https://a.com/x#z");
  assert.equal(normalizeUrl("https://a.com/x?y=1#z", { ignoreHash: true, ignoreQuery: true }), "https://a.com/x");
});

test("normalizeUrl treats trailing slash, empty hash and empty query as equal", () => {
  assert.equal(normalizeUrl("https://a.com/x/"), normalizeUrl("https://a.com/x"));
  assert.equal(normalizeUrl("https://a.com/x#"), "https://a.com/x");
  assert.equal(normalizeUrl("https://a.com/x?"), "https://a.com/x");
  assert.equal(normalizeUrl("https://a.com"), "https://a.com/");
});

test("normalizeUrl tolerates invalid input", () => {
  assert.equal(normalizeUrl("not a url"), "not a url");
  assert.equal(normalizeUrl(undefined), "");
});

test("domainOf strips www and lowercases", () => {
  assert.equal(domainOf("https://WWW.Example.com/a"), "example.com");
  assert.equal(domainOf("garbage"), "");
});

test("stripForPrefix removes protocol, www, query and hash", () => {
  assert.equal(stripForPrefix("https://www.a.com/Path?q#h"), "a.com/path");
});

test("isDedupable skips blank and new-tab pages", () => {
  assert.equal(isDedupable("about:blank"), false);
  assert.equal(isDedupable("chrome://newtab/"), false);
  assert.equal(isDedupable("chrome://settings/"), true);
  assert.equal(isDedupable("https://a.com"), true);
  assert.equal(isDedupable(""), false);
});
