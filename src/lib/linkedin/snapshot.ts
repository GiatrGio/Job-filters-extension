// Sanitized job-container snapshot for diagnostics (Measure 3).
//
// PRIVACY MODEL — "capture the job, exclude the user":
//   - We capture the JOB POSTING subtree only (scoped to <main>), which is
//     public listing content and is already sent to the LLM during normal
//     evaluation. We never capture LinkedIn's global chrome (the top nav, feed,
//     and messaging) where the signed-in member's own identity lives — that's
//     outside <main>, and we additionally drop known global-chrome selectors as
//     a belt-and-suspenders for the body fallback.
//   - We keep STRUCTURE (tags, classes, ids, roles, data-*) because that's what
//     lets us see where a moved field now lives and write the selector fix.
//   - We strip scripts, styles and ALL media (no avatars, no image URLs), and
//     drop every non-structural attribute (href, src, alt, aria-label, …).
//   - As defense-in-depth we redact the signed-in member's name (read from the
//     nav before scoping) and any email/phone patterns from the text.
//   - The result is whitespace-collapsed and hard-capped at MAX_HTML.
//
// This is what makes silent + privacy-policy-disclosed defensible: the payload
// stays within the already-disclosed evaluation data flow and excludes the
// member's identity. If this guarantee ever weakens, revisit the consent model.

import { candidateDocuments } from "./dom";

// Preferred roots, most specific first. <main> excludes the global nav/header
// (and thus the member's identity) on LinkedIn job pages; body is a last resort.
const ROOT_SELECTORS = ["main", "[role='main']", ".scaffold-layout__main", "#main-content", "#main"];

// Always removed from the captured subtree: anything non-structural, all media
// (avatars/images), and the known global-chrome containers (belt-and-suspenders
// for the body fallback — under <main> they're already excluded by scoping).
const DROP_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "link",
  "meta",
  "svg",
  "img",
  "picture",
  "video",
  "audio",
  "canvas",
  "iframe",
  "object",
  "embed",
  "#global-nav",
  ".global-nav",
  "[role='banner']",
  ".global-footer",
  ".global-footer-compact",
  ".msg-overlay-list-bubble",
  "[aria-label*='messaging' i]",
];

// Attributes worth keeping for diagnosing structure. Everything else (href,
// src, alt, title, aria-*, style, value, placeholder, srcset, …) is dropped.
// data-* is kept too — LinkedIn uses it for stable test hooks/ids, not PII.
const KEEP_ATTRS = new Set(["class", "id", "role"]);

const MAX_HTML = 50_000;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Phone-ish: 8+ chars of digits/separators with at least 7 actual digits. Tuned
// to skip salary figures (e.g. "€6,500", "60000") which have fewer digits.
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;

// Best-effort read of the signed-in member's display name so we can redact it
// from the captured text. Read from the global nav (which we do NOT capture).
function memberNameGuesses(): string[] {
  const names = new Set<string>();
  const add = (s: string | null | undefined) => {
    const t = (s ?? "").trim();
    if (t.length >= 2 && t.length <= 80) names.add(t);
  };
  add(document.querySelector("img.global-nav__me-photo")?.getAttribute("alt"));
  add(document.querySelector(".global-nav__me-photo")?.getAttribute("alt"));
  add(document.querySelector(".feed-identity-module__actor-meta a")?.textContent);
  return Array.from(names);
}

function redactText(text: string, names: string[]): string {
  let out = text;
  for (const name of names) {
    if (name) out = out.split(name).join("[redacted-name]");
  }
  out = out.replace(EMAIL_RE, "[redacted-email]");
  out = out.replace(PHONE_RE, (m) =>
    m.replace(/\D/g, "").length >= 7 ? "[redacted-phone]" : m,
  );
  return out;
}

function findRoot(doc: Document): HTMLElement | null {
  for (const sel of ROOT_SELECTORS) {
    const el = doc.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return doc.body ?? null;
}

function sanitize(root: HTMLElement, names: string[]): string {
  const clone = root.cloneNode(true) as HTMLElement;

  // Remove each drop-selector independently so one unsupported selector (e.g. a
  // case-insensitive attribute match in an older engine) can't abort the whole
  // sanitisation and leak the rest of the subtree.
  for (const sel of DROP_SELECTORS) {
    try {
      clone.querySelectorAll(sel).forEach((n) => n.remove());
    } catch {
      // unsupported selector in this engine — skip it
    }
  }

  for (const el of Array.from(clone.querySelectorAll<HTMLElement>("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (KEEP_ATTRS.has(name) || name.startsWith("data-")) continue;
      el.removeAttribute(attr.name);
    }
  }

  const owner = clone.ownerDocument ?? document;
  const walker = owner.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) textNodes.push(node as Text);
  for (const tn of textNodes) {
    tn.nodeValue = redactText(tn.nodeValue ?? "", names);
  }

  let html = clone.outerHTML.replace(/\s+/g, " ").trim();
  if (html.length > MAX_HTML) html = `${html.slice(0, MAX_HTML)}<!-- …truncated… -->`;
  return html;
}

// Pure core, exported for tests: pick the first document with real job content,
// sanitize its scoped root, and return the HTML (or null if nothing usable).
export function snapshotFromDocuments(docs: Document[], memberNames: string[]): string | null {
  for (const doc of docs) {
    const root = findRoot(doc);
    if (!root) continue;
    const textLen = (root.textContent ?? "").replace(/\s+/g, " ").trim().length;
    if (textLen < 100) continue; // empty-ish (page not rendered) — try the next doc
    try {
      return sanitize(root, memberNames);
    } catch {
      // sanitisation failed for this doc — try the next, never throw to callers
    }
  }
  return null;
}

export function buildJobSnapshot(): string | null {
  return snapshotFromDocuments(candidateDocuments(), memberNameGuesses());
}
