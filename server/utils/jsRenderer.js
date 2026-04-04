/**
 * JS Renderer — Puppeteer with @sparticuz/chromium
 *
 * Renders JS-heavy pages (React, Next.js, Vue, Angular) that return
 * blank HTML when fetched normally.
 *
 * Falls back to regular fetch() if Puppeteer is unavailable
 * (e.g. Render free tier without enough memory).
 *
 * Usage:
 *   const { renderPage } = require("./jsRenderer");
 *   const { html, rendered, error } = await renderPage("https://example.com");
 */

let puppeteer = null;
let chromium  = null;
let available = null; // null = not checked yet, true/false after first call

async function checkAvailability() {
  if (available !== null) return available;
  try {
    puppeteer = require("puppeteer-core");
    chromium  = require("@sparticuz/chromium");
    available = true;
    console.log("[jsRenderer] Puppeteer + chromium available ✓");
  } catch {
    available = false;
    console.log("[jsRenderer] Puppeteer not installed — falling back to fetch()");
  }
  return available;
}

/**
 * Detect if a page likely uses JS rendering based on its HTML.
 * Call this on the fetch() result — if true, use renderPage() instead.
 */
function isJSRendered(html) {
  if (!html || html.length > 5000) return false; // has real content
  return (
    html.includes("__NEXT_DATA__") ||           // Next.js
    html.includes("data-reactroot") ||           // React
    html.includes("window.__INITIAL_STATE__") || // Vue/Nuxt
    html.includes("ng-version=") ||              // Angular
    html.includes("__NUXT__") ||                 // Nuxt.js
    (html.includes('<div id="app">') && html.length < 2000) || // Generic SPA
    (html.includes('<div id="root">') && html.length < 2000)   // Create React App
  );
}

/**
 * Render a page using Puppeteer (returns full DOM after JS execution).
 * Falls back to fetch() if Puppeteer unavailable.
 *
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {{ html: string, rendered: boolean, error: string|null }}
 */
async function renderPage(url, timeoutMs = 20000) {
  const hasPuppeteer = await checkAvailability();

  // ── Puppeteer path ─────────────────────────────────────────────────────────
  if (hasPuppeteer) {
    let browser;
    try {
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      const page = await browser.newPage();

      // Block images, fonts, stylesheets — we only need HTML
      await page.setRequestInterception(true);
      page.on("request", req => {
        const type = req.resourceType();
        if (["image", "stylesheet", "font", "media"].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.setUserAgent("Mozilla/5.0 (compatible; SEOAgentBot/1.0)");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });

      // Wait for body to have content
      await page.waitForFunction(
        () => document.body && document.body.innerHTML.length > 200,
        { timeout: 5000 }
      ).catch(() => {}); // non-fatal if times out

      const html = await page.content();
      return { html, rendered: true, error: null };
    } catch (e) {
      return { html: null, rendered: false, error: e.message };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  // ── Fallback: regular fetch ────────────────────────────────────────────────
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOAgentBot/1.0)" },
      redirect: "follow",
    });
    const html = await res.text();
    return { html, rendered: false, error: null };
  } catch (e) {
    return { html: null, rendered: false, error: e.message };
  }
}

module.exports = { renderPage, isJSRendered, checkAvailability };
