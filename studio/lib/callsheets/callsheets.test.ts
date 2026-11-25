import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { callFor, dateLabel, groupEntries, identityForTeam, pdfName, sheetFromRows, timeLabel } from "./sheet.ts";
import { buildCallSheetPdf } from "./pdf.ts";

test("times and dates read the way a call sheet writes them", () => {
  assert.equal(timeLabel("07:30:00"), "7:30 AM");
  assert.equal(timeLabel("00:05"), "12:05 AM");
  assert.equal(timeLabel("12:00:00"), "12:00 PM");
  assert.equal(timeLabel("18:45"), "6:45 PM");
  assert.equal(timeLabel(null), "");
  assert.equal(dateLabel("2026-12-05"), "Saturday, December 5, 2026");
});

test("entries group cast first, then by call time and name; unknown teams go to Other", () => {
  const e = (id: string, name: string, team: string, callTime: string | null) => ({ id, name, team, callTime, position: null, notes: null });
  const g = groupEntries([e("1", "Zed", "crew", "06:00:00"), e("2", "Amy", "crew", "06:00:00"), e("3", "Sosa", "cast", "08:00:00"), e("4", "Late", "crew", null), e("5", "X", "weird", null)]);
  assert.deepEqual(g.map((x) => x.team), ["cast", "crew", "other"]);
  assert.deepEqual(g[1].rows.map((r) => r.name), ["Amy", "Zed", "Late"]);
});

test("a person's call falls back to crew call, then general call", () => {
  const s = { generalCall: "08:00:00", crewCall: "06:30:00" };
  assert.equal(callFor(s, { callTime: "07:00:00", team: "crew" }), "07:00:00");
  assert.equal(callFor(s, { callTime: null, team: "crew" }), "06:30:00");
  assert.equal(callFor(s, { callTime: null, team: "cast" }), "08:00:00");
  assert.equal(identityForTeam("cast"), "casting");
  assert.equal(identityForTeam("producer"), "crew");
});

test("the PDF renders, with a safe file name", async () => {
  const s = sheetFromRows({
    production: "Love Me Like This",
    sheet: { id: "x", title: "Day 1", shoot_date: "2026-12-05", version: 2, general_call: "08:00:00", crew_call: "06:30:00", location_text: "123 Main St, Dallas TX",
      parking: "Lot B behind the building", nearest_hospital: "Baylor Medical, 3500 Gaston Ave", weather: "Sunny, 61°F", sunrise: "7:15 AM", sunset: "5:22 PM",
      key_contacts: "Producer: Test Person, 555-0100", safety_notes: "Closed set. No open flames.", schedule: "8:00 Scene 1\n10:30 Scene 4", notes: "Bring ID." },
    entries: Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, full_name: `Person ${i} Ñandú`, position: i % 3 ? "Grip" : "Sosa", team: i % 3 ? "crew" : "cast", call_time: i % 5 ? "07:00:00" : null, notes: i === 3 ? "Wardrobe fitting first; bring two pairs of shoes and a jacket" : null })),
  });
  const bytes = await buildCallSheetPdf(s, { highlightEntryId: "e3" });
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 2, "long rosters continue on a second page");
  assert.match(pdf.getTitle() ?? "", /Love Me Like This/);
  assert.equal(pdfName(s), "Love-Me-Like-This-Call-Sheet-Day-1-2026-12-05-v2.pdf");
});
