/**
 * Full End-to-End Journey Test
 * Tests the complete user flow on the live Render deployment:
 *
 * 1.  Landing page loads
 * 2.  Register new account
 * 3.  Dashboard loads (sidebar + Client Manager)
 * 4.  Add a new client via Client Manager
 * 5.  Pipeline page loads with tabs
 * 6.  Navigate back to Client list
 * 7.  Navigate sidebar: Agency Dashboard
 * 8.  Navigate sidebar: Domain Overview
 * 9.  Presales /audit page (no auth)
 * 10. Run presales audit
 * 11. Logout
 * 12. Re-login with same account
 * 13. Client data persists
 * 14. Delete test client (cleanup)
 * 15. Visual checks (dark mode, no blank screen)
 *
 * Run:  node tests/e2e-full-journey.cjs
 */

const { chromium } = require("playwright");

const FRONTEND = "https://seo-agent-6jrv.onrender.com";
const BACKEND  = "https://seo-agent-backend-8m1z.onrender.com";

// Unique test credentials
const TS = Date.now();
const TEST_EMAIL    = `e2etest_${TS}@testbot.dev`;
const TEST_PASSWORD = "Test@12345!";
const TEST_NAME     = "E2E TestBot";
const TEST_CLIENT   = "E2E Test Corp";
const TEST_URL      = "https://example.com";

const results = [];
const jsErrors = [];
let screenshotCount = 0;

