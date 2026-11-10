import { defineConfig, devices } from "@playwright/test";

const previewPort = Number(process.env.WIDGET_PREVIEW_PORT ?? 4173);
const previewUrl = new URL("http://127.0.0.1:4173");
previewUrl.port = String(previewPort);

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  use: {
    ...devices["iPhone 13"],
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    baseURL: previewUrl.origin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node tools/static-server.mjs",
    port: previewPort,
    reuseExistingServer: !process.env.CI
  }
});
