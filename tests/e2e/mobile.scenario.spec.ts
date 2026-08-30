import { mkdirSync, rmSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.beforeAll(() => {
  rmSync("artifacts/screenshots", { recursive: true, force: true });
  mkdirSync("artifacts/screenshots", { recursive: true });
});

test("scenario: mobile day history is dense, direct-labelled and scrolls into the previous day", async ({ page }) => {
  await page.goto("/preview/");
  const card = page.locator("alx-heating-history-card");
  await expect(card).toBeVisible();
  await expect(card.locator(".direct-label")).toHaveCount(5);
  await expect(card.locator('[data-kind="precipitation"]')).not.toHaveCount(0);
  const box = await card.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(390);
  const timelineBox = await card.locator(".timeline").boundingBox();
  for (const label of await card.locator(".direct-label").all()) {
    const labelBox = await label.boundingBox();
    expect(labelBox?.y).toBeGreaterThanOrEqual(timelineBox!.y);
    expect(labelBox!.y + labelBox!.height).toBeLessThanOrEqual(timelineBox!.y + timelineBox!.height);
  }
  const timeBoxes = await Promise.all((await card.locator(".time-label").all()).map((label) => label.boundingBox()));
  const timeRight = Math.max(...timeBoxes.map((label) => label!.x + label!.width));
  const requestBox = await card.locator('[data-kind="heating-request"]').boundingBox();
  expect(requestBox!.x).toBeGreaterThan(timeRight);
  const targetSeries = card.locator('[data-kind="target_temperature"] .series');
  await expect.poll(() => targetSeries.count()).toBeGreaterThanOrEqual(2);
  const targetPath = await targetSeries.first().getAttribute("d");
  expect(targetPath).toMatch(/V .* H /);
  expect(targetPath).not.toContain("L");
  for (const interval of await card.locator('[data-kind="heating-request"] .request').all()) {
    expect(await interval.getAttribute("x1")).toBe(await interval.getAttribute("x2"));
  }
  await expect(card.locator('[data-label="heating-request"]')).toHaveText("No heat req.");
  await page.screenshot({ path: "artifacts/screenshots/history-day-now-dark.png" });

  await page.mouse.move(timelineBox!.x + timelineBox!.width * .55, timelineBox!.y + timelineBox!.height * .45);
  const inspector = card.locator(".inspector");
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText("Zone A");
  await expect(inspector).toContainText(/Rain \d+\.\d mm \(estimated\)/);
  await expect(inspector).not.toContainText("Rain est.");
  const inspectorGeometry = await inspector.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(inspectorGeometry.scrollWidth).toBeLessThanOrEqual(inspectorGeometry.clientWidth);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect((await card.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: "artifacts/screenshots/history-touch-inspection-dark.png" });
  await card.locator("svg").dispatchEvent("pointerleave");
  await expect(inspector).toBeHidden();

  const before = await card.locator("header span").textContent();
  const beforeHeight = await card.locator(".timeline").evaluate((element) => element.scrollHeight);
  await card.locator(".timeline").evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => card.locator("header span").textContent()).not.toBe(before);
  const anchor = await card.locator(".timeline").evaluate((element) => ({
    scrollTop: element.scrollTop,
    addedHeight: element.scrollHeight,
  }));
  expect(Math.abs(anchor.scrollTop - (anchor.addedHeight - beforeHeight))).toBeLessThanOrEqual(2);
  await expect(card.locator(".direct-label")).toHaveCount(5);
  await card.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: "artifacts/screenshots/history-day-earlier-dark.png" });
});

