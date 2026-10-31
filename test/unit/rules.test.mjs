import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRules, parseLines, parseRules } from "../../extension/lib/rules.js";

test("parseLines trims, drops blanks and duplicates", () => {
  assert.deepEqual(parseLines(" a.com \n\nb.com\na.com\n"), ["a.com", "b.com"]);
});

test("parseRules reads prefix and flags, reports bad lines", () => {
  const { rules, errors } = parseRules("docs.x.com/guide query hash\n\nnews.y.com HASH\nbad.com\nz.com foo");
  assert.deepEqual(rules, [
    { prefix: "docs.x.com/guide", ignoreQuery: true, ignoreHash: true },
    { prefix: "news.y.com", ignoreQuery: false, ignoreHash: true },
  ]);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /Line 4/);
  assert.match(errors[1], /Line 5/);
});

test("formatRules round-trips", () => {
  const text = "docs.x.com/guide query hash\nnews.y.com hash";
  assert.equal(formatRules(parseRules(text).rules), text);
});