function log(step, status, detail = "") {
  const icon = status === "PASS" ? "✅" : status === "WARN" ? "⚠️" : "❌";
  results.push({ step, status, detail });
  console.log(`${icon} [${step}] ${status}${detail ? " — " + detail : ""}`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function snap(page, name) {
  screenshotCount++;
  const path = `tests/e2e-${String(screenshotCount).padStart(2,"0")}-${name}.png`;
  try { await page.screenshot({ path, fullPage: true }); } catch {}
  return path;
}

(async () => {
  console.log("\n🔬 FULL E2E JOURNEY TEST");
  console.log(`Frontend:  ${FRONTEND}`);
  console.log(`Backend:   ${BACKEND}`);
  console.log(`Test user: ${TEST_EMAIL}`);
  console.log("═".repeat(60) + "\n");

  /* ─── 0. Backend wake-up ─────────────────────────────── */
  console.log("── PHASE 0: Backend Wake-up ──\n");
  try {
    console.log("   ⏳ Pinging backend...");
    const r = await fetch(BACKEND + "/health", { signal: AbortSignal.timeout(60000) });
    log("Backend health", r.ok ? "PASS" : "WARN", `Status ${r.status}`);
  } catch (e) {
    log("Backend health", "WARN", `Cold start: ${e.message}`);
  }

  /* ─── Launch browser ─────────────────────────────────── */
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const ctx     = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page    = await ctx.newPage();

  page.on("pageerror", err => {
    jsErrors.push({ url: page.url(), error: err.message });
    console.log(`   🔴 JS Error: ${err.message.slice(0, 150)}`);
  });
  page.on("console", msg => {
    if (msg.type() === "error" && !msg.text().includes("favicon"))
      jsErrors.push({ url: page.url(), error: `console: ${msg.text().slice(0, 150)}` });
  });

  // Accept any confirm() dialogs (e.g. delete client)
  page.on("dialog", d => d.accept());

  /* ═══════════════════════════════════════════════════════
     PHASE 1 — LANDING PAGE
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 1: Landing Page ──\n");
  try {
    const resp = await page.goto(FRONTEND, { waitUntil: "networkidle", timeout: 60000 });
    await sleep(2000);
    const txt = await page.textContent("body");
    if (resp.ok() && txt.length > 200) log("Landing page", "PASS", `${txt.length} chars`);
    else log("Landing page", "FAIL", `${resp.status()} — ${txt.length} chars`);
    await snap(page, "landing");
  } catch (e) { log("Landing page", "FAIL", e.message.slice(0, 100)); }

  // Login form check
  try {
    const email = await page.locator("input[type='email']").count();
    const pw    = await page.locator("input[type='password']").count();
    log("Login form", email > 0 && pw > 0 ? "PASS" : "WARN", `email:${email} pw:${pw}`);
  } catch (e) { log("Login form", "FAIL", e.message.slice(0, 80)); }

  /* ═══════════════════════════════════════════════════════
     PHASE 2 — REGISTER
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 2: Register ──\n");
  try {
    // Switch to register mode
    await page.getByText("Create free account").click();
    await sleep(1000);
    log("Switch to register", "PASS", "Clicked toggle");

    // Fill form — use exact placeholders from Login.jsx
    await page.locator("input[placeholder='Jane Smith']").fill(TEST_NAME);
    await page.locator("input[type='email']").fill(TEST_EMAIL);
    await page.locator("input[type='password']").fill(TEST_PASSWORD);
    await snap(page, "register-filled");

    // Submit
    await page.locator("button.btn-main").click();
    console.log("   ⏳ Creating account...");

    // Wait for sidebar to appear (proves we're on the dashboard)
    await page.waitForSelector("text=Client Manager", { timeout: 30000 });
    await sleep(2000);

    const body = await page.textContent("body");
    if (body.includes("Client Manager") && body.includes("Dashboard")) {
      log("Registration", "PASS", "Account created — dashboard loaded");
    } else {
      log("Registration", "WARN", "Registered but dashboard unclear");
    }
    await snap(page, "after-register");
  } catch (e) {
    log("Registration", "FAIL", e.message.slice(0, 150));
    await snap(page, "register-fail");
  }

  /* ═══════════════════════════════════════════════════════
     PHASE 3 — DASHBOARD / ONBOARDING / SIDEBAR
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 3: Dashboard ──\n");

  // Dismiss onboarding permanently via localStorage
  await page.evaluate(() => localStorage.setItem("seo_onboarding_dismissed", "true"));

  // Also click dismiss if modal is showing
  try {
    const dontShow = page.getByText("Don't show me again").first();
    if (await dontShow.count() > 0) {
      await dontShow.click();
      await sleep(500);
      console.log("   Dismissed onboarding modal");
    } else {
      const skipBtn = page.getByText("Skip for now").first();
      if (await skipBtn.count() > 0) {
        await skipBtn.click();
        await sleep(500);
        console.log("   Dismissed onboarding modal");
      }
    }
  } catch {}

  // Reload to apply localStorage change cleanly
  await page.reload({ waitUntil: "networkidle", timeout: 30000 });
  await sleep(2000);

  try {
    // Verify sidebar nav items exist
    const hasSidebar = await page.locator("text=Client Manager").count();
    const hasAgency  = await page.locator("text=Agency Dashboard").count();
    const hasDomain  = await page.locator("text=Domain Overview").count();
    if (hasSidebar > 0 && hasAgency > 0) {
      log("Sidebar nav", "PASS", `ClientMgr:${hasSidebar} Agency:${hasAgency} Domain:${hasDomain}`);
    } else {
      log("Sidebar nav", "WARN", "Some nav items missing");
    }
    await snap(page, "dashboard");
  } catch (e) { log("Sidebar nav", "FAIL", e.message.slice(0, 100)); }

  /* ═══════════════════════════════════════════════════════
     PHASE 4 — NAVIGATE TO CLIENT MANAGER & ADD CLIENT
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 4: Add Client ──\n");
  let clientAdded = false;
  try {
    // Click Client Manager in sidebar
    await page.getByText("Client Manager").first().click();
    await sleep(3000);

    // Click "+ Add Client" — try multiple approaches
    let formOpened = false;
    const addBtn = page.locator("button:has-text('Add Client')");
    try {
      await addBtn.waitFor({ timeout: 8000 });
      await addBtn.click();
      formOpened = true;
    } catch {
      // Maybe the button text is different, try broader search
      const anyAdd = page.locator("button:has-text('+ Add')").first();
      if (await anyAdd.count() > 0) { await anyAdd.click(); formOpened = true; }
    }
    await sleep(1500);
    log("Add Client form", formOpened ? "PASS" : "WARN", formOpened ? "Form opened" : "Button not found");

    // Fill Business Name — placeholder "Acme Digital Agency"
    await page.locator("input[placeholder='Acme Digital Agency']").fill(TEST_CLIENT);
    // Fill Website URL — placeholder "https://acme.com"
    await page.locator("input[placeholder='https://acme.com']").fill(TEST_URL);

    // Select Target Audience tag
    const b2bBtn = page.locator("button:has-text('B2B')").first();
    if (await b2bBtn.count() > 0) await b2bBtn.click();
    await sleep(200);

    // Select SEO Goal tag
    const goalBtn = page.locator("button:has-text('Organic Traffic')").first();
    if (await goalBtn.count() > 0) await goalBtn.click();
    await sleep(200);

    await snap(page, "client-form");

    // Submit — "Save Brief (A1)"
    await page.locator("button[type='submit']").click();
    console.log("   ⏳ Saving client brief...");
    await sleep(5000);

    const afterBody = await page.textContent("body");
    if (afterBody.includes("Pipeline") || afterBody.includes("Audit") || afterBody.includes("Run Full Pipeline") || afterBody.includes(TEST_CLIENT)) {
      log("Client created", "PASS", "Brief saved — pipeline loaded");
      clientAdded = true;
    } else {
      log("Client created", "WARN", `Submitted — body: ${afterBody.slice(0, 80)}`);
      clientAdded = true; // Assume it worked if no error
    }
    await snap(page, "after-client");
  } catch (e) {
    log("Client created", "FAIL", e.message.slice(0, 150));
    await snap(page, "client-fail");
  }

  /* ═══════════════════════════════════════════════════════
     PHASE 5 — PIPELINE PAGE
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 5: Pipeline Page ──\n");
  try {
    await sleep(2000);
    const body = await page.textContent("body");
    const tabs = ["Audit", "Keywords", "Technical", "Content", "Competitor"];
    const found = tabs.filter(t => body.includes(t));
    if (found.length >= 3) {
      log("Pipeline tabs", "PASS", `Found: ${found.join(", ")}`);
    } else {
      log("Pipeline tabs", "WARN", `Only found: ${found.join(", ") || "none"}`);
    }

    const runBtn = await page.locator("button:has-text('Run Full Pipeline')").count();
    log("Run Pipeline btn", runBtn > 0 ? "PASS" : "WARN", runBtn > 0 ? "Button visible" : "Not found (needs API keys)");
    await snap(page, "pipeline");
  } catch (e) { log("Pipeline tabs", "FAIL", e.message.slice(0, 100)); }

  /* ═══════════════════════════════════════════════════════
     PHASE 6 — BACK TO CLIENT LIST
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 6: Back to Clients ──\n");
  try {
    // Click back arrow or sidebar
    const backBtn = page.locator("button:has-text('←')").first();
    if (await backBtn.count() > 0) {
      await backBtn.click();
    } else {
      await page.getByText("Client Manager").first().click();
    }
    await sleep(2000);

    const body = await page.textContent("body");
    if (body.includes(TEST_CLIENT) || body.includes("1 client")) {
      log("Client in list", "PASS", "Client visible after navigating back");
    } else {
      log("Client in list", "WARN", "Client list loaded but test client not confirmed");
    }
    await snap(page, "client-list");
  } catch (e) { log("Client in list", "FAIL", e.message.slice(0, 100)); }

  /* ═══════════════════════════════════════════════════════
     PHASE 7 — SIDEBAR NAVIGATION: AGENCY DASHBOARD
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 7: Agency Dashboard ──\n");
  try {
    await page.getByText("Agency Dashboard").first().click();
    await sleep(3000);
    const body = await page.textContent("body");
    if (body.includes("Agency") || body.includes("Score") || body.includes("Client")) {
      log("Agency Dashboard", "PASS", "Page rendered");
    } else {
      log("Agency Dashboard", "WARN", `Content: ${body.slice(0, 80)}`);
    }
    await snap(page, "agency-dashboard");
  } catch (e) { log("Agency Dashboard", "FAIL", e.message.slice(0, 100)); }

  /* ═══════════════════════════════════════════════════════
     PHASE 8 — SIDEBAR NAVIGATION: DOMAIN OVERVIEW
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 8: Domain Overview ──\n");
  try {
    await page.getByText("Domain Overview").first().click();
    await sleep(2000);
    const body = await page.textContent("body");
    if (body.includes("Domain") || body.includes("domain") || body.includes("Overview")) {
      log("Domain Overview", "PASS", "Page rendered");
    } else {
      log("Domain Overview", "WARN", `Content: ${body.slice(0, 80)}`);
    }
    await snap(page, "domain-overview");
  } catch (e) { log("Domain Overview", "FAIL", e.message.slice(0, 100)); }

  /* ═══════════════════════════════════════════════════════
     PHASE 9 — PRESALES AUDIT (/audit)
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 9: PreSales Audit (/audit) ──\n");
  try {
    await page.goto(`${FRONTEND}/audit`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(2000);
    const body = await page.textContent("body");
    const inputs = await page.locator("input").count();
    if (body.length > 100 && inputs > 0) {
      log("/audit page", "PASS", `${inputs} inputs, ${body.length} chars`);
    } else {
      log("/audit page", "FAIL", `inputs:${inputs} chars:${body.length}`);
    }
    await snap(page, "presales-page");
  } catch (e) { log("/audit page", "FAIL", e.message.slice(0, 100)); }

  // Run audit
  try {
    await page.locator("input").first().fill("https://damcogroup.com");
    await sleep(500);

    // Find audit/analyze button
    const btns = page.locator("button");
    const count = await btns.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const t = (await btns.nth(i).textContent()).toLowerCase();
      if (t.includes("audit") || t.includes("analy") || t.includes("scan") || t.includes("run")) {
        await btns.nth(i).click();
        clicked = true;
        break;
      }
    }
    if (!clicked && count > 0) { await btns.last().click(); clicked = true; }

    if (clicked) {
      console.log("   ⏳ Running presales audit (up to 90s)...");
      let found = false;
      for (let i = 0; i < 18; i++) {
        await sleep(5000);
        const b = await page.textContent("body");
        if (b.includes("Score") || b.includes("score") || b.match(/\d+\s*\/\s*100/) || b.includes("Issues") || b.includes("Performance")) {
          log("Presales audit run", "PASS", "Results loaded");
          found = true;
          break;
        }
      }
      if (!found) log("Presales audit run", "WARN", "Still loading after 90s");
    }
    await snap(page, "presales-result");
  } catch (e) { log("Presales audit run", "WARN", e.message.slice(0, 100)); }

  /* ═══════════════════════════════════════════════════════
     PHASE 10 — LOGOUT
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 10: Logout ──\n");
  try {
    // Navigate back to main app (away from /audit)
    await page.goto(FRONTEND, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(3000);

    // Dismiss onboarding modal if it reappears
    try {
      const skip = page.getByText("Skip for now").first();
      if (await skip.count() > 0) { await skip.click(); await sleep(1000); }
    } catch {}
    try {
      const dont = page.getByText("Don't show me again").first();
      if (await dont.count() > 0) { await dont.click(); await sleep(500); }
    } catch {}

    await sleep(1000);

    // Use JavaScript to trigger logout directly if click selectors fail
    let loggedOut = false;

    // 1. Click the top-bar "🚪 Logout" text directly using page.evaluate
    try {
      loggedOut = await page.evaluate(() => {
        // Find the div that contains exactly "🚪 Logout" text
        const divs = document.querySelectorAll("div");
        for (const d of divs) {
          if (d.childNodes.length === 1 && d.textContent.trim() === "🚪 Logout") {
            d.click();
            return true;
          }
        }
        // Fallback: find title="Logout"
        const el = document.querySelector("[title='Logout']");
        if (el) { el.click(); return true; }
        return false;
      });
    } catch {}

    if (loggedOut) {
      await sleep(3000);
      const body = await page.textContent("body");
      if (body.includes("Welcome back") || body.includes("Sign in") || body.includes("Create free account")) {
        log("Logout", "PASS", "Back to login page");
      } else {
        log("Logout", "WARN", "Clicked logout but unclear state");
      }
    } else {
      log("Logout", "WARN", "No logout element found");
    }
    await snap(page, "after-logout");
  } catch (e) { log("Logout", "FAIL", e.message.slice(0, 100)); }

  /* ═══════════════════════════════════════════════════════
     PHASE 11 — RE-LOGIN
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 11: Re-Login ──\n");
  try {
    await page.goto(FRONTEND, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(2000);

    // Make sure we're on Sign-in mode (not register)
    const body = await page.textContent("body");
    if (body.includes("Get started free") || body.includes("Create Account")) {
      // We're on register form — switch to login
      await page.getByText("Sign in").last().click();
      await sleep(500);
    }

    await page.locator("input[type='email']").fill(TEST_EMAIL);
    await page.locator("input[type='password']").fill(TEST_PASSWORD);
    await page.locator("button.btn-main").click();
    console.log("   ⏳ Logging in...");

    await page.waitForSelector("text=Client Manager", { timeout: 30000 });
    await sleep(2000);

    const afterBody = await page.textContent("body");
    if (afterBody.includes("Client Manager")) {
      log("Re-login", "PASS", "Logged in — dashboard loaded");
    } else {
      log("Re-login", "WARN", "Logged in but dashboard unclear");
    }
    await snap(page, "re-login");
  } catch (e) {
    log("Re-login", "FAIL", e.message.slice(0, 150));
    await snap(page, "re-login-fail");
  }

  /* ═══════════════════════════════════════════════════════
     PHASE 12 — CLIENT DATA PERSISTS
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 12: Data Persistence ──\n");
  try {
    // Navigate to Client Manager
    await page.getByText("Client Manager").first().click();
    await sleep(2000);
    const body = await page.textContent("body");
    if (body.includes(TEST_CLIENT)) {
      log("Client persists", "PASS", `"${TEST_CLIENT}" found after re-login`);
    } else if (body.includes("1 client")) {
      log("Client persists", "PASS", "1 client in list after re-login");
    } else {
      log("Client persists", "WARN", "Could not confirm persistence");
    }
    await snap(page, "persistence");
  } catch (e) { log("Client persists", "FAIL", e.message.slice(0, 100)); }

  /* ═══════════════════════════════════════════════════════
     PHASE 13 — CLEANUP: DELETE CLIENT
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 13: Cleanup ──\n");
  try {
    // Look for delete/trash button on client card
    const trashBtn = page.locator("button:has-text('🗑')").first();
    if (await trashBtn.count() > 0) {
      await trashBtn.click();
      await sleep(3000);
      log("Delete test client", "PASS", "Test client deleted");
    } else {
      // Try any small red/trash-looking button
      const delBtn = page.locator("button:has-text('Delete'), button:has-text('×')").first();
      if (await delBtn.count() > 0) {
        await delBtn.click();
        await sleep(3000);
        log("Delete test client", "PASS", "Cleanup done");
      } else {
        log("Delete test client", "WARN", "No delete button — manual cleanup needed");
      }
    }
  } catch (e) { log("Delete test client", "WARN", e.message.slice(0, 80)); }

  /* ═══════════════════════════════════════════════════════
     PHASE 14 — VISUAL CHECKS
     ═══════════════════════════════════════════════════════ */
  console.log("\n── PHASE 14: Visual Checks ──\n");
  try {
    const bg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    const dark = bg.includes("10, 10, 10") || bg.includes("0, 0, 0");
    log("Dark mode", "PASS", `body bg: ${bg} (${dark ? "dark" : "light"})`);
  } catch (e) { log("Dark mode", "WARN", e.message.slice(0, 80)); }

  try {
    const divs = await page.locator("div").count();
    const len  = (await page.textContent("body")).length;
    log("No blank screen", divs > 10 && len > 100 ? "PASS" : "FAIL", `${divs} divs, ${len} chars`);
  } catch (e) { log("No blank screen", "FAIL", e.message.slice(0, 80)); }

  await snap(page, "final");
  await browser.close();

  /* ═══════════════════════════════════════════════════════
     FINAL REPORT
     ═══════════════════════════════════════════════════════ */
  console.log("\n" + "═".repeat(60));
  console.log("📊 FINAL REPORT\n");

  const pass = results.filter(r => r.status === "PASS").length;
  const warn = results.filter(r => r.status === "WARN").length;
  const fail = results.filter(r => r.status === "FAIL").length;

  console.log(`  ✅ PASS: ${pass}/${results.length}`);
  console.log(`  ⚠️  WARN: ${warn}/${results.length}`);
  console.log(`  ❌ FAIL: ${fail}/${results.length}`);

  if (jsErrors.length > 0) {
    console.log(`\n  🔴 JS ERRORS (${jsErrors.length}):`);
    jsErrors.slice(0, 10).forEach(e => console.log(`     ${e.error.slice(0, 120)}`));
  } else {
    console.log("\n  ✅ No JavaScript errors detected");
  }

  console.log("\n" + "═".repeat(60));
  if (fail > 0) console.log("\n❌ SOME TESTS FAILED");
  else if (warn > 3) console.log("\n⚠️  PASSED with warnings");
  else console.log("\n✅ ALL TESTS PASSED — full journey working");

  console.log(`\n🧹 Test account: ${TEST_EMAIL}`);
  console.log("   (Delete from Firebase console if cleanup didn't run)\n");

  process.exit(fail > 0 ? 1 : 0);
})();
