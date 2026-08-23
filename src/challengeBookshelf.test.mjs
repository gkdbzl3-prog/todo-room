import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { chromium } from "playwright";

test("완독 서재의 책 표지는 여러 줄로 줄바꿈된다", async () => {
  const browser = await chromium.launch({
    ...(existsSync("/usr/bin/google-chrome") && { executablePath: "/usr/bin/google-chrome" }),
    headless: true,
  });
  const page = await browser.newPage();

  try {
    await page.setContent(`
      <div class="challenge-bookshelf-row" style="width: 300px">
        ${Array.from({ length: 12 }, (_, index) => `<div class="bookshelf-book">${index + 1}</div>`).join("")}
      </div>
    `);
    await page.addStyleTag({ path: new URL("./App.css", import.meta.url).pathname });

    const firstBookTop = await page.locator(".bookshelf-book").first().evaluate((element) => element.offsetTop);
    const lastBookTop = await page.locator(".bookshelf-book").last().evaluate((element) => element.offsetTop);

    assert.ok(lastBookTop > firstBookTop);
  } finally {
    await browser.close();
  }
});
