// The production modules behind the lifecycle menu, described once.
//
// Each module is one database table (see supabase/migrations/
// 20261124090000_studio_modules.sql) protected by one permission section.
// The list, the add/edit forms and the server-side validation are all built
// from these definitions, so every module looks and behaves the same.
// Pure code: no server or browser imports, so it is unit-tested directly.

import type { SectionKey } from "../sections.ts";
import { STAGES, STAGE_LABEL } from "./labels.ts";

export type FieldType = "text" | "textarea" | "date" | "time" | "url" | "email" | "select" | "number" | "phone";
export type Option = readonly [value: string, label: string];

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  options?: readonly Option[];
  /** Shown as a column in the list. */
  list?: boolean;
  wide?: boolean;
  help?: string;
  /** Default for new records. */
  initial?: string;
  /** Shown, never edited in the form (e.g. a stored file's name). */
  readOnly?: boolean;
};

export type ModuleGroup = "development" | "preproduction" | "production" | "post" | "distribution" | "operations";

export type ModuleDef = {
  key: string;                 // route segment, e.g. "call-sheets"
  table: string;
  section: SectionKey;
  group: ModuleGroup;
  title: string;               // "Call Sheets"
  singular: string;            // "call sheet"
  lead: string;                // one line under the page title
  /** Whether a record may be Studio-wide (production_id null). */
  studioLevel: "never" | "allowed" | "only";
  titleField: string;
  orderBy: { column: string; ascending: boolean; nullsFirst?: boolean };
  /** Fixed column values: list filter and value forced on new records. */
  fixed?: Record<string, string>;
  /** A date column that feeds the dashboard's upcoming deadlines. */
  dueField?: string;
  /** Status column whose values count as finished (not shown as upcoming). */
  doneWhen?: { column: string; values: readonly string[] };
  fields: readonly Field[];
  /** Child list shown on a record's page (call sheet lines). */
  child?: { module: string; parentField: string };
  /** Hidden from the menu (reached from another page). */
  hidden?: boolean;
};

const opts = (...pairs: Option[]) => pairs;

export const STATUS_TONE: Record<string, "good" | "warn" | "info" | "bad" | "muted"> = {
  confirmed: "good", complete: "good", done: "good", signed: "good", locked: "good", approved: "good",
  delivered: "good", accepted: "good", released: "good", final: "good", filed: "good",
  active: "warn", in_progress: "warn", in_review: "warn", pending: "warn", offered: "warn", submitted: "warn",
  scheduled: "warn", ready: "warn", planned: "info", sent: "info", upcoming: "info", draft: "info",
  scouting: "info", prospect: "info", researching: "info", todo: "info", not_started: "muted", open: "info",
  blocked: "bad", declined: "bad", cancelled: "bad", withdrawn: "bad", expired: "bad", void: "bad",
  archived: "muted", wrapped: "muted", resolved: "muted",
};

const NOTES: Field = { name: "notes", label: "Notes", type: "textarea", max: 10000, wide: true };

