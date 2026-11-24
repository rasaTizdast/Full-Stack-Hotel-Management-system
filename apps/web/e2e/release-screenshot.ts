import type { Page } from '@playwright/test';

export const releaseScreenshotStyle = `
  .skip-link { visibility: hidden !important; }
  nextjs-portal { display: none !important; }
`;

export async function prepareReleaseScreenshot(page: Page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
}
