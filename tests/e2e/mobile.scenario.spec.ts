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
  // The first valid segment may end at the noon unknown gap before a transition.
  const targetPaths = await card.locator(".target-line").evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""));
  expect(targetPaths.some((path) => /H .* V /.test(path))).toBe(true);
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

test("scenario: timed away offers inline presets, an approximate scrubber, one apply and one cancel", async ({ page }) => {
  await page.goto("/preview/");
  const card = page.locator("alx-timed-away-card");
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("button", { name: "Set away" }).click();
  const picker = card.getByRole("region");
  await expect(picker).toBeVisible();
  await expect(card.getByRole("dialog")).toHaveCount(0);
  await expect(picker.getByRole("button", { name: "8h 30m" })).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/timed-away-picker.png" });
  await picker.getByRole("button", { name: "8h 30m" }).click();
  await picker.getByRole("button", { name: "Apply away" }).click();
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
  const picker = card.getByRole("region");
  await expect(card.getByRole("alert")).toContainText("heating was not changed");
  await expect(picker).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/timed-away-failure.png" });
});

test("scenario: heating pause uses inline exact minutes, reported modes and one resume", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/preview/?view=pause");
  const card = page.locator("alx-timed-away-card");
  const picker = card.getByRole("region");
  const open = card.locator(".summary .open");
  await expect(card.getByRole("heading", { name: "On schedule" })).toBeVisible();
  await open.click();
  await expect(picker).toBeVisible();
  await expect(card.getByRole("dialog")).toHaveCount(0);
  await expect(open).toHaveAttribute("aria-expanded", "true");
  for (const label of ["15m", "30m", "1h", "2h"]) await expect(picker.getByRole("button", { name: label, exact: true })).toBeVisible();
  const exact = picker.getByRole("spinbutton", { name: "Exact minutes" });
  const apply = picker.getByRole("button", { name: "Pause heating", exact: true });
  await exact.fill("0");
  await expect(apply).toBeDisabled();
  await exact.fill("2881");
  await expect(apply).toBeDisabled();
  await exact.fill("47");
  await expect(picker.locator(".ends-at time")).toBeVisible();
  const before = await page.evaluate(() => window.previewCalls.length);
  await page.evaluate(() => { window.previewSuppressReadback = true; });
  await apply.click();
  await expect.poll(() => page.evaluate(() => window.previewCalls.length)).toBe(before + 1);
  expect(await page.evaluate(() => window.previewCalls.at(-1))).toMatchObject({ domain: "script", service: "example_apply_timed_pause", data: { duration_minutes: 47 } });
  await expect(card.getByRole("heading", { name: "On schedule" })).toBeVisible();
  await expect(picker.getByRole("button", { name: "Confirming…" })).toBeDisabled();
  await page.evaluate(() => window.previewSetAwayState("Applying pause", "active"));
  await expect(card.getByText("Applying pause and confirming heating")).toBeVisible();
  await expect(picker).toHaveCount(0);
  await page.evaluate(() => window.previewSetAwayState("Paused", "active", new Date(Date.now() + 47 * 60000).toISOString()));
  await expect(card.getByRole("heading", { name: "Heating paused" })).toBeVisible();
  await expect(card.getByText(/Paused until/)).toBeVisible();
  const rooms = page.locator("alx-heating-history-card .room");
  await expect(rooms.first().locator(".set-value strong")).toHaveText("Off");
  await expect(rooms.first().locator(".now strong")).toHaveText("21.4°C");
  await expect(rooms.first().getByRole("button", { name: "Raise Zone A target" })).toBeDisabled();

  await page.screenshot({ path: "artifacts/screenshots/timed-pause-active.png" });
  await page.evaluate(() => { window.previewSuppressReadback = false; });
  await card.getByRole("button", { name: "Resume schedule", exact: true }).click();
  await expect(open).toBeVisible();
  await open.click();
  await exact.fill("1");
  await expect(exact).toHaveValue("1");
  await page.locator("#theme").click();
  await page.screenshot({ path: "artifacts/screenshots/timed-pause-picker.png" });
  const beforeShort = await page.evaluate(() => window.previewCalls.length);
  await apply.click();
  await expect.poll(() => page.evaluate(() => window.previewCalls.length)).toBe(beforeShort + 1);
  expect(await page.evaluate(() => window.previewCalls.at(-1))).toMatchObject({ data: { duration_minutes: 1 } });
  await expect(card.getByRole("heading", { name: "Heating paused" })).toBeVisible();
  await page.evaluate(() => window.previewSetAwayState("Paused", "paused"));
  await expect(card.getByRole("alert")).toContainText("Heating state mismatch");
  expect(browserErrors).toEqual([]);
});

