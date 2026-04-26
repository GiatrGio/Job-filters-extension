import { ENV } from "./env";

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

export function openPricing(): void {
  openTab(`${ENV.WEB_URL}/pricing`);
}

export function openDashboardJob(applicationId: string): void {
  openTab(`${ENV.WEB_URL}/app/jobs/${applicationId}`);
}

export function openDashboard(): void {
  openTab(`${ENV.WEB_URL}/app`);
}
