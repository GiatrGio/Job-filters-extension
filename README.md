# linkedin-job-filter-extension

Chrome (MV3) extension that evaluates LinkedIn job postings against your
custom, free-text filters. Pairs with the `linkedin-job-filter-backend`
FastAPI service and a Supabase project.

See the top-level `CLAUDE.md` for the product/architecture spec.

## Local dev

```bash
cp .env.example .env           # fill in shared Supabase client settings
npm install
npm run dev                    # Vite + CRXJS (HMR)
```

The checked-out workspace uses Vite mode-specific local overrides:

| File | Used by | Endpoint purpose |
|---|---|---|
| `.env.development.local` | `npm run dev`, `npm run build:dev` | Local backend and website |
| `.env.production.local` | `npm run build` | Deployed backend and `https://www.canvasjob.com` |

Both files are ignored by git. Keep `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`; Vite merges those shared values
with the endpoint overrides for the selected mode.

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and pick the `dist/` directory (build with
   `npm run build`) OR the Vite HMR output — CRXJS writes a live build to
   `dist/` while `npm run dev` is running.
4. Click the extension's toolbar icon → open `Options` to sign in and add
   filters.
5. Visit a LinkedIn job posting. The side panel will auto-open with an
   evaluation.

The dev extension ID is stable per unpacked load — copy it into the
backend's `ALLOWED_ORIGINS` (`chrome-extension://<id>`) so CORS passes.

## Scripts

| Command            | What it does                                          |
|--------------------|-------------------------------------------------------|
| `npm run dev`      | Vite + CRXJS, watches `src/`, writes to `dist/`.      |
| `npm run build:dev`| Type-checks and produces a local-endpoint build.       |
| `npm run build`    | Type-checks and builds the Web Store production bundle.|
| `npm run typecheck`| `tsc --noEmit`.                                       |
| `npm run test`     | Vitest. Only a smoke suite is wired up today.         |

The API and Supabase `host_permissions` entries are generated from the mode's
`VITE_API_URL` and the shared `VITE_SUPABASE_URL`. This keeps production
access limited to canvasjob's configured services rather than every Supabase
project. Production builds fail if the API URL points at localhost, so a
store ZIP cannot accidentally request local development access.

## Chrome Web Store beta build

The production override currently points at the deployed Fly.io API and
website:

```env
VITE_API_URL=https://job-filters-backend.fly.dev
VITE_WEB_URL=https://www.canvasjob.com
```

Create an uploadable build with:

```bash
npm run build
cd dist
zip -r ../canvasjob-beta-0.1.0.zip .
```

Before publishing a later update, increment `version` in `manifest.json`.
After the Chrome Web Store assigns the beta extension ID, add
`chrome-extension://<extension-id>` to the deployed backend CORS allowlist.

## Layout

```
src/
├── background/    service worker — routes messages, calls backend
├── content/       DOM scraper for linkedin.com/jobs/*
├── sidepanel/     side-panel React UI (result checklist)
├── options/       options page React UI (auth + filter CRUD)
├── lib/           api client, Supabase auth, chrome.storage, LinkedIn selectors
└── shared/        TypeScript types mirroring backend schemas
```

## Keeping types in sync with the backend

`src/shared/types.ts` is the mirror of `app/schemas/*.py`. A mismatch will
appear as a TS error at the `api.ts` boundary — keep them aligned by hand
until we generate a shared schema.

## Known LinkedIn DOM brittleness

Selectors live in `src/lib/linkedin.ts` with a "last verified" date. When
LinkedIn ships a UI change and scraping starts returning `null`, bump the
date and update the selector arrays — each field tries several fallbacks so
small changes usually only require one-line edits.
