// Contacts import runner: Brevo contacts + the website's Airtable sign-up
// tables -> one SQL file of public.studio_intake calls (see
// lib/migrate/contacts-import.ts).
//
//   node scripts/import-contacts.mts --mode=dry-run --out=contacts.sql
//   node scripts/import-contacts.mts --mode=apply   --out=contacts.sql
//   node scripts/import-contacts.mts --fixture=file.json ...   (no network)
//
// Applied by the workflow with psql in one transaction: a dry run ends in
// ROLLBACK. Brevo and Airtable are only read. No email is sent (imports never
// trigger confirmations). Output is counts only: Actions logs are public.
// Needs BREVO_KEY and AIRTABLE_TOKEN unless --fixture is given.

import { readFileSync, writeFileSync } from "node:fs";
import { BASE_ID, lit, type AirtableRecord } from "../lib/migrate/final-hand.ts";
import { SIGNUP_TABLES, buildContactsPlan, contactsValidation, type BrevoContact, type SignupKey } from "../lib/migrate/contacts-import.ts";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function get(url: URL, headers: Record<string, string>): Promise<Response> {
  let res: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(url, { headers });
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  return res!;
}

async function airtable(token: string, tableId: string): Promise<AirtableRecord[]> {
  const rows: AirtableRecord[] = [];
  let offset: string | undefined;
  for (let page = 0; page < 200; page++) {
    const u = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
    u.searchParams.set("pageSize", "100");
    if (offset) u.searchParams.set("offset", offset);
    const res = await get(u, { Authorization: `Bearer ${token}` });
    if (!res.ok) throw new Error(`Airtable read failed for table ${tableId}: HTTP ${res.status}`);
    const body = (await res.json()) as { records: AirtableRecord[]; offset?: string };
    rows.push(...body.records);
    offset = body.offset;
    if (!offset) return rows;
    await new Promise((r) => setTimeout(r, 220));
  }
  throw new Error("Too many Airtable pages");
}

async function brevo(key: string): Promise<BrevoContact[]> {
  const out: BrevoContact[] = [];
  for (let offset = 0; offset < 50000; offset += 500) {
    const u = new URL("https://api.brevo.com/v3/contacts");
    u.searchParams.set("limit", "500");
    u.searchParams.set("offset", String(offset));
    const res = await get(u, { "api-key": key, accept: "application/json" });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { code?: string };
      throw new Error(`Brevo contacts read failed: HTTP ${res.status} ${String(b.code ?? "").replace(/\W/g, "")}`);
    }
    const body = (await res.json()) as { contacts?: BrevoContact[] };
    const page = body.contacts ?? [];
    out.push(...page);
    if (page.length < 500) return out;
  }
  return out;
}

async function main() {
  const mode = arg("mode") ?? "dry-run";
  if (!["dry-run", "apply"].includes(mode)) throw new Error(`Unknown --mode=${mode}`);
  const outFile = arg("out") ?? "contacts-import.sql";
  let sources: { brevo: BrevoContact[]; airtable: Record<SignupKey, AirtableRecord[]> };
  const fixture = arg("fixture");
  if (fixture) {
    const d = JSON.parse(readFileSync(fixture, "utf8"));
    sources = { brevo: d.brevo ?? [], airtable: { newsletter: d.newsletter ?? [], notify: d.notify ?? [], inquiries: d.inquiries ?? [] } };
  } else {
    const key = (process.env.BREVO_KEY ?? "").trim();
    const token = (process.env.AIRTABLE_TOKEN ?? "").trim();
    if (!key || !token) throw new Error("BREVO_KEY and AIRTABLE_TOKEN must both be set. Nothing was read or written.");
    const at = {} as Record<SignupKey, AirtableRecord[]>;
    for (const k of Object.keys(SIGNUP_TABLES) as SignupKey[]) at[k] = await airtable(token, SIGNUP_TABLES[k].id);
    sources = { brevo: await brevo(key), airtable: at };
  }
  const plan = buildContactsPlan(sources);
  const parts = ["\\set ON_ERROR_STOP on", "\\set VERBOSITY sqlstate", "begin;", plan.sql, contactsValidation(),
    mode === "apply"
      ? `insert into public.migration_runs (name, mode, status, finished_at, summary) values ('Contacts (Brevo and website sign-ups)', 'apply', 'succeeded', now(), ${lit(JSON.stringify({ totals: plan.counts, skipped: plan.skipped }))}::jsonb);\ncommit;`
      : "rollback;"];
  writeFileSync(outFile, parts.join("\n") + "\n");
  console.log(`Mode: ${mode}`);
  console.log(`Brevo contacts read: ${sources.brevo.length}`);
  for (const k of Object.keys(SIGNUP_TABLES) as SignupKey[]) console.log(`Airtable ${SIGNUP_TABLES[k].name}: ${sources.airtable[k].length}`);
  console.log("Records sent to Studio OS intake (re-runs update, never duplicate):");
  for (const [k, n] of Object.entries(plan.counts)) console.log(`  ${k}: ${n}`);
  for (const [k, n] of Object.entries(plan.skipped)) console.log(`  skipped, ${k}: ${n}`);
  console.log(`SQL written to ${outFile}${mode === "dry-run" ? " (ends in ROLLBACK)" : ""}.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : "Import failed"); process.exit(1); });
