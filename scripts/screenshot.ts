import { chromium } from "playwright";
import { ChildProcess, execSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = import.meta.dirname ? resolve(import.meta.dirname, "..") : process.cwd();
const SCREENSHOT_PATH = resolve(REPO_ROOT, "public", "screenshot.png");
const CARDS_PATH = resolve(REPO_ROOT, "public", "screenshot-cards.png");
const README_PATH = resolve(REPO_ROOT, "README.md");
const STARTUP_TIMEOUT = 60_000;
const SCREENSHOT_TIMEOUT = 15_000;

function findChromium(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    const found = execSync(
      "which chromium 2>/dev/null || nix-shell -p chromium --run 'which chromium' 2>/dev/null",
      {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return found || undefined;
  } catch {
    return undefined;
  }
}

function extractPort(output: string): number | null {
  const match = output.match(/Local:\s+http:\/\/localhost:(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function startDevServer(): { process: ChildProcess; urlPromise: Promise<string> } {
  let port: number | null = null;
  let resolveUrl: (url: string) => void;
  let rejectUrl: (err: Error) => void;
  const urlPromise = new Promise<string>((resolve, reject) => {
    resolveUrl = resolve;
    rejectUrl = reject;
  });

  const server = spawn("bun", ["run", "dev"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  let stdout = "";
  server.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
    const match = extractPort(stdout);
    if (match && !port) {
      port = match;
      waitForReady(`http://localhost:${port}`).then(resolveUrl).catch(rejectUrl);
    }
  });

  const failTimer = setTimeout(() => {
    rejectUrl(new Error(`Dev server did not start within ${STARTUP_TIMEOUT}ms`));
  }, STARTUP_TIMEOUT);

  urlPromise.finally(() => clearTimeout(failTimer));

  return { process: server, urlPromise };
}

async function waitForReady(url: string): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < STARTUP_TIMEOUT) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return url;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Server at ${url} did not respond within ${STARTUP_TIMEOUT}ms`);
}

function updateReadme() {
  let readme = readFileSync(README_PATH, "utf-8");

  const dashboardBlock = "![Fishdex Dashboard](public/screenshot.png)";
  const cardsBlock = "![Fishdex Cards](public/screenshot-cards.png)";
  let updated = false;

  if (!readme.includes(dashboardBlock)) {
    const titleLine = readme.indexOf("\n## ");
    const insertIdx = titleLine === -1 ? readme.indexOf("\n") + 1 : titleLine;
    readme = readme.slice(0, insertIdx) + `\n${dashboardBlock}\n` + readme.slice(insertIdx);
    updated = true;
  }

  if (!readme.includes(cardsBlock)) {
    const dashboardIdx = readme.indexOf(dashboardBlock);
    const insertIdx =
      dashboardIdx !== -1 ? readme.indexOf("\n", dashboardIdx) + 1 : readme.indexOf("\n## ");
    readme = readme.slice(0, insertIdx) + `${cardsBlock}\n` + readme.slice(insertIdx);
    updated = true;
  }

  if (updated) {
    writeFileSync(README_PATH, readme);
    console.log("README updated with screenshots.");
  } else {
    console.log("README already contains all screenshot references.");
  }
}

async function main() {
  console.log("Starting dev server...");
  const { process: server, urlPromise } = startDevServer();

  try {
    const url = await urlPromise;
    console.log(`Dev server ready at ${url}. Capturing screenshot...`);

    const executablePath = findChromium();
    if (!executablePath) {
      console.warn("Chromium not found; using Playwright bundled Chromium.");
    }

    const browser = await chromium.launch({
      headless: true,
      executablePath,
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "networkidle", timeout: SCREENSHOT_TIMEOUT });
    await page.waitForTimeout(2000);
    await page
      .waitForFunction(
        () => {
          const images = Array.from(document.querySelectorAll("img"));
          return images.every((img) => (img as HTMLImageElement).complete);
        },
        { timeout: SCREENSHOT_TIMEOUT },
      )
      .catch(() => {});
    await page.screenshot({ path: SCREENSHOT_PATH });

    const gridSelector = "main";
    try {
      await page.waitForSelector(gridSelector, { timeout: 5000 });
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ block: "start" });
      }, gridSelector);
      await page.waitForTimeout(500);
      await page.screenshot({ path: CARDS_PATH });
      console.log(`Cards screenshot saved to ${CARDS_PATH}`);
    } catch {
      console.warn("Could not find card grid for second screenshot.");
    }

    await browser.close();
    console.log(`Screenshot saved to ${SCREENSHOT_PATH}`);

    updateReadme();
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error("Screenshot failed:", err);
  process.exit(1);
});
