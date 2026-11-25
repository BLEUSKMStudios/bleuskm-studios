// Casting dates on the master calendar. Synthetic values only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { castingCallItems, type CallDates } from "./calendar.ts";

const call = (o: Partial<CallDates>): CallDates => ({
  id: "c1", production_id: "p1", title: "Test call", status: "open", public_slug: "test-call",
  opens_at: null, deadline: null, early_access_starts: {}, ...o,
});
const href = (c: CallDates) => `/calls/${c.id}`;

test("calendar: early access, public opening and deadline, in Central time", () => {
  const items = castingCallItems([call({
    early_access_starts: { "SECOND-CODE": "2026-11-27T06:00:00Z", "FIRST-CODE": "2026-11-25T06:00:00Z" },
    opens_at: "2026-11-30T15:00:00Z", deadline: "2026-12-15T05:59:00Z",
  })], href, "2026-11-01");
  assert.deepEqual(items.map((i) => [i.day, i.time, i.title]), [
    ["2026-11-25", "00:00", "Test call: early access opens (FIRST-CODE)"],
    ["2026-11-27", "00:00", "Test call: early access opens (SECOND-CODE)"],
    ["2026-11-30", "09:00", "Test call: opens to the public"],
    ["2026-12-14", "23:59", "Test call: submissions close"],
  ]);
  assert.equal(items[0].kind, "Casting call");
  assert.equal(items[0].href, "/calls/c1");
});
test("calendar: crew calls are labelled, past and missing dates are left out", () => {
  const items = castingCallItems([call({ public_slug: "test-crew", opens_at: "2026-10-01T15:00:00Z", deadline: null, early_access_starts: { X: 5 } })], href, "2026-11-01");
  assert.equal(items.length, 0);
  const crew = castingCallItems([call({ public_slug: "test-crew", deadline: "2026-12-15T05:59:00Z" })], href, "2026-11-01");
  assert.equal(crew[0].kind, "Crew call");
});