export const MODULES: readonly ModuleDef[] = [
  // -------------------------------------------------------------------------
  // Development
  // -------------------------------------------------------------------------
  {
    key: "scripts", table: "scripts", section: "script_breakdown", group: "development",
    title: "Scripts & Treatments", singular: "script or document",
    lead: "The library of screenplays and development documents: every draft and revision, its file (PDF or Fountain) or Drive link, and the projects it belongs to. Writing happens in Fountainhead.",
    studioLevel: "never", titleField: "title", orderBy: { column: "draft_date", ascending: false, nullsFirst: false },
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200, list: true },
      { name: "kind", label: "Document type", type: "select", list: true, initial: "script",
        options: opts(["script", "Screenplay"], ["treatment", "Treatment"], ["outline", "Outline"], ["synopsis", "Synopsis"], ["beat_sheet", "Beat sheet"],
          ["pitch", "Pitch"], ["series_bible", "Series bible"], ["lookbook", "Lookbook"], ["breakdown", "Breakdown"], ["shot_list", "Shot list"], ["other", "Other"]) },
      { name: "version", label: "Draft / version", type: "text", max: 40, list: true, help: "e.g. First draft, v3, Locked shooting script" },
      { name: "draft_date", label: "Revision date", type: "date", list: true },
      { name: "status", label: "Status", type: "select", list: true, initial: "draft",
        options: opts(["draft", "Draft"], ["in_review", "In review"], ["locked", "Locked"], ["archived", "Archived"]) },
      { name: "file_name", label: "File", type: "text", list: true, readOnly: true },
      { name: "drive_url", label: "External link (Google Drive or other)", type: "url", max: 1000, wide: true },
      NOTES,
    ],
  },
  {
    key: "resources", table: "dev_resources", section: "development", group: "development",
    title: "Development Resources", singular: "resource",
    lead: "Research, lookbooks, references and rights notes for projects in development.",
    studioLevel: "allowed", titleField: "title", orderBy: { column: "created_at", ascending: false },
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200, list: true },
      { name: "kind", label: "Type", type: "select", list: true, initial: "reference",
        options: opts(["research", "Research"], ["lookbook", "Lookbook"], ["reference", "Reference"], ["pitch_deck", "Pitch deck"], ["mood_board", "Mood board"], ["rights", "Rights"], ["other", "Other"]) },
      { name: "url", label: "Link", type: "url", max: 1000, wide: true },
      NOTES,
    ],
  },
  // -------------------------------------------------------------------------
  // Pre-Production
  // -------------------------------------------------------------------------
  {
    key: "crew-roster", table: "production_team", section: "crew", group: "preproduction",
    title: "Crew roster", singular: "crew member", hidden: true,
    lead: "Who is on each production's crew, by department and position.",
    studioLevel: "never", titleField: "full_name", orderBy: { column: "department", ascending: true, nullsFirst: false },
    fixed: { team: "crew" },
    fields: [
      { name: "full_name", label: "Name", type: "text", required: true, max: 200, list: true },
      { name: "department", label: "Department", type: "text", max: 120, list: true, help: "e.g. Camera, Sound, Grip & Electric. A label only: departments never decide access." },
      { name: "position", label: "Position", type: "text", required: true, max: 200, list: true },
      { name: "status", label: "Confirmation", type: "select", list: true, initial: "offered",
        options: opts(["prospect", "Prospect"], ["offered", "Offered"], ["confirmed", "Confirmed"], ["wrapped", "Wrapped"], ["released", "Released"]) },
      { name: "onboarding", label: "Onboarding", type: "select", list: true, initial: "not_started",
        options: opts(["not_started", "Not started"], ["paperwork_sent", "Agreement sent"], ["paperwork_signed", "Agreement signed"], ["guide_sent", "Guide sent"], ["complete", "Complete"]) },
      { name: "availability", label: "Availability", type: "textarea", max: 1000 },
      { name: "email", label: "Email", type: "email", max: 254 },
      { name: "phone", label: "Phone", type: "phone", max: 40 },
      { name: "notes", label: "Notes", type: "textarea", max: 5000, wide: true },
    ],
  },
  {
    key: "locations", table: "locations", section: "locations", group: "preproduction",
    title: "Locations", singular: "location",
    lead: "Scouted and confirmed locations, with the contact for each.",
    studioLevel: "allowed", titleField: "name", orderBy: { column: "name", ascending: true },
    fields: [
      { name: "name", label: "Location", type: "text", required: true, max: 200, list: true },
      { name: "status", label: "Status", type: "select", list: true, initial: "scouting",
        options: opts(["scouting", "Scouting"], ["pending", "Pending"], ["confirmed", "Confirmed"], ["declined", "Declined"], ["wrapped", "Wrapped"]) },
      { name: "address", label: "Address", type: "textarea", max: 1000, wide: true },
      { name: "contact_name", label: "Contact", type: "text", max: 200, list: true },
      { name: "phone", label: "Phone", type: "phone", max: 40 },
      { name: "email", label: "Email", type: "email", max: 254 },
      { name: "drive_url", label: "Photos or files (Drive link)", type: "url", max: 1000, wide: true },
      NOTES,
    ],
  },
  {
    key: "scheduling", table: "schedule_events", section: "scheduling", group: "preproduction",
    title: "Scheduling", singular: "date",
    lead: "Milestones, meetings, deadlines and shoot days on one timeline.",
    studioLevel: "allowed", titleField: "title", orderBy: { column: "starts_on", ascending: true, nullsFirst: false },
    dueField: "starts_on", doneWhen: { column: "status", values: ["complete", "cancelled"] },
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200, list: true },
      { name: "kind", label: "Type", type: "select", list: true, initial: "milestone",
        options: opts(["milestone", "Milestone"], ["meeting", "Meeting"], ["deadline", "Deadline"], ["shoot_day", "Shoot day"], ["callback", "Callback"], ["other", "Other"]) },
      { name: "starts_on", label: "Date", type: "date", list: true },
      { name: "ends_on", label: "End date", type: "date" },
      { name: "start_time", label: "Time", type: "time" },
      { name: "date_label", label: "Date note", type: "text", max: 120, list: true, help: "Free text such as “Week of July 12”." },
      { name: "status", label: "Status", type: "select", list: true, initial: "upcoming",
        options: opts(["upcoming", "Upcoming"], ["active", "Active"], ["complete", "Complete"], ["cancelled", "Cancelled"]) },
      { name: "department", label: "Department (label only)", type: "text", max: 120 },
      { name: "description", label: "Details", type: "textarea", max: 10000, wide: true },
    ],
  },
  {
    key: "documents", table: "documents", section: "documents", group: "preproduction",
    title: "Documents", singular: "document",
    lead: "Contracts, releases, permits and paperwork, with signing status and the file in Drive.",
    studioLevel: "allowed", titleField: "title", orderBy: { column: "created_at", ascending: false },
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200, list: true },
      { name: "category", label: "Category", type: "select", list: true, initial: "contract",
        options: opts(["contract", "Contract"], ["release", "Release"], ["permit", "Permit"], ["insurance", "Insurance"], ["schedule", "Schedule"], ["report", "Report"], ["guide", "Guide"], ["other", "Other"]) },
      { name: "contract_type", label: "Contract type", type: "text", max: 120 },
      { name: "status", label: "Status", type: "select", list: true, initial: "draft",
        options: opts(["draft", "Draft"], ["sent", "Sent"], ["signed", "Signed"], ["filed", "Filed"], ["expired", "Expired"], ["void", "Void"]) },
      { name: "signer_name", label: "Signer", type: "text", max: 200, list: true },
      { name: "signer_email", label: "Signer email", type: "email", max: 254 },
      { name: "signer_role", label: "Signer role", type: "text", max: 200 },
      { name: "signed_on", label: "Signed on", type: "date", list: true },
      { name: "drive_url", label: "Google Drive link", type: "url", max: 1000, wide: true },
      { name: "details", label: "Details", type: "textarea", max: 10000, wide: true },
    ],
  },
  {
    key: "crew-guides", table: "documents", section: "documents", group: "preproduction",
    title: "Department guides", singular: "department guide", hidden: true,
    lead: "Department guides sent to crew (stored in Documents).",
    studioLevel: "allowed", titleField: "title", orderBy: { column: "title", ascending: true },
    fixed: { category: "guide" },
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200, list: true },
      { name: "contract_type", label: "Department", type: "text", max: 120, list: true },
      { name: "status", label: "Status", type: "select", list: true, initial: "filed",
        options: opts(["draft", "Draft"], ["sent", "Sent"], ["signed", "Signed"], ["filed", "Filed"], ["expired", "Expired"], ["void", "Void"]) },
      { name: "drive_url", label: "Google Drive link", type: "url", max: 1000, wide: true, list: true },
      { name: "details", label: "Details", type: "textarea", max: 10000, wide: true },
    ],
  },
  {
    key: "crew-agreements", table: "documents", section: "documents", group: "preproduction",
    title: "Agreements", singular: "agreement", hidden: true,
    lead: "Crew agreements and deal memos and where each one stands (stored in Documents).",
    studioLevel: "allowed", titleField: "title", orderBy: { column: "created_at", ascending: false },
    fixed: { category: "contract" },
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200, list: true },
      { name: "contract_type", label: "Agreement type", type: "text", max: 120, list: true },
      { name: "status", label: "Status", type: "select", list: true, initial: "draft",
        options: opts(["draft", "Draft"], ["sent", "Sent"], ["signed", "Signed"], ["filed", "Filed"], ["expired", "Expired"], ["void", "Void"]) },
      { name: "signer_name", label: "Signer", type: "text", max: 200, list: true },
      { name: "signer_email", label: "Signer email", type: "email", max: 254 },
      { name: "signer_role", label: "Signer role", type: "text", max: 200 },
      { name: "signed_on", label: "Signed on", type: "date", list: true },
      { name: "drive_url", label: "Google Drive link", type: "url", max: 1000, wide: true },
      { name: "details", label: "Details", type: "textarea", max: 10000, wide: true },
    ],
  },
  // -------------------------------------------------------------------------
  // Production
  // -------------------------------------------------------------------------
  {
    key: "call-sheets", table: "call_sheets", section: "scheduling", group: "production", hidden: true,
    title: "Call Sheets", singular: "call sheet",
    lead: "One sheet per shoot day: general call, location, safety details and everyone's call time.",
    studioLevel: "never", titleField: "title", orderBy: { column: "shoot_date", ascending: true },
    dueField: "shoot_date",
    child: { module: "call-sheet-lines", parentField: "call_sheet_id" },
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200, list: true, initial: "Day 1" },
      { name: "shoot_date", label: "Shoot date", type: "date", required: true, list: true },
      { name: "general_call", label: "General call", type: "time", list: true },
      { name: "status", label: "Status", type: "select", list: true, initial: "draft",
        options: opts(["draft", "Draft"], ["final", "Final"], ["sent", "Sent"]) },
      { name: "location_text", label: "Location and address", type: "textarea", max: 500, wide: true },
      { name: "parking", label: "Parking", type: "textarea", max: 2000 },
      { name: "nearest_hospital", label: "Nearest hospital", type: "textarea", max: 1000 },
      { name: "weather", label: "Weather", type: "text", max: 500 },
      { name: "schedule", label: "Day schedule", type: "textarea", max: 10000, wide: true },
      NOTES,
    ],
  },
  {
    key: "call-sheet-lines", table: "call_sheet_entries", section: "scheduling", group: "production",
    title: "Call times", singular: "person", hidden: true,
    lead: "Everyone called for this day.",
    studioLevel: "never", titleField: "full_name", orderBy: { column: "call_time", ascending: true, nullsFirst: false },
    fields: [
      { name: "full_name", label: "Name", type: "text", required: true, max: 200, list: true },
      { name: "position", label: "Position", type: "text", max: 200, list: true },
      { name: "call_time", label: "Call time", type: "time", list: true },
      { name: "notes", label: "Notes", type: "text", max: 2000, list: true },
    ],
  },
  {
    key: "shoot-schedule", table: "schedule_events", section: "scheduling", group: "production", hidden: true,
    title: "Shoot Schedules", singular: "shoot day",
    lead: "The shoot days for each production. They also appear on the master calendar.",
    studioLevel: "never", titleField: "title", orderBy: { column: "starts_on", ascending: true, nullsFirst: false },
    fixed: { kind: "shoot_day" },
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200, list: true, initial: "Shoot day" },
      { name: "starts_on", label: "Date", type: "date", list: true },
      { name: "start_time", label: "Call", type: "time", list: true },
      { name: "date_label", label: "Date note", type: "text", max: 120, list: true },
      { name: "status", label: "Status", type: "select", list: true, initial: "upcoming",
        options: opts(["upcoming", "Upcoming"], ["active", "Active"], ["complete", "Complete"], ["cancelled", "Cancelled"]) },
      { name: "description", label: "Scenes and notes", type: "textarea", max: 10000, wide: true },
    ],
  },
  {
    key: "tracking", table: "production_tasks", section: "tasks", group: "production",
    title: "Production Tracking", singular: "task",
    lead: "What needs doing, who has it and when it's due.",
    studioLevel: "never", titleField: "title", orderBy: { column: "due_on", ascending: true, nullsFirst: false },
    dueField: "due_on", doneWhen: { column: "status", values: ["done"] },
    fields: [
      { name: "title", label: "Task", type: "text", required: true, max: 200, list: true },
      { name: "status", label: "Status", type: "select", list: true, initial: "todo",
        options: opts(["todo", "To do"], ["in_progress", "In progress"], ["blocked", "Blocked"], ["done", "Done"]) },
      { name: "assignee", label: "Assigned to", type: "text", max: 200, list: true },
      { name: "due_on", label: "Due", type: "date", list: true },
      { name: "stage", label: "Stage", type: "select", options: STAGES.map((s) => [s, STAGE_LABEL[s]] as const) },
      { name: "completed_on", label: "Completed on", type: "date" },
      { name: "description", label: "Details", type: "textarea", max: 10000, wide: true },
    ],
  },
  {
    key: "notes", table: "production_notes", section: "set_records", group: "production",
    title: "Production Notes", singular: "note", hidden: true,
    lead: "Set records and team notes: sound, camera, continuity and announcements.",
    studioLevel: "never", titleField: "title", orderBy: { column: "noted_at", ascending: false },
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200, list: true },
      { name: "category", label: "Category", type: "select", list: true, initial: "general",
        options: opts(["general", "General"], ["announcement", "Announcement"], ["sound", "Sound"], ["camera", "Camera"], ["continuity", "Continuity"], ["casting", "Casting"], ["take_log", "Take log"], ["other", "Other"]) },
      { name: "author_name", label: "From", type: "text", max: 200, list: true },
      { name: "audience", label: "For", type: "text", max: 120 },
      { name: "status", label: "Status", type: "select", list: true, initial: "open",
        options: opts(["open", "Open"], ["resolved", "Resolved"], ["archived", "Archived"]) },
      { name: "body", label: "Note", type: "textarea", max: 20000, wide: true },
    ],
  },
  // -------------------------------------------------------------------------
  // Post-Production
  // -------------------------------------------------------------------------
  {
    key: "editing", table: "edit_milestones", section: "post", group: "post", hidden: true,
    title: "Editing Progress", singular: "edit milestone",
    lead: "From assembly to final: each cut, its status and the review link.",
    studioLevel: "never", titleField: "title", orderBy: { column: "due_on", ascending: true, nullsFirst: false },
    dueField: "due_on", doneWhen: { column: "status", values: ["approved"] },
    fields: [
      { name: "title", label: "Milestone", type: "text", required: true, max: 200, list: true },
      { name: "phase", label: "Phase", type: "select", list: true, initial: "edit",
        options: opts(["assembly", "Assembly"], ["rough_cut", "Rough cut"], ["fine_cut", "Fine cut"], ["picture_lock", "Picture lock"], ["edit", "Edit"], ["color", "Color"], ["sound", "Sound"], ["music", "Music"], ["vfx", "VFX"], ["titles", "Titles"], ["final", "Final"]) },
      { name: "status", label: "Status", type: "select", list: true, initial: "not_started",
        options: opts(["not_started", "Not started"], ["in_progress", "In progress"], ["in_review", "In review"], ["approved", "Approved"]) },
      { name: "owner_name", label: "Owner", type: "text", max: 200, list: true },
      { name: "due_on", label: "Due", type: "date", list: true },
      { name: "completed_on", label: "Completed on", type: "date" },
      { name: "review_url", label: "Review link", type: "url", max: 1000, wide: true },
      NOTES,
    ],
  },
  {
    key: "deliverables", table: "deliverables", section: "post", group: "post", hidden: true,
    title: "Deliverables", singular: "deliverable",
    lead: "Masters, subtitles, artwork and paperwork owed to festivals, platforms and partners.",
    studioLevel: "never", titleField: "name", orderBy: { column: "due_on", ascending: true, nullsFirst: false },
    dueField: "due_on", doneWhen: { column: "status", values: ["delivered", "accepted"] },
    fields: [
      { name: "name", label: "Deliverable", type: "text", required: true, max: 200, list: true },
      { name: "kind", label: "Type", type: "select", list: true, initial: "video",
        options: opts(["video", "Video"], ["audio", "Audio"], ["subtitles", "Subtitles"], ["artwork", "Artwork"], ["trailer", "Trailer"], ["stills", "Stills"], ["press_kit", "Press kit"], ["paperwork", "Paperwork"], ["other", "Other"]) },
      { name: "recipient", label: "For", type: "text", max: 200, list: true },
      { name: "status", label: "Status", type: "select", list: true, initial: "not_started",
        options: opts(["not_started", "Not started"], ["in_progress", "In progress"], ["ready", "Ready"], ["delivered", "Delivered"], ["accepted", "Accepted"]) },
      { name: "due_on", label: "Due", type: "date", list: true },
      { name: "delivered_on", label: "Delivered on", type: "date" },
      { name: "spec", label: "Spec", type: "textarea", max: 2000, wide: true },
      { name: "file_url", label: "File link", type: "url", max: 1000, wide: true },
      NOTES,
    ],
  },
  // -------------------------------------------------------------------------
  // Distribution
  // -------------------------------------------------------------------------
  {
    key: "festivals", table: "festival_submissions", section: "distribution", group: "distribution", hidden: true,
    title: "Festivals", singular: "festival",
    lead: "Festival strategy: deadlines, submissions and results.",
    studioLevel: "never", titleField: "festival", orderBy: { column: "deadline", ascending: true, nullsFirst: false },
    dueField: "deadline", doneWhen: { column: "status", values: ["submitted", "accepted", "declined", "withdrawn"] },
    fields: [
      { name: "festival", label: "Festival", type: "text", required: true, max: 200, list: true },
      { name: "category", label: "Category", type: "text", max: 200 },
      { name: "status", label: "Status", type: "select", list: true, initial: "researching",
        options: opts(["researching", "Researching"], ["planned", "Planned"], ["submitted", "Submitted"], ["accepted", "Accepted"], ["declined", "Declined"], ["withdrawn", "Withdrawn"]) },
      { name: "deadline", label: "Deadline", type: "date", list: true },
      { name: "submitted_on", label: "Submitted on", type: "date" },
      { name: "notification_on", label: "Notification date", type: "date", list: true },
      { name: "event_dates", label: "Festival dates", type: "text", max: 120 },
      { name: "platform", label: "Submitted through", type: "text", max: 120 },
      { name: "url", label: "Festival link", type: "url", max: 1000, wide: true },
      NOTES,
    ],
  },
  {
    key: "releases", table: "releases", section: "distribution", group: "distribution", hidden: true,
    title: "Releases", singular: "release",
    lead: "Premieres, screenings and online releases.",
    studioLevel: "never", titleField: "title", orderBy: { column: "release_on", ascending: true, nullsFirst: false },
    dueField: "release_on", doneWhen: { column: "status", values: ["released", "cancelled"] },
    fields: [
      { name: "title", label: "Release", type: "text", required: true, max: 200, list: true },
      { name: "channel", label: "Channel", type: "select", list: true, initial: "online",
        options: opts(["online", "Online"], ["streaming", "Streaming"], ["theatrical", "Theatrical"], ["screening", "Screening"], ["premiere", "Premiere"], ["broadcast", "Broadcast"], ["social", "Social"], ["other", "Other"]) },
      { name: "platform", label: "Platform or venue", type: "text", max: 200, list: true },
      { name: "release_on", label: "Date", type: "date", list: true },
      { name: "status", label: "Status", type: "select", list: true, initial: "planned",
        options: opts(["planned", "Planned"], ["scheduled", "Scheduled"], ["released", "Released"], ["cancelled", "Cancelled"]) },
      { name: "url", label: "Link", type: "url", max: 1000, wide: true },
      NOTES,
    ],
  },
  // -------------------------------------------------------------------------
  // Studio Operations
  // -------------------------------------------------------------------------
  {
    key: "contacts", table: "contacts", section: "contacts", group: "operations",
    title: "Contacts", singular: "contact",
    lead: "Everyone BLEUSKM works with: crew, cast, clients, vendors, locations and festivals.",
    studioLevel: "only", titleField: "full_name", orderBy: { column: "full_name", ascending: true },
    fields: [
      { name: "full_name", label: "Name", type: "text", required: true, max: 200, list: true },
      { name: "category", label: "Category", type: "select", list: true, initial: "crew",
        options: opts(["crew", "Crew"], ["cast", "Cast"], ["client", "Client"], ["vendor", "Vendor"], ["location", "Location"], ["festival", "Festival"], ["press", "Press"], ["other", "Other"]) },
      { name: "kind", label: "Person or company", type: "select", initial: "person", options: opts(["person", "Person"], ["company", "Company"]) },
      { name: "roles", label: "Roles", type: "text", max: 500, list: true },
      { name: "email", label: "Email", type: "email", max: 254, list: true },
      { name: "phone", label: "Phone", type: "phone", max: 40 },
      { name: "company", label: "Company", type: "text", max: 200 },
      { name: "city", label: "City", type: "text", max: 200, list: true },
      { name: "website", label: "Website or portfolio", type: "url", max: 1000, wide: true },
      NOTES,
    ],
  },
];

