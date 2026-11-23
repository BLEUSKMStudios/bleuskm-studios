// Synthetic data only: no real Airtable records are used in tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan, buildValidation, runRecord, castingStatus, lit, email, TABLES, type Tables, type TableKey } from "./final-hand.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/final-hand.synthetic.json", import.meta.url), "utf8")) as Partial<Tables>;
const tables = Object.fromEntries((Object.keys(TABLES) as TableKey[]).map((k) => [k, fixture[k] ?? []])) as Tables;

test("lit: escapes quotes and drops NUL bytes", () => {
  assert.equal(lit("it's"), "'it''s'");
  assert.equal(lit("a\u0000b"), "'ab'");
  assert.equal(lit(null), "NULL");
  assert.equal(lit(Number.NaN), "NULL");
  assert.equal(lit(true), "true");
});
test("email: extracts and lower-cases one address", () => {
  assert.equal(email("Name <Me@Example.TEST>"), "me@example.test");
  assert.equal(email("nope"), null);
});
test("castingStatus: most decisive field wins", () => {
  assert.equal(castingStatus({ "Cast Status": "Confirmed", "Casting Status": "Pass" }), "cast");
  assert.equal(castingStatus({ "Cast Status": "Not Cast" }), "not_selected");
  assert.equal(castingStatus({ "Self Tape Status": "Selected for Final Round" }), "audition");
  assert.equal(castingStatus({ "Casting Status": "Callback" }), "callback");
  assert.equal(castingStatus({ "Casting Status": "Redirect" }), "not_selected");
  assert.equal(castingStatus({ "Casting Status": "Reviewing" }), "shortlisted");
  assert.equal(castingStatus({}), "submitted");
});

const plan = buildPlan(tables);
test("plan: counts and skips", () => {
  assert.equal(plan.counts.contacts, 2, "only CORE and SUPPORT crew");
  assert.equal(plan.counts["production_team (crew)"], 2);
  assert.equal(plan.counts.casting_applications, 2, "other films, duplicates and missing emails left out");
  assert.equal(plan.counts["production_team (cast)"], 1);
  assert.equal(plan.counts.casting_roles, 2);
  assert.equal(plan.counts.production_notes, 5);
  assert.equal(plan.counts.scripts, 1);
  assert.equal(plan.skipped["crew: no name"], 1);
  assert.equal(plan.skipped["casting: duplicate person for the same role"], 1);
  assert.equal(plan.skipped["casting: missing name or email"], 1);
  assert.ok(plan.empty.includes("Portal Scenes"));
});
test("plan: never deletes or truncates", () => {
  assert.doesNotMatch(plan.sql, /\b(delete\s+from|truncate|drop\s)/i);
});
test("plan: every import upserts on its source id", () => {
  const inserts = plan.sql.split("\n").filter((l) => /^insert into public\.(contacts|production_team|schedule_events|documents|scripts|locations|production_tasks|production_notes|comm_messages) /.test(l));
  assert.ok(inserts.length > 10);
  const upserts = plan.sql.match(/on conflict \(source, source_id\) where source is not null do update/g) ?? [];
  assert.equal(upserts.length, inserts.length);
});
test("plan: the archive casting call is closed and applications never overwrite", () => {
  assert.match(plan.sql, /'closed'\) on conflict \(public_slug\) do nothing/);
  assert.match(plan.sql, /on conflict do nothing returning id/);
});
test("plan: historical applications dedupe on the Airtable record id", () => {
  for (const id of ["recCAST0000000001", "recCREW0000000001", "recCREW0000000002", "recCREW0000000003"]) {
    assert.match(plan.sql, new RegExp(`where not exists \\(select 1 from public\\.casting_applications where source_record_id = '${id}'\\)`));
  }
  assert.doesNotMatch(plan.sql, /recCREW0000000005'\)/, "general-pool crew are not tied to a production");
});
test("plan: crew applications go to a closed crew archive call", () => {
  assert.equal(plan.counts.crew_applications, 3);
  assert.equal(plan.skipped["crew applications: missing name or email"], 1);
  assert.equal(plan.skipped["crew applications: general pool, not tied to a production"], 1);
  assert.match(plan.sql, /'the-final-hand-archive-crew'/);
});
test("plan: a reply note is written after its parent", () => {
  assert.ok(plan.sql.indexOf("'Gear'") < plan.sql.indexOf("'Re: Gear'"));
});
test("validation and run record: counts only", () => {
  const v = buildValidation(plan);
  assert.match(v, /if n < 2 then raise exception/);
  const r = runRecord(plan, "apply");
  for (const pii of ["example.test", "Actor", "Test Person"]) {
    assert.ok(!r.includes(pii), `run record has no ${pii}`);
    assert.ok(!v.includes(pii), `validation has no ${pii}`);
  }
});
test("plan: re-running gives identical SQL", () => {
  assert.equal(buildPlan(tables).sql, plan.sql);
});
