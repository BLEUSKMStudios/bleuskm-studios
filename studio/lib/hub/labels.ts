// Display names for the database's fixed values.

export const PRODUCTION_TYPES = ["film", "commercial", "photography", "creative"] as const;
export const PRODUCTION_STATUSES = ["planning", "active", "wrapped", "archived"] as const;
export const STAGES = ["development", "preproduction", "production", "postproduction", "marketing", "distribution", "analytics"] as const;
export const STAGE_STATUSES = ["not_started", "in_progress", "complete"] as const;

export type ProductionType = (typeof PRODUCTION_TYPES)[number];
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];
export type Stage = (typeof STAGES)[number];
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const TYPE_LABEL: Record<ProductionType, string> = {
  film: "Film",
  commercial: "Commercial",
  photography: "Photography",
  creative: "Creative",
};
export const STATUS_LABEL: Record<ProductionStatus, string> = {
  planning: "Planning",
  active: "Active",
  wrapped: "Wrapped",
  archived: "Archived",
};
export const STAGE_LABEL: Record<Stage, string> = {
  development: "Development",
  preproduction: "Preproduction",
  production: "Production",
  postproduction: "Postproduction",
  marketing: "Marketing",
  distribution: "Distribution",
  analytics: "Analytics",
};
export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

export const SECTION_LABEL: Record<string, string> = {
  overview: "Studio Overview",
  productions: "Productions",
  casting: "Casting",
  crew: "Crew",
  scheduling: "Scheduling",
  locations: "Locations",
  documents: "Documents",
  communications: "Communications",
  script_breakdown: "Script and Breakdown",
  budget: "Budget",
  set_records: "Set Records",
  tasks: "Tasks",
  settings: "Settings",
};

export const LEVEL_LABEL = { none: "No access", view: "View", edit: "Edit" } as const;

export function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/** URL-safe slug from a title: "Love Me Like This" -> "love-me-like-this". */
export function slugify(title: string): string {
  const s = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "production";
}
