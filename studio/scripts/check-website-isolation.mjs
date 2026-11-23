// Verifies that the public website's vercel.json keeps Studio OS isolated
// without touching any existing website route.
//
//  1. The /studio redirects match /studio and everything under it, so hub
//     source files are never served from bleuskm.com.
//  2. They match NO existing website route: every file in the repo outside
//     studio/ (with and without .html, as cleanUrls serves them), every API
//     route and its /.netlify/functions alias, and every path named in
//     netlify.toml and _headers.
//  3. Everything the website's vercel.json already had is unchanged.
//
// Run from studio/: npm run check:website-isolation
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { pathToRegexp } from "path-to-regexp";

const root = join(import.meta.dirname, "..", "..");
const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
let failures = 0;
const fail = (msg) => { failures++; console.error("FAIL " + msg); };
const pass = (msg) => console.log("ok   " + msg);

// Vercel matches "source" patterns with path-to-regexp v6 semantics.
const studioRedirects = (config.redirects || []).filter((r) => r.source.startsWith("/studio"));
if (studioRedirects.length !== 2) fail(`expected 2 /studio redirects, found ${studioRedirects.length}`);
const matchers = studioRedirects.map((r) => pathToRegexp(r.source));
const caught = (path) => matchers.some((re) => re.test(path));

for (const r of studioRedirects) {
  if (r.permanent !== false) fail(`${r.source} must be a temporary redirect`);
  // studio.bleuskm.com once that domain is attached to the hub project; until then the hub's Vercel address.
  if (!["https://studio.bleuskm.com/", "https://bleuskm-studio-os.vercel.app/"].some((d) => r.destination.startsWith(d))) fail(`${r.source} points somewhere unexpected: ${r.destination}`);
}

// 1. Hub paths are caught.
for (const p of ["/studio", "/studio/package.json", "/studio/app/page.tsx", "/studio/scripts/check-website-isolation.mjs"]) {
  caught(p) ? pass(`redirected: ${p}`) : fail(`not redirected: ${p}`);
}

// "/studio/" (trailing slash) is not matched by Vercel, which answers 404 as
// long as there is no studio/index.html for the website to serve. Keep it so.
for (const name of ["index.html", "index.htm"]) {
  try { statSync(join(root, "studio", name)); fail(`studio/${name} would be served at bleuskm.com/studio/`); } catch { pass(`no studio/${name}`); }
}

// 2. No existing website route is caught.
const skip = new Set([".git", "node_modules", "studio"]);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name) && dir === root) continue;
    if (name === "node_modules") continue;
    const full = join(dir, name);
    statSync(full).isDirectory() ? walk(full, out) : out.push(full);
  }
  return out;
}
const routes = new Set();
for (const file of walk(root)) {
  const url = "/" + relative(root, file).split(sep).join("/");
  routes.add(url);
  if (url.endsWith(".html")) {
    routes.add(url.slice(0, -5));
    if (url.endsWith("/index.html")) { routes.add(url.slice(0, -11) || "/"); routes.add(url.slice(0, -10)); }
  }
  const api = url.match(/^\/api\/([^/_][^/]*)\.js$/);
  if (api) { routes.add(`/api/${api[1]}`); routes.add(`/.netlify/functions/${api[1]}`); }
}
// netlify.toml was removed with the obsolete Netlify setup; read it if present.
try {
  for (const m of readFileSync(join(root, "netlify.toml"), "utf8").matchAll(/(?:from|to)\s*=\s*"([^"]+)"/g)) routes.add(m[1]);
} catch { /* no netlify.toml */ }
for (const line of readFileSync(join(root, "_headers"), "utf8").split("\n")) if (line.startsWith("/")) routes.add(line.trim());
// Near misses that must keep working (or keep 404ing) exactly as before.
for (const p of ["/studios", "/studio-os", "/studio.html", "/studiox", "/films/studio", "/portal", "/dashboard"]) routes.add(p);

// The legacy /dashboard (removed) now sends people to the hub. Approved by the
// owner (Nov 23 reorganization). It may catch only /dashboard paths.
const RETIRED = ["/dashboard"];
const retiredRedirects = (config.redirects || []).filter((r) => RETIRED.some((p) => r.source === p || r.source.startsWith(`${p}/`)));
for (const r of retiredRedirects) {
  if (r.permanent !== false) fail(`${r.source} must be a temporary redirect`);
  if (!["https://studio.bleuskm.com/", "https://bleuskm-studio-os.vercel.app/"].some((d) => r.destination.startsWith(d))) fail(`${r.source} points somewhere unexpected: ${r.destination}`);
}
const retiredMatchers = retiredRedirects.map((r) => pathToRegexp(r.source));
const liveRoutes = [...routes].filter((p) => !RETIRED.some((x) => p === x || p.startsWith(`${x}/`)));
const retiredHits = liveRoutes.filter((p) => retiredMatchers.some((re) => re.test(p)));
retiredHits.length ? fail(`routes caught by the /dashboard redirect: ${retiredHits.join(", ")}`) : pass("the /dashboard redirect catches only /dashboard");

const hits = [...routes].filter(caught);
hits.length ? fail(`existing routes caught by the redirect: ${hits.join(", ")}`) : pass(`none of ${routes.size} existing website routes is affected`);

// 3. Existing settings are unchanged compared with main.
let before;
try {
  before = JSON.parse(execFileSync("git", ["show", "origin/main:vercel.json"], { cwd: root, encoding: "utf8" }));
} catch {
  console.log("skip comparison with main (origin/main not available)");
}
if (before) {
  for (const key of Object.keys(before)) {
    if (key === "redirects") continue;
    JSON.stringify(before[key]) === JSON.stringify(config[key]) ? pass(`unchanged: ${key}`) : fail(`changed: ${key}`);
  }
  const ours = (r) => r.source.startsWith("/studio") || RETIRED.some((p) => r.source === p || r.source.startsWith(`${p}/`));
  const keptRedirects = (config.redirects || []).filter((r) => !ours(r));
  // Compare like with like: main may already carry the /studio redirects (once
  // they are merged), so leave them out of both sides.
  const beforeKept = (before.redirects || []).filter((r) => !ours(r));
  JSON.stringify(beforeKept) === JSON.stringify(keptRedirects) ? pass("unchanged: existing redirects") : fail("existing redirects changed");
  const added = Object.keys(config).filter((k) => !(k in before));
  const allowed = ["ignoreCommand", "redirects"];
  added.every((k) => allowed.includes(k)) ? pass(`only added: ${added.join(", ")}`) : fail(`unexpected new settings: ${added.join(", ")}`);
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll website isolation checks passed.");
