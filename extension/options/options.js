import { formatRules, parseLines, parseRules } from "../lib/rules.js";
import { DEFAULTS, getSettings, setSettings } from "../lib/settings.js";

const form = document.getElementById("form");
const fields = form.elements;
const CHECKBOXES = ["paused", "ignoreQuery", "ignoreHash", "reloadOriginal", "notify"];
const SELECTS = ["scope", "moveOriginal", "listMode"];

async function load() {
  const s = await getSettings();
  for (const key of CHECKBOXES) fields[key].checked = s[key];
  for (const key of SELECTS) fields[key].value = s[key];
  fields.list.value = s.list.join("\n");
  fields.singleTabDomains.value = s.singleTabDomains.join("\n");
  fields.rules.value = formatRules(s.rules);
}

let statusTimer;
function flash(text) {
  const status = document.getElementById("status");
  status.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (status.textContent = ""), 1500);
}

async function save() {
  const { rules, errors } = parseRules(fields.rules.value);
  document.getElementById("errors").textContent = errors.join("\n");
  if (errors.length) return;
  const patch = { rules, list: parseLines(fields.list.value), singleTabDomains: parseLines(fields.singleTabDomains.value) };
  for (const key of CHECKBOXES) patch[key] = fields[key].checked;
  for (const key of SELECTS) patch[key] = fields[key].value;
  await setSettings(patch);
  flash("Saved");
}

form.addEventListener("change", save);
form.addEventListener("submit", (e) => e.preventDefault());
document.getElementById("reset").addEventListener("click", async () => {
  await setSettings({ ...DEFAULTS });
  await load();
  flash("Reset to defaults");
});

load();
