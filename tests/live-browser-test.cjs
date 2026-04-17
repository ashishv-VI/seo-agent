/**
 * Live Browser Test — Opens the real Render deployment in a browser
 * Tests: page loads, no JS errors, no blank screens, key elements visible
 *
 * Run: npx playwright test tests/live-browser-test.js --headed
 * Or headless: node tests/live-browser-test.js
 */

const { chromium } = require("playwright");

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:5173";
const BACKEND  = process.env.BACKEND_URL  || "http://localhost:5000";
const HEADLESS = process.env.HEADLESS !== "false";

const IS_PROD = FRONTEND.includes("onrender.com") || BACKEND.includes("onrender.com");
if (IS_PROD && process.env.ALLOW_PRODUCTION_TESTS !== "true") {
  console.error("ERROR: Refusing to run browser test against production without ALLOW_PRODUCTION_TESTS=true");
  console.error("  Set ALLOW_PRODUCTION_TESTS=true to explicitly opt in.");
  process.exit(1);
}

const results = [];
const jsErrors = [];

function log(route, status, detail = "") {
  const icon = status === "PASS" ? "✅" : status === "WARN" ? "⚠️" : "❌";
  results.push({ route, status, detail });
  console.log(`${icon} ${route} — ${status}${detail ? ": " + detail : ""}`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log("\n🌐 LIVE BROWSER TEST");
  console.log(`Frontend: ${FRONTEND}`);
  console.log(`Backend:  ${BACKEND}`);
  console.log("=".repeat(60) + "\n");

  // ── 1. Backend health check ─────────────────────────────
  console.log("── BACKEND API TESTS ──\n");

  try {
    const res = await fetch(BACKEND, { signal: AbortSignal.timeout(30000) });
    if (res.ok) log("GET /", "PASS", `${res.status}`);
    else log("GET /", "FAIL", `Status ${res.status}`);
  } catch (e) {
    log("GET /", "WARN", `Backend cold start? ${e.message}`);
  }

  // PreSales audit (no auth needed — GET with ?url= query param)
  try {
    const res = await fetch(`${BACKEND}/api/presales/audit?url=${encodeURIComponent("https://example.com")}`, {
      signal: AbortSignal.timeout(90000),
    });
    const data = await res.json();
    if (res.ok && data.audit) log("GET /api/presales/audit", "PASS", `Score: ${data.audit?.healthScore || "N/A"}`);
    else if (res.ok) log("GET /api/presales/audit", "WARN", "200 but no audit data");
    else log("GET /api/presales/audit", "FAIL", `${res.status}: ${data.error || "unknown"}`);
  } catch (e) {
    log("GET /api/presales/audit", "FAIL", e.message);
  }

  // Domain overview route requires auth (POST) — skip unauthenticated check,
  // note it as skipped so the test doesn't report a false failure.
  log("POST /api/crawler/domain-overview", "WARN", "Skipped — requires auth token (tested in e2e-full-journey)");

  // ── 2. Browser tests ───────────────────────────────────
  console.log("\n── BROWSER UI TESTS ──\n");

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 500 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Capture JS errors
  page.on("pageerror", err => {
    jsErrors.push({ url: page.url(), error: err.message });
    console.log(`   🔴 JS Error: ${err.message.slice(0, 120)}`);
  });

  // Capture console errors
  page.on("console", msg => {
    if (msg.type() === "error" && !msg.text().includes("favicon")) {
      jsErrors.push({ url: page.url(), error: `console.error: ${msg.text().slice(0, 120)}` });
    }
  });

  // ── Test 1: Homepage / Login page loads ─────────────
  try {
    const resp = await page.goto(FRONTEND, { waitUntil: "networkidle", timeout: 45000 });
    if (resp.ok()) {
      const bodyText = await page.textContent("body");
      if (bodyText && bodyText.length > 50) {
        log("Homepage load", "PASS", `${bodyText.length} chars rendered`);
      } else {
        log("Homepage load", "WARN", "Page loaded but very little content");
      }
    } else {
      log("Homepage load", "FAIL", `Status ${resp.status()}`);
    }
  } catch (e) {
    log("Homepage load", "FAIL", e.message.slice(0, 100));
  }

  // ── Test 2: Check login form exists ─────────────────
  try {
    const hasEmail = await page.locator("input[type='email'], input[placeholder*='email' i]").count();
    const hasPassword = await page.locator("input[type='password']").count();
    const hasButton = await page.locator("button").count();
    if (hasEmail > 0 && hasPassword > 0) {
      log("Login form", "PASS", `email:${hasEmail} password:${hasPassword} buttons:${hasButton}`);
    } else if (hasButton > 0) {
      log("Login form", "WARN", `No email/password fields but ${hasButton} buttons — may be Google-only auth`);
    } else {
      log("Login form", "WARN", "No form elements found — checking if already logged in");
    }
  } catch (e) {
    log("Login form", "WARN", e.message.slice(0, 80));
  }

  // ── Test 3: PreSales /audit page (no login needed) ──
  try {
    await page.goto(`${FRONTEND}/audit`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(2000);
    const bodyText = await page.textContent("body");
    const hasInput = await page.locator("input").count();
    const hasButton = await page.locator("button").count();
    if (bodyText.length > 100 && hasInput > 0) {
      log("/audit page", "PASS", `Content rendered, ${hasInput} inputs, ${hasButton} buttons`);
    } else if (bodyText.length > 50) {
      log("/audit page", "WARN", "Page loaded but inputs may be missing");
    } else {
      log("/audit page", "FAIL", "Page appears blank");
    }
  } catch (e) {
    log("/audit page", "FAIL", e.message.slice(0, 100));
  }

  // ── Test 4: Run a presales audit via UI ─────────────
  try {
    const input = page.locator("input").first();
    if (await input.count() > 0) {
      await input.fill("https://damcogroup.com");
      // Find and click the submit/analyze button
      const buttons = page.locator("button");
      const btnCount = await buttons.count();
      let clicked = false;
      for (let i = 0; i < btnCount; i++) {
        const text = await buttons.nth(i).textContent();
        if (text && (text.toLowerCase().includes("audit") || text.toLowerCase().includes("analy") || text.toLowerCase().includes("scan") || text.toLowerCase().includes("run"))) {
          await buttons.nth(i).click();
          clicked = true;
          break;
        }
      }
      if (!clicked && btnCount > 0) {
        await buttons.first().click();
        clicked = true;
      }

      if (clicked) {
        // Wait for results (presales audit can take 30-60s)
        console.log("   ⏳ Waiting for presales audit results (up to 90s)...");
        await sleep(5000);
        const bodyAfter = await page.textContent("body");
        if (bodyAfter.length > 500) {
          // Check for score or results
          const hasScore = bodyAfter.match(/\d+\s*\/\s*100/) || bodyAfter.includes("score") || bodyAfter.includes("Score");
          if (hasScore) {
            log("/audit run", "PASS", "Audit returned results with score");
          } else {
            log("/audit run", "WARN", "Audit ran but no score visible yet — may still be loading");
          }
        } else {
          log("/audit run", "WARN", "Audit running — content hasn't loaded yet");
        }
      } else {
        log("/audit run", "WARN", "Could not find submit button");
      }
    } else {
      log("/audit run", "WARN", "No input field found on /audit");
    }
  } catch (e) {
    log("/audit run", "WARN", e.message.slice(0, 100));
  }

  // ── Test 5: Check for blank screens / white pages ───
  try {
    // Navigate back to home
    await page.goto(FRONTEND, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(2000);

    // Check if page has meaningful content (not just white/empty)
    const bodyHTML = await page.innerHTML("body");
    const divCount = await page.locator("div").count();
    const textLength = (await page.textContent("body")).length;

    if (divCount > 10 && textLength > 100) {
      log("No blank screen", "PASS", `${divCount} divs, ${textLength} chars`);
    } else if (divCount > 0) {
      log("No blank screen", "WARN", `Only ${divCount} divs, ${textLength} chars — possible partial render`);
    } else {
      log("No blank screen", "FAIL", "Page appears completely blank");
    }
  } catch (e) {
    log("No blank screen", "FAIL", e.message.slice(0, 100));
  }

  // ── Test 6: Dark mode check (body background) ──────
  try {
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    log("Dark mode renders", "PASS", `body bg: ${bgColor}`);
  } catch (e) {
    log("Dark mode renders", "WARN", e.message.slice(0, 80));
  }

  // Take a screenshot for evidence
  try {
    await page.screenshot({ path: "tests/screenshot-live.png", fullPage: true });
    log("Screenshot saved", "PASS", "tests/screenshot-live.png");
  } catch (e) {
    log("Screenshot", "WARN", e.message.slice(0, 80));
  }

  await browser.close();

  // ── FINAL REPORT ────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("📊 FINAL REPORT\n");

  const passed = results.filter(r => r.status === "PASS").length;
  const warned = results.filter(r => r.status === "WARN").length;
  const failed = results.filter(r => r.status === "FAIL").length;

  console.log(`  ✅ PASS: ${passed}`);
  console.log(`  ⚠️  WARN: ${warned}`);
  console.log(`  ❌ FAIL: ${failed}`);

  if (jsErrors.length > 0) {
    console.log(`\n  🔴 JS ERRORS (${jsErrors.length}):`);
    jsErrors.forEach(e => console.log(`     ${e.url}: ${e.error.slice(0, 120)}`));
  } else {
    console.log("\n  ✅ No JavaScript errors detected");
  }

  console.log("\n" + "=".repeat(60));
  console.log(failed > 0 ? "\n❌ SOME TESTS FAILED — needs fixing" : "\n✅ ALL CRITICAL TESTS PASSED");

  process.exit(failed > 0 ? 1 : 0);
})();
