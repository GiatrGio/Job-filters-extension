import { defineConfig } from "vitest/config";
import path from "node:path";

// Standalone test config — intentionally does NOT load the CRXJS plugin or the
// manifest/env machinery from vite.config.ts. Tests only need the "@" alias and
// a DOM environment to exercise the LinkedIn scraper against captured fixtures.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      // scrapeJob() reads the job id from location.href, so the test document
      // must look like a real /jobs/view/ page. The id itself is arbitrary —
      // title/company/description come from the fixture DOM, not the URL.
      jsdom: {
        url: "https://www.linkedin.com/jobs/view/4267892341/",
      },
    },
    include: ["tests/**/*.test.ts"],
  },
});
