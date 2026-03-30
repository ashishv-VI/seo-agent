/**
 * WordPress REST API Connector — Level 1 (Connect)
 *
 * Handles all communication with a WordPress site via its REST API.
 * Uses HTTP Basic Auth with WordPress Application Passwords.
 *
 * How to get Application Password:
 *   WP Admin → Users → Your Profile → Application Passwords → Add New
 *   Format: "xxxx xxxx xxxx xxxx xxxx xxxx" (spaces stripped before use)
 */

/**
 * Build base64 Basic Auth header
 * WP app passwords are provided with spaces (for readability) — strip them
 */
function buildAuth(username, appPassword) {
  const creds = `${username}:${appPassword.replace(/\s/g, "")}`;
  return "Basic " + Buffer.from(creds).toString("base64");
}

/**
 * Build WordPress REST API v2 base URL
 */
function buildBase(siteUrl) {
  return siteUrl.replace(/\/+$/, "") + "/wp-json/wp/v2";
}

/**
 * Test WordPress connection
 * Verifies credentials and returns site + user info
 *
 * @param {string} siteUrl       — e.g. "https://example.com"
 * @param {string} username      — WP username (not email)
 * @param {string} appPassword   — Application Password from WP admin
 * @returns {object} connection info
 */
async function testConnection(siteUrl, username, appPassword) {
  const base = buildBase(siteUrl);
  const auth = buildAuth(username, appPassword);

  // Verify credentials — /users/me requires auth
  const userRes = await fetch(`${base}/users/me?context=edit`, {
    headers: { Authorization: auth, "User-Agent": "SEO-Agent/1.0" },
    signal:  AbortSignal.timeout(12000),
  });

  if (!userRes.ok) {
    const err = await userRes.json().catch(() => ({}));
    if (userRes.status === 401) throw new Error("Invalid credentials — check username and Application Password");
    if (userRes.status === 403) throw new Error("Forbidden — user may not have REST API access");
    throw new Error(err.message || `Connection failed (HTTP ${userRes.status})`);
  }

  const user = await userRes.json();

  // Get site-wide info (unauthenticated)
  let siteInfo = {};
  try {
    const infoRes = await fetch(siteUrl.replace(/\/+$/, "") + "/wp-json", {
      headers: { "User-Agent": "SEO-Agent/1.0" },
      signal:  AbortSignal.timeout(8000),
    });
    if (infoRes.ok) siteInfo = await infoRes.json();
  } catch { /* non-blocking — site info is optional */ }

  // Check if Yoast SEO plugin is active (has yoast_head_json in pages)
  const hasYoast = await checkYoast(siteUrl, username, appPassword);

  return {
    connected:       true,
    userId:          user.id,
    userName:        user.name,
    userEmail:       user.email || null,
    userRoles:       user.roles || [],
    siteName:        siteInfo.name        || null,
    siteDescription: siteInfo.description || null,
    siteUrl:         siteInfo.url         || siteUrl,
    gmtOffset:       siteInfo.gmt_offset  || null,
    wpVersion:       siteInfo.generator?.replace("WordPress ", "") || null,
    hasYoast,
    testedAt:        new Date().toISOString(),
  };
}

/**
 * Check if Yoast SEO plugin is active
 * Yoast exposes yoast_head_json field on posts/pages
 */
