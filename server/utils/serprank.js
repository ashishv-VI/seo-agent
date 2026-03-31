/**
 * SerpAPI-based live rank checking
 * Docs: https://serpapi.com/search-api
 * Free tier: 100 searches/month
 * Auth: api_key query param
 */

// ISO country code → Google gl parameter (2-letter lowercase)
// SerpAPI uses "gl" (geolocation) for country targeting
const GL_CODES = {
  US: "us", GB: "gb", IN: "in", AU: "au", CA: "ca",
  AE: "ae", PK: "pk", SG: "sg", DE: "de", FR: "fr",
  SA: "sa", ZA: "za", NG: "ng", BD: "bd", NL: "nl",
  PH: "ph", MY: "my", NZ: "nz", IE: "ie", BR: "br",
};

/**
 * Check positions for multiple keywords via SerpAPI Google Organic SERP.
 *
 * @param {string}   domain      - e.g. "imagophotography.co.uk"
 * @param {string[]} keywords    - array of keyword strings
 * @param {string}   apiKey      - SerpAPI key
 * @param {string}   countryCode - e.g. "GB"
 * @returns {object} { "keyword lower": { position, url } }
 */
async function checkBulkPositionsSerp(domain, keywords, apiKey, countryCode = "US") {
  if (!apiKey || !domain || !keywords.length) return {};

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  const gl          = GL_CODES[countryCode] || "us";
  const results     = {};

  // SerpAPI: sequential with delay — free tier is 100/mo, paid is per-search
  // Batch of 5 concurrent, 1s between batches
  const BATCH = 5;

  for (let i = 0; i < keywords.length; i += BATCH) {
    const batch = keywords.slice(i, i + BATCH);

    await Promise.all(batch.map(async (kw) => {
      const key = kw.toLowerCase();
      try {
        const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(kw)}&gl=${gl}&hl=en&num=100&api_key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) });

        if (!res.ok) {
          const err = await res.text();
          console.warn(`[serpapi] error ${res.status} for "${kw}":`, err.slice(0, 100));
          results[key] = { position: null, url: null };
          return;
        }

        const data    = await res.json();
        const organic = data.organic_results || [];

        let found = null;
        for (const item of organic) {
          const itemLink = (item.link || item.displayed_link || "").toLowerCase();
          if (itemLink.includes(cleanDomain)) {
            found = {
              position: item.position || null,
              url:      item.link     || null,
            };
            break;
          }
        }

        results[key] = found || { position: null, url: null };
      } catch (e) {
        console.warn(`[serpapi] request failed for "${kw}":`, e.message);
        results[key] = { position: null, url: null };
      }
    }));

    if (i + BATCH < keywords.length) {
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  return results;
}

module.exports = { checkBulkPositionsSerp };
