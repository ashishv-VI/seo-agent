const { saveState } = require("../shared-state/stateManager");

/**
 * A1 — Client Onboarding & Brief Agent
 * Structures raw client info into standardized brief
 * Saves to shared state for all downstream agents
 */
async function runA1(clientId, rawData) {
  const {
    businessName,
    websiteUrl,
    businessDescription,
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
  } = rawData;

  // Validate required fields
  const missing = [];
  if (!businessName)    missing.push("Business Name");
  if (!websiteUrl)      missing.push("Website URL");
  if (!targetAudience)  missing.push("Target Audience");
  if (goals.length === 0) missing.push("Goals");

  // Structure the brief
  const brief = {
    status:          missing.length > 0 ? "incomplete" : "complete",
    missingFields:   missing,

    // Business Info
    businessName,
    websiteUrl: websiteUrl?.startsWith("http") ? websiteUrl : `https://${websiteUrl}`,
    businessDescription,
    services,

    // Strategy
    targetAudience,
    goals,
    conversionGoal,
    currentTraffic: currentTraffic || "unknown",

    // Research Inputs (will be validated by A3 - not final)
    primaryKeywords,
    targetLocations,
    competitors,

    // New Pages
    newPagesNeeded,

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
      ? `Brief saved with ${missing.length} missing field(s): ${missing.join(", ")}`
      : "Brief complete — ready for human sign-off before audit begins",
  };
}

module.exports = { runA1 };
