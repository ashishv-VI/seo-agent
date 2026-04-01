/**
 * DataForSEO SERP API — Live Google Organic rank checking
 * Auth: Basic base64(login:password)
 * Docs: https://docs.dataforseo.com/v3/serp/google/organic/live/regular/
 *
 * Sign up at dataforseo.com — pay-per-task (~$0.001 per keyword).
 * Store key as "login:password" (colon-separated) in user's apiKeys.dataforseo
 */

const DFS_BASE = "https://api.dataforseo.com";

// ISO country code → DataForSEO location code
const LOCATION_CODES = {
  US: 2840, GB: 2826, IN: 2356, AU: 2036,  CA: 2124,
  AE: 9041109, PK: 2586, SG: 2702, DE: 2276, FR: 2250,
  SA: 2682, ZA: 2710, NG: 2566, BD: 2050,  NL: 2528,
  PH: 2608, MY: 2458, NZ: 2554, IE: 2372,  BR: 2076,
};

const LANGUAGE_CODES = {
  US: "en", GB: "en", AU: "en", CA: "en", NZ: "en", IE: "en", ZA: "en",
  IN: "en", PK: "en", SG: "en", PH: "en", NG: "en", BD: "en", MY: "en",
  AE: "ar", SA: "ar",
  DE: "de", FR: "fr", NL: "nl", BR: "pt",
};

/**
 * Check positions for many keywords in bulk using DataForSEO live SERP.
 * Sends up to 100 keywords per API request.
 *
 * @param {string}   domain       - e.g. "imagophotography.co.uk"
 * @param {string[]} keywords     - array of keyword strings
 * @param {string}   auth         - "dataforseo_login:dataforseo_password"
 * @param {string}   countryCode  - e.g. "GB"
 * @returns {object} { "keyword lower": { position, url } }
 */
async function checkBulkPositionsDFS(domain, keywords, auth, countryCode = "US") {
  if (!auth || !domain || !keywords.length) return {};

  const cleanDomain   = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  const locationCode  = LOCATION_CODES[countryCode]  || 2840;
  const languageCode  = LANGUAGE_CODES[countryCode]  || "en";
  const base64Auth    = Buffer.from(auth).toString("base64");

  const results = {};
  const BATCH   = 100; // DataForSEO max tasks per request

  for (let i = 0; i < keywords.length; i += BATCH) {
    const batch = keywords.slice(i, i + BATCH);

    const tasks = batch.map(kw => ({
      keyword:       kw,
      location_code: locationCode,
      language_code: languageCode,
      depth:         200,
      device:        "desktop",
    }));

    try {
      const res = await fetch(`${DFS_BASE}/v3/serp/google/organic/live/regular`, {
        method:  "POST",
        headers: {
          "Authorization": `Basic ${base64Auth}`,
          "Content-Type":  "application/json",
        },
        body:   JSON.stringify(tasks),
        signal: AbortSignal.timeout(90000), // 90s for big batches
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn("[dataforseo] SERP HTTP error:", res.status, errText.slice(0, 200));
        batch.forEach(kw => { results[kw.toLowerCase()] = { position: null, url: null }; });
        continue;
      }

      const data = await res.json();

      for (const task of (data.tasks || [])) {
        const keyword = (task.data?.keyword || "").toLowerCase();
        if (!keyword) continue;

        if (task.status_code !== 20000) {
          console.warn(`[dataforseo] task error for "${keyword}":`, task.status_message);
          results[keyword] = { position: null, url: null };
          continue;
        }

        const items   = task.result?.[0]?.items || [];
        const organic = items.filter(i => i.type === "organic");

        let found = null;
        for (const item of organic) {
          const itemDomain = (item.domain || item.url || "").toLowerCase();
          if (itemDomain.includes(cleanDomain)) {
            found = {
              position: item.rank_group || item.rank_absolute || null,
              url:      item.url        || null,
            };
            break;
          }
        }

        results[keyword] = found || { position: null, url: null };
      }
    } catch (e) {
      console.warn("[dataforseo] batch request failed:", e.message);
      batch.forEach(kw => { results[kw.toLowerCase()] = { position: null, url: null }; });
    }

    // Brief pause between batches to be respectful
    if (i + BATCH < keywords.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

/**
 * Verify DataForSEO credentials without consuming quota.
 * @param {string} auth - "login:password"
 * @returns {{ valid: boolean, balance?: number, error?: string }}
 */
async function verifyDFSCredentials(auth) {
  try {
    const base64Auth = Buffer.from(auth).toString("base64");
    const res = await fetch(`${DFS_BASE}/v3/appendix/user_data`, {
      headers: {
        "Authorization": `Basic ${base64Auth}`,
        "Content-Type":  "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { valid: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const tasks = data.tasks || [];
    if (tasks[0]?.status_code === 20000) {
      const result = tasks[0]?.result?.[0] || {};
      return { valid: true, balance: result.money_balance };
    }
    return { valid: false, error: tasks[0]?.status_message || "Unknown error" };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

module.exports = { checkBulkPositionsDFS, verifyDFSCredentials };
