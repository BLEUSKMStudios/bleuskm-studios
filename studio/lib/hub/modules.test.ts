import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { MODULES, moduleByKey, parseFields, checkScope, selectColumns, optionLabel } from "./modules.ts";
import { NAV, navFor, groupForPath } from "./nav.ts";
import { writeBlockReason, commsSendBlockReason, integrations, PREVIEW_READ_ONLY } from "./env.ts";
import { aliasFor, replySubject, quoteOriginal } from "./comms.ts";
import { formatDay, daysBetween, addDays, relativeDay, studioToday } from "./dates.ts";
import { GRANTABLE_SECTIONS } from "../sections.ts";

const P1 = "11111111-1111-4111-8111-111111111111";
const form = (v: Record<string, string>) => (k: string) => v[k];

// ---------------------------------------------------------------------------
// Modules match the database
// ---------------------------------------------------------------------------
const migration = (f: string) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8");
const SQL = migration("20261124090000_studio_modules.sql");
// Later migrations extend those tables with `alter table … add column` / `add constraint … check`.
const LATER = readdirSync(new URL("../../supabase/migrations/", import.meta.url))
  .filter((f) => f.endsWith(".sql") && f > "20261124090000_studio_modules.sql").sort()
  .map(migration).join("\n").replace(/^\s*--.*$/gm, "");
