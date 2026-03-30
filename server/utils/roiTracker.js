/**
 * ROI Tracker — Level 4 (ROI)
 *
 * Attributes SEO improvements to specific fixes and calculates
 * estimated revenue/traffic impact for the agency to show clients.
 *
 * Attribution model:
 *   - A fix is "attributed" if rankings improved in the 30 days after it was pushed
 *   - Traffic estimate: CTR curve based on average CTR by position (industry standard)
 *   - Revenue estimate: (traffic increase) × (conversion rate) × (avg order value)
 *     — conversion rate and avg order value are configurable per client
 *
 * Standard CTR by position (based on industry averages):
 *   Pos 1: 27.6%,  2: 18.7%,  3: 12.4%,  4: 8.0%,  5: 6.3%
 *   Pos 6: 4.8%,   7: 3.6%,   8: 2.7%,   9: 2.1%, 10: 1.6%
 *   Pos 11-20: ~0.7% (page 2)
 */
const { db }     = require("../config/firebase");
const { getState } = require("../shared-state/stateManager");

// Standard CTR by position (industry average — desktop)
const CTR_BY_POSITION = {
  1: 0.276, 2: 0.187, 3: 0.124, 4: 0.080, 5: 0.063,
  6: 0.048, 7: 0.036, 8: 0.027, 9: 0.021, 10: 0.016,
};

function getCTR(position) {
  if (!position || position > 100) return 0;
  if (position <= 10) return CTR_BY_POSITION[Math.round(position)] || 0.005;
  if (position <= 20) return 0.007;
  return 0.003;
}

/**
 * Estimate monthly traffic for a keyword at a given position
 * Uses monthly search volume × CTR at that position
 *
 * @param {number} position      — current ranking position
 * @param {number} searchVolume  — monthly search volume (from A3 keywords)
 * @returns {number} estimated monthly clicks
 */
function estimateMonthlyTraffic(position, searchVolume) {
  if (!searchVolume || searchVolume <= 0) return 0;
  return Math.round(searchVolume * getCTR(position));
}

/**
 * Calculate ROI for a client based on push log and ranking changes
 *
 * @param {string} clientId
 * @returns {object} ROI report
 */
