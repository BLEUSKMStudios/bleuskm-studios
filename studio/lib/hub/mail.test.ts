import assert from "node:assert/strict";
import { test } from "node:test";

import { parseIntake, secretMatches } from "./intake-rules.ts";
import { identityFor, marketingEligible, sendGate, zohoFromGate, type IdentityRow } from "./mail-rules.ts";
import { confirmationKey, firstName, missing, placeholders, render, toHtml } from "./templates.ts";

const id = (o: Partial<IdentityRow> = {}): IdentityRow => ({
  key: "casting", address: "casting@bleuskm.com", display_name: "BLEUSKM Studios Casting", reply_to: null, purpose: "",
  zoho_kind: "alias", brevo_verified: true, zoho_send_as: true, verified_at: null, notes: null, ...o,
});

test("render fills fields and optional sections", () => {
  const t = "Hi {{first_name}}, thanks for applying{{#role}} for {{role}}{{/role}}.";
  assert.equal(render(t, { first_name: "Ada", role: "Sosa" }), "Hi Ada, thanks for applying for Sosa.");
  assert.equal(render(t, { first_name: "Ada" }), "Hi Ada, thanks for applying.");
  assert.deepEqual(missing(t, { first_name: "Ada" }), []);
  assert.deepEqual(missing("{{film}} {{#role}}{{role}}{{/role}}", {}), ["film"]);
  assert.deepEqual(placeholders(t).sort(), ["first_name", "role"]);
});

test("firstName falls back politely", () => {
  assert.equal(firstName(" Ada  Lovelace "), "Ada");
  assert.equal(firstName(""), "there");
});

test("toHtml escapes, links https only, adds preview and unsubscribe", () => {
  const h = toHtml("Hello <b>you</b>\n\nSee https://bleuskm.com/x.", { from: "casting@bleuskm.com", preview: "Peek", unsubscribeUrl: "https://studio.bleuskm.com/u/abc" });
  assert.ok(h.includes("&lt;b&gt;you&lt;/b&gt;"));
  assert.ok(h.includes('<a href="https://bleuskm.com/x"'));
  assert.ok(h.includes("Peek"));
  assert.ok(h.includes("Unsubscribe"));
  assert.ok(!toHtml("javascript:alert(1)", { from: "x" }).includes("<a href"));
});

test("confirmation keys per form", () => {
  assert.equal(confirmationKey("casting"), "confirm_casting");
  assert.equal(confirmationKey("client_inquiry"), "confirm_inquiry");
  assert.equal(confirmationKey("contract"), null);
});

test("sendGate refuses unverified senders, bad addresses, bounced contacts, previews", () => {
  const base = { writeBlock: null, brevoKey: true, identity: id(), emailStatus: "ok", to: "a@example.com" };
  assert.equal(sendGate(base), null);
  assert.match(sendGate({ ...base, identity: id({ brevo_verified: false }) })!, /not marked as a verified Brevo sender/);
  assert.match(sendGate({ ...base, brevoKey: false })!, /BREVO_KEY/);
  assert.match(sendGate({ ...base, emailStatus: "bounced" })!, /bounced/);
  assert.match(sendGate({ ...base, to: "nope" })!, /not valid/);
  assert.equal(sendGate({ ...base, writeBlock: "read-only" }), "read-only");
  assert.match(zohoFromGate(id({ zoho_send_as: false }))!, /send as/);
  assert.equal(zohoFromGate(id()), null);
});

test("marketing goes only to subscribed, deliverable, unmerged contacts", () => {
  const c = { email: "a@example.com", email_status: "ok", merged_into: null };
  assert.equal(marketingEligible({ status: "subscribed" }, c), true);
  assert.equal(marketingEligible({ status: "unsubscribed" }, c), false);
  assert.equal(marketingEligible({ status: "subscribed" }, { ...c, email_status: "bounced" }), false);
  assert.equal(marketingEligible({ status: "subscribed" }, { ...c, merged_into: "x" }), false);
});

test("department identities", () => {
  assert.equal(identityFor({ crew: true }), "crew");
  assert.equal(identityFor({}), "casting");
  assert.equal(identityFor({ kind: "newsletter" }), "newsletter");
  assert.equal(identityFor({ kind: "film" }), "films");
  assert.equal(identityFor({ kind: "client_inquiry" }), "studio");
});

test("parseIntake keeps known fields only and validates", () => {
  const ok = parseIntake({ kind: "newsletter", submission_key: "web:nl:123456", email: " Ada@Example.COM ", name: "Ada",
    website: "javascript:alert(1)", production_slug: "Bad Slug", consent: { newsletter: "yes", text: "Yes" }, extra: 1 });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.input.email, "ada@example.com");
  assert.equal(ok.input.website, null);
  assert.equal(ok.input.production_slug, null);
  assert.equal(ok.input.consent.newsletter, false, "only a real true counts as consent");
  assert.equal(ok.input.confirmation, "none");
  assert.deepEqual(parseIntake({ kind: "x", submission_key: "12345678", email: "a@b.co" }), { ok: false, error: "unknown_kind" });
  assert.deepEqual(parseIntake({ kind: "crew", submission_key: "short", email: "a@b.co" }), { ok: false, error: "bad_submission_key" });
  assert.deepEqual(parseIntake({ kind: "crew", submission_key: "12345678", email: "nope" }), { ok: false, error: "invalid_email" });
});

test("intake secret must be long and match exactly", () => {
  const s = "x".repeat(40);
  assert.equal(secretMatches(s, s), true);
  assert.equal(secretMatches(s + "y", s), false);
  assert.equal(secretMatches("short", "short"), false);
  assert.equal(secretMatches(null, s), false);
  assert.equal(secretMatches(s, undefined), false);
});
