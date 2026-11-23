// The Final Hand import: Airtable (legacy portal) -> Studio OS (Supabase).
//
// Pure code. It turns Airtable records into one SQL script that is safe to run
// again and again:
//   * every imported row carries source = 'airtable:<table id>' and
//     source_id = the Airtable record id, unique together, so a re-run updates
//     instead of duplicating;
//   * casting applicants are matched on (role, email), and their files and
//     notes are only added the first time;
//   * nothing is ever deleted, in Supabase or in Airtable.
// The runner (scripts/import-final-hand.mts) fetches the records and applies
// the script with psql in one transaction. Output never contains personal
// data in logs: only counts.

export type AirtableRecord = { id: string; createdTime?: string; fields: Record<string, unknown> };
export type Tables = Record<TableKey, AirtableRecord[]>;

export const BASE_ID = "appXf1NxIVhYbuV4j";
export const TABLES = {
  timeline: { id: "tblQ5GVTrUFhOWMiQ", name: "Production Timeline" },
  contracts: { id: "tbl9V7tnVsuccyNsv", name: "Contracts" },
  portalNotes: { id: "tblFDppXUIgiH52K8", name: "Portal Notes" },
  pushedNotes: { id: "tblkr4cvu7qCbCD0e", name: "Pushed Notes" },
  files: { id: "tblRcNwwGKpl4IylQ", name: "Portal Files" },
  locations: { id: "tblNXw83wijZmQqBA", name: "Portal Locations" },
  scenes: { id: "tblH9bkPLY9u029Ji", name: "Portal Scenes" },
  continuity: { id: "tblZ4GGCao9uzczxe", name: "Portal Continuity" },
  takeLog: { id: "tblM7lhg0pbtKhFP8", name: "Portal Take Log" },
  sound: { id: "tbl59oUC6f3hKeauN", name: "Portal Sound Moments" },
  characterNotes: { id: "tbliAd7h6AVuP9ej6", name: "Character Casting Notes" },
  tasks: { id: "tbl7TxX0xPNI7YxZ9", name: "Production Tasks" },
  sentEmails: { id: "tblshz4V9itp8DTuy", name: "Sent Emails" },
  polls: { id: "tblBQ2y1z2KeGSs6S", name: "Meeting Polls" },
  crew: { id: "tblCR7Cg3WugORlwO", name: "Crew applications" },
  casting: { id: "tblLGmXULNb9ebFxH", name: "Casting Submissions" },
} as const;
export type TableKey = keyof typeof TABLES;

export const PRODUCTION = { slug: "the-final-hand", title: "The Final Hand" } as const;
export const CASTING_ARCHIVE_SLUG = "the-final-hand-casting-archive";
const FILM = "The Final Hand";

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------
export type Sql = { sql: string };
type Value = string | number | boolean | null | undefined | Sql;
const raw = (sql: string): Sql => ({ sql });

export function lit(v: Value): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return v.sql;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  // Standard-conforming string literal; NUL bytes are not allowed in Postgres text.
  return `'${v.replace(/\u0000/g, "").replace(/'/g, "''")}'`;
}

const PROD = raw(`(select id from public.productions where slug = ${lit(PRODUCTION.slug)})`);
const src = (t: TableKey) => `airtable:${TABLES[t].id}`;

function upsert(table: string, row: Record<string, Value>): string {
  const cols = Object.keys(row);
  const updates = cols.filter((c) => c !== "source" && c !== "source_id").map((c) => `${c} = excluded.${c}`);
  return `insert into public.${table} (${cols.join(", ")}) values (${cols.map((c) => lit(row[c])).join(", ")})\n` +
    `  on conflict (source, source_id) where source is not null do update set ${updates.join(", ")};`;
}

