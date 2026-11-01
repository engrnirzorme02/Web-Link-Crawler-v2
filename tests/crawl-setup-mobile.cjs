/**
 * Chromium mobile viewport smoke test. No crawl requests are dispatched.
 * Requires Vite on http://127.0.0.1:4173 and local Playwright installation.
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [360, 393, 412]) {
      const context = await browser.newContext({
        viewport: { width, height: 800 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36'
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      const targets = page.locator('#mobile-crawl-targets');
      await targets.waitFor({ state: 'visible', timeout: 20000 });
      await targets.fill('https://example.com');
      const domain = page.locator('input[name="mobile-crawl-scope"][value="domain"]');
      assert.equal(await domain.isChecked(), true);
      assert.equal(await page.locator('#mobile-max-pages').inputValue(), '50');
      assert.equal(await page.locator('#mobile-max-depth').inputValue(), '2');

      await page.locator('input[name="mobile-crawl-scope"][value="single"]').check();
      assert.equal(await page.locator('#mobile-max-depth').inputValue(), '0');
      await domain.check();
      assert.equal(await page.locator('#mobile-max-depth').inputValue(), '2');

      const formBounds = await page.locator('form[aria-label="Website crawl setup"]').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right };
      });
      assert.ok(formBounds.left >= -1 && formBounds.right <= width + 1, JSON.stringify({ width, formBounds }));

      await page.getByRole('button', { name: 'Advanced settings' }).click();
      await page.getByRole('button', { name: 'Simple setup' }).click();
      assert.equal(await targets.isVisible(), true);
      assert.equal(errors.length, 0, errors.join('; '));
      await context.close();
      console.log('PASS Android-style viewport:', width);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