async function checkYoast(siteUrl, username, appPassword) {
  try {
    const base = buildBase(siteUrl);
    const auth = buildAuth(username, appPassword);
    const res  = await fetch(`${base}/pages?per_page=1&_fields=id,yoast_head_json`, {
      headers: { Authorization: auth, "User-Agent": "SEO-Agent/1.0" },
      signal:  AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 && data[0].yoast_head_json !== undefined;
  } catch {
    return false;
  }
}

/**
 * Get all pages from WordPress (paginated)
 * Returns cleaned page objects with SEO meta if Yoast is active
 *
 * @returns {Array} pages
 */
async function getPages(siteUrl, username, appPassword) {
  const base = buildBase(siteUrl);
  const auth = buildAuth(username, appPassword);

  let allPages = [];
  let pageNum  = 1;

  while (true) {
    const res = await fetch(
      `${base}/pages?per_page=100&page=${pageNum}&status=publish,draft&_fields=id,title,link,slug,status,modified,yoast_head_json`,
      {
        headers: { Authorization: auth, "User-Agent": "SEO-Agent/1.0" },
        signal:  AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) break;
    const pages = await res.json();
    if (!Array.isArray(pages) || pages.length === 0) break;

    allPages = [...allPages, ...pages];

    const totalPages = parseInt(res.headers.get("X-WP-TotalPages") || "1", 10);
    if (pageNum >= totalPages) break;
    pageNum++;
  }

  return allPages.map(p => ({
    id:              p.id,
    title:           p.title?.rendered || "(no title)",
    url:             p.link,
    slug:            p.slug,
    status:          p.status,
    modified:        p.modified,
    seoTitle:        p.yoast_head_json?.title        || null,
    metaDescription: p.yoast_head_json?.description  || null,
    hasSchema:       !!(p.yoast_head_json?.schema),
    canonicalUrl:    p.yoast_head_json?.canonical     || null,
    focusKeyphrase:  p.yoast_head_json?.focuskw       || null,
  }));
}

/**
 * Get posts from WordPress
 * Returns up to `limit` most recent published/draft posts
 *
 * @param {number} limit — max posts to fetch (default 50)
 * @returns {Array} posts
 */
async function getPosts(siteUrl, username, appPassword, limit = 50) {
  const base = buildBase(siteUrl);
  const auth = buildAuth(username, appPassword);

  const perPage = Math.min(limit, 100);
  const res = await fetch(
    `${base}/posts?per_page=${perPage}&status=publish,draft&_fields=id,title,link,slug,status,date,modified,categories,yoast_head_json`,
    {
      headers: { Authorization: auth, "User-Agent": "SEO-Agent/1.0" },
      signal:  AbortSignal.timeout(15000),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to fetch posts (HTTP ${res.status})`);
  }

  const posts = await res.json();
  return posts.map(p => ({
    id:              p.id,
    title:           p.title?.rendered || "(no title)",
    url:             p.link,
    slug:            p.slug,
    status:          p.status,
    date:            p.date,
    modified:        p.modified,
    categories:      p.categories || [],
    seoTitle:        p.yoast_head_json?.title       || null,
    metaDescription: p.yoast_head_json?.description || null,
    focusKeyphrase:  p.yoast_head_json?.focuskw      || null,
  }));
}

/**
 * Update SEO meta on a page or post
 * Supports: title, metaDescription, seoTitle, focusKeyphrase, canonicalUrl
 * Uses Yoast SEO meta fields when available; falls back to native WP title update
 *
 * @param {string} postType — "page" | "post"
 * @param {number} postId   — WP post/page ID
 * @param {object} updates  — fields to update
 * @returns {object} update result
 */
async function updatePageMeta(siteUrl, username, appPassword, postType, postId, updates) {
  const base     = buildBase(siteUrl);
  const auth     = buildAuth(username, appPassword);
  const endpoint = postType === "page" ? "pages" : "posts";

  const body = {};

  // Native WP title (shown in browser tabs + fallback)
  if (updates.title) {
    body.title = updates.title;
  }

  // Yoast SEO fields stored as post meta
  const yoastMeta = {};
  if (updates.seoTitle)        yoastMeta._yoast_wpseo_title      = updates.seoTitle;
  if (updates.metaDescription) yoastMeta._yoast_wpseo_metadesc   = updates.metaDescription;
  if (updates.focusKeyphrase)  yoastMeta._yoast_wpseo_focuskw    = updates.focusKeyphrase;
  if (updates.canonicalUrl)    yoastMeta._yoast_wpseo_canonical  = updates.canonicalUrl;

  if (Object.keys(yoastMeta).length > 0) {
    body.meta = yoastMeta;
  }

  if (Object.keys(body).length === 0) {
    return { updated: false, reason: "No fields provided to update" };
  }

  const res = await fetch(`${base}/${endpoint}/${postId}`, {
    method:  "POST",
    headers: {
      Authorization:  auth,
      "Content-Type": "application/json",
      "User-Agent":   "SEO-Agent/1.0",
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Update failed (HTTP ${res.status})`);
  }

  const result = await res.json();
  return {
    updated: true,
    postId:  result.id,
    title:   result.title?.rendered || null,
    link:    result.link,
  };
}

/**
 * Inject JSON-LD schema markup into a page or post
 * Stores in a custom meta field `_seo_agent_schema`
 * Requires the schema to be output in wp_head via a theme snippet or plugin hook
 *
 * Returns the schema and a code snippet the user can add to functions.php
 * if they need manual injection
 *
 * @param {string} postType    — "page" | "post"
 * @param {number} postId      — WP post ID
 * @param {string} schemaJsonLd — raw JSON-LD string
 */
async function injectSchema(siteUrl, username, appPassword, postType, postId, schemaJsonLd) {
  const base     = buildBase(siteUrl);
  const auth     = buildAuth(username, appPassword);
  const endpoint = postType === "page" ? "pages" : "posts";

  // Try to store via meta field (requires REST API field registration in WP)
  const body = {
    meta: {
      _seo_agent_schema: schemaJsonLd,
    },
  };

  const res = await fetch(`${base}/${endpoint}/${postId}`, {
    method:  "POST",
    headers: {
      Authorization:  auth,
      "Content-Type": "application/json",
      "User-Agent":   "SEO-Agent/1.0",
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  // Build the functions.php snippet regardless of push result
  const functionsSnippet = `// Add to your theme's functions.php — auto-outputs JSON-LD schema added by SEO Agent
add_action('wp_head', function() {
  $schema = get_post_meta(get_the_ID(), '_seo_agent_schema', true);
  if ($schema) { echo '<script type="application/ld+json">' . $schema . '</script>'; }
});`;

  if (!res.ok) {
    // If meta push failed, return the snippet so user can manually wire it
    return {
      injected:        false,
      reason:          `Meta field push failed (HTTP ${res.status}) — use the manual snippet below`,
      schema:          schemaJsonLd,
      functionsSnippet,
    };
  }

  return {
    injected:        true,
    postId,
    schema:          schemaJsonLd,
    functionsSnippet,
    note:            "Schema stored in _seo_agent_schema meta field. Add the functions.php snippet to output it in wp_head.",
  };
}

/**
 * Create a new post in WordPress as draft
 * Used by Content Autopilot (Level 2 — A14)
 *
 * @param {object} postData — { title, content, excerpt, slug, metaDescription, focusKeyphrase, categories, tags, status }
 * @returns {object} created post info
 */
async function createPost(siteUrl, username, appPassword, postData) {
  const base = buildBase(siteUrl);
  const auth = buildAuth(username, appPassword);

  const {
    title,
    content,
    excerpt        = "",
    slug           = "",
    metaDescription = null,
    focusKeyphrase  = null,
    seoTitle        = null,
    categories     = [],
    tags           = [],
    status         = "draft",
  } = postData;

  // Build clean slug from title if not provided
  const cleanSlug = slug || title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const body = {
    title,
    content,
    excerpt,
    slug:       cleanSlug,
    status,
    categories,
    tags,
    meta: {
      ...(metaDescription  ? { _yoast_wpseo_metadesc: metaDescription }  : {}),
      ...(focusKeyphrase   ? { _yoast_wpseo_focuskw:  focusKeyphrase  }  : {}),
      ...(seoTitle         ? { _yoast_wpseo_title:    seoTitle        }  : {}),
    },
  };

  const res = await fetch(`${base}/posts`, {
    method:  "POST",
    headers: {
      Authorization:  auth,
      "Content-Type": "application/json",
      "User-Agent":   "SEO-Agent/1.0",
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Create post failed (HTTP ${res.status})`);
  }

  const result = await res.json();
  return {
    created: true,
    postId:  result.id,
    title:   result.title?.rendered || title,
    link:    result.link,
    status:  result.status,
    editUrl: `${siteUrl.replace(/\/+$/, "")}/wp-admin/post.php?post=${result.id}&action=edit`,
  };
}

/**
 * Get categories from WordPress
 * Used by Content Autopilot to assign correct category to new posts
 *
 * @returns {Array} categories
 */
async function getCategories(siteUrl, username, appPassword) {
  try {
    const base = buildBase(siteUrl);
    const auth = buildAuth(username, appPassword);
    const res  = await fetch(`${base}/categories?per_page=100&_fields=id,name,slug,count`, {
      headers: { Authorization: auth, "User-Agent": "SEO-Agent/1.0" },
      signal:  AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const cats = await res.json();
    return cats.map(c => ({ id: c.id, name: c.name, slug: c.slug, count: c.count }));
  } catch {
    return [];
  }
}

/**
 * Get a single page or post by ID
 * Used to verify current values before overwriting
 */
async function getPost(siteUrl, username, appPassword, postType, postId) {
  const base     = buildBase(siteUrl);
  const auth     = buildAuth(username, appPassword);
  const endpoint = postType === "page" ? "pages" : "posts";

  const res = await fetch(`${base}/${endpoint}/${postId}?context=edit&_fields=id,title,content,link,slug,status,meta,yoast_head_json`, {
    headers: { Authorization: auth, "User-Agent": "SEO-Agent/1.0" },
    signal:  AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Could not fetch ${postType} ${postId} (HTTP ${res.status})`);
  }

  const p = await res.json();
  return {
    id:              p.id,
    title:           p.title?.rendered || "",
    content:         p.content?.raw   || p.content?.rendered || "",
    link:            p.link,
    slug:            p.slug,
    status:          p.status,
    seoTitle:        p.yoast_head_json?.title        || p.meta?._yoast_wpseo_title    || null,
    metaDescription: p.yoast_head_json?.description  || p.meta?._yoast_wpseo_metadesc || null,
    focusKeyphrase:  p.yoast_head_json?.focuskw       || p.meta?._yoast_wpseo_focuskw  || null,
    canonicalUrl:    p.yoast_head_json?.canonical     || p.meta?._yoast_wpseo_canonical|| null,
  };
}

module.exports = {
  testConnection,
  checkYoast,
  getPages,
  getPosts,
  getPost,
  getCategories,
  updatePageMeta,
  injectSchema,
  createPost,
};
