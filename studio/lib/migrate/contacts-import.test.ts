import assert from "node:assert/strict";
import { test } from "node:test";

import { airtableIntake, brevoIntake, buildContactsPlan } from "./contacts-import.ts";

test("Brevo newsletter contacts carry consent; others don't", () => {
  const nl = brevoIntake({ id: 7, email: "A@Example.com", listIds: [2, 4], createdAt: "2026-01-02T00:00:00Z", attributes: { FIRSTNAME: "Ada", FILM: "Love Me Like This" } })!;
  assert.equal(nl.kind, "newsletter");
  assert.equal(nl.email, "a@example.com");
  assert.equal(nl.submission_key, "brevo:contact:7");
  assert.equal(nl.origin, "import");
  assert.equal((nl.consent as { newsletter: boolean }).newsletter, true);
  assert.equal(nl.film, "Love Me Like This");
  const other = brevoIntake({ id: 8, email: "b@example.com", listIds: [6] })!;
  assert.equal(other.kind, "other");
  assert.deepEqual(other.consent, {});
  assert.equal(brevoIntake({ id: 9, email: "bad" }), null);
});

test("Airtable sign-ups map to intake kinds with stable keys", () => {
  const n = airtableIntake("notify", { id: "rec1", createdTime: "2026-02-01T00:00:00.000Z", fields: { Email: "c@example.com", Film: "Echos", Type: "Coming Soon" } })!;
  assert.equal(n.kind, "film_notify");
  assert.equal(n.submission_key, "airtable:tblcSHay5dfYcbDKC:rec1");
  assert.equal(airtableIntake("inquiries", { id: "rec2", fields: { Email: "d@example.com", Concept: "x" } })!.kind, "client_inquiry");
  assert.equal(airtableIntake("newsletter", { id: "rec3", fields: {} }), null);
});

test("the plan applies the Brevo blocklist last and counts only", () => {
  const plan = buildContactsPlan({
    brevo: [{ id: 1, email: "x@example.com", listIds: [2], emailBlacklisted: true }, { id: 2, email: "nope" }],
    airtable: { newsletter: [{ id: "r", fields: { Email: "x@example.com" } }], notify: [], inquiries: [] },
  });
  assert.equal(plan.counts["brevo newsletter subscribers"], 1);
  assert.equal(plan.counts["airtable Newsletter"], 1);
  assert.equal(plan.skipped["brevo: no valid email"], 1);
  assert.ok(plan.sql.trimEnd().endsWith("'x@example.com');"), "the blocklist update is the last statement");
  assert.ok(plan.sql.indexOf("airtable:tblSMb3y7vrvjbONx:r") < plan.sql.indexOf("brevo:contact:1"));
});