test("scenario: an unconfirmed pause stays reported as schedule and retries inline", async ({ page }) => {
  await page.clock.install();
  await page.goto("/preview/?view=pause");
  const card = page.locator("alx-timed-away-card");
  await card.locator(".summary .open").click();
  const picker = card.getByRole("region");
  await page.evaluate(() => { window.previewSuppressReadback = true; });
  const before = await page.evaluate(() => window.previewCalls.length);
  await picker.getByRole("button", { name: "Pause heating", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.previewCalls.length)).toBe(before + 1);
  await expect(picker.getByRole("button", { name: "Confirming…" })).toBeDisabled();
  await page.clock.fastForward(10001);
  await expect(card.getByRole("alert")).toContainText("No confirmation from heating");
  await expect(card.getByRole("heading", { name: "On schedule" })).toBeVisible();
  await expect(picker).toBeVisible();
  await page.evaluate(() => { window.previewSuppressReadback = false; });
  await picker.getByRole("button", { name: "Pause heating", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.previewCalls.length)).toBe(before + 2);
  await expect(card.getByRole("heading", { name: "Heating paused" })).toBeVisible();
  await card.getByRole("button", { name: "Resume schedule" }).click();
  await card.locator(".summary .open").click();
  await picker.getByRole("spinbutton", { name: "Exact minutes" }).focus();
  await picker.getByRole("spinbutton", { name: "Exact minutes" }).press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(card.locator(".summary .open")).toBeFocused();
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

test("scenario: light brightness is accessible by touch and keyboard without losing identity or collapsing its room", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/preview/?view=lights");
  await page.locator("#theme").click();
  const ceiling = page.locator('[data-fixture-entity="light.example_zone_a_light_a"]');
  const slider = ceiling.getByRole("slider", { name: "Light A brightness", exact: true });
  await expect(slider).toBeVisible();
  const stableHeight = (await ceiling.boundingBox())!.height;
  const bounds = (await slider.boundingBox())!;
  const callsBefore = await page.evaluate(() => window.previewCalls.length);
  await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .75, bounds.y + bounds.height / 2);
  expect(await page.evaluate(() => window.previewCalls.length)).toBe(callsBefore);
  expect((await ceiling.boundingBox())!.height).toBeCloseTo(stableHeight, 1);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.previewCalls.length)).toBe(callsBefore + 1);
  const callsBeforeTouch = await page.evaluate(() => window.previewCalls.length);
  const requestedPercentage = 100;
  await page.touchscreen.tap(bounds.x + bounds.width - 2, bounds.y + bounds.height / 2);
  await expect.poll(() => page.evaluate(() => window.previewCalls.length)).toBe(callsBeforeTouch + 1);
  expect(await page.evaluate((index) => window.previewCalls[index], callsBeforeTouch)).toEqual({
    domain: "light", service: "turn_on",
    data: { entity_id: "light.example_zone_a_light_a", brightness_pct: requestedPercentage },
  });
  await expect(ceiling.locator(".identity")).toContainText("Light A");
  await slider.focus();
  const before = Number(await slider.inputValue());
  await slider.press("ArrowLeft");
  await expect.poll(async () => Number(await slider.inputValue())).toBeLessThan(before);
  await ceiling.getByRole("button", { name: "Adjust Light A", exact: true }).click();
  await expect(ceiling.getByRole("slider", { name: "Light A white tone", exact: true })).toBeVisible();
  await expect(ceiling.locator(".identity")).toContainText("Light A");
  await expect(page.getByRole("button", { name: "Hide Zone A lights", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({ path: "artifacts/screenshots/lights-inline-white-light.png" });
  expect(errors).toEqual([]);
});

test("scenario: inline white and colour controls respect native bounds and group-only scenes", async ({ page }) => {
  await page.goto("/preview/?view=lights");
  await page.locator("#theme").click();
  const ceiling = page.locator('[data-fixture-entity="light.example_zone_a_light_a"]');
  await ceiling.getByRole("button", { name: "Adjust Light A", exact: true }).click();
  const white = ceiling.getByRole("slider", { name: "Light A white tone", exact: true });
  await white.focus(); await white.press("End");
  await expect(white).toHaveAttribute("aria-valuetext", "6500 K");
  expect(await page.evaluate(() => window.previewCalls.at(-1))).toMatchObject({ domain: "light", service: "turn_on", data: { entity_id: "light.example_zone_a_light_a", color_temp_kelvin: 6500 } });
  const beforeMode = await page.evaluate(() => window.previewCalls.length);
  await ceiling.getByRole("button", { name: "Colour", exact: true }).click();
  expect(await page.evaluate(() => window.previewCalls.length)).toBe(beforeMode);
  const hue = ceiling.getByRole("slider", { name: "Light A colour", exact: true });
  await hue.focus(); await hue.press("Home");
  await expect(hue).toHaveAttribute("aria-valuetext", "Red");
  const strength = ceiling.getByRole("slider", { name: "Light A colour strength", exact: true });
  await strength.focus(); await strength.press("End");
  expect(await page.evaluate(() => window.previewCalls.at(-1))).toMatchObject({ data: { hs_color: [0,100] } });
  await expect(ceiling.getByRole("combobox")).toHaveCount(0);
  const room = page.locator('[data-fixture-entity="light.example_zone_a_group"]');
  await room.getByRole("combobox", { name: "Zone A room scene" }).selectOption("Relax");
  expect(await page.evaluate(() => window.previewCalls.at(-1))).toMatchObject({ domain: "select", service: "select_option", data: { entity_id: "select.example_zone_a_scene", option: "Relax" } });
  await expect(page.getByRole("button", { name: "Hide Zone A lights", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({ path: "artifacts/screenshots/lights-inline-colour-light.png" });
  await page.setViewportSize({ width: 1100, height: 844 });
  const geometry = await room.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
});

test("scenario: pending light changes keep reported values, survive one-step baseline updates, and fail visibly", async ({ page }) => {
  await page.clock.install();
  await page.goto("/preview/?view=lights");
  const ceiling = page.locator('[data-fixture-entity="light.example_zone_a_light_a"]');
  const slider = ceiling.getByRole("slider", { name: "Light A brightness", exact: true });
  const stableHeight = (await ceiling.boundingBox())!.height;
  await page.evaluate(() => { window.previewDeferNext = true; });
  await slider.focus(); await slider.press("ArrowRight");
  await expect(ceiling.locator(".identity")).toContainText("Light A · 68%");
  await expect(slider).toBeDisabled();
  expect((await ceiling.boundingBox())!.height).toBeCloseTo(stableHeight, 1);
  await page.evaluate(() => window.previewLightState("light.example_zone_a_light_a", { attributes: { supported_color_modes: ["color_temp", "xy"], brightness: 173, color_mode: "color_temp", color_temp_kelvin: 3000, min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500, hs_color: [210,60], unrelated: true } }));
  await expect(slider).toBeDisabled();
  await page.evaluate(() => window.previewFinishDeferred());
  await expect(slider).toBeEnabled();
  await expect(ceiling.locator(".identity")).toContainText("69%");
  await page.evaluate(() => { window.previewFailNext = true; });
  await slider.focus(); await slider.press("ArrowLeft");
  await expect(ceiling.getByRole("alert")).toContainText("Couldn't send");
  await expect(ceiling.locator(".identity")).toContainText("69%");
  await page.evaluate(() => { window.previewSuppressReadback = true; });
  await slider.focus(); await slider.press("ArrowLeft");
  await page.clock.fastForward(10001);
  await expect(ceiling.getByRole("alert")).toContainText("No confirmation");
  await expect(ceiling.locator(".identity")).toContainText("69%");
  const offline = page.locator('[data-fixture-entity="light.example_zone_f_light"]');
  await expect(offline.locator(".identity")).toContainText("Unavailable");
  await expect(offline.getByRole("slider")).toHaveCount(0);
  await expect(offline.getByRole("button")).toBeDisabled();
  await page.screenshot({ path: "artifacts/screenshots/lights-reported-state-dark.png" });
});

test("scenario: native room-member helpers dispose on close, ignore late results and avoid one-member duplicates", async ({ page }) => {
  await page.goto("/preview/?view=lights");
  const living = page.locator('[data-fixture-entity="light.example_zone_a_group"]');
  await expect(page.locator('[data-fixture-entity="light.example_zone_a_light_a"]')).toBeVisible();
  await living.getByRole("button", { name: "Hide Zone A lights", exact: true }).click();
  await expect(page.locator('[data-fixture-entity="light.example_zone_a_light_a"]')).toHaveCount(0);
  await page.evaluate(() => {
    const nativeHelpers = window.loadCardHelpers!;
    let release!: (helpers: Awaited<ReturnType<typeof nativeHelpers>>) => void;
    window.loadCardHelpers = () => new Promise((resolve) => { release = resolve; });
    window.previewReleaseHelpers = async () => { window.loadCardHelpers = nativeHelpers; release(await nativeHelpers()); };
  });
  await living.getByRole("button", { name: "Show Zone A lights", exact: true }).click();
  await expect(living.locator(".member-status")).toContainText("Loading lights");
  await living.getByRole("button", { name: "Hide Zone A lights", exact: true }).click();
  await page.evaluate(() => window.previewReleaseHelpers());
  await expect(page.locator('[data-fixture-entity="light.example_zone_a_light_a"]')).toHaveCount(0);
  await living.getByRole("button", { name: "Show Zone A lights", exact: true }).click();
  await expect(page.locator('[data-fixture-entity="light.example_zone_a_light_a"]')).toBeVisible();
  const bedroom = page.locator('[data-fixture-entity="light.example_zone_c_group"]');
  await bedroom.evaluate((element) => {
    (element as unknown as { setConfig(config: Record<string, unknown>): void }).setConfig({ type: "custom:alx-light-row-card", entity: "light.example_zone_c_group", name: "Zone C", group: true, cards: [{ type: "custom:alx-light-row-card", entity: "light.example_zone_a_light_c" }] });
  });
  await expect(bedroom.locator(".members-toggle")).toHaveCount(0);
  await expect(bedroom.locator("alx-light-row-card")).toHaveCount(0);
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
    previewReleaseHelpers: () => Promise<void>;
    previewLightState: (entity: string, update: Record<string, unknown>) => void;
    previewSetPcState: (power: string, timer?: string, remaining?: string) => void;
  }
}
