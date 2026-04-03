/**
 * tools.js — Tool Execution Backend
 *
 * Routes:
 *   POST /api/tools/run           — run a tool with agent context, save output to approval_queue
 *   GET  /api/tools/history/:id   — tool run history for a client
 *   GET  /api/tools/list          — available tools catalogue
 *   POST /api/tools/approve/:id   — approve a tool output (mark as approved)
 *   POST /api/tools/reject/:id    — reject a tool suggestion
 */

const express        = require("express");
const router         = express.Router();
const { db, FieldValue } = require("../config/firebase");
const { verifyToken }    = require("../middleware/auth");
const { getUserKeys }    = require("../utils/getUserKeys");
const { callLLM, parseJSON } = require("../utils/llm");
const { getState }       = require("../shared-state/stateManager");

// ── Tool catalogue ───────────────────────────────────────────────────────────
const TOOL_CATALOGUE = [
  { id: "meta",          name: "Meta Generator",         category: "on-page",   description: "Generate optimised title tags and meta descriptions" },
  { id: "schema",        name: "Schema Generator",       category: "technical", description: "Generate structured data (JSON-LD) for any page type" },
  { id: "sitemap",       name: "Sitemap Generator",      category: "technical", description: "Create XML sitemap from crawled pages" },
  { id: "blog",          name: "Blog Generator",         category: "content",   description: "Write SEO-optimised blog posts and landing page copy" },
  { id: "brief",         name: "Content Brief",          category: "content",   description: "Turn keyword research into a detailed content brief" },
  { id: "onpage",        name: "On-Page Optimizer",      category: "on-page",   description: "Heading structure, internal links, keyword density fixes" },
  { id: "cwv",           name: "CWV Advisor",            category: "technical", description: "Core Web Vitals fix checklist prioritised by impact" },
  { id: "eeat",          name: "E-E-A-T Optimizer",      category: "content",   description: "Add author bios, citations, and trust signals" },
  { id: "serpsimulator", name: "SERP Simulator",         category: "preview",   description: "Preview how a page looks in Google search results" },
  { id: "metapreview",   name: "Meta Preview",           category: "preview",   description: "Google snippet preview with character counters" },
  { id: "aeo",           name: "AEO Optimizer",          category: "content",   description: "Featured snippet and answer engine optimisation" },
  { id: "local",         name: "Local SEO",              category: "local",     description: "LocalBusiness schema and NAP citation fixes" },
  { id: "outreach",      name: "Outreach Email",         category: "links",     description: "Link-building outreach email templates" },
  { id: "humanizer",     name: "Content Humanizer",      category: "content",   description: "Rewrite AI-generated text to pass AI detection" },
  { id: "contentgap",    name: "Content Gap Analyzer",   category: "research",  description: "Find keywords competitors rank for that you don't" },
];

