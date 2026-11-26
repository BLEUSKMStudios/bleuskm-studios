import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";

import { FIELDS, LIBRARY, UNKNOWN, templateByKey, templateFields } from "./library.ts";
import {
  agreementText, canonical, clausesToText, freeze, identityForTemplate, libraryBody, missingRequired,
  recommendTemplate, renderAgreement, sha256, textToClauses, thaw,
} from "./render.ts";
import { buildSignedPdf, decodeSignaturePng, winAnsi } from "./pdf.ts";

const IMDB_WORDS = "BLEUSKM Studios will make reasonable efforts to submit accurate cast and crew credits to IMDb following production. The final acceptance, publication, and display of credits are subject to IMDb's independent policies and approval processes.";

test("the library has the 11 requested agreement types, each with unique keys", () => {
  const keys = LIBRARY.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of ["actor_principal", "background_performer", "crew_general", "crew_key", "producer", "nda", "likeness_release",
    "location_release", "ip_release", "equipment_loan", "minor_performer"]) assert.ok(templateByKey(k), k);
  assert.equal(LIBRARY.length, 11);
});

test("every placeholder is a known field, and every template lists attorney-review points", () => {
  for (const t of LIBRARY) {
    for (const f of templateFields(t)) assert.ok(FIELDS[f], `${t.key}: ${f}`);
    assert.ok(t.review.length > 0, t.key);
    assert.ok(t.clauses.some((c) => c.title === "Electronic Records & Signatures"), `${t.key} has e-sign consent`);
  }
});

test("cast and crew agreements carry the exact IMDb wording and a crediting commitment", () => {
  for (const t of LIBRARY.filter((x) => x.audience !== "other")) {
    const credit = t.clauses.find((c) => c.title === "Credit");
    assert.ok(credit, t.key);
    assert.ok(credit.text.includes(IMDB_WORDS), t.key);
    assert.match(credit.text, /committed to crediting/);
  }
});

test("unpaid terms and minors are flagged for attorney review", () => {
  for (const t of LIBRARY.filter((x) => x.audience !== "other")) {
    assert.ok(t.clauses.some((c) => c.title === "Compensation" && c.review), t.key);
  }
  assert.match(templateByKey("minor_performer")!.review.join(" "), /REQUIRED before casting any minor/);
});

const actor = templateByKey("actor_principal")!;
const tpl = { key: actor.key, version: 1, name: actor.name, body: libraryBody(actor) };

test("rendering fills values and states unknown dates clearly instead of guessing", () => {
  const r = renderAgreement({ id: "00000000-0000-4000-8000-000000000001", template: tpl, signer: { name: "Jordan Lee", email: "j@example.com" },
    values: { production_title: "Love Me Like This", role: "Sosa" } });
  const text = agreementText(r);
  assert.match(text, /Jordan Lee \("Actor"\)/);
  assert.match(text, /character of Sosa/);
  assert.ok(text.includes(`Shoot dates: ${UNKNOWN}`));
  assert.ok(r.unconfirmed.includes("shoot_dates"));
  assert.equal(r.party.find((p) => p.label === "Shoot Dates")!.value, "To be confirmed");
  assert.match(text, /None\. This is a voluntary, unpaid engagement/);
  assert.doesNotMatch(text, /\{\{/);
});

test("required fields block sending", () => {
  assert.deepEqual(missingRequired(actor, { recipient_name: "A", production_title: "B" }), ["role"]);
  assert.deepEqual(missingRequired(actor, { recipient_name: "A", production_title: "B", role: "C" }), []);
});

test("frozen wording is canonical, hashed, and refused if altered", () => {
  const r = renderAgreement({ id: "x", template: tpl, signer: { name: "A", email: "a@b.co" }, values: { production_title: "F", role: "R" } });
  const f = freeze(r);
  assert.equal(f.hash, sha256(f.text));
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  assert.deepEqual(thaw(f.text, f.hash), r);
  assert.equal(thaw(f.text.replace("Sosa", "x").replace('"R"', '"Q"'), f.hash), null);
});

test("the owner's text format round-trips, and rejects unknown fields", () => {
  const txt = clausesToText(actor.clauses);
  const back = textToClauses(txt);
  assert.equal(back.error, undefined);
  assert.deepEqual(back.clauses, actor.clauses);
  assert.match(textToClauses("## Pay\nYou get {{salary}}").error!, /salary/);
  assert.match(textToClauses("no heading").error!, /title line/);
});

test("the recommended template follows the role", () => {
  assert.equal(recommendTemplate({ crew: false, role: "Sosa" }), "actor_principal");
  assert.equal(recommendTemplate({ crew: false, role: "Background / Extras" }), "background_performer");
  assert.equal(recommendTemplate({ crew: true, role: "Director of Photography (DP)" }), "crew_key");
  assert.equal(recommendTemplate({ crew: true, role: "Producer" }), "producer");
  assert.equal(recommendTemplate({ crew: true, role: "PA / 2nd AC" }), "crew_general");
  assert.equal(recommendTemplate({ crew: false, role: "Sosa", minor: true }), "minor_performer");
  assert.equal(identityForTemplate("cast", "casting", null), "casting");
  assert.equal(identityForTemplate("crew", "crew", null), "crew");
  assert.equal(identityForTemplate("other", "studio", true), "crew");
  assert.equal(identityForTemplate("other", "studio", null), "studio");
});

test("signature images must be real PNGs of a sensible size", () => {
  assert.equal(decodeSignaturePng("data:image/png;base64,AAAA"), null);
  assert.equal(decodeSignaturePng("data:image/svg+xml;base64,PHN2Zz4="), null);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)]);
  assert.ok(decodeSignaturePng(`data:image/png;base64,${png.toString("base64")}`));
  assert.equal(winAnsi("Zoë “quoted” 名"), "Zoë “quoted” ?");
});

test("the signed PDF has the agreement, both signatures and a certificate page", async () => {
  const r = renderAgreement({ id: "00000000-0000-4000-8000-000000000002", template: tpl, signer: { name: "Jordan Lee", email: "j@example.com" },
    values: { production_title: "Love Me Like This", role: "Sosa", studio_rep_name: "Studio Rep", studio_rep_title: "Owner" } });
  const f = freeze(r);
  const at = "2026-11-25T18:00:00.000Z";
  const bytes = await buildSignedPdf({
    agreement: r, contentHash: f.hash,
    studio: { name: "Studio Rep", title: "Owner", kind: "typed", at },
    signer: { name: "Jordan Lee", email: "j@example.com", kind: "typed", at },
    certificate: { verifiedAt: at, consentAt: at, consentText: "I agree to sign electronically.", ip: "203.0.113.5", userAgent: "Test",
      approvedBy: "Studio Rep", approvedAt: at, sentFrom: "casting@bleuskm.com", chainHead: "a".repeat(64),
      events: [{ at, kind: "signed", actor: "signer", who: "Jordan Lee", ip: "203.0.113.5" }] },
  });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 3);
  assert.match(doc.getTitle() ?? "", /Actor Agreement/);
  assert.ok((doc.getKeywords() ?? "").includes(f.hash));
});
