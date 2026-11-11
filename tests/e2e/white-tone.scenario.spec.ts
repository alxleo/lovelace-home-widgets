import { expect, test } from "@playwright/test";

test("scenario: existing Bubble disclosure sends one full-range warm command and waits for device readback", async ({ page }) => {
  await page.goto("/preview/white-tone.html");
  const card = page.locator("bubble-card");
  await expect(card.locator("alx-white-tone-slider")).not.toBeVisible();
  await card.locator(".bubble-sub-button-1").click();
  const slider = card.locator("alx-white-tone-slider");
  await expect(slider).toBeVisible();
  const range = slider.getByRole("slider");
  await expect(range).toHaveValue("626");
  // Bubble animates the disclosure. Native pointer coordinates need its stable
  // box; hover uses Playwright's stability check without an arbitrary sleep.
  await range.hover();
  const box = (await range.boundingBox())!;
  await page.mouse.move(box.x + box.width * .626, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2);
  expect(await page.evaluate(() => window.previewCalls)).toHaveLength(0);
  await page.mouse.up();

  await expect(slider.getByRole("status")).toContainText("2700 K …");
  await expect(range).toBeDisabled();
  const calls = await page.evaluate(() => window.previewCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({domain:"light",service:"turn_on",data:{entity_id:"light.example_zone_a_light_a"}});
  expect((calls[0]!.data as Record<string, number>).color_temp_kelvin).toBeGreaterThan(2300);
  expect((calls[0]!.data as Record<string, number>).color_temp_kelvin).toBeLessThan(2350);
  await card.locator(".bubble-sub-slider-wrapper:not(.is-hidden) > .bubble-sub-slider-close").click();
  await expect(slider).not.toBeVisible();
  await card.locator(".bubble-sub-button-1").click();
  await expect(range).toBeDisabled();
  await page.evaluate(() => window.previewWhiteState({color_temp_kelvin:2325}));
  await expect(range).toBeEnabled();
  await expect(slider.getByRole("status")).toHaveText("Ceiling · 2325 K");
  await range.fill("0");
  expect(await page.evaluate(() => window.previewCalls.at(-1))).toMatchObject({data:{color_temp_kelvin:6535}});
  await page.evaluate(() => window.previewWhiteState({color_temp_kelvin:6535}));
  await range.fill("1000");
  expect(await page.evaluate(() => window.previewCalls.at(-1))).toMatchObject({data:{color_temp_kelvin:2000}});
  await page.evaluate(() => window.previewWhiteState({color_temp_kelvin:2000}));
  await page.screenshot({path:"artifacts/screenshots/white-tone-full-range.png"});
});

test("scenario: a refused white adjustment shows reported state and an off light cannot be switched on accidentally", async ({ page }) => {
  await page.goto("/preview/white-tone.html");
  const card = page.locator("bubble-card"); await card.locator(".bubble-sub-button-1").click();
  const slider=card.locator("alx-white-tone-slider"), range=slider.getByRole("slider");
  await page.evaluate(() => {window.previewFailNext=true;});
  await range.fill("800");
  await expect(slider.getByRole("alert")).toContainText("Couldn’t send");
  await expect(range).toBeEnabled();
  await page.evaluate(() => window.previewWhiteState({},"off"));
  await expect(range).toBeDisabled();
  await expect(slider.getByRole("status")).toContainText("Off");
  const box = (await range.boundingBox())!;
  await page.mouse.move(box.x + box.width * .5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2);
  await page.mouse.up();
  expect(await page.evaluate(() => window.previewCalls)).toHaveLength(1);
});

declare global {interface Window {previewWhiteState:(attributes:Record<string,unknown>,power?:string)=>void}}
