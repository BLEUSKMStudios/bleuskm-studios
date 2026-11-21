import { test } from "node:test";
import assert from "node:assert/strict";
import { readEmailLink } from "./link.ts";

test("invite link goes to set-password", () => {
  assert.deepEqual(readEmailLink({ token_hash: "abc", type: "invite", next: "/set-password" }), { kind: "token", tokenHash: "abc", type: "invite", next: "/set-password" });
});
test("invite without next still goes to set-password", () => {
  assert.equal((readEmailLink({ token_hash: "abc", type: "invite" }) as { next: string }).next, "/set-password");
});
test("tracked links that turned & into &amp; still work", () => {
  assert.deepEqual(readEmailLink({ token_hash: "abc", "amp;type": "recovery", "amp;next": "/set-password" }), { kind: "token", tokenHash: "abc", type: "recovery", next: "/set-password" });
});
test("sign-up and unknown types are refused", () => {
  assert.equal(readEmailLink({ token_hash: "abc", type: "signup" }).kind, "invalid");
  assert.equal(readEmailLink({ token_hash: "abc", type: "magiclink" }).kind, "invalid");
});
test("missing token is refused", () => {
  assert.equal(readEmailLink({ type: "invite" }).kind, "invalid");
});
test("next cannot point to another site", () => {
  assert.equal((readEmailLink({ token_hash: "abc", type: "invite", next: "//evil.example" }) as { next: string }).next, "/set-password");
  assert.equal((readEmailLink({ token_hash: "abc", type: "invite", next: "https://evil.example" }) as { next: string }).next, "/set-password");
});
test("PKCE code links are accepted", () => {
  assert.deepEqual(readEmailLink({ code: "xyz" }), { kind: "code", code: "xyz", next: "/" });
});
