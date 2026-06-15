// Low-level DOM reading helpers shared by the extractors. These are generic
// (no LinkedIn selectors live here — those belong in the per-variant extractor
// modules); they only know how to pull clean text out of elements and how to
// reach the same-origin iframes LinkedIn renders the job into.

import type { FieldProvenance } from "./types";

// Read an element's text. Prefer innerText (respects layout/visibility and
// collapses hidden nodes) but fall back to a cleaned textContent — required for
// content inside the hidden/unrendered preload iframe, where innerText is "".
export function getText(el: HTMLElement | null): string {
  if (!el) return "";
  const inner = el.innerText?.trim();
  if (inner) return inner;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script, style, noscript").forEach((n) => n.remove());
  return (clone.textContent ?? "").replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// Try each selector in order and return the first non-empty text along with the
// selector that produced it (the provenance). A miss returns {value: null,
// source: null} so callers can distinguish "found nothing" from "found empty".
export function firstTextWithSource(
  selectors: string[],
  root: ParentNode = document,
): FieldProvenance {
  for (const sel of selectors) {
    const t = getText(root.querySelector<HTMLElement>(sel));
    if (t) return { value: t, source: sel };
  }
  return { value: null, source: null };
}

// All documents we can scrape from: the top document plus every same-origin
// iframe (LinkedIn renders the job into a /preload/ iframe — see jobs-v1).
// Cross-origin iframes throw on contentDocument access and are skipped.
export function candidateDocuments(): Document[] {
  const docs: Document[] = [document];
  for (const frame of Array.from(document.querySelectorAll("iframe"))) {
    try {
      const doc = (frame as HTMLIFrameElement).contentDocument;
      if (doc?.body) docs.push(doc);
    } catch {
      // cross-origin frame — not readable, skip
    }
  }
  return docs;
}
