// A call sheet as data, and the small formatting rules shared by the hub page,
// the personal page and the PDF. Pure code (unit-tested).

export type SheetEntry = { id: string; name: string; position: string | null; team: string; callTime: string | null; notes: string | null };
export type Sheet = {
  id: string;
  production: string;
  title: string;
  shootDate: string; // YYYY-MM-DD
  version: number;
  generalCall: string | null;
  crewCall: string | null;
  location: string | null;
  parking: string | null;
  hospital: string | null;
  weather: string | null;
  sunrise: string | null;
  sunset: string | null;
  keyContacts: string | null;
  safety: string | null;
  schedule: string | null;
  notes: string | null;
  entries: SheetEntry[];
};

/** "07:30:00" → "7:30 AM"; empty → "". */
export function timeLabel(t: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** "2026-12-05" → "Saturday, December 5, 2026" (the date as written, no time zone shift). */
export function dateLabel(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

const TEAM_ORDER = ["cast", "producer", "crew", "other"] as const;
export const TEAM_LABEL: Record<string, string> = { cast: "Cast", producer: "Producers", crew: "Crew", other: "Other" };

/** Entries grouped by team (cast first), each group by call time then name. */
export function groupEntries(entries: SheetEntry[]): { team: string; label: string; rows: SheetEntry[] }[] {
  const key = (e: SheetEntry) => `${e.callTime ? e.callTime.slice(0, 5) : "99:99"}|${e.name.toLowerCase()}`;
  return TEAM_ORDER.map((team) => ({
    team,
    label: TEAM_LABEL[team],
    rows: entries.filter((e) => (TEAM_ORDER as readonly string[]).includes(e.team) ? e.team === team : team === "other").sort((a, b) => key(a).localeCompare(key(b))),
  })).filter((g) => g.rows.length > 0);
}

/** A person's own call: their line's time, else crew call for crew, else general call. */
export function callFor(sheet: Pick<Sheet, "generalCall" | "crewCall">, e: Pick<SheetEntry, "callTime" | "team"> | null): string | null {
  if (e?.callTime) return e.callTime;
  if (e && e.team !== "cast" && sheet.crewCall) return sheet.crewCall;
  return sheet.generalCall;
}

/** Which identity a person's call sheet email comes from. */
export function identityForTeam(team: string): "casting" | "crew" {
  return team === "cast" ? "casting" : "crew";
}

/** Safe file name for the PDF. */
export function pdfName(s: Pick<Sheet, "production" | "title" | "shootDate" | "version">): string {
  const clean = (x: string) => x.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
  return `${clean(s.production) || "Production"}-Call-Sheet-${clean(s.title) || "Day"}-${s.shootDate}-v${Math.max(1, s.version)}.pdf`;
}

export function sheetFromRows(o: {
  sheet: Record<string, unknown>;
  production: string;
  entries: Record<string, unknown>[];
}): Sheet {
  const s = o.sheet;
  const str = (k: string) => (typeof s[k] === "string" && (s[k] as string).trim() ? (s[k] as string) : null);
  return {
    id: String(s.id),
    production: o.production,
    title: String(s.title ?? "Call sheet"),
    shootDate: String(s.shoot_date ?? ""),
    version: Number(s.version ?? 0),
    generalCall: str("general_call"),
    crewCall: str("crew_call"),
    location: str("location_text"),
    parking: str("parking"),
    hospital: str("nearest_hospital"),
    weather: str("weather"),
    sunrise: str("sunrise"),
    sunset: str("sunset"),
    keyContacts: str("key_contacts"),
    safety: str("safety_notes"),
    schedule: str("schedule"),
    notes: str("notes"),
    entries: o.entries.map((e) => ({
      id: String(e.id), name: String(e.full_name ?? ""), position: (e.position as string | null) ?? null, team: String(e.team ?? "crew"),
      callTime: (e.call_time as string | null) ?? null, notes: (e.notes as string | null) ?? null,
    })),
  };
}
