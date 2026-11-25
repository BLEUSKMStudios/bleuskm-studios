import assert from "node:assert/strict";
import { test } from "node:test";

import { hashToken, isToken, newToken, publicBase } from "./links.ts";
import { cleanTapeLink, inviteState, maxSelftapeBytes, pathBelongs, safeName, selftapePath, selftapeType } from "./selftape.ts";

const A = "11111111-1111-4111-8111-111111111111";
const I = "22222222-2222-4222-8222-222222222222";

test("tokens are random, URL-safe and only stored hashed", () => {
  const t = newToken();
  assert.ok(isToken(t));
  assert.notEqual(t, newToken());
  assert.match(hashToken(t), /^[0-9a-f]{64}$/);
  assert.equal(isToken("short"), false);
  assert.equal(isToken(t + "/"), false);
});

test("public base prefers the configured https address", () => {
  assert.equal(publicBase({ STUDIO_PUBLIC_URL: "https://studio.bleuskm.com/" }), "https://studio.bleuskm.com");
  assert.equal(publicBase({ STUDIO_PUBLIC_URL: "javascript:x" }, "bleuskm-studio-os.vercel.app", "https"), "https://bleuskm-studio-os.vercel.app");
  assert.equal(publicBase({}, "evil host/", "https"), "https://studio.bleuskm.com");
});

test("self-tape files: videos and PDFs only, safe names, own folder", () => {
  assert.equal(selftapeType("Take 3.MOV"), "video/quicktime");
  assert.equal(selftapeType("x.exe"), null);
  assert.equal(safeName("../../etc/passwd"), "etcpasswd");
  const p = selftapePath(A, I, "My Tape.mp4", "abcdef123456");
  assert.equal(p, `${A}/${I}/abcdef123456-My-Tape.mp4`);
  assert.ok(pathBelongs(p, A, I));
  assert.equal(pathBelongs(p, I, A), false);
  assert.equal(pathBelongs(`${A}/${I}/../x`, A, I), false);
  assert.equal(maxSelftapeBytes({}), 50 * 1048576);
  assert.equal(maxSelftapeBytes({ STUDIO_SELFTAPE_MAX_MB: "500" }), 500 * 1048576);
});

test("links must be https", () => {
  assert.equal(cleanTapeLink("https://vimeo.com/1"), "https://vimeo.com/1");
  assert.equal(cleanTapeLink("http://vimeo.com/1"), null);
  assert.equal(cleanTapeLink("javascript:alert(1)"), null);
});

test("an invitation closes a day after its deadline", () => {
  const now = Date.parse("2026-12-10T12:00:00Z");
  assert.equal(inviteState({ status: "sent", deadline: "2026-12-10T00:00:00Z" }, now), "open");
  assert.equal(inviteState({ status: "sent", deadline: "2026-12-08T00:00:00Z" }, now), "expired");
  assert.equal(inviteState({ status: "cancelled", deadline: null }, now), "cancelled");
  assert.equal(inviteState({ status: "submitted", deadline: null }, now), "submitted");
});
