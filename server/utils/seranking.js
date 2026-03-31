/**
 * SE Ranking Data API Utility
 * Docs: https://seranking.com/api/data-api/
 * Auth: Authorization: Token YOUR_KEY
 * Base: https://api4.seranking.com/
 */

const SE_BASE = "https://api4.seranking.com";

/**
 * Get keyword metrics (volume, difficulty, CPC, trend) for up to 100 keywords
 * @param {string[]} keywords - array of keywords
 * @param {string} apiKey - SE Ranking API key
 * @param {string} countryCode - e.g. "US", "GB", "IN"
 */
async function getKeywordMetrics(keywords, apiKey, countryCode = "US") {
  if (!apiKey || !keywords.length) return {};
  try {
    const res = await fetch(`${SE_BASE}/research/keywords`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keywords: keywords.slice(0, 100),
        country: countryCode,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.warn("[seranking] keyword metrics error:", res.status, await res.text());
      return {};
    }
    const data = await res.json();
    // Returns array of { keyword, volume, difficulty, cpc, trend }
    const result = {};
    (Array.isArray(data) ? data : (data.data || [])).forEach(item => {
      if (item.keyword) {
        result[item.keyword.toLowerCase()] = {
          volume:     item.vol     || item.volume     || 0,
          difficulty: item.kd      || item.difficulty || 0,
          cpc:        item.cpc     || 0,
          trend:      item.trend   || [],
          competition:item.competition || null,
        };
      }
    });
    return result;
  } catch (e) {
    console.warn("[seranking] getKeywordMetrics failed:", e.message);
    return {};
  }
}

/**
 * Get organic keywords a domain ranks for
 * @param {string} domain - e.g. "example.com"
 * @param {string} apiKey
 * @param {string} countryCode
 */
async function getDomainKeywords(domain, apiKey, countryCode = "US") {
  if (!apiKey || !domain) return [];
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  try {
    const res = await fetch(
      `${SE_BASE}/research/domain/organic/keywords?domain=${encodeURIComponent(cleanDomain)}&country=${countryCode}&limit=50&sort_by=traffic&sort_order=desc`,
      {
        headers: { "Authorization": `Token ${apiKey}` },
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) {
      console.warn("[seranking] domain keywords error:", res.status);
      return [];
    }
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.data || []);
    return items.slice(0, 50).map(k => ({
      keyword:    k.keyword || "",
      position:   k.pos     || k.position || 0,
      volume:     k.vol     || k.volume   || 0,
      difficulty: k.kd      || k.difficulty || 0,
      url:        k.url     || "",
      traffic:    k.traffic || 0,
    }));
  } catch (e) {
    console.warn("[seranking] getDomainKeywords failed:", e.message);
    return [];
  }
}

/**
 * Get organic competitors for a domain
 * @param {string} domain
 * @param {string} apiKey
 * @param {string} countryCode
 */
async function getDomainCompetitors(domain, apiKey, countryCode = "US") {
  if (!apiKey || !domain) return [];
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  try {
    const res = await fetch(
      `${SE_BASE}/research/domain/organic/competitors?domain=${encodeURIComponent(cleanDomain)}&country=${countryCode}&limit=10`,
      {
        headers: { "Authorization": `Token ${apiKey}` },
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) {
      console.warn("[seranking] competitors error:", res.status);
      return [];
    }
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.data || []);
    return items.slice(0, 10).map(c => ({
      domain:          c.domain        || "",
      commonKeywords:  c.common_keywords || c.commonKeywords || 0,
      organicKeywords: c.organic_keywords || c.organicKeywords || 0,
      traffic:         c.traffic       || 0,
    }));
  } catch (e) {
    console.warn("[seranking] getDomainCompetitors failed:", e.message);
    return [];
  }
}

/**
 * Bulk position check — fetches all domain rankings (up to 500) and matches
 * against user's tracked keywords. One API call per country.
 *
 * @param {string}   domain
 * @param {string[]} keywords  — keywords to check
 * @param {string}   apiKey
 * @param {string}   countryCode — e.g. "US", "IN", "AE"
 * @returns {object}  { "keyword lower": { position, url, volume, difficulty } }
 */
async function checkBulkPositions(domain, keywords, apiKey, countryCode = "US") {
  if (!apiKey || !domain || !keywords.length) return {};
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

  try {
    const res = await fetch(
      `${SE_BASE}/research/domain/organic/keywords?domain=${encodeURIComponent(cleanDomain)}&country=${countryCode}&limit=500&sort_by=traffic&sort_order=desc`,
      {
        headers: { "Authorization": `Token ${apiKey}` },
        signal: AbortSignal.timeout(25000),
      }
    );
    if (!res.ok) {
      console.warn("[seranking] bulk positions error:", res.status);
      return {};
    }
    const data  = await res.json();
    const items = Array.isArray(data) ? data : (data.data || []);

    // Build lookup map from domain's organic keywords
    const rankMap = {};
    for (const k of items) {
      if (k.keyword) {
        rankMap[k.keyword.toLowerCase()] = {
          position:   k.pos      || k.position   || null,
          url:        k.url      || null,
          volume:     k.vol      || k.volume     || 0,
          difficulty: k.kd       || k.difficulty || 0,
          traffic:    k.traffic  || 0,
        };
      }
    }

    // Match against tracked keywords
    const results = {};
    for (const kw of keywords) {
      const key  = kw.toLowerCase();
      results[key] = rankMap[key] || { position: null, url: null, volume: 0, difficulty: 0 };
    }
    return results;
  } catch (e) {
    console.warn("[seranking] checkBulkPositions failed:", e.message);
    return {};
  }
}

module.exports = { getKeywordMetrics, getDomainKeywords, getDomainCompetitors, checkBulkPositions };
