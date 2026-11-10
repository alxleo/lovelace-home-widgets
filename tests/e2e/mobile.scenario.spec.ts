import { mkdirSync, rmSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { HeatingHistoryCard } from "../../src/cards/heating-history/card";

test.beforeAll(() => {
  rmSync("artifacts/screenshots", { recursive: true, force: true });
  mkdirSync("artifacts/screenshots", { recursive: true });
});

test("scenario: room journals show current and target, inspect without reflow and page earlier", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  await page.goto("/preview/");
  const card = page.locator("alx-heating-history-card");
  await expect(card.locator(".room")).toHaveCount(2);
  await expect(card.locator(".window")).toContainText("Last 24 hours");
  await expect(card.locator(".room").first()).toContainText("Now");
  await expect(card.locator(".room").first()).toContainText("Set");
  await expect.poll(() => card.locator(".heat-band").count()).toBeGreaterThan(0);
  expect(Number(await card.locator(".heat-band").first().getAttribute("height"))).toBeGreaterThan(100);
  expect(await card.locator(".target-line").first().getAttribute("d")).toMatch(/H .* V /);
  await page.screenshot({ path: "artifacts/screenshots/history-day-now-dark.png" });
  const chart = card.locator(".chart").first();
  const before = await card.boundingBox();
  await chart.focus();
  await chart.press("ArrowLeft");
  await expect(card.locator(".inspection").first()).toContainText("actual");
  await expect(card.locator(".inspection").first()).toContainText(/Request: (on|off|unknown)/);
  expect((await card.boundingBox())!.height).toBeCloseTo(before!.height, 1);
  await page.screenshot({ path: "artifacts/screenshots/history-touch-inspection-dark.png" });
  await chart.press("Escape");
  await card.getByRole("button", { name: "Earlier history", exact: true }).click();
  await expect(card.locator(".window")).not.toContainText("Last 24 hours");
  await expect(card.getByRole("button", { name: "Later history", exact: true })).toBeEnabled();
  await page.screenshot({ path: "artifacts/screenshots/history-day-earlier-dark.png" });
  await card.getByRole("button", { name: "Later history", exact: true }).click();
  await expect(card.locator(".window")).toContainText("Last 24 hours");
  expect(browserErrors).toEqual([]);
});

