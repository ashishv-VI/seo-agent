const { saveState } = require("../shared-state/stateManager");

/**
 * A1 — Client Onboarding & Brief Agent
 * Structures raw client info into standardized brief
 * Saves to shared state for all downstream agents
 */
async function runA1(clientId, rawData) {
  try {
  const {
    businessName,
    websiteUrl,
    businessDescription,
    businessLocation,
    services = [],
    targetAudience,
    goals = [],
    competitors = [],
    targetLocations = [],
    primaryKeywords = [],
    conversionGoal,
    newPagesNeeded = [],
    currentTraffic,
    notes,
    // Sprint 1 — new fields
    kpiSelection = [],       // Primary KPIs: ["Organic Traffic Growth", "Lead Generation", ...]
    avgOrderValue,           // e.g. "£150 per booking"
    socialLinks = [],        // Social profile URLs
    pastSeoHistory,          // Previous SEO work, agencies, penalties
  } = rawData;

  // Validate required fields
  const missing = [];
  if (!businessName)    missing.push("Business Name");
  if (!websiteUrl)      missing.push("Website URL");
  if (!targetAudience)  missing.push("Target Audience");
  if (goals.length === 0) missing.push("Goals");

  // Derive primary KPI from goals if not explicitly set
  const derivedKpi = kpiSelection.length > 0 ? kpiSelection : deriveKpiFromGoals(goals);

  // Structure the brief
  const brief = {
    status:          missing.length > 0 ? "incomplete" : "complete",
    missingFields:   missing,

    // Business Info
    businessName,
    websiteUrl: websiteUrl?.startsWith("http") ? websiteUrl : `https://${websiteUrl}`,
    businessDescription,
    businessLocation: businessLocation || "Not specified",
    services: [].concat(services || []),

    // Strategy
    targetAudience,
    goals: [].concat(goals || []),
    conversionGoal,
    currentTraffic: currentTraffic || "unknown",

    // Sprint 1 — KPI & Performance
    kpiSelection:   [].concat(derivedKpi || []),
    avgOrderValue:  avgOrderValue || null,
    socialLinks:    [].concat(socialLinks || []),
    pastSeoHistory: pastSeoHistory || null,

    // Research Inputs (will be validated by A3 - not final)
    primaryKeywords:  [].concat(primaryKeywords || []),
    targetLocations:  [].concat(targetLocations || []),
    competitors:      [].concat(competitors || []),

    // New Pages
    newPagesNeeded: [].concat(newPagesNeeded || []),

    // Notes
    notes,

    // Metadata
    briefVersion:  1,
    signedOff:     false,   // Human must sign off before downstream agents run
    createdAt:     new Date().toISOString(),
  };

  // Save to shared state
  await saveState(clientId, "A1_brief", brief);

  return {
    success: true,
    brief,
    readyForAudit: brief.status === "complete",
    message: missing.length > 0
      ? `Brief saved with ${missing.length} missing field(s): ${[].concat(missing || []).join(", ")}`
      : "Brief complete — ready for human sign-off before audit begins",
  };
  } catch (e) {
    console.error(`[A1] Onboarding failed for ${clientId}:`, e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Derive a primary KPI from goals when the user hasn't explicitly set one.
 * Used as a fallback so all downstream agents always have a kpiSelection.
 */
function deriveKpiFromGoals(goals = []) {
  const g = [].concat(goals || []).join(" ").toLowerCase();
  const kpis = [];
  if (g.includes("traffic") || g.includes("ranking") || g.includes("organic")) kpis.push("Organic Traffic Growth");
  if (g.includes("lead") || g.includes("form") || g.includes("contact"))        kpis.push("Lead Generation");
  if (g.includes("sale") || g.includes("e-commerce") || g.includes("purchase")) kpis.push("Online Sales / E-commerce");
  if (g.includes("local") || g.includes("map") || g.includes("visibility"))     kpis.push("Local Visibility");
  return kpis.length > 0 ? kpis : ["Organic Traffic Growth"]; // default
}

module.exports = { runA1 };