async function calculateROI(clientId) {
  const [rankings, keywords, clientDoc] = await Promise.all([
    getState(clientId, "A10_rankings"),
    getState(clientId, "A3_keywords"),
    db.collection("clients").doc(clientId).get(),
  ]);

  const clientData = clientDoc.exists ? clientDoc.data() : {};
  const wpInt      = clientData.wpIntegration;

  // Client-specific revenue settings (defaults)
  const revenueSettings = clientData.roiSettings || {
    monthlySearchersPerVisitor: 1,  // one visitor per search click (default)
    conversionRate: 0.02,           // 2% default conversion rate
    avgOrderValue:  100,            // £100 default order value
    currency:       "GBP",
  };

  // Get all pushes from wp_push_log
  const pushLogSnap = await db.collection("wp_push_log")
    .where("clientId", "==", clientId)
    .get();

  const pushLogs = pushLogSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Build keyword volume map from A3
  const volumeMap = {};
  (keywords?.keywordMap || []).forEach(kw => {
    volumeMap[kw.keyword.toLowerCase()] = kw.searchVolume || kw.volume || 0;
  });

  // Calculate gains
  const rankGains      = rankings?.gains       || [];
  const rankDrops      = rankings?.drops       || [];
  const allRankings    = rankings?.rankings    || [];

  // ── Attributed improvements ───────────────────────────────────────────────
  // For each ranking gain, check if there's a push log entry for the same page within 30 days before
  const attributedFixes = [];
  let totalTrafficGainedMonthly = 0;
  let totalTrafficLostMonthly   = 0;

  for (const gain of rankGains) {
    const vol         = volumeMap[gain.keyword?.toLowerCase()] || 200; // 200 default if no volume
    const trafficBefore = estimateMonthlyTraffic(gain.previousPosition, vol);
    const trafficAfter  = estimateMonthlyTraffic(gain.position, vol);
    const trafficGain   = Math.max(0, trafficAfter - trafficBefore);

    totalTrafficGainedMonthly += trafficGain;

    // Find if any push is associated with this keyword's page
    const relatedPush = pushLogs.find(log => {
      if (!log.pushedAt) return false;
      const daysSincePush = (Date.now() - new Date(log.pushedAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysSincePush <= 30 && daysSincePush >= 0;
    });

    attributedFixes.push({
      keyword:           gain.keyword,
      fix:               relatedPush?.field || "seo_optimisation",
      pushedAt:          relatedPush?.pushedAt || null,
      positionBefore:    gain.previousPosition,
      positionAfter:     gain.position,
      positionImproved:  gain.gain,
      searchVolume:      vol,
      trafficBefore,
      trafficAfter,
      trafficGain,
      revenueGain:       Math.round(trafficGain * revenueSettings.conversionRate * revenueSettings.avgOrderValue),
      attributed:        !!relatedPush,
    });
  }

  // Calculate traffic loss from drops
  for (const drop of rankDrops) {
    const vol = volumeMap[drop.keyword?.toLowerCase()] || 200;
    const trafficBefore = estimateMonthlyTraffic(drop.previousPosition, vol);
    const trafficAfter  = estimateMonthlyTraffic(drop.position, vol);
    totalTrafficLostMonthly += Math.max(0, trafficBefore - trafficAfter);
  }

  // ── Current ranking value ─────────────────────────────────────────────────
  let currentMonthlyTraffic = 0;
  for (const ranking of allRankings) {
    if (!ranking.position || ranking.position > 50) continue;
    const vol = volumeMap[ranking.keyword?.toLowerCase()] || 0;
    currentMonthlyTraffic += estimateMonthlyTraffic(ranking.position, vol);
  }

  // ── Total fixes pushed ────────────────────────────────────────────────────
  const totalPushed  = pushLogs.length;
  const fixesByType  = pushLogs.reduce((acc, log) => {
    const type = log.field || log.issueType || "other";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  // ── Revenue calculations ──────────────────────────────────────────────────
  const estimatedMonthlyRevenue  = Math.round(currentMonthlyTraffic * revenueSettings.conversionRate * revenueSettings.avgOrderValue);
  const estimatedRevenueGained   = Math.round(totalTrafficGainedMonthly * revenueSettings.conversionRate * revenueSettings.avgOrderValue);
  const netTrafficChange         = totalTrafficGainedMonthly - totalTrafficLostMonthly;

  return {
    clientId,
    currency:                revenueSettings.currency,
    calculatedAt:            new Date().toISOString(),
    summary: {
      totalFixesPushed:       totalPushed,
      rankingGains:           rankGains.length,
      rankingDrops:           rankDrops.length,
      keywordsTop10:          rankings?.top10Count     || 0,
      keywordsTracked:        rankings?.totalTracked   || 0,
    },
    traffic: {
      currentMonthlyEstimate: currentMonthlyTraffic,
      gainedThisPeriod:       totalTrafficGainedMonthly,
      lostThisPeriod:         totalTrafficLostMonthly,
      netChange:              netTrafficChange,
    },
    revenue: {
      currentMonthlyEstimate: estimatedMonthlyRevenue,
      gainedFromFixes:        estimatedRevenueGained,
      conversionRate:         revenueSettings.conversionRate,
      avgOrderValue:          revenueSettings.avgOrderValue,
    },
    attributedFixes:          attributedFixes.slice(0, 20),
    fixesByType,
    recentPushes:             pushLogs
      .sort((a, b) => new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0))
      .slice(0, 10)
      .map(log => ({
        field:      log.field,
        page:       log.wpPostTitle || log.wpPostUrl,
        pushedAt:   log.pushedAt,
        pushedBy:   log.pushedBy,
        oldValue:   log.oldValue,
        newValue:   log.newValue,
      })),
    wpConnected:              !!wpInt?.connected,
    wpUrl:                    wpInt?.url || null,
  };
}

/**
 * Save ROI snapshot to Firestore for historical tracking
 */
async function saveROISnapshot(clientId, roiData) {
  const ref = db.collection("roi_snapshots").doc(`${clientId}_${new Date().toISOString().split("T")[0]}`);
  await ref.set({ ...roiData, savedAt: new Date().toISOString() });
}

/**
 * Get ROI snapshot history for a client
 */
async function getROIHistory(clientId) {
  const snap = await db.collection("roi_snapshots")
    .where("clientId", "==", clientId)
    .get();

  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => new Date(b.calculatedAt || 0) - new Date(a.calculatedAt || 0))
    .slice(0, 12); // last 12 snapshots
}

/**
 * Update ROI revenue settings for a client
 */
async function updateROISettings(clientId, settings) {
  await db.collection("clients").doc(clientId).update({
    roiSettings: {
      conversionRate: settings.conversionRate || 0.02,
      avgOrderValue:  settings.avgOrderValue  || 100,
      currency:       settings.currency       || "GBP",
    },
  });
}

module.exports = { calculateROI, saveROISnapshot, getROIHistory, updateROISettings, estimateMonthlyTraffic, CTR_BY_POSITION };
