import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(path.join(root, "extension/manifest.json"), "utf8"));
const out = path.join(root, "dist", `nodupe-tabs-${version}.zip`);
mkdirSync(path.dirname(out), { recursive: true });
rmSync(out, { force: true });
execFileSync("zip", ["-r", "-X", "-q", out, "."], { cwd: path.join(root, "extension"), stdio: "inherit" });
console.log(path.relative(root, out));
