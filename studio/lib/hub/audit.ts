import { LEVEL_LABEL, SECTION_LABEL, STAGE_LABEL, STAGE_STATUS_LABEL, STATUS_LABEL } from "./labels.ts";

export type AuditRow = {
  id: number;
  at: string;
  actor_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  table_name: string;
  production_id: string | null;
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
};

export type Names = { people: ReadonlyMap<string, string>; productions: ReadonlyMap<string, string> };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** One plain sentence for an audit log entry. */
export function describeAudit(r: AuditRow, n: Names): string {
  const row = (r.new_row ?? r.old_row ?? {}) as Record<string, unknown>;
  const old = (r.old_row ?? {}) as Record<string, unknown>;
  const person = (id: unknown) => n.people.get(str(id)) ?? "a removed user";
  const prod = (id: unknown) => (id ? n.productions.get(str(id)) ?? "a deleted production" : "Studio level");
  const section = (k: unknown) => SECTION_LABEL[str(k)] ?? str(k);
  const level = (l: unknown) => LEVEL_LABEL[str(l) as keyof typeof LEVEL_LABEL] ?? str(l);
  const label = <T extends string>(map: Record<T, string>, v: unknown) => map[str(v) as T] ?? str(v);

  switch (r.table_name) {
    case "access_grants": {
      const where = `${section(row.section_key)}, ${prod(row.production_id)}`;
      if (r.action === "INSERT") return `Gave ${person(row.user_id)} ${level(row.level)} access to ${where}`;
      if (r.action === "DELETE") return `Removed ${person(row.user_id)}'s access to ${where}`;
      return `Changed ${person(row.user_id)}'s access to ${where} from ${level(old.level)} to ${level(row.level)}`;
    }
    case "profiles": {
      const name = str(row.full_name) || str(row.email);
      if (r.action === "INSERT") return `Account created for ${name}`;
      if (r.action === "DELETE") return `Account removed for ${name}`;
      if (old.status !== row.status) return row.status === "deactivated" ? `Deactivated ${name}` : `Reactivated ${name}`;
      return `Updated ${name}'s details`;
    }
    case "productions": {
      const title = str(row.title);
      if (r.action === "INSERT") return `Created the production ${title}`;
      if (r.action === "DELETE") return `Deleted the production ${title}`;
      if (old.status !== row.status) return `${title}: status changed to ${label(STATUS_LABEL, row.status)}`;
      if (old.current_stage !== row.current_stage) return `${title}: current stage changed to ${label(STAGE_LABEL, row.current_stage)}`;
      if (old.title !== row.title) return `Renamed ${str(old.title)} to ${title}`;
      return `Updated details of ${title}`;
    }
    case "production_stages": {
      const p = prod(row.production_id);
      if (r.action === "INSERT") return `${p}: ${label(STAGE_LABEL, row.stage)} stage added`;
      return `${p}: ${label(STAGE_LABEL, row.stage)} marked ${label(STAGE_STATUS_LABEL, row.status)}`;
    }
    case "production_sections": {
      const p = prod(row.production_id);
      if (r.action === "INSERT") return `${p}: ${section(row.section_key)} section added`;
      if (r.action === "DELETE") return `${p}: ${section(row.section_key)} section removed`;
      return `${p}: ${section(row.section_key)} turned ${row.enabled ? "on" : "off"}`;
    }
    case "production_departments": {
      const p = prod(row.production_id);
      if (r.action === "INSERT") return `${p}: department ${str(row.name)} added`;
      if (r.action === "DELETE") return `${p}: department ${str(row.name)} removed`;
      return `${p}: department ${str(old.name)} renamed to ${str(row.name)}`;
    }
    default:
      return `${r.action.toLowerCase()} on ${r.table_name}`;
  }
}

/** Entries written automatically when a production is created (its stages and sections). */
export function isSetupNoise(r: AuditRow): boolean {
  return r.action === "INSERT" && (r.table_name === "production_stages" || r.table_name === "production_sections");
}