// ── Prompt builders: each tool gets a structured prompt from context ─────────
const TOOL_PROMPTS = {
  meta: (ctx) => `You are an expert SEO copywriter. Generate an optimised title tag and meta description for this page.

URL: ${ctx.url || "unknown"}
Page H1: ${ctx.h1 || "not provided"}
Existing title: ${ctx.existing || "none"}
Existing description: ${ctx.description || "none"}
Target keyword: ${ctx.keyword || "derive from context"}

Rules:
- Title: 50-60 characters, include primary keyword near the start, compelling and unique
- Meta description: 145-160 characters, include keyword, a benefit, and a soft CTA
- Do NOT use clickbait or misleading language
- Return ONLY valid JSON, no markdown:
{
  "title": "...",
  "metaDescription": "...",
  "titleLength": 55,
  "descriptionLength": 155,
  "primaryKeyword": "...",
  "notes": "brief rationale"
}`,

  schema: (ctx) => `You are a structured data expert. Generate the correct JSON-LD schema markup for this page.

URL: ${ctx.url || ""}
Page type: ${ctx.pageType || "webpage"}
Page title: ${ctx.title || ""}
H1: ${ctx.h1 || ""}

Generate the most appropriate schema type (WebPage, Article, LocalBusiness, Service, Product, FAQPage, BreadcrumbList, etc.)
Return ONLY valid JSON-LD as a script tag:
{
  "schemaType": "Article",
  "jsonLd": "<script type='application/ld+json'>{...}</script>",
  "notes": "why this schema type"
}`,

  sitemap: (ctx) => `Generate a valid XML sitemap for these pages.

Pages: ${(ctx.pages || []).slice(0, 100).join("\n")}

Rules:
- Include all pages
- Set priority: 1.0 for homepage, 0.8 for main pages, 0.6 for others
- Set changefreq: weekly for homepage/main pages, monthly for others
- Return ONLY valid JSON:
{
  "xml": "<?xml version='1.0'...>...",
  "totalUrls": 25,
  "notes": "sitemap summary"
}`,

  blog: (ctx) => `You are a senior SEO content writer. Write a comprehensive, SEO-optimised blog post.

Topic: ${ctx.topic || ctx.keyword || "unknown"}
Target keyword: ${ctx.keyword || ""}
URL context: ${ctx.url || ""}
Current word count: ${ctx.wordCount || 0} (expand to at least 800 words)

Write a full blog post with:
- H1 with keyword
- Introduction (hook + keyword)
- 3-5 H2 sections with H3 sub-sections
- Conclusion with CTA
- Return ONLY valid JSON:
{
  "title": "H1 title",
  "content": "full HTML content with headings",
  "wordCount": 900,
  "primaryKeyword": "...",
  "secondaryKeywords": ["...", "..."],
  "metaTitle": "...",
  "metaDescription": "..."
}`,

  brief: (ctx) => `Create a detailed SEO content brief for a writer.

Business: ${ctx.businessName || ""}
Website: ${ctx.url || ""}
Target keywords: ${(ctx.keywords || []).join(", ")}

Return ONLY valid JSON:
{
  "title": "Content brief title",
  "targetKeyword": "primary keyword",
  "secondaryKeywords": [],
  "searchIntent": "informational|transactional|commercial|navigational",
  "recommendedWordCount": 1200,
  "outline": [
    { "heading": "H2 title", "notes": "what to cover", "subheadings": ["H3 a", "H3 b"] }
  ],
  "internalLinks": ["suggested internal link opportunities"],
  "faqs": [{ "question": "...", "answer": "..." }],
  "notes": "writer guidance"
}`,

  onpage: (ctx) => `You are an on-page SEO specialist. Provide heading structure and content fixes for this page.

URL: ${ctx.url || ""}
Current title: ${ctx.title || "none"}
Target keyword: ${ctx.keyword || ""}

Return ONLY valid JSON:
{
  "h1": "Recommended H1",
  "h2s": ["Recommended H2 sections"],
  "keywordDensity": "suggested density %",
  "internalLinkSuggestions": [{ "anchor": "...", "targetPage": "..." }],
  "fixes": ["actionable fix 1", "fix 2"],
  "notes": "rationale"
}`,

  cwv: (ctx) => `You are a web performance expert. Generate a Core Web Vitals fix checklist.

URL: ${ctx.url || ""}
LCP: ${ctx.lcp || "unknown"}ms
FID/INP: ${ctx.fid || "unknown"}ms
CLS: ${ctx.cls || "unknown"}

Return ONLY valid JSON:
{
  "summary": "brief assessment",
  "fixes": [
    { "issue": "...", "fix": "...", "effort": "easy|medium|hard", "impact": "high|medium|low", "priority": 1 }
  ],
  "quickWins": ["3 easiest fixes"],
  "estimatedScoreGain": "+15 points after fixes"
}`,

  eeat: (ctx) => `You are an E-E-A-T specialist. Recommend improvements to demonstrate expertise, authoritativeness, and trustworthiness.

URL: ${ctx.url || ""}
Content excerpt: ${ctx.content || "not provided"}

Return ONLY valid JSON:
{
  "score": "current E-E-A-T score: 1-10",
  "gaps": ["identified gap 1", "gap 2"],
  "recommendations": [
    { "type": "author_bio|citations|awards|reviews|schema", "action": "...", "impact": "high|medium|low" }
  ],
  "priorityActions": ["top 3 actions"],
  "notes": "overall assessment"
}`,

  serpsimulator: (ctx) => `Generate a SERP preview analysis for this page's meta tags.

Title: ${ctx.title || ""}
Description: ${ctx.description || ""}
URL: ${ctx.url || ""}

Return ONLY valid JSON:
{
  "displayUrl": "formatted display URL",
  "titlePreview": "title as shown in SERP (truncated if needed)",
  "descriptionPreview": "description as shown in SERP",
  "titleLength": 55,
  "descriptionLength": 155,
  "titleStatus": "good|too_short|too_long",
  "descriptionStatus": "good|too_short|too_long",
  "ctrScore": "estimated CTR: 1-10",
  "suggestions": ["improvement suggestion 1", "suggestion 2"]
}`,

  metapreview: (ctx) => `Preview and score these meta tags for Google appearance.

Title: ${ctx.title || ""}
Description: ${ctx.description || ""}
URL: ${ctx.url || ""}

Return ONLY valid JSON with the same shape as serpsimulator.`,

  aeo: (ctx) => `You are an Answer Engine Optimisation specialist. Generate a featured snippet optimised answer for this question.

Question: ${ctx.question || ""}
Topic: ${ctx.topic || ""}

Return ONLY valid JSON:
{
  "question": "...",
  "directAnswer": "40-60 word concise answer for featured snippet",
  "answerFormat": "paragraph|list|table",
  "faqItems": [{ "question": "...", "answer": "..." }],
  "schemaMarkup": "<script type='application/ld+json'>{FAQPage schema}</script>",
  "notes": "why this format wins featured snippets"
}`,

  local: (ctx) => `Generate LocalBusiness schema and local SEO recommendations.

Business: ${ctx.businessName || ""}
Address: ${ctx.address || ""}
Phone: ${ctx.phone || ""}
URL: ${ctx.url || ""}

Return ONLY valid JSON:
{
  "schema": "<script type='application/ld+json'>{LocalBusiness JSON-LD}</script>",
  "napConsistencyChecklist": ["item 1", "item 2"],
  "citationTargets": [{ "directory": "...", "url": "...", "priority": "high|medium" }],
  "notes": "local SEO recommendations"
}`,

  outreach: (ctx) => `Write a personalised link-building outreach email.

Target site/person: ${ctx.target || ""}
Link type: ${ctx.type || "guest post"}
Target keyword/topic: ${ctx.keyword || ""}

Return ONLY valid JSON:
{
  "subject": "email subject line",
  "body": "full email body (plain text, professional, personal, under 200 words)",
  "followUpSubject": "follow-up email subject",
  "followUpBody": "follow-up email (shorter, 5-7 days later)",
  "notes": "personalisation tips"
}`,

  humanizer: (ctx) => `Rewrite this AI-generated content to sound completely natural and human.

Content: ${ctx.content || "not provided"}
Tone: ${ctx.tone || "professional but conversational"}

Rules:
- Vary sentence length (mix short punchy sentences with longer ones)
- Remove corporate buzzwords and AI tells
- Add natural transitions and personality
- Keep all factual information and keywords
- Return ONLY valid JSON:
{
  "humanized": "rewritten content",
  "wordCount": 900,
  "changes": ["key changes made"],
  "aiDetectionScore": "estimated AI score: 1-100 (lower is more human)"
}`,

  contentgap: (ctx) => `Identify content gap opportunities based on competitor keyword data.

Your domain: ${ctx.url || ""}
Gap keyword: ${ctx.keyword || ""}
Competitor ranking for it: ${ctx.competitor || ""}

Return ONLY valid JSON:
{
  "gapKeyword": "${ctx.keyword || ""}",
  "searchVolume": "estimated monthly searches",
  "difficulty": "low|medium|high",
  "recommendedPageType": "blog|landing|product|faq",
  "contentBrief": {
    "title": "...",
    "wordCount": 1000,
    "outline": ["H2 section 1", "H2 section 2"]
  },
  "competitorAnalysis": "why ${ctx.competitor || "competitor"} ranks for this",
  "notes": "how to outrank them"
}`,
};