test("scenario: week scale remains scrollable and readable in light theme", async ({ page }) => {
  await page.goto("/preview/");
  await page.locator("#theme").click();
  const card = page.locator("alx-heating-history-card");
  await card.getByRole("button", { name: "Week" }).click();
  await expect(card.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
  const timeline = card.locator(".timeline");
  await expect(timeline).toHaveCSS("overflow-y", "auto");
  const target = await card.locator('[data-label="target_temperature"]').boundingBox();
  const lastTime = await card.locator(".time-label").last().boundingBox();
  const timelineBox = await timeline.boundingBox();
  expect(target!.y + target!.height).toBeLessThanOrEqual(timelineBox!.y + timelineBox!.height);
  expect(lastTime!.y + lastTime!.height).toBeLessThanOrEqual(timelineBox!.y + timelineBox!.height);
  await page.screenshot({ path: "artifacts/screenshots/history-week-bright-theme.png" });
});

test("scenario: timed away offers presets, an approximate scrubber, one apply and one cancel", async ({ page }) => {
  await page.goto("/preview/");
  const card = page.locator("alx-timed-away-card");
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("button", { name: "Set away" }).click();
  const dialog = card.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "8h 30m" })).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/timed-away-picker.png" });
  await dialog.getByRole("button", { name: "8h 30m" }).click();
  await dialog.getByRole("button", { name: "Apply away" }).click();
  await expect(card.getByText(/Away until/)).toBeVisible();
  expect(await page.evaluate(() => window.previewCalls.at(-1))).toMatchObject({
    domain: "script", service: "example_apply_timed_away", data: { duration_minutes: 510 },
  });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/screenshots/timed-away-active.png" });
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card.getByRole("button", { name: "Set away" })).toBeVisible();

  await page.evaluate(() => window.previewSetAwayState("Applying away", "active"));
  await expect(card.getByText("Applying away and confirming heating")).toBeVisible();
  await page.evaluate(() => window.previewSetAwayState("Restoring", "idle"));
  await expect(card.getByText("Restoring heating schedule")).toBeVisible();
  await page.evaluate(() => window.previewSetAwayState("Fault", "idle"));
  const faultStatus = card.locator('.copy [role="alert"]');
  await expect(faultStatus).toContainText("Away control fault");
  const faultCardBox = await card.locator("ha-card").boundingBox();
  const faultCopyBox = await card.locator(".copy").boundingBox();
  const resumeBox = await card.getByRole("button", { name: "Resume schedule" }).boundingBox();
  const faultCopyGeometry = await card.locator(".copy").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(faultCardBox!.width).toBeLessThanOrEqual(390);
  expect(faultCopyGeometry.scrollWidth).toBeLessThanOrEqual(faultCopyGeometry.clientWidth);
  expect(resumeBox!.x).toBeGreaterThanOrEqual(faultCardBox!.x);
  expect(resumeBox!.x + resumeBox!.width).toBeLessThanOrEqual(faultCardBox!.x + faultCardBox!.width);
  expect(resumeBox!.y).toBeGreaterThanOrEqual(faultCopyBox!.y + faultCopyBox!.height);
  await page.screenshot({ path: "artifacts/screenshots/timed-away-fault.png" });

  await page.evaluate(() => { window.previewDeferNext = true; });
  await card.getByRole("button", { name: "Resume schedule" }).click();
  await expect(faultStatus).toContainText("Away control fault");
  await expect(card.getByRole("button", { name: "Resuming…" })).toBeDisabled();
  await page.evaluate(() => window.previewFinishDeferred(true));
  await expect(card.locator(".error")).toContainText("Backend rejected the resume request");
  await expect(faultStatus).toContainText("Away control fault");
  await card.getByRole("button", { name: "Resume schedule" }).click();
  await expect(card.getByRole("button", { name: "Set away" })).toBeVisible();

  await page.evaluate(() => window.previewSetAwayState("Mismatch", "idle"));
  await expect(card.locator('.copy [role="alert"]')).toContainText("Heating state mismatch");
  await expect(card.getByRole("button", { name: "Resume schedule" })).toBeVisible();
  await page.evaluate(() => window.previewSetAwayState("Schedule", "active"));
  await expect(card.locator('.copy [role="alert"]')).toContainText("Heating state mismatch");
  await page.evaluate(() => window.previewSetAwayState("Away", "idle"));
  await expect(card.locator('.copy [role="alert"]')).toContainText("Heating state mismatch");
});

test("scenario: a refused away action stays open and explains that heating was not changed", async ({ page }) => {
  await page.goto("/preview/");
  await page.evaluate(() => { window.previewFailNext = true; });
  const card = page.locator("alx-timed-away-card");
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("button", { name: "Set away" }).click();
  await card.getByRole("button", { name: "Apply away" }).click();
  const dialog = card.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("heating was not changed");
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/timed-away-failure.png" });
});

declare global {
  interface Window {
    previewCalls: Array<Record<string, unknown>>;
    previewFailNext: boolean;
    previewDeferNext: boolean;
    previewSetAwayState: (mode: string, timerState?: string, finishesAt?: string) => void;
    previewFinishDeferred: (reject?: boolean) => void;
  }
}