test("scenario: week and weather disclosure retain separate units without nested scroll", async ({ page }) => {
  await page.goto("/preview/");
  await page.locator("#theme").click();
  const card = page.locator("alx-heating-history-card");
  await page.screenshot({ path: "artifacts/screenshots/history-day-now-light.png" });
  await card.getByRole("button", { name: "Week", exact: true }).click();
  await expect(card.locator(".window")).toContainText("Last 7 days");
  await card.locator(".weather summary").click();
  await expect(card.locator(".weather-charts")).toBeVisible();
  await expect(card.locator(".weather summary")).toContainText("latest estimate");
  await expect(card.locator(".timeline")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/screenshots/history-week-bright-theme.png" });
});

test("scenario: native target action waits for readback, reports refusal and respects bounds", async ({ page }) => {
  await page.goto("/preview/");
  const card = page.locator("alx-heating-history-card");
  const room = card.locator(".room").first();
  await page.evaluate(() => { window.previewDeferNext = true; });
  await room.locator(".temperature-plus").click();
  await expect(room.locator(".set")).toContainText("Confirming");
  await expect(room.locator(".set-value strong")).toHaveText("21.0°C");
  await expect(room.locator(".temperature-plus")).toBeDisabled();
  await page.evaluate(() => window.previewFinishDeferred());
  await expect(room.locator(".set-value strong")).toHaveText("21.5°C");
  expect(await page.evaluate(() => window.previewCalls.at(-1))).toMatchObject({ domain: "climate", service: "set_temperature", data: { entity_id: "climate.example_zone_a", temperature: 21.5 } });
  await page.evaluate(() => { window.previewFailNext = true; });
  await room.locator(".temperature-minus").click();
  await expect(room.getByRole("alert")).toContainText("Couldn't change");
  await expect(room.locator(".set-value strong")).toHaveText("21.5°C");
  for (let step = 0; step < 4; step++) await room.locator(".temperature-plus").click();
  await expect(room.locator(".set-value strong")).toHaveText("23.5°C");
  await expect(room.locator(".temperature-plus")).toBeDisabled();
  await page.setViewportSize({ width: 1000, height: 844 });
  await page.locator("main").evaluate((element) => { element.style.width = "940px"; });
  const rooms = await card.locator(".room").all();
  expect((await rooms[0]!.boundingBox())!.y).toBeCloseTo((await rooms[1]!.boundingBox())!.y, 1);
});

test("scenario: accepted target action without device readback times out without optimistic success", async ({ page }) => {
  await page.goto("/preview/");
  const card = page.locator("alx-heating-history-card");
  const room = card.locator(".room").first();
  await expect(room.locator(".temperature-plus")).toBeEnabled();
  await page.clock.install();
  await page.evaluate(() => { window.previewSuppressReadback = true; });
  await room.locator(".temperature-plus").click();
  await expect(room.locator(".set-value strong")).toHaveText("21.0°C");
  await page.clock.fastForward(10001);
  await expect(room.getByRole("alert")).toContainText("No device confirmation");
  await expect(room.locator(".set-value strong")).toHaveText("21.0°C");
  await expect(room.locator(".temperature-plus")).toBeEnabled();
});

test("scenario: detached journals reconnect and a refreshed historical window returns to current latest", async ({ page }) => {
  await page.clock.install();
  await page.goto("/preview/");
  const card = page.locator("alx-heating-history-card");
  await expect(card.locator(".actual-line").first()).toBeVisible();
  await card.evaluate(async (element) => {
    const instance = element as HeatingHistoryCard;
    const healthy = instance.hass!;
    let complete!: (response: Record<string, never[]>) => void;
    const pending = new Promise<Record<string, never[]>>((resolve) => { complete = resolve; });
    instance.hass = { ...healthy, callWS: async <T>() => await pending as T };
    instance.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Earlier history"]')!.click();
    await instance.updateComplete;
    const parent = instance.parentElement!;
    instance.remove(); instance.hass = healthy; parent.append(instance);
    await instance.updateComplete;
    complete({});
  });
  await expect(card.locator(".actual-line").first()).toBeVisible();
  await expect(card.getByRole("button", { name: "Week", exact: true })).toBeEnabled();
  await card.getByRole("button", { name: "Earlier history", exact: true }).click();
  const previous = await card.locator(".window span").textContent();
  const latestEnd = await card.evaluate((element) => (element as unknown as { controller: { loadedRange: { end: number } } }).controller.loadedRange.end);
  await page.clock.fastForward(30001);
  await expect.poll(() => card.evaluate((element) => (element as unknown as { controller: { loadedRange: { end: number } } }).controller.loadedRange.end)).toBeGreaterThan(latestEnd);
  await expect(card.locator(".window span")).toHaveText(previous!);
  await card.getByRole("button", { name: "Later history", exact: true }).click();
  await expect(card.locator(".window")).toContainText("Last 24 hours");
  await expect(card.getByRole("button", { name: "Later history", exact: true })).toBeDisabled();
});

test("scenario: late rejection from an expired request cannot clear a newer target request", async ({ page }) => {
  await page.goto("/preview/");
  const card = page.locator("alx-heating-history-card");
  const room = card.locator(".room").first();
  await expect(room.locator(".temperature-plus")).toBeEnabled();
  await page.clock.install();
  await card.evaluate((element) => {
    const instance = element as HeatingHistoryCard;
    window.previewRejections = [];
    instance.hass = { ...instance.hass!, callService: () => new Promise((_, reject) => window.previewRejections.push(() => reject(new Error("Expired request rejected")))) };
  });
  await room.locator(".temperature-plus").click();
  await page.clock.fastForward(10001);
  await expect(room.getByRole("alert")).toContainText("No device confirmation");
  await room.locator(".temperature-plus").click();
  await page.evaluate(() => window.previewRejections[0]!());
  await expect(room.locator(".set")).toContainText("Confirming");
  await expect(room.locator(".temperature-plus")).toBeDisabled();
  await expect(room.getByRole("alert")).toHaveCount(0);
});

test("scenario: removing history during its first request leaves no observing resource", async ({ page }) => {
  await page.goto("/preview/");
  await expect(page.locator("alx-heating-history-card svg").first()).toBeVisible();
  const observing = await page.evaluate(async () => {
    let complete!: (response: Record<string, never[]>) => void;
    const pending = new Promise<Record<string, never[]>>((resolve) => { complete = resolve; });
    const card = document.createElement("alx-heating-history-card") as HeatingHistoryCard;
    const NativeObserver = window.ResizeObserver;
    let observed = 0;
    window.ResizeObserver = class extends NativeObserver {
      observe(target: Element, options?: ResizeObserverOptions): void {
        if ((target.getRootNode() as ShadowRoot).host === card) observed += 1;
        super.observe(target, options);
      }
    };
    try {
      card.setConfig({ type: "custom:alx-heating-history-card", series: [
        { kind: "actual_temperature", entity: "climate.example_zone_a", label: "Zone A" },
      ] });
      card.hass = { states: {}, callWS: async <T>() => await pending as T, callService: async () => undefined };
      document.body.append(card);
      await card.updateComplete;
      card.remove();
      complete({});
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return observed;
    } finally {
      card.remove();
      window.ResizeObserver = NativeObserver;
    }
  });
  expect(observing).toBe(0);
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

test("scenario: pc power toggles, delays shutdown, shows the countdown and cancels it", async ({ page }) => {
  await page.goto("/preview/");
  const card = page.locator("alx-pc-power-card");
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator(".summary")).toHaveAttribute("data-mode", "off");
  await card.getByRole("button", { name: "Power on" }).click();
  expect(await page.evaluate(() => window.previewCalls.at(-1))).toMatchObject({
    domain: "switch", service: "turn_on", data: { entity_id: "switch.example_pc" },
  });
  await expect(card.locator(".summary")).toHaveAttribute("data-mode", "on");

  await card.getByRole("button", { name: "Delay…" }).click();
  const dialog = card.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "1h" })).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/pc-power-picker.png" });
  await dialog.getByRole("button", { name: "30m" }).click();
  await dialog.getByRole("button", { name: "Start countdown" }).click();
  expect(await page.evaluate(() => window.previewCalls.at(-1))).toMatchObject({
    domain: "timer", service: "start", data: { entity_id: "timer.example_pc_shutdown", duration: 1800 },
  });
  await expect(card.locator(".summary")).toHaveAttribute("data-mode", "countdown");
  await expect(card.getByText("Shutting down in 30m 0s")).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/screenshots/pc-power-countdown.png" });
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card.locator(".summary")).toHaveAttribute("data-mode", "on");

  await page.evaluate(() => window.previewSetPcState("off", "active", "00:29:59"));
  await expect(card.locator('.copy [role="alert"]')).toContainText("Countdown pending while the PC is off");
  await expect(card.getByRole("button", { name: "Cancel timer" })).toBeVisible();
  await page.evaluate(() => window.previewSetPcState("unavailable"));
  await expect(card.getByText("Power state is not answering")).toBeVisible();
  await page.evaluate(() => window.previewSetPcState("on"));
});