// ── GET /api/tools/list ───────────────────────────────────────────────────────
router.get("/list", verifyToken, (req, res) => {
  res.json({ tools: TOOL_CATALOGUE });
});

// ── POST /api/tools/run ───────────────────────────────────────────────────────
// Body: { clientId, toolId, context }
router.post("/run", verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const { clientId, toolId, context = {} } = req.body;

  if (!clientId || !toolId) {
    return res.status(400).json({ error: "clientId and toolId are required" });
  }

  // Verify ownership
  const clientDoc = await db.collection("clients").doc(clientId).get();
  if (!clientDoc.exists || clientDoc.data().ownerId !== uid) {
    return res.status(403).json({ error: "Access denied" });
  }

  const promptBuilder = TOOL_PROMPTS[toolId];
  if (!promptBuilder) {
    return res.status(400).json({ error: `Unknown tool: ${toolId}` });
  }

  let keys;
  try {
    keys = await getUserKeys(uid);
  } catch (e) {
    return res.status(400).json({ error: "No API keys found — add keys in Settings" });
  }

  const prompt = promptBuilder(context);

  let output;
  try {
    const raw = await callLLM(prompt, keys, {
      maxTokens: 3000,
      temperature: 0.3,
      systemPrompt: "You are an expert SEO specialist. Return only valid JSON with no markdown or explanation.",
    });
    output = parseJSON(raw);
  } catch (e) {
    return res.status(500).json({ error: `Tool execution failed: ${e.message}` });
  }

  // Save output to approval_queue
  const toolMeta = TOOL_CATALOGUE.find(t => t.id === toolId) || { name: toolId };
  try {
    await db.collection("approval_queue").add({
      clientId,
      type:      "tool_output",
      toolId,
      toolName:  toolMeta.name,
      context,
      output,
      status:    "pending_review",
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn("[tools] approval_queue write failed:", e.message);
  }

  res.json({ success: true, toolId, output });
});

// ── GET /api/tools/history/:clientId ─────────────────────────────────────────
router.get("/history/:clientId", verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const { clientId } = req.params;

  const clientDoc = await db.collection("clients").doc(clientId).get();
  if (!clientDoc.exists || clientDoc.data().ownerId !== uid) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const snap = await db.collection("approval_queue")
      .where("clientId", "==", clientId)
      .where("type", "==", "tool_output")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const history = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ history });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/tools/approve/:docId ────────────────────────────────────────────
