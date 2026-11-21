import assert from "node:assert/strict";
import { test } from "node:test";

import { AccessDeniedError, checkAccess, checkAccessFor, requireAccess, requireAccessFor, type RpcClient } from "./permissions.ts";

const P1 = "00000000-0000-0000-0000-00000000f001";
const USER = "00000000-0000-0000-0000-0000000000a1";

function client(reply: { data: unknown; error: unknown } | Error) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const c: RpcClient = {
    rpc(fn, args) {
      calls.push({ fn, args });
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
    },
  };
  return { c, calls };
}

test("allows only when the database answers exactly true", async () => {
  const { c, calls } = client({ data: true, error: null });
  assert.equal(await checkAccess(c, P1, "casting", "view"), true);
  assert.deepEqual(calls, [{ fn: "check_access", args: { p_production: P1, p_section: "casting", p_level: "view" } }]);
});

test("fails closed on a database refusal, an error, odd data or a network failure", async () => {
  for (const reply of [
    { data: false, error: null },
    { data: true, error: { message: "permission denied" } },
    { data: null, error: null },
    { data: "true", error: null },
    { data: [true], error: null },
    new Error("network down"),
  ]) {
    const { c } = client(reply);
    assert.equal(await checkAccess(c, P1, "casting", "view"), false, JSON.stringify(reply));
  }
});

test("rejects bad input without asking the database", async () => {
  const { c, calls } = client({ data: true, error: null });
  // @ts-expect-error: settings is never grantable
  assert.equal(await checkAccess(c, P1, "settings", "view"), false);
  // @ts-expect-error: unknown level
  assert.equal(await checkAccess(c, P1, "casting", "admin"), false);
  assert.equal(await checkAccess(c, "not-a-uuid", "casting", "view"), false);
  assert.equal(await checkAccess(c, "' or 1=1 --", "casting", "view"), false);
  assert.equal(await checkAccess(c, null, "budget", "view"), false, "Budget has no Studio level");
  assert.equal(calls.length, 0);
});

test("Studio-level checks pass null as the production", async () => {
  const { c, calls } = client({ data: true, error: null });
  assert.equal(await checkAccess(c, null, "casting", "view"), true);
  assert.equal(calls[0].args.p_production, null);
});

test("requireAccess throws a 403 error when denied and passes when allowed", async () => {
  await assert.rejects(requireAccess(client({ data: false, error: null }).c, P1, "budget", "edit"), (e: unknown) =>
    e instanceof AccessDeniedError && e.status === 403);
  await requireAccess(client({ data: true, error: null }).c, P1, "budget", "edit");
});

test("server-side checks for a given user use the service-only function", async () => {
  const { c, calls } = client({ data: true, error: null });
  assert.equal(await checkAccessFor(c, USER, P1, "documents", "edit"), true);
  assert.equal(calls[0].fn, "check_access_for");
  assert.equal(calls[0].args.p_user, USER);

  assert.equal(await checkAccessFor(c, "nobody", P1, "documents", "edit"), false, "user id must be a UUID");
  await assert.rejects(requireAccessFor(client({ data: false, error: null }).c, USER, P1, "documents", "view"), AccessDeniedError);
});
