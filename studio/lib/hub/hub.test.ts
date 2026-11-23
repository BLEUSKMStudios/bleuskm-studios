import { test } from "node:test";
import assert from "node:assert/strict";
import { menuFor, readGrid, diffGrants, cellApplies, levelIn, type Grant } from "./access.ts";
import { slugify } from "./labels.ts";
import { describeAudit, type AuditRow } from "./audit.ts";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

test("menu: a person with no grants sees only Overview and Productions", () => {
  assert.deepEqual(menuFor(false, []).map((m) => m.key), ["overview", "productions"]);
});
test("menu: a grant anywhere shows that area; Settings only for the owner", () => {
  const keys = menuFor(false, [{ production_id: P1, section_key: "casting", level: "view" }]).map((m) => m.key);
  assert.deepEqual(keys, ["overview", "productions", "casting"]);
  assert.ok(!keys.includes("settings"));
  assert.ok(menuFor(true, []).some((m) => m.key === "settings"));
});
test("menu: production-only sections never appear in the main menu", () => {
  assert.deepEqual(menuFor(false, [{ production_id: P1, section_key: "budget", level: "edit" }]).map((m) => m.key), ["overview", "productions"]);
});
test("grid: Studio level only for the six main areas", () => {
  assert.equal(cellApplies(null, "casting"), true);
  assert.equal(cellApplies(null, "budget"), false);
  assert.equal(cellApplies(P1, "budget"), true);
  assert.equal(cellApplies(P1, "settings"), false);
  assert.equal(cellApplies(P1, "overview"), false);
});
test("grid: reads only real cells of known productions", () => {
  const got = readGrid(
    [
      ["cell:studio:casting", "view"],
      ["cell:studio:budget", "edit"], // no Studio level: ignored
      [`cell:${P1}:budget`, "edit"],
      [`cell:${P1}:crew`, "none"], // No access: no row
      [`cell:${P2}:crew`, "edit"], // unknown production: ignored
      [`cell:${P1}:settings`, "edit"], // never grantable: ignored
      [`cell:${P1}:tasks`, "admin"], // bad level: ignored
      ["full_name", "x"],
    ],
    new Set([P1]),
  );
  assert.deepEqual(got, [
    { production_id: null, section_key: "casting", level: "view" },
    { production_id: P1, section_key: "budget", level: "edit" },
  ]);
});
test("grid: diff inserts, updates and removes only what changed", () => {
  const current: Grant[] = [
    { id: "a", production_id: null, section_key: "casting", level: "view" },
    { id: "b", production_id: P1, section_key: "budget", level: "view" },
    { id: "c", production_id: P1, section_key: "crew", level: "edit" },
  ];
  const wanted: Grant[] = [
    { production_id: null, section_key: "casting", level: "view" },
    { production_id: P1, section_key: "budget", level: "edit" },
    { production_id: P1, section_key: "tasks", level: "view" },
  ];
  assert.deepEqual(diffGrants(current, wanted), {
    insert: [{ production_id: P1, section_key: "tasks", level: "view" }],
    update: [{ id: "b", level: "edit" }],
    remove: ["c"],
  });
  assert.deepEqual(diffGrants(current, current), { insert: [], update: [], remove: [] });
});
test("levelIn distinguishes Studio level from a production", () => {
  const g: Grant[] = [{ production_id: P1, section_key: "crew", level: "edit" }];
  assert.equal(levelIn(g, P1, "crew"), "edit");
  assert.equal(levelIn(g, null, "crew"), "none");
});
test("slugify makes safe production addresses", () => {
  assert.equal(slugify("Love Me Like This"), "love-me-like-this");
  assert.equal(slugify("  The Final Hand!! "), "the-final-hand");
  assert.equal(slugify("Café & Co."), "cafe-and-co");
  assert.equal(slugify("***"), "production");
});
test("audit log entries read as plain sentences", () => {
  const names = { people: new Map([["u1", "Ada"]]), productions: new Map([[P1, "Love Me Like This"]]) };
  const base = { id: 1, at: "", actor_id: null, production_id: P1 } as const;
  const grant: AuditRow = { ...base, action: "INSERT", table_name: "access_grants", old_row: null, new_row: { user_id: "u1", production_id: P1, section_key: "budget", level: "edit" } };
  assert.equal(describeAudit(grant, names), "Gave Ada Edit access to Budget, Love Me Like This");
  const studio: AuditRow = { ...grant, action: "UPDATE", old_row: { level: "view" }, new_row: { user_id: "u1", production_id: null, section_key: "casting", level: "edit" } };
  assert.equal(describeAudit(studio, names), "Changed Ada's access to Casting, Studio level from View to Edit");
  const deact: AuditRow = { ...base, action: "UPDATE", table_name: "profiles", old_row: { status: "active", full_name: "Ada" }, new_row: { status: "deactivated", full_name: "Ada" } };
  assert.equal(describeAudit(deact, names), "Deactivated Ada");
});
