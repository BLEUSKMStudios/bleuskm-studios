import { test } from "node:test";
import assert from "node:assert/strict";
import { docStoragePath, docType, isDocPath, isShareable } from "./doc-files.ts";

const ID = "11111111-2222-4333-8444-555555555555";

test("document files: allowed types and safe paths", () => {
  assert.equal(docType("Sides Scene 4.PDF"), "application/pdf");
  assert.equal(docType("guide.docx")?.includes("wordprocessingml"), true);
  assert.equal(docType("virus.exe"), null);
  assert.equal(docType("noext"), null);
  const p = docStoragePath(ID, "Call Sheet #1 (final).pdf", 42);
  assert.match(p, new RegExp(`^documents/${ID}/42-Call-Sheet-1-final-?\\.pdf$`));
  assert.ok(isDocPath(ID, p));
  assert.ok(!isDocPath(ID, `documents/${ID}/../x.pdf`));
  assert.ok(!isDocPath(ID, `documents/other/x.pdf`));
});

test("only production materials can go in onboarding packages", () => {
  for (const c of ["script", "sides", "call_sheet", "location_info", "guide"]) assert.ok(isShareable(c), c);
  for (const c of ["contract", "release", "permit", "insurance"]) assert.ok(!isShareable(c), c);
});
