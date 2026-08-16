import { ENV } from "./env";
import { api } from "./api";

/**
 * Centralised "open the website" helpers. Using `chrome.tabs.create` rather
 * than a plain anchor tag is required from the side panel — anchors with
 * target="_blank" do open a tab, but they don't reliably focus it on every
 * Chrome version, and they also dismiss the side panel on some platforms.
 *
 * Every helper opens a new tab and focuses it.
 */

function openTab(url: string): void {
  void chrome.tabs.create({ url, active: true });
}

function openCompanySearch(
  baseUrl: string,
  queryParam: string,
  company: string,
  extraParams: Record<string, string> = {},
): void {
  const query = company.trim();
  if (!query) return;

  const url = new URL(baseUrl);
  url.searchParams.set(queryParam, query);
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, value);
  }
  openTab(url.toString());
}

// Open the extension's options page on a specific settings tab. We stash the
// desired tab in storage and call openOptionsPage() (which reliably focuses an
// existing options tab) rather than building a getURL()+hash, whose path is not
// stable across dev/prod bundling. The options page reads + clears the key.
export function openOptionsAt(tab: "filters" | "fit" | "cover"): void {
  void chrome.storage.local.set({ pendingOptionsTab: tab }).then(() => {
    chrome.runtime.openOptionsPage?.();
  });
}

export function openPricing(): void {
  void openAuthenticatedWebPath("/pricing");
}

export function openDashboardBoard(): void {
  void openAuthenticatedWebPath("/app?view=board");
}

export function openDashboard(): void {
  void openAuthenticatedWebPath("/app");
}

/**
 * Open an account-aware website destination. The API returns a short-lived,
 * single-use URL that installs a separate website cookie session for the same
 * Supabase user. If the bridge is unavailable, fall back to the ordinary path
 * so the user can still sign in manually.
 *
 * This is deliberately generic: future Settings links should use this helper
 * rather than opening another extension options tab.
 */
export async function openAuthenticatedWebPath(destination: string): Promise<void> {
  const directUrl = websiteDestination(destination);
  try {
    const handoff = await api.createWebHandoff({ destination });
    const handoffUrl = new URL(handoff.url);
    if (handoffUrl.origin !== new URL(ENV.WEB_URL).origin) {
      throw new Error("auth handoff returned an unexpected website origin");
    }
    openTab(handoffUrl.toString());
  } catch {
    openTab(directUrl);
  }
}

function websiteDestination(destination: string): string {
  let decoded = destination;
  try {
    for (let i = 0; i < 3; i += 1) {
      const nextDecoded = decodeURIComponent(decoded);
      if (nextDecoded === decoded) break;
      decoded = nextDecoded;
    }
  } catch {
    throw new Error("website destination must be an internal path");
  }
  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    /[\u0000-\u001F]/.test(decoded)
  ) {
    throw new Error("website destination must be an internal path");
  }
  return `${ENV.WEB_URL.replace(/\/$/, "")}${destination}`;
}

export function openHowItWorks(): void {
  openTab(`${ENV.WEB_URL}/#how-it-works`);
}

export function openGlassdoorCompanySearch(company: string): void {
  openCompanySearch("https://www.glassdoor.com/Reviews/index.htm", "employerName", company, {
    page: "1",
  });
}

export function openIndeedCompanySearch(company: string): void {
  openCompanySearch("https://www.indeed.com/companies/search", "q", company);
}
