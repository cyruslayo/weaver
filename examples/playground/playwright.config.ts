import { defineConfig, devices } from "@playwright/test";

// The e2e run is an explicit, local-only script. It is not part of the required
// CI gate, and it never downloads a browser. See README.md, "Browser checks".
const PORT = 4174;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
    // Use PW_CHROMIUM_EXECUTABLE to point at a preinstalled Chromium. When it is
    // unset, Playwright uses the browser for its pinned revision from
    // PLAYWRIGHT_BROWSERS_PATH. It never runs `playwright install`.
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  webServer: {
    // Serves the built dist/ folder. The e2e script builds the playground first.
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/inspector.html`,
    reuseExistingServer: process.env.CI === undefined,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [
    {
      name: "width-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "width-360",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 780 } },
    },
  ],
});
