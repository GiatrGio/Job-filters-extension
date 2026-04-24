# linkedin-job-filter-extension

Chrome (MV3) extension that evaluates LinkedIn job postings against your
custom, free-text filters. Pairs with the `linkedin-job-filter-backend`
FastAPI service and a Supabase project.

See the top-level `CLAUDE.md` for the product/architecture spec.

## Local dev

```bash
cp .env.example .env           # fill in Supabase + backend URLs
npm install
npm run dev                    # Vite + CRXJS (HMR)
```

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
| `npm run build`    | Type-checks and builds a production bundle in `dist/`.|
| `npm run typecheck`| `tsc --noEmit`.                                       |
| `npm run test`     | Vitest. Only a smoke suite is wired up today.         |

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
