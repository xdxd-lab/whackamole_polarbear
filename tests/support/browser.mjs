import { chromium, firefox, webkit } from 'playwright';

/**
 * The browser engine every test and the release gate run in.
 * WAM_BROWSER picks it (chromium | firefox | webkit). The default is chromium,
 * so every existing command behaves exactly as before.
 *
 * What is known per engine (CI, 2026-11-11, Playwright 1.56.1):
 * - chromium: everything passes. The mutation check runs here only.
 * - webkit: everything passes except the repeat-visit cache test, which is skipped
 *   because Playwright's WebKit fetched the images again on every visit, cache or not.
 * - firefox: the gate runs but does not block a merge yet. Ten layout tests fail
 *   because the board does not shrink to the height of the screen in Firefox, a
 *   real fault in the game; three music tests time out waiting for audio to stop
 *   or fade, most likely because headless Firefox has no audio clock on CI.
 */
const ENGINES = { chromium, firefox, webkit };

export const BROWSER_NAME = process.env.WAM_BROWSER || 'chromium';

export function launchBrowser() {
  const engine = ENGINES[BROWSER_NAME];
  if (!engine) throw new Error(`Unknown WAM_BROWSER "${BROWSER_NAME}". Use chromium, firefox or webkit.`);
  return engine.launch({ headless: true });
}
