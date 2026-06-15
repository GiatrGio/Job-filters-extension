# Test fixtures — captured LinkedIn job DOM

Each `*.html` file here is the **outer HTML of a real LinkedIn job page**, captured
from a browser where the scraper misbehaves. `tests/linkedin.test.ts` replays each
one through the actual `scrapeJob()` and asserts that title / company / description
are extracted.

This is how we reproduce variant-specific scraping bugs deterministically — without
needing to land in the same LinkedIn A/B bucket ourselves.

## How to capture one

On the failing job page, in the **LinkedIn tab's** console (context = `top` /
`www.linkedin.com`, NOT the extension side panel):

```js
copy(document.documentElement.outerHTML);
```

Paste the clipboard into a new file here, named after the case, e.g.
`granular-energy-broken.html`. Then:

```bash
npm test
```

The `scrapeJob against captured LinkedIn DOM` suite picks up every `*.html` in this
folder automatically. A fixture from a broken bucket will fail (red) until the
scraper is fixed.

> These files can be large (~300 KB) and may contain the capturing account's
> personal data from the LinkedIn chrome (name, notifications). Review before
> committing, or keep sensitive captures local / git-ignored.