function tableBlock(table: string): string {
  const start = SQL.indexOf(`create table public.${table} (`);
  assert.ok(start >= 0, `migration creates public.${table}`);
  const alters = LATER.split(/;\s*\n/).filter((st) => new RegExp(`^alter table public\\.${table}\\s`).test(st.trimStart()))
    .map((st) => st.replace(/add column\s+/g, "\n  ").replace(/add constraint \w+\s+check \((\w+) in \(/g, "\n  $1 text check ($1 in ("));
  return [SQL.slice(start, SQL.indexOf("\n);", start)), ...alters].join("\n");
}
function checkValues(block: string, column: string): string[] | null {
  const all = [...block.matchAll(new RegExp(`\\n\\s+${column}\\s[^\\n]*?(?:\\n\\s*)?check \\(${column} in \\(([^)]*)\\)\\)`, "g"))];
  const m = all.at(-1); // the most recent definition wins
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
}

test("modules: every select option is a value the database accepts", () => {
  for (const def of MODULES) {
    const block = tableBlock(def.table);
    for (const f of def.fields) {
      if (!block.includes(`\n  ${f.name} `) && !new RegExp(`\\n\\s+${f.name}\\s`).test(block)) assert.fail(`${def.key}.${f.name} is not a column of ${def.table}`);
      if (f.type !== "select") continue;
      const allowed = checkValues(block, f.name);
      if (!allowed) continue; // free text column
      assert.deepEqual([...(f.options ?? []).map(([v]) => v)].sort(), [...allowed].sort(), `${def.key}.${f.name}`);
    }
    for (const [k, v] of Object.entries(def.fixed ?? {})) {
      const allowed = checkValues(block, k);
      if (allowed) assert.ok(allowed.includes(String(v)), `${def.key} fixed ${k}`);
    }
  }
});
test("modules: each module uses a grantable section and has a unique key", () => {
  const keys = new Set<string>();
  for (const def of MODULES) {
    assert.ok((GRANTABLE_SECTIONS as readonly string[]).includes(def.section), `${def.key} section ${def.section}`);
    assert.ok(!keys.has(def.key), `duplicate ${def.key}`);
    keys.add(def.key);
    assert.ok(def.fields.some((f) => f.name === def.titleField), `${def.key} title field`);
  }
  assert.equal(moduleByKey("nope"), undefined);
  assert.equal(moduleByKey("locations")?.table, "locations");
});
test("modules: the select list includes id, production and source", () => {
  const cols = selectColumns(moduleByKey("locations")!).split(",").map((c) => c.trim());
  for (const c of ["id", "production_id", "source", "name", "status"]) assert.ok(cols.includes(c), c);
});
test("modules: option labels fall back to the raw value", () => {
  const status = moduleByKey("locations")!.fields.find((f) => f.name === "status")!;
  assert.equal(optionLabel(status, "confirmed"), "Confirmed");
  assert.equal(optionLabel(status, "mystery"), "mystery");
});

// ---------------------------------------------------------------------------
// Form validation
// ---------------------------------------------------------------------------
const loc = moduleByKey("locations")!;
test("parseFields: required, trimming, lower-case email, empty to null", () => {
  assert.deepEqual(parseFields(loc, form({ name: "  " })), { ok: false, error: "Location is required." });
  const r = parseFields(loc, form({ name: " Diner ", status: "pending", email: "A@B.CO", phone: "" }));
  assert.ok(r.ok);
  assert.equal(r.values.name, "Diner");
  assert.equal(r.values.email, "a@b.co");
  assert.equal(r.values.phone, null);
});
test("parseFields: rejects bad select values, links, emails and over-long text", () => {
  assert.equal(parseFields(loc, form({ name: "x", status: "hacked" })).ok, false);
  assert.equal(parseFields(loc, form({ name: "x", drive_url: "javascript:alert(1)" })).ok, false);
  assert.equal(parseFields(loc, form({ name: "x", email: "not-an-email" })).ok, false);
  assert.equal(parseFields(loc, form({ name: "x".repeat(201) })).ok, false);
});
test("parseFields: dates must be real dates; fixed values are applied", () => {
  const shoot = moduleByKey("shoot-schedule")!;
  const title = shoot.titleField;
  const dateField = shoot.fields.find((f) => f.type === "date")!;
  assert.equal(parseFields(shoot, form({ [title]: "Day 1", [dateField.name]: "2026-02-30x" })).ok, false);
  const ok = parseFields(shoot, form({ [title]: "Day 1", [dateField.name]: "2026-07-01" }));
  assert.ok(ok.ok);
  for (const [k, v] of Object.entries(shoot.fixed ?? {})) assert.equal(ok.values[k], v);
});
test("checkScope: studio-only, production-only and either", () => {
  const contacts = moduleByKey("contacts")!;
  assert.equal(checkScope(contacts, null), null);
  assert.notEqual(checkScope(contacts, P1), null);
  const never = MODULES.find((m) => m.studioLevel === "never")!;
  assert.notEqual(checkScope(never, null), null);
  assert.equal(checkScope(never, P1), null);
  assert.equal(checkScope(loc, null), null);
  assert.equal(checkScope(loc, P1), null);
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
test("nav: lifecycle groups in order", () => {
  assert.deepEqual(NAV.map((g) => g.label), ["Dashboard", "Development", "Pre-Production", "Production", "Post-Production", "Distribution", "Studio Operations"]);
});
test("nav: the owner sees everything", () => {
  const all = NAV.flatMap((g) => g.items).length;
  assert.equal(navFor(true, []).flatMap((g) => g.items).length, all);
});
test("nav: a person sees only granted sections, never owner pages", () => {
  const groups = navFor(false, [{ production_id: P1, section_key: "casting", level: "view" }]);
  const keys = groups.flatMap((g) => g.items.map((i) => i.key));
  assert.ok(keys.includes("casting"));
  assert.ok(keys.includes("productions"));
  for (const k of ["crew", "administration", "settings", "activity", "communications"]) assert.ok(!keys.includes(k), k);
  assert.ok(!groups.some((g) => g.key === "post"), "empty groups are hidden");
});
test("nav: every nav section is a real section", () => {
  for (const i of NAV.flatMap((g) => g.items)) if (i.section) assert.ok((GRANTABLE_SECTIONS as readonly string[]).includes(i.section), i.key);
});
test("nav: groupForPath picks the right group", () => {
  assert.equal(groupForPath("/"), "dashboard");
  assert.equal(groupForPath("/casting/abc"), "preproduction");
  assert.equal(groupForPath("/call-sheets"), "preproduction", "moved into Scheduling");
  assert.equal(groupForPath("/scheduling?tab=calendar"), "preproduction");
  assert.equal(groupForPath("/editing"), "post");
  assert.equal(groupForPath("/festivals"), "distribution");
  assert.equal(groupForPath("/administration"), "operations");
  assert.equal(groupForPath("/settings/users/1"), "operations");
  assert.equal(groupForPath("/nowhere"), null);
});
test("nav: every module page is in the menu", () => {
  const hrefs = new Set(NAV.flatMap((g) => g.items.map((i) => i.href)));
  for (const m of MODULES) if (!m.hidden) assert.ok(hrefs.has(`/${m.key}`), m.key);
});

// ---------------------------------------------------------------------------
// Deployment guard
// ---------------------------------------------------------------------------
test("env: Previews are read-only unless explicitly allowed", () => {
  assert.equal(writeBlockReason({ VERCEL_ENV: "production" }), null);
  assert.equal(writeBlockReason({}), null);
  assert.equal(writeBlockReason({ VERCEL_ENV: "preview" }), PREVIEW_READ_ONLY);
  assert.equal(writeBlockReason({ VERCEL_ENV: "preview", STUDIO_PREVIEW_WRITES: "yes" }), PREVIEW_READ_ONLY);
  assert.equal(writeBlockReason({ VERCEL_ENV: "preview", STUDIO_PREVIEW_WRITES: "allow" }), null);
});
test("env: email sending is off unless COMMS_SEND_ENABLED=on, and never on a read-only Preview", () => {
  assert.notEqual(commsSendBlockReason({ VERCEL_ENV: "production" }), null);
  assert.equal(commsSendBlockReason({ VERCEL_ENV: "production", COMMS_SEND_ENABLED: "on" }), null);
  assert.equal(commsSendBlockReason({ VERCEL_ENV: "preview", COMMS_SEND_ENABLED: "on" }), PREVIEW_READ_ONLY);
});
test("env: integrations report missing names, never values", () => {
  const list = integrations({ ZOHO_MAIL_USER: "secret-user" });
  const zoho = list.find((i) => i.key === "zoho")!;
  assert.equal(zoho.configured, false);
  assert.deepEqual(zoho.missing, ["ZOHO_MAIL_APP_PASSWORD"]);
  assert.ok(!JSON.stringify(list).includes("secret-user"));
  assert.equal(list.find((i) => i.key === "drive")!.configured, true);
});

// ---------------------------------------------------------------------------
// Communications and dates
// ---------------------------------------------------------------------------
test("comms: alias detection prefers the specific alias", () => {
  assert.equal(aliasFor("Casting <casting@bleuskm.com>, studio@bleuskm.com"), "casting@bleuskm.com");
  assert.equal(aliasFor("studio@bleuskm.com"), "studio@bleuskm.com");
  assert.equal(aliasFor("someone@else.com"), null);
});
test("comms: reply subject and quoting", () => {
  assert.equal(replySubject("Hello"), "Re: Hello");
  assert.equal(replySubject("RE: Hello"), "RE: Hello");
  assert.equal(replySubject(" "), "Re: (no subject)");
  assert.match(quoteOriginal("a\nb", "x@y.z", null), /> a\n> b$/);
});
test("dates: calendar math without time zone drift", () => {
  assert.equal(formatDay("2026-11-30"), "Mon, Nov 30, 2026");
  assert.equal(daysBetween("2026-11-23", "2026-11-30"), 7);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(relativeDay("2026-11-24", "2026-11-23"), "Tomorrow");
  assert.equal(relativeDay("2026-11-20", "2026-11-23"), "3 days ago");
  assert.equal(studioToday(new Date("2026-11-24T03:00:00Z")), "2026-11-23");
});