router.post("/approve/:docId", verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const { docId } = req.params;

  const doc = await db.collection("approval_queue").doc(docId).get();
  if (!doc.exists) return res.status(404).json({ error: "Not found" });

  const data = doc.data();
  const clientDoc = await db.collection("clients").doc(data.clientId).get();
  if (!clientDoc.exists || clientDoc.data().ownerId !== uid) {
    return res.status(403).json({ error: "Access denied" });
  }

  await doc.ref.update({ status: "approved", approvedAt: FieldValue.serverTimestamp(), approvedBy: uid });
  res.json({ success: true });
});

// ── POST /api/tools/reject/:docId ─────────────────────────────────────────────
router.post("/reject/:docId", verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const { docId } = req.params;

  const doc = await db.collection("approval_queue").doc(docId).get();
  if (!doc.exists) return res.status(404).json({ error: "Not found" });

  const data = doc.data();
  const clientDoc = await db.collection("clients").doc(data.clientId).get();
  if (!clientDoc.exists || clientDoc.data().ownerId !== uid) {
    return res.status(403).json({ error: "Access denied" });
  }

  await doc.ref.update({ status: "rejected", rejectedAt: FieldValue.serverTimestamp(), rejectedBy: uid });
  res.json({ success: true });
});

module.exports = router;
