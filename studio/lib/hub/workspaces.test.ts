// Workspaces, the script library and load errors. Pure code, synthetic values only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WORKSPACES, workspaceByKey, tabFor, workspaceHrefForModule, listHrefForModule } from "./workspaces.ts";
import { MODULES, moduleByKey, parseFields, loadError } from "./modules.ts";
import { GRANTABLE_SECTIONS } from "../sections.ts";
import { NAV, NAV_ALIASES, navFor } from "./nav.ts";
import { scriptFormat, safeFileName, scriptStoragePath, isScriptPath, formatBytes, MAX_SCRIPT_BYTES } from "./script-files.ts";

const ID = "22222222-2222-4222-8222-222222222222";

test("nav: Dashboard holds only the Studio Overview", () => {
  const dash = NAV.find((g) => g.key === "dashboard")!;
  assert.deepEqual(dash.items.map((i) => i.href), ["/"]);
});
test("nav: no duplicate destinations in the sidebar", () => {
  const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const old of ["/shoot-schedule", "/call-sheets", "/editing", "/deliverables", "/festivals", "/releases", "/administration"]) {
    assert.ok(!hrefs.includes(old), `${old} is a tab now, not a sidebar entry`);
  }
});
test("nav: Applications, Casting and Crew are separate entries", () => {
  const pre = NAV.find((g) => g.key === "preproduction")!.items.map((i) => i.href);
  for (const h of ["/applications", "/casting", "/crew", "/scheduling"]) assert.ok(pre.includes(h), h);
});
test("nav: crew-only people see Crew, not Applications (read under Casting access) or Settings", () => {
  const keys = navFor(false, [{ production_id: ID, section_key: "crew", level: "view" }]).flatMap((g) => g.items.map((i) => i.href));
  assert.ok(keys.includes("/crew"));
  for (const h of ["/applications", "/casting", "/settings"]) assert.ok(!keys.includes(h), h);
});
test("nav: every alias points at a sidebar entry", () => {
  const hrefs = new Set(NAV.flatMap((g) => g.items.map((i) => i.href)));
  for (const [from, to] of Object.entries(NAV_ALIASES)) assert.ok(hrefs.has(to), `${from} -> ${to}`);
});
test("every module is reachable from the sidebar or a workspace tab", () => {
  const hrefs = new Set(NAV.flatMap((g) => g.items.map((i) => i.href)));
  const children = new Set(MODULES.flatMap((m) => (m.child ? [m.child.module] : [])));
  for (const m of MODULES) {
    if (children.has(m.key)) continue; // edited on the parent record's page
    if (m.hidden && m.studioLevel === "never") continue; // per-production only, opened from a production's page
    const where = listHrefForModule(m.key).split("?")[0];
    assert.ok(hrefs.has(where), `${m.key} opens at ${where}`);
  }
});

test("workspaces: tabs reference real modules and sections; keys are unique", () => {
  for (const ws of WORKSPACES) {
    assert.ok((GRANTABLE_SECTIONS as readonly string[]).includes(ws.section), ws.key);
    const keys = ws.tabs.map((t) => t.key);
    assert.equal(new Set(keys).size, keys.length, `${ws.key} tab keys`);
    for (const t of ws.tabs) {
      assert.ok(Boolean(t.module) !== Boolean(t.view), `${ws.key}.${t.key} is a module or a view`);
      if (t.module) assert.ok(moduleByKey(t.module), `${ws.key}.${t.key} module ${t.module}`);
      if (t.section) assert.ok((GRANTABLE_SECTIONS as readonly string[]).includes(t.section), `${ws.key}.${t.key} section`);
    }
  }
});
test("workspaces: the requested tab sets", () => {
  const labels = (k: string) => workspaceByKey(k)!.tabs.map((t) => t.key);
  assert.deepEqual(labels("scheduling"), ["calendar", "events", "shoot-days", "call-sheets"]);
  assert.deepEqual(labels("post"), ["editing", "deliverables"]);
  assert.deepEqual(labels("distribution"), ["festivals", "releases"]);
  assert.deepEqual(labels("applications"), ["cast", "crew"]);
});
test("workspaces: an unknown tab falls back to the first", () => {
  const ws = workspaceByKey("scheduling")!;
  assert.equal(tabFor(ws, "nope").key, "calendar");
  assert.equal(tabFor(ws, "call-sheets").module, "call-sheets");
});
test("workspaces: moved modules open their tab", () => {
  assert.equal(workspaceHrefForModule("call-sheets"), "/scheduling?tab=call-sheets");
  assert.equal(workspaceHrefForModule("festivals"), "/distribution?tab=festivals");
  assert.equal(workspaceHrefForModule("crew-roster"), "/crew?tab=roster");
  assert.equal(workspaceHrefForModule("scripts"), null);
  assert.equal(listHrefForModule("scheduling"), "/scheduling?tab=events");
  assert.equal(listHrefForModule("scripts"), "/scripts");
});

test("scripts: only PDF and Fountain files are accepted", () => {
  assert.equal(scriptFormat("Draft 3.PDF")?.mime, "application/pdf");
  assert.equal(scriptFormat("pilot.fountain")?.ext, "fountain");
  for (const bad of ["pilot.docx", "pilot.fdx", "pilot", "x.pdf.exe"]) assert.equal(scriptFormat(bad), null, bad);
});
test("scripts: storage paths are safe and scoped to the record", () => {
  const p = scriptStoragePath(ID, "Lové / Me ../Draft 2.fountain", 1700000000000);
  assert.equal(p, `scripts/${ID}/1700000000000-Love-Me-Draft-2.fountain`);
  assert.ok(isScriptPath(ID, p));
  assert.ok(!isScriptPath(ID, `scripts/${ID}/../x.pdf`));
  assert.ok(!isScriptPath(ID, `scripts/${ID}/a/b.pdf`));
  assert.ok(!isScriptPath("33333333-3333-4333-8333-333333333333", p));
  assert.equal(safeFileName("..."), "file");
  assert.ok(safeFileName("a".repeat(500) + ".pdf").endsWith(".pdf"));
});
test("scripts: size labels and the 50 MB limit", () => {
  assert.equal(formatBytes(0), "");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
  assert.equal(MAX_SCRIPT_BYTES, 52428800, "matches the database check");
});
test("scripts: the stored file name is read-only in the form", () => {
  const def = moduleByKey("scripts")!;
  const r = parseFields(def, (k) => ({ title: "Pilot", kind: "script", file_name: "evil.pdf" } as Record<string, string>)[k]);
  assert.ok(r.ok);
  if (r.ok) assert.ok(!("file_name" in r.values));
});

test("load errors: a missing table is a setup step, anything else a failure", () => {
  assert.equal(loadError(null), null);
  assert.equal(loadError({ code: "PGRST205" }), "setup");
  assert.equal(loadError({ code: "42P01" }), "setup");
  assert.equal(loadError({ code: "42501" }), "failed");
  assert.equal(loadError({}), "failed");
});
