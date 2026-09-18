# Extension build — progress checklist

> Written so a future session can pick up without the full prior conversation.
> Update this file whenever a checkbox changes.

## Status: **MVP extension scaffold complete — not yet built or loaded.**

## Done

- [x] **Tooling** — `package.json` (Vite + CRXJS + React + TS + Tailwind +
      Vitest), `tsconfig.json` (strict + `@/*` path alias), `vite.config.ts`,
      `manifest.json` (MV3), `tailwind.config.js`, `postcss.config.js`,
      `.env.example`, `.gitignore`, `src/styles.css`.
- [x] **Shared types** — `src/shared/types.ts` mirrors backend pydantic
      schemas: `EvaluateRequest/Response`, `FilterOut/Create/Update`,
      `MeResponse`, `ScrapedJob`, `ExtensionMessage` union, `StoredEvaluation`.
- [x] **Lib** —
      - `env.ts` reads `VITE_SUPABASE_*` + `VITE_API_URL`.
      - `auth.ts` — Supabase client with a `chrome.storage.local` storage
        adapter (so the service worker can read the session — it has no
        `localStorage`).
      - `api.ts` — typed fetch wrapper; attaches `Authorization: Bearer <jwt>`
        automatically; throws `ApiError { status, message }`.
      - `storage.ts` — autoEval flag, last-evaluation record, per-job cache.
      - `linkedin.ts` — selector arrays with fallbacks, `getJobIdFromUrl`
        handling both `/jobs/view/:id` and `?currentJobId=…`, `waitForJobContent`
        polling until the DOM anchors appear.
- [x] **Content script** — URL-change + MutationObserver detection,
      1.5s debounce, dedup by `jobId`, monkey-patches `history.pushState`
      so the SPA actually emits nav events.
- [x] **Background service worker** — message router, cache check, backend
      call, side-panel forwarding, opens the side panel on first eval per tab,
      sets `openPanelOnActionClick` on install.
- [x] **Side panel** — React + Tailwind. Header with auto-eval toggle,
      loading / ready / error / signed-out states, usage counter footer,
      "open settings" affordance.
- [x] **Options page** — email/password sign-in and sign-up (magic link can
      come later), filter CRUD with reorder (position swap), enable toggle,
      inline edit on blur, account bar with plan + monthly usage.

## Not done (explicit non-goals for this pass)

- [ ] **`npm install` / `npm run build`.** Per user, scaffold only. First run:
      `npm install && npm run typecheck`.
- [ ] **Icons.** The `icons` key is currently removed from `manifest.json`
      so the build doesn't fail on missing assets — Chrome uses the default
      puzzle icon. When you have artwork, drop PNGs into `public/icons/` and
      re-add:
      ```json
      "icons": {
        "16": "public/icons/icon-16.png",
        "48": "public/icons/icon-48.png",
        "128": "public/icons/icon-128.png"
      }
      ```
- [ ] **OAuth (Google) sign-in.** CLAUDE.md marks it nice-to-have, not MVP.
- [ ] **Drag-and-drop reorder.** Using up/down arrow buttons for MVP; good
      enough until filter counts grow.
- [ ] **Job-list overlays.** Post-MVP per CLAUDE.md §13.
- [ ] **Tests.** Vitest is wired but no tests yet. The scraper (`linkedin.ts`)
      is the highest-value target.

## First-run checklist for the user

1. `cd linkedin-job-filter-extension`
2. `cp .env.example .env` — set the shared `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY`. Endpoint overrides live in
   `.env.development.local` for local work and `.env.production.local` for
   Chrome Web Store builds.
3. `npm install`
4. `npm run dev` (or `npm run build:dev` for a static local-endpoint build).
5. Chrome → `chrome://extensions` → Load unpacked → pick `dist/`.
6. Copy the assigned extension ID → paste `chrome-extension://<id>` into the
   backend's `ALLOWED_ORIGINS` env var, restart backend.
7. Click the extension icon → Options → create an account → add filters.
8. Visit any `linkedin.com/jobs/view/<id>` page; side panel should auto-open.

## Production beta build

- `npm run build` loads `.env.production.local`, targeting the deployed API
  and `https://www.canvasjob.com`.
- Vite generates the API and exact Supabase `host_permissions` entries from
  the production API URL and shared Supabase URL; it rejects a production
  build that still points at a localhost API.
- After Chrome Web Store assigns the extension ID, add its
  `chrome-extension://<id>` origin to the deployed backend CORS allowlist.

## Job memory ("seen before") — added 2026-09-18

- `src/lib/jobMemory.ts` keeps a local index of opened jobs in
  `chrome.storage.local` (`jobMemory`). Written by the background worker
  (visits, verdicts, fit) and the side panel (tracker state). Never uploaded.
- Side panel: `TrackerStatusChip` renders the tracker status under the job
  title, only once it is past "saved".
- LinkedIn's job cards: `src/content/decorate.ts` badges each card with the
  remembered verdict, match and tracker state, with a hover popover replaying
  the saved evidence. Cards are located by `src/lib/linkedin/list/`: `cards-v2`
  reads the id off the card element (`componentkey` on /jobs/search-results/,
  `data-occludable-job-id` on /jobs/search/), `cards-v1` climbs from a job link
  for surfaces with neither. Both run and their results merge, so the list card
  and the details pane are each badged.
- **No "seen before" badge** — LinkedIn already labels viewed jobs (decided
  2026-09-18). Visits are still recorded; only the display was dropped.
- Covered by `tests/job-memory.test.ts`, `tests/job-list.test.ts` and
  `tests/tracker-status-chip.test.ts` (virtualisation remount, stale verdicts,
  the job-details pane, flex-card layout, filter pills, budgeting).

## Known trade-offs worth remembering

- Job memory has no off switch yet. Indicators simply never appear until the
  user has opened a job, so a new install sees no change — but if anyone asks
  to turn it off, the toggle belongs in the options page, read by both
  `JobMemoryChips` and `startJobListDecoration`.
- The list decorator only knows about jobs opened in THIS browser (plus
  tracked jobs, which sync through `/applications`). A user on a second
  machine starts from a blank memory. A one-time backfill from the backend's
  `evaluations` table would fix the first-run emptiness without storing view
  history server-side.
- Badge colours are light chips with dark text, which stay legible on
  LinkedIn's dark theme but sit brighter than its own surfaces. If LinkedIn
  dark mode ever looks wrong, that is where to look.

- The side panel subscribes to `chrome.runtime.onMessage`. When the panel is
  closed, messages are lost — the panel rebuilds state on open by reading
  `lastEvaluation` from `chrome.storage.local`. That means if a second job is
  evaluated while the panel is closed, the panel will display it the next
  time it opens.
- The local per-job cache and the backend cache both key by `linkedin_job_id`
  only. The backend additionally keys by `filters_hash`, so a filter edit
  invalidates server-side. The local cache does NOT know about filter edits —
  if you change a filter and revisit a recently-viewed job within the same
  Chrome session, the local cache will serve stale results. Fix later by
  clearing `jobCache:*` on filter mutations. Low-priority: cache hits on the
  backend are free anyway.
- `getSupabase()` is called from the background worker. Supabase's
  `detectSessionInUrl` is turned off because there is no URL to detect from
  in a worker context.
- The CORS allowlist is driven by the extension ID, which changes between
  machines and between packed/unpacked installs. Dev requires pasting the
  unpacked ID into backend `ALLOWED_ORIGINS`; prod will use the Web Store ID.
