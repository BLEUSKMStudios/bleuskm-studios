import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, safeNextPath, passwordProblem, type SessionFacts } from "./decide.ts";

const active = { isOwner: false, status: "active" as const };
const owner = { isOwner: true, status: "active" as const };
const base: SessionFacts = { signedIn: true, profile: active, hasAuthenticator: false, passedAuthenticator: false };

test("signed-out visitors are sent to sign in", () => {
  assert.equal(decide({ ...base, signedIn: false }).kind, "sign-in");
});

test("an account without a profile is blocked", () => {
  assert.equal(decide({ ...base, profile: null }).kind, "blocked");
});

test("a deactivated person is blocked even with a valid session and authenticator", () => {
  assert.equal(
    decide({ ...base, profile: { isOwner: false, status: "deactivated" }, hasAuthenticator: true, passedAuthenticator: true }).kind,
    "blocked",
  );
});

test("the owner must set up an authenticator app before anything else", () => {
  assert.equal(decide({ ...base, profile: owner }).kind, "set-up-authenticator");
});

test("the owner with an authenticator must use it in every session", () => {
  assert.equal(decide({ ...base, profile: owner, hasAuthenticator: true }).kind, "verify-authenticator");
  assert.equal(decide({ ...base, profile: owner, hasAuthenticator: true, passedAuthenticator: true }).kind, "allow");
});

test("anyone who has set up an authenticator must use it", () => {
  assert.equal(decide({ ...base, hasAuthenticator: true }).kind, "verify-authenticator");
});

test("an active person without an authenticator is allowed (optional for now)", () => {
  assert.equal(decide(base).kind, "allow");
});

test("links after sign-in can only lead to pages on this site", () => {
  assert.equal(safeNextPath("/set-password"), "/set-password");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("/\\evil.example"), "/");
  assert.equal(safeNextPath(null), "/");
});

test("passwords need 12 characters and must match", () => {
  assert.match(passwordProblem("short", "short")!, /12/);
  assert.match(passwordProblem("long-enough-pass", "different-pass!")!, /match/);
  assert.equal(passwordProblem("long-enough-pass", "long-enough-pass"), null);
});
