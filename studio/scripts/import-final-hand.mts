// The Final Hand import runner: reads the legacy portal's Airtable tables and
// writes one SQL file that imports them into Studio OS.
//
//   node scripts/import-final-hand.mts --mode=dry-run  --out=import.sql
//   node scripts/import-final-hand.mts --mode=apply    --out=import.sql
//   node scripts/import-final-hand.mts --mode=validate --out=validate.sql
//   node scripts/import-final-hand.mts --fixture=file.json ...   (no network)
//
// The script never connects to the database itself. The workflow applies the
// file with `psql -1 -v ON_ERROR_STOP=1` (one transaction):
//   dry-run  : import + validation, then ROLLBACK. Nothing is kept.
//   apply    : import + validation + run record, COMMIT.
//   validate : validation only (re-checks a previous apply).
// Airtable is only read. Nothing is deleted anywhere. Output is counts only,
// because GitHub Actions logs for this repository are public.
//
// Needs AIRTABLE_TOKEN (read access to the base) unless --fixture is given.

import { readFileSync, writeFileSync } from "node:fs";
import { BASE_ID, TABLES, buildPlan, buildValidation, runRecord, type AirtableRecord, type TableKey, type Tables } from "../lib/migrate/final-hand.ts";

type Mode = "dry-run" | "apply" | "validate";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function fetchTable(token: string, tableId: string): Promise<AirtableRecord[]> {
  const rows: AirtableRecord[] = [];
  let offset: string | undefined;
  for (let page = 0; page < 200; page++) {
    const u = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
    u.searchParams.set("pageSize", "100");
    if (offset) u.searchParams.set("offset", offset);
    let res: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status !== 429 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    if (!res || !res.ok) throw new Error(`Airtable read failed for table ${tableId}: HTTP ${res?.status ?? "?"}`);
    const body = (await res.json()) as { records: AirtableRecord[]; offset?: string };
    rows.push(...body.records);
    offset = body.offset;
    if (!offset) return rows;
    await new Promise((r) => setTimeout(r, 220)); // stay under 5 requests a second
  }
  throw new Error(`Airtable table ${tableId} has more pages than expected`);
}

async function loadTables(): Promise<Tables> {
  const fixture = arg("fixture");
  const keys = Object.keys(TABLES) as TableKey[];
  if (fixture) {
    const data = JSON.parse(readFileSync(fixture, "utf8")) as Partial<Tables>;
    return Object.fromEntries(keys.map((k) => [k, data[k] ?? []])) as Tables;
  }
  const token = (process.env.AIRTABLE_TOKEN ?? "").trim();
  if (!token) throw new Error("AIRTABLE_TOKEN is not set. Nothing was read or written.");
  const out = {} as Tables;
  for (const k of keys) out[k] = await fetchTable(token, TABLES[k].id);
  return out;
}

async function main() {
  const mode = (arg("mode") ?? "dry-run") as Mode;
  if (!["dry-run", "apply", "validate"].includes(mode)) throw new Error(`Unknown --mode=${mode}`);
  const outFile = arg("out") ?? "final-hand-import.sql";

  const tables = await loadTables();
  const plan = buildPlan(tables);

  // VERBOSITY sqlstate: a failure prints only its error code, never row values
  // (a constraint error's detail would otherwise quote the failing row).
  const parts = ["\\set ON_ERROR_STOP on", "\\set VERBOSITY sqlstate", "begin;"];
  if (mode !== "validate") parts.push(plan.sql);
  parts.push(buildValidation(plan));
  if (mode === "apply") parts.push(runRecord(plan, "apply"), "commit;");
  else if (mode === "dry-run") parts.push("rollback;");
  else parts.push("commit;");
  writeFileSync(outFile, parts.join("\n") + "\n");

  // Counts only: no names, emails or record contents.
  console.log(`Mode: ${mode}`);
  console.log("Airtable records read:");
  for (const k of Object.keys(TABLES) as TableKey[]) console.log(`  ${TABLES[k].name}: ${tables[k].length}`);
  console.log("Rows the import writes (insert or update):");
  for (const [k, n] of Object.entries(plan.counts)) console.log(`  ${k}: ${n}`);
  if (Object.keys(plan.skipped).length) {
    console.log("Skipped:");
    for (const [k, n] of Object.entries(plan.skipped)) console.log(`  ${k}: ${n}`);
  }
  console.log(`SQL written to ${outFile}${mode === "dry-run" ? " (ends in ROLLBACK)" : ""}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Import failed");
  process.exit(1);
});