export function moduleByKey(key: string): ModuleDef | undefined {
  return MODULES.find((m) => m.key === key);
}

/** Columns to read for a module's list and forms. */
export function selectColumns(def: ModuleDef): string {
  const cols = new Set(["id", "production_id", "source", "updated_at", ...def.fields.map((f) => f.name), ...Object.keys(def.fixed ?? {})]);
  if (def.child) cols.add("created_at");
  return [...cols].join(", ");
}

export function optionLabel(field: Field, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const hit = field.options?.find(([v]) => v === value);
  return hit ? hit[1] : String(value);
}

// ---------------------------------------------------------------------------
// Validation (used by the server actions; the database checks again)
// ---------------------------------------------------------------------------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+().\-\s]{3,40}$/;

export type Parsed = { ok: true; values: Record<string, string | number | null> } | { ok: false; error: string };

/** Reads and checks a module's fields from submitted form values. */
export function parseFields(def: ModuleDef, get: (name: string) => unknown): Parsed {
  const values: Record<string, string | number | null> = {};
  for (const f of def.fields) {
    if (f.readOnly) continue;
    const raw = get(f.name);
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) {
      if (f.required) return { ok: false, error: `${f.label} is required.` };
      values[f.name] = null;
      continue;
    }
    const max = f.max ?? 2000;
    if (s.length > max) return { ok: false, error: `${f.label} is too long (up to ${max} characters).` };
    switch (f.type) {
      case "date":
        if (!DATE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) return { ok: false, error: `${f.label} must be a date.` };
        break;
      case "time":
        if (!TIME.test(s)) return { ok: false, error: `${f.label} must be a time.` };
        break;
      case "url":
        try {
          const u = new URL(s);
          if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
        } catch {
          return { ok: false, error: `${f.label} must be a web link starting with https://.` };
        }
        break;
      case "email":
        if (!EMAIL.test(s)) return { ok: false, error: `${f.label} must be an email address.` };
        values[f.name] = s.toLowerCase();
        continue;
      case "phone":
        if (!PHONE.test(s)) return { ok: false, error: `${f.label} must be a phone number.` };
        break;
      case "select":
        if (!f.options?.some(([v]) => v === s)) return { ok: false, error: `Choose a valid ${f.label.toLowerCase()}.` };
        break;
      case "number": {
        const n = Number(s);
        if (!Number.isFinite(n)) return { ok: false, error: `${f.label} must be a number.` };
        values[f.name] = n;
        continue;
      }
    }
    values[f.name] = s;
  }
  for (const [k, v] of Object.entries(def.fixed ?? {})) values[k] = v;
  return { ok: true, values };
}

/** Where a module's record can live: a production id, or null for Studio level. */
export function checkScope(def: ModuleDef, productionId: string | null): string | null {
  if (def.studioLevel === "only" && productionId !== null) return "These records are studio-wide and can't belong to a production.";
  if (def.studioLevel === "never" && productionId === null) return "Choose a production.";
  return null;
}

// ---------------------------------------------------------------------------
// Load errors
// ---------------------------------------------------------------------------
/**
 * Why a list didn't load: "setup" when the table isn't in the database yet
 * (its migration hasn't been applied), "failed" for anything else.
 */
export type LoadError = null | "setup" | "failed";
export function loadError(error: { code?: string } | null): LoadError {
  if (!error) return null;
  return isMissingTable(error.code) ? "setup" : "failed";
}
/** PostgREST answers PGRST205 (or PGRST200/42P01) for a table it doesn't know. */
export function isMissingTable(code: string | undefined): boolean {
  return code === "PGRST205" || code === "42P01" || code === "PGRST200" || code === "42703";
}
