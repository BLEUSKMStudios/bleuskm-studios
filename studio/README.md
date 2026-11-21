# BLEUSKM Studio OS

Internal production hub for BLEUSKM Studios, planned for `studio.bleuskm.com`.

This folder is a separate Next.js application. It is deployed by its **own Vercel
project** (Root Directory = `studio`), not by the public website's project. Nothing
here is served by bleuskm.com: the website's `vercel.json` redirects `/studio` and
`/studio/*` to the hub.

## Status

- Step 1A: separate application and isolated deployment.
- Step 1B: database schema, Row Level Security and server-side permission checks
  (`supabase/migrations`, `lib/permissions.ts`), with automated tests. There is
  no sign-in, dashboard or imported data yet.

## Database and permissions

- **Migrations** live in `supabase/migrations` and are the only way the schema changes.
- **Rule:** the owner has full access. Everyone else needs a grant of View or Edit
  for a section, either on one production or at Studio level. No grant means no
  access. Deactivated users and sections switched off on a production deny access.
  Departments never grant access.
- **Enforcement:** Row Level Security on every table (`private.has_access`), the
  `check_access` / `check_access_for` database functions, and `lib/permissions.ts`
  for server code (fails closed). Future section tables get the same rules with
  `select private.apply_section_rls('public.<table>', '<section>')`.
- **Tests:** `supabase/tests/database/*.test.sql` (pgTAP) run against a throwaway
  Supabase Postgres in CI (`supabase/scripts/test-database.sh`); `npm test` runs the
  server permission unit tests.
- **Staging:** `.github/workflows/studio-db-staging.yml` applies migrations to the
  Supabase project only after the tests pass and the owner approves the run in the
  protected `supabase-staging` environment. Credentials are never committed.
- **Status page:** `/status` on the Preview shows schema facts and counts only.

## Deployment isolation

| Change | Website project | Hub project |
|---|---|---|
| Only files in `studio/` | skipped | builds |
| Only website files | builds | skipped |
| Both | builds | builds |
| First deploy of a branch, or previous deploy unknown | builds | builds |

Both projects use an Ignored Build Step (`ignoreCommand` in each `vercel.json`)
that compares the commit with the branch's last deployment
(`VERCEL_GIT_PREVIOUS_SHA`). When in doubt, they build.

`npm run check:website-isolation` proves the `/studio` redirect matches no
existing website route and that the website's other settings are unchanged.
CI runs it on every pull request that touches `studio/` or `vercel.json`.

## Vercel project setup

The hub's Vercel project is `bleuskm-studio-os`: Framework Preset **Next.js**,
Root Directory **`studio`** (set under Settings → Build and Deployment, because
the import screen only lists folders that already exist on `main`). It has no
custom domain yet; studio.bleuskm.com is added only at launch, with approval.

## Local development

```bash
cd studio
npm ci
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

Requires Node 22 or newer. No environment variables are needed yet.
Secrets are never committed: they live in Vercel and GitHub settings only.
