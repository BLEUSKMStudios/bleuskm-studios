// Brevo read errors: what the Communications page shows. Synthetic values only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { brevoReadError } from "./brevo.ts";

test("brevo: a 403 on campaigns names the account/key permission and keeps Brevo's code", () => {
  const e = brevoReadError(403, { code: "permission_denied", message: "Unable to access campaigns" }, "email campaigns");
  assert.match(e, /403/);
  assert.match(e, /not allowed to read email campaigns/);
  assert.match(e, /permission_denied · Unable to access campaigns/);
});
test("brevo: a 401 points at the key or Authorized IPs", () => {
  assert.match(brevoReadError(401, {}, "contact lists"), /Authorized IPs/);
});
test("brevo: Brevo's text is trimmed and stripped of markup", () => {
  const e = brevoReadError(500, { code: "x<y>", message: "<b>" + "a".repeat(500) }, "email events");
  assert.ok(!e.includes("<"));
  assert.ok(e.length < 400);
});