// ---------------------------------------------------------------------------
// Field cleaning
// ---------------------------------------------------------------------------
const s = (v: unknown, max = 2000): string | null => {
  if (v === null || v === undefined) return null;
  const t = (Array.isArray(v) ? v.map((x) => (typeof x === "object" && x && "name" in x ? (x as { name: string }).name : String(x))).join(", ") : typeof v === "object" && "name" in (v as object) ? (v as { name: string }).name : String(v)).trim();
  return t ? t.slice(0, max) : null;
};
const day = (v: unknown): string | null => {
  const t = s(v, 40);
  if (!t) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(t);
  return m && !Number.isNaN(Date.parse(`${m[1]}T00:00:00Z`)) ? m[1] : null;
};
const ts = (v: unknown): string | null => {
  const t = s(v, 60);
  return t && !Number.isNaN(Date.parse(t)) ? new Date(t).toISOString() : null;
};
const EMAIL = /[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+/;
export const email = (v: unknown): string | null => {
  const t = s(v, 500);
  const m = t ? EMAIL.exec(t) : null;
  return m && m[0].length <= 254 ? m[0].toLowerCase() : null;
};
const url = (v: unknown): string | null => {
  const t = s(v, 1000);
  return t && /^https?:\/\//i.test(t) ? t : null;
};
const phone = (v: unknown): string | null => s(v, 40);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const first = (v: unknown): string | null => (Array.isArray(v) && v.length ? s(v[0]) : s(v));
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^rec[A-Za-z0-9]{14}$/.test(x)) : []);
const joinLines = (...parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join("\n") || null;

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------
const TIMELINE_STATUS: Record<string, string> = { Upcoming: "upcoming", Active: "active", Complete: "complete" };
function eventKind(title: string): string {
  const t = title.toLowerCase();
  if (/shoot (window|week|day)|production$|^shoot/.test(t)) return "milestone";
  if (/meeting|table read|read\b/.test(t)) return "meeting";
  if (/callback/.test(t)) return "callback";
  if (/deadline|submissions|decision/.test(t)) return "deadline";
  return "milestone";
}
const TASK_STATUS: Record<string, string> = { "To Do": "todo", "In Progress": "in_progress", Done: "done" };
const LOCATION_STATUS: Record<string, string> = {
  "Not Yet Contacted": "scouting", "Called - No Answer": "pending", "Called - Maybe Follow Up": "pending", Approved: "confirmed", Declined: "declined",
};

/** Casting status from the portal's several fields, most decisive first. */
export function castingStatus(f: Record<string, unknown>): string {
  const cast = s(f["Cast Status"]);
  const casting = s(f["Casting Status"]);
  const tape = s(f["Self Tape Status"]);
  if (cast === "Confirmed") return "cast";
  if (cast === "Not Cast") return "not_selected";
  if (tape === "Selected for Final Round") return "audition";
  if (casting === "Callback") return "callback";
  if (casting === "Pass" || casting === "Redirect") return "not_selected";
  if (casting === "Reviewing") return "shortlisted";
  return "submitted";
}

export type FileCopy = { storagePath: string };
/** Files already copied into the private bucket, by Airtable record id. */
export type CopiedFiles = Record<string, FileCopy | undefined>;

export type Plan = { sql: string; counts: Record<string, number>; skipped: Record<string, number>; empty: string[] };

export function buildPlan(t: Tables, copied: CopiedFiles = {}): Plan {
  const out: string[] = [];
  const counts: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const count = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  const skip = (k: string) => { skipped[k] = (skipped[k] ?? 0) + 1; };
  const empty = (Object.keys(TABLES) as TableKey[]).filter((k) => (t[k] ?? []).length === 0).map((k) => TABLES[k].name);

  out.push("-- The Final Hand import (generated). Safe to re-run.");
  out.push(`insert into public.productions (slug, title, type, status, current_stage, legacy_source) values (${lit(PRODUCTION.slug)}, ${lit(PRODUCTION.title)}, 'film', 'active', 'postproduction', 'airtable') on conflict (slug) do nothing;`);
  out.push(`update public.productions set legacy_source = 'airtable' where slug = ${lit(PRODUCTION.slug)} and legacy_source is null;`);

  // Crew roster -> contacts + the production team
  for (const r of t.crew ?? []) {
    const f = r.fields;
    const status = s(f.Status);
    const forTfh = f["For the final Hand"] === true;
    if (!(status === "CORE" || status === "SUPPORT" || forTfh)) continue;
    const name = s(f.Name, 200);
    if (!name) { skip("crew: no name"); continue; }
    const preferred = s(f["Preferred role by Director"], 500);
    out.push(upsert("contacts", {
      full_name: name, kind: "person", category: "crew", roles: preferred ?? s(f.Role, 500), email: email(f.Email), phone: phone(f.Phone),
      city: s(f.City, 200), website: url(f["Resume / Portfolio Link"]) ?? url(f["Reel / Work Samples"]),
      notes: joinLines(s(f["Gear List"], 3000) && `Gear: ${s(f["Gear List"], 3000)}`, s(f.Availability) && `Availability: ${s(f.Availability)}`, s(f.Notes, 4000)),
      source: src("crew"), source_id: r.id,
    }));
    count("contacts");
    out.push(upsert("production_team", {
      production_id: PROD, full_name: name,
      contact_id: raw(`(select id from public.contacts where source = ${lit(src("crew"))} and source_id = ${lit(r.id)})`),
      position: first(f["Preferred role by Director"]) ?? s(f.Role, 200) ?? "Crew", team: "crew",
      status: status === "CORE" ? "confirmed" : "prospect", email: email(f.Email), phone: phone(f.Phone),
      notes: joinLines(status && `Portal status: ${status}`, s(f["Film set role notes"], 3000), s(f["Guide Link"]) && `Department guide: ${s(f["Guide Link"])}`),
      source: src("crew"), source_id: r.id,
    }));
    count("production_team (crew)");
  }

  // Timeline -> scheduling
  for (const r of t.timeline ?? []) {
    const f = r.fields;
    const title = s(f.Phase, 200);
    if (!title) { skip("timeline: no title"); continue; }
    const start = day(f["Start Date"]);
    let end = day(f["End Date"]);
    if (start && end && end < start) end = null;
    out.push(upsert("schedule_events", {
      production_id: PROD, title, kind: eventKind(title), starts_on: start, ends_on: end, date_label: s(f["Action Label"], 120),
      department: s(f.Department, 120), status: TIMELINE_STATUS[s(f.Status) ?? ""] ?? "upcoming", description: s(f.Description, 10000),
      sort: num(f["Sort Index"]) ?? 0, source: src("timeline"), source_id: r.id,
    }));
    count("schedule_events");
  }

  // Contracts -> documents
  for (const r of t.contracts ?? []) {
    const f = r.fields;
    const type = s(f["Contract Type"], 120) ?? "Contract";
    const name = s(f.Name, 200) ?? "Unnamed signer";
    const sig = Array.isArray(f.Signature) && f.Signature.length ? (f.Signature[0] as { filename?: string }) : null;
    const file = copied[r.id];
    const linked = ids(f["Linked Crew"])[0];
    out.push(upsert("documents", {
      production_id: PROD, title: `${type}: ${name}`.slice(0, 200),
      category: /release/i.test(type) ? "release" : "contract", contract_type: type,
      status: s(f["Contract Status"]) === "Signed" ? "signed" : "sent", signer_name: name, signer_email: email(f.Email),
      signer_role: s(f.Role, 200), signed_on: day(f["Date Signed"]),
      contact_id: linked ? raw(`(select id from public.contacts where source = ${lit(src("crew"))} and source_id = ${lit(linked)})`) : null,
      storage_path: file?.storagePath ?? null,
      details: joinLines(s(f["Extra Details"], 8000), sig && !file && `Signature image kept in Airtable (Contracts, record ${r.id}).`),
      source: src("contracts"), source_id: r.id,
    }));
    count("documents (contracts)");
  }

  // Portal files -> scripts (scripts) or documents
  for (const r of t.files ?? []) {
    const f = r.fields;
    const name = s(f.Name, 200) ?? "Portal file";
    const file = copied[r.id];
    const note = joinLines(s(f.Notes, 5000), s(f["For Department"]) && `Shared with: ${s(f["For Department"])}`, !file && `File kept in Airtable (Portal Files, record ${r.id}).`);
    if (/script|draft|treatment/i.test(name)) {
      const v = /v(?:ersion)?\s*\.?\s*(\d+(?:\.\d+)?)/i.exec(name);
      out.push(upsert("scripts", {
        production_id: PROD, title: name, kind: /treatment/i.test(name) ? "treatment" : "script", version: v ? `v${v[1]}` : null,
        draft_date: day(f.Created) ?? day(r.createdTime), status: "locked", drive_url: null, storage_path: file?.storagePath ?? null, notes: note,
        source: src("files"), source_id: r.id,
      }));
      count("scripts");
    } else {
      out.push(upsert("documents", {
        production_id: PROD, title: name, category: "other", status: "filed", storage_path: file?.storagePath ?? null, details: note,
        drive_url: url(f["File URL"]) && !/airtableusercontent/.test(String(f["File URL"])) ? url(f["File URL"]) : null,
        source: src("files"), source_id: r.id,
      }));
      count("documents (files)");
    }
  }

  // Locations
  for (const r of t.locations ?? []) {
    const f = r.fields;
    const name = s(f["Location Name"], 200);
    if (!name) { skip("locations: no name"); continue; }
    out.push(upsert("locations", {
      production_id: PROD, name, address: s(f.Address, 1000), contact_name: s(f["Contact Person"], 200), phone: phone(f.Phone), email: email(f.Email),
      status: LOCATION_STATUS[s(f.Status) ?? ""] ?? "scouting", notes: joinLines(s(f.Status) && `Portal status: ${s(f.Status)}`, s(f.Notes, 8000)),
      source: src("locations"), source_id: r.id,
    }));
    count("locations");
  }

  // Tasks
  for (const r of t.tasks ?? []) {
    const f = r.fields;
    const title = s(f.Title, 200);
    if (!title) { skip("tasks: no title"); continue; }
    const status = TASK_STATUS[s(f.Status) ?? ""] ?? "todo";
    const who = s(f["Assigned To"], 200);
    out.push(upsert("production_tasks", {
      production_id: PROD, title, description: joinLines(s(f.Description, 9000), s(f["Created By"]) && `Created by ${s(f["Created By"])}`),
      assignee: who === "Unassigned" ? null : who, status, due_on: day(f["Due Date"]), stage: "preproduction",
      source: src("tasks"), source_id: r.id,
    }));
    count("production_tasks");
  }

  // Notes: portal notes, pushed notes (with replies), sound moments, casting notes, continuity, take log
  const note = (k: TableKey, r: AirtableRecord, row: Record<string, Value>) => {
    out.push(upsert("production_notes", { production_id: PROD, ...row, source: src(k), source_id: r.id }));
    count("production_notes");
  };
  for (const r of t.portalNotes ?? []) {
    const f = r.fields;
    note("portalNotes", r, {
      title: s(f.Title, 200) ?? "Note", body: s(f.Note, 20000), category: "announcement", audience: s(f.Audience, 120),
      author_name: s(f.Author, 200), status: s(f.Status) === "Archived" ? "archived" : "open", noted_at: ts(r.createdTime) ?? raw("now()"),
    });
  }
  const pushed = [...(t.pushedNotes ?? [])].sort((a, b) => Number(!!s(a.fields["Parent ID"])) - Number(!!s(b.fields["Parent ID"])));
  for (const r of pushed) {
    const f = r.fields;
    const parent = s(f["Parent ID"], 40);
    note("pushedNotes", r, {
      title: s(f.Title, 200) ?? "Note", body: s(f.Content, 20000), category: "general",
      audience: joinLines(s(f["To Department"]) && `Department: ${s(f["To Department"])}`, s(f["To Person"]) && `Person: ${s(f["To Person"])}`),
      author_name: s(f["From Person"], 200) ?? s(f["From Department"], 200), noted_at: ts(f.Created) ?? ts(r.createdTime) ?? raw("now()"),
      parent_id: parent && /^rec[A-Za-z0-9]{14}$/.test(parent) ? raw(`(select id from public.production_notes where source = ${lit(src("pushedNotes"))} and source_id = ${lit(parent)})`) : null,
    });
  }
  for (const r of t.sound ?? []) note("sound", r, { title: s(r.fields.Label, 200) ?? "Sound moment", body: s(r.fields.Note, 20000), category: "sound", noted_at: ts(r.createdTime) ?? raw("now()") });
  for (const r of t.characterNotes ?? []) {
    note("characterNotes", r, {
      title: s(r.fields.Character, 200) ?? "Character", body: s(r.fields["Casting Notes"], 20000), category: "casting",
      author_name: s(r.fields["Updated By"], 200), noted_at: ts(r.fields.Updated) ?? ts(r.createdTime) ?? raw("now()"),
    });
  }
  for (const r of t.continuity ?? []) {
    note("continuity", r, {
      title: `Scene ${s(r.fields.Scene, 40) ?? "?"}${s(r.fields.Take) ? `, take ${s(r.fields.Take, 20)}` : ""}`, body: s(r.fields.Note, 20000),
      category: "continuity", author_name: s(r.fields["Created By"], 200), noted_at: ts(r.fields.Created) ?? ts(r.createdTime) ?? raw("now()"),
    });
  }
  for (const r of t.takeLog ?? []) {
    note("takeLog", r, {
      title: `Scene ${s(r.fields.Scene, 40) ?? "?"}, take ${s(r.fields["Take Number"], 20) ?? "?"}${r.fields["Best Take"] === true ? " (best)" : ""}`,
      body: s(r.fields.Notes, 20000), category: "take_log", noted_at: ts(r.createdTime) ?? raw("now()"),
    });
  }
  for (const r of t.scenes ?? []) {
    const f = r.fields;
    note("scenes", r, {
      title: `Scene ${s(f["Scene Number"], 40) ?? "?"}`, category: "other",
      body: joinLines(s(f.Location) && `Location: ${s(f.Location)}`, s(f.Characters) && `Characters: ${s(f.Characters)}`, s(f["Day or Night"]) && `Time: ${s(f["Day or Night"])}`, s(f["Key Action"], 8000)),
      noted_at: ts(r.createdTime) ?? raw("now()"),
    });
  }

  // Sent emails -> communications history
  for (const r of t.sentEmails ?? []) {
    const f = r.fields;
    out.push(upsert("comm_messages", {
      production_id: PROD, direction: "outbound", channel: "portal", from_address: email(f["From Address"]),
      to_addresses: s(f.To, 5000), subject: s(f.Subject, 500), body: s(f.Body, 100000),
      status: s(f.Status) === "Failed" ? "failed" : "sent", sent_by_name: s(f["Sent By"], 200), sent_at: ts(f["Sent At"]) ?? ts(r.createdTime),
      source: src("sentEmails"), source_id: r.id,
    }));
    count("comm_messages");
  }

  // Casting submissions for The Final Hand -> a closed archive casting call
  const cast = (t.casting ?? []).filter((r) => s(r.fields.Film) === FILM);
  if (cast.length) {
    const CALL = raw(`(select id from public.casting_calls where public_slug = ${lit(CASTING_ARCHIVE_SLUG)})`);
    out.push(`insert into public.casting_calls (production_id, public_slug, title, summary, status) values (${lit(PROD)}, ${lit(CASTING_ARCHIVE_SLUG)}, 'The Final Hand: 2026 casting (imported)', 'Imported from the Final Hand portal. Closed: not shown on the website.', 'closed') on conflict (public_slug) do nothing;`);
    const roles = [...new Set(cast.map((r) => s(r.fields.Role, 120) ?? "General"))];
    roles.forEach((name, i) => {
      const anyCast = cast.some((r) => (s(r.fields.Role, 120) ?? "General") === name && castingStatus(r.fields) === "cast");
      out.push(`insert into public.casting_roles (call_id, production_id, name, status, sort) values (${lit(CALL)}, ${lit(PROD)}, ${lit(name)}, ${lit(anyCast ? "cast" : "closed")}, ${i}) on conflict (call_id, name) do nothing;`);
    });
    count("casting_calls");
    counts.casting_roles = roles.length;
    const seen = new Set<string>();
    for (const r of cast) {
      const f = r.fields;
      const mail = email(f.Email);
      const name = s(f.Name, 200);
      const role = s(f.Role, 120) ?? "General";
      if (!mail || !name) { skip("casting: missing name or email"); continue; }
      if (seen.has(`${role}|${mail}`)) { skip("casting: duplicate person for the same role"); continue; }
      seen.add(`${role}|${mail}`);
      const ROLE = raw(`(select id from public.casting_roles where call_id = ${CALL.sql} and name = ${lit(role)})`);
      const status = castingStatus(f);
      const rating = num(f["Producer Rating"]);
      const materials: [string, string | null][] = [
        ["headshot", url(f.Headshot)], ["reel", url(f["Reel/Portfolio Link"])], ["other", url(f["Additional Materials"])], ["self_tape", url(f["Self Tape URL"])],
      ];
      const mats = materials.filter(([, u]) => u).map(([k, u]) => `select app.production_id, app.id, ${lit(k)}::public.casting_material_kind, ${lit(u)} from app`);
      const redirect = s(f["Callback/Redirect"], 500);
      const noteText = joinLines(s(f.Notes, 4000), redirect && `Callback/redirect: ${redirect}`, s(f["To Role"]) && `Moved to role: ${s(f["To Role"])}`,
        s(f["Email Sent"]) && `Email: ${s(f["Email Sent"])}`, s(f["Future Role"]) && `Future role: ${s(f["Future Role"])}`,
        f["Casting Directory"] === true && "In the casting directory", `Imported from Airtable (Casting Submissions, record ${r.id}).`);
      const parts = [
        `with app as (insert into public.casting_applications (call_id, role_id, production_id, full_name, email, phone, age, location, about, source, status, rating, submitted_at)`,
        `  values (${lit(CALL)}, ${lit(ROLE)}, ${lit(PROD)}, ${lit(name)}, ${lit(mail)}, ${lit(phone(f.Phone))}, ${lit(num(f.Age) !== null && num(f.Age)! >= 0 && num(f.Age)! <= 120 ? Math.round(num(f.Age)!) : null)}, ${lit(s(f.Location, 200))}, ${lit(s(f.About, 5000))}, 'airtable', ${lit(status)}, ${lit(rating && rating >= 1 && rating <= 5 ? Math.round(rating) : null)}, ${lit(ts(r.createdTime) ?? ts(f["Created Time"]) ?? raw("now()"))})`,
        `  on conflict (role_id, email) do nothing returning id, production_id)`,
      ];
      const tail: string[] = [];
      if (mats.length) tail.push(`m as (insert into public.casting_materials (production_id, application_id, kind, url) ${mats.join(" union all ")})`);
      tail.push(`n as (insert into public.casting_notes (production_id, application_id, body) select app.production_id, app.id, ${lit(noteText ?? "Imported from Airtable.")} from app)`);
      out.push(`${parts.join("\n")}${tail.length ? ",\n" + tail.join(",\n") : ""}\nselect 1;`);
      count("casting_applications");
      if (status === "cast") {
        out.push(upsert("production_team", {
          production_id: PROD, full_name: name, position: role, team: "cast", status: "confirmed", email: mail, phone: phone(f.Phone),
          source: src("casting"), source_id: r.id,
        }));
        count("production_team (cast)");
      }
    }
  }

  return { sql: out.join("\n"), counts, skipped, empty };
}

/**
 * Validation: after an import, every imported record must be in Studio OS.
 * Fails the transaction (and the workflow) when anything is missing.
 */
export function buildValidation(plan: Plan): string {
  const checks: [string, string, string][] = [
    ["contacts", `source = ${lit(src("crew"))}`, "contacts"],
    ["production_team", `source = ${lit(src("crew"))}`, "production_team (crew)"],
    ["production_team", `source = ${lit(src("casting"))}`, "production_team (cast)"],
    ["schedule_events", `source = ${lit(src("timeline"))}`, "schedule_events"],
    ["documents", `source = ${lit(src("contracts"))}`, "documents (contracts)"],
    ["locations", `source = ${lit(src("locations"))}`, "locations"],
    ["production_tasks", `source = ${lit(src("tasks"))}`, "production_tasks"],
    ["production_notes", `source like 'airtable:%'`, "production_notes"],
    ["comm_messages", `source = ${lit(src("sentEmails"))}`, "comm_messages"],
    ["casting_applications", `source = 'airtable' and call_id = (select id from public.casting_calls where public_slug = ${lit(CASTING_ARCHIVE_SLUG)})`, "casting_applications"],
  ];
  const lines = checks.map(([table, where, key]) => {
    const want = plan.counts[key] ?? 0;
    return `  select count(*) into n from public.${table} where ${where};\n  if n < ${want} then raise exception 'Validation failed: % has % imported rows, expected at least %', ${lit(key)}, n, ${want}; end if;\n  got := got || jsonb_build_object(${lit(key)}, n);`;
  });
  return [
    "do $$",
    "declare n bigint; got jsonb := '{}'::jsonb;",
    "begin",
    `  if not exists (select 1 from public.productions where slug = ${lit(PRODUCTION.slug)}) then raise exception 'Validation failed: production missing'; end if;`,
    ...lines,
    `  insert into public.migration_runs (name, mode, status, finished_at, summary) values ('The Final Hand (Airtable portal)', 'validate', 'succeeded', now(), jsonb_build_object('totals', got));`,
    "end $$;",
  ].join("\n");
}

/** The run record written at the end of an import (counts only, no personal data). */
export function runRecord(plan: Plan, mode: "apply" | "dry_run"): string {
  const summary = JSON.stringify({ totals: plan.counts, skipped: plan.skipped, empty_tables: plan.empty });
  return `insert into public.migration_runs (name, mode, status, finished_at, summary) values ('The Final Hand (Airtable portal)', ${lit(mode)}, 'succeeded', now(), ${lit(summary)}::jsonb);`;
}
