# BLEUSKM Studio OS

Internal production hub for BLEUSKM Studios, planned for `studio.bleuskm.com`.

This folder is a separate Next.js application. It is deployed by its **own Vercel
project** (Root Directory = `studio`), not by the public website's project. Nothing
here is served by bleuskm.com: the website's `vercel.json` redirects `/studio` and
`/studio/*` to the hub.

## Status

Phase 1, step 1A: application and deployment skeleton only. There is no sign-in,
database or data yet. Those arrive in later steps, each approved separately.

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
