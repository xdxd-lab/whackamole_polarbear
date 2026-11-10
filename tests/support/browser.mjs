import { chromium, firefox, webkit } from 'playwright';

/**
 * The browser engine every test and the release gate run in.
 * WAM_BROWSER picks it (chromium | firefox | webkit). The default is chromium,
 * so every existing command behaves exactly as before.
 */
const ENGINES = { chromium, firefox, webkit };

export const BROWSER_NAME = process.env.WAM_BROWSER || 'chromium';

export function launchBrowser() {
  const engine = ENGINES[BROWSER_NAME];
  if (!engine) throw new Error(`Unknown WAM_BROWSER "${BROWSER_NAME}". Use chromium, firefox or webkit.`);
  return engine.launch({ headless: true });
}