test("scenario: a refused shutdown delay keeps the sheet open and says no countdown started", async ({ page }) => {
  await page.goto("/preview/");
  const card = page.locator("alx-pc-power-card");
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => { window.previewFailNext = true; });
  await card.getByRole("button", { name: "Power on" }).click();
  await expect(card.locator(".summary")).toHaveAttribute("data-mode", "off");
  await expect(card.locator(".error")).toContainText("the power switch did not respond");
  await card.getByRole("button", { name: "Power on" }).click();
  await expect(card.locator(".summary")).toHaveAttribute("data-mode", "on");
  await page.evaluate(() => { window.previewFailNext = true; });
  await card.getByRole("button", { name: "Delay…" }).click();
  const dialog = card.getByRole("dialog");
  await dialog.getByRole("button", { name: "15m" }).click();
  await dialog.getByRole("button", { name: "Start countdown" }).click();
  await expect(dialog.getByRole("alert")).toContainText("no countdown was started");
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/pc-power-failure.png" });
});

declare global {
  interface Window {
    previewCalls: Array<Record<string, unknown>>;
    previewFailNext: boolean;
    previewSuppressReadback: boolean;
    previewRejections: Array<() => void>;
    previewDeferNext: boolean;
    previewSetAwayState: (mode: string, timerState?: string, finishesAt?: string) => void;
    previewFinishDeferred: (reject?: boolean) => void;
    previewSetPcState: (power: string, timer?: string, remaining?: string) => void;
  }
}
