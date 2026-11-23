import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanUrl, emailHtml, fillTemplate, firstName, formatStudioTime, isCrewCall, isoToStudioLocal, missingFields, senderEmailFor, studioLocalToIso } from "./casting-core.ts";

test("Central time input converts to UTC across standard and daylight time", () => {
  assert.equal(studioLocalToIso("2026-11-30T23:59"), "2026-12-01T05:59:00.000Z"); // CST, UTC-6
  assert.equal(studioLocalToIso("2026-07-01T12:00"), "2026-07-01T17:00:00.000Z"); // CDT, UTC-5
  assert.equal(studioLocalToIso("2026-13-01T00:00"), null);
  assert.equal(studioLocalToIso("tomorrow"), null);
});

test("UTC converts back to the same Central time input", () => {
  for (const local of ["2026-11-30T23:59", "2026-03-08T12:30", "2026-11-01T00:15"]) {
    assert.equal(isoToStudioLocal(studioLocalToIso(local)), local);
  }
  assert.equal(isoToStudioLocal(null), "");
});

test("Times show in Central time", () => {
  assert.match(formatStudioTime("2026-12-01T05:59:00.000Z"), /Nov 30, 2026.*11:59.*PM.*CST/);
});

test("Templates fill known fields and report missing ones", () => {
  const vars = { first_name: "Ada", role: "Sosa", film: "Love Me Like This" };
  assert.equal(fillTemplate("Hi {{first_name}}, {{ role }} in {{film}} {{session_time}}", vars), "Hi Ada, Sosa in Love Me Like This ");
  assert.deepEqual(missingFields("{{first_name}} {{session_time}} {{session_location}}", vars), ["session_time", "session_location"]);
  assert.equal(firstName("  Ada  Lovelace "), "Ada");
});

test("Email HTML escapes the text", () => {
  const html = emailHtml("Hi <b>Ada</b>\n\nLine & more");
  assert.ok(html.includes("Hi &lt;b&gt;Ada&lt;/b&gt;"));
  assert.ok(html.includes("Line &amp; more"));
  assert.ok(!html.includes("<b>Ada</b>"));
});

test("Only web links are accepted", () => {
  assert.equal(cleanUrl("https://vimeo.com/1"), "https://vimeo.com/1");
  assert.equal(cleanUrl("javascript:alert(1)"), null);
  assert.equal(cleanUrl("  "), null);
});

test("crew calls send from crew@, everything else from casting@", () => {
  assert.equal(isCrewCall("love-me-like-this-crew"), true);
  assert.equal(isCrewCall("love-me-like-this"), false);
  assert.equal(isCrewCall("crewless-film"), false);
  assert.equal(isCrewCall(null), false);
  assert.equal(senderEmailFor("love-me-like-this-crew"), "crew@bleuskm.com");
  assert.equal(senderEmailFor("love-me-like-this"), "casting@bleuskm.com");
  assert.match(emailHtml("Hi", "crew@bleuskm.com"), /crew@bleuskm\.com/);
  assert.match(emailHtml("Hi"), /casting@bleuskm\.com/);
});
