# Packaging a new Chrome Web Store release

How to turn the current code into an uploadable `.zip`. Follow it top to bottom.

## TL;DR

```bash
# 1. Bump the version in BOTH files to the same number (e.g. 0.3.0):
#      manifest.json  -> "version": "0.3.0"
#      package.json   -> "version": "0.3.0"

# 2. Build + package (production build, then zip):
npm run package
```

That produces **`canvasjob-<version>.zip`** in the project root — that's the file
you upload. Done.

---

## Step 1 — Bump the version

Edit the version in **two** places and keep them identical:

- `manifest.json` → `"version"` — this is the one Chrome actually reads and the
  one the zip is named after.
- `package.json` → `"version"` — kept in sync so the repo doesn't lie about what
  it ships.

Chrome requires the version to be **higher than the one already live**. Use
`MAJOR.MINOR.PATCH`:

- patch (`0.3.0 → 0.3.1`): bug fixes only
- minor (`0.3.0 → 0.4.0`): new features (e.g. the onboarding wizard)
- major (`0.3.0 → 1.0.0`): big/breaking releases

## Step 2 — Confirm you're building for production

Production endpoints live in `.env.production.local` (Supabase keys come from
`.env`). It should point at the live API and site, **not** localhost:

```env
VITE_API_URL=https://api.canvasjob.com
VITE_WEB_URL=https://www.canvasjob.com
```

`npm run build` loads this automatically. You normally never touch this file.

## Step 3 — Build and package

```bash
npm run package
```

This runs the production build and zips `dist/` into `canvasjob-<version>.zip`.
Before writing the zip it runs safety checks that catch the mistakes that got
past uploads rejected:

- exactly one `manifest.json` at the archive root,
- **no development / remotely-hosted code** (a dev build imports from
  `localhost:5173` and Chrome rejects it),
- the production build refuses to use a `localhost` API URL.

If any check fails the script stops and tells you which file is the problem —
fix it and re-run.

> Already have a good `dist/` and just want to re-zip without rebuilding?
> `SKIP_BUILD=1 npm run package`

## Step 4 — Upload to the Chrome Web Store

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Open the **canvasjob** item → **Package** → **Upload new package**.
3. Select `canvasjob-<version>.zip` from the project root.
4. Update the store listing / notes if needed, then **Submit for review**.

The `.zip` is git-ignored (it's a build artifact), so you commit only the version
bump — not the archive.

---

## One-time setup (only when the extension ID changes)

The extension ID only changes on a brand-new store item, not on version updates.
When it does change, also:

- add `chrome-extension://<extension-id>` to the backend `ALLOWED_ORIGINS` (CORS),
- add the OAuth redirect `https://<extension-id>.chromiumapp.org/` to
  **Supabase → Authentication → URL Configuration → Redirect URLs**.

For normal version bumps you can skip this section.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `dist/ contains remotely hosted / dev-server code` | You built in dev mode. Run `npm run package` (which uses `npm run build`), not a dev build. |
| `A production extension build cannot use a localhost VITE_API_URL` | `.env.production.local` is pointing at localhost. Restore the production URLs from Step 2. |
| Chrome Web Store: "version must be greater than…" | You forgot Step 1, or bumped only one of the two files. |
| `expected exactly one manifest.json` | Stale/duplicate build output — delete `dist/` and re-run `npm run package`. |
