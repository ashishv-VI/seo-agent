export const TOOLS = [
  // ── CONTENT ──────────────────────────────────────────────
  { id:"keyword", icon:"🔍", label:"Keyword Research", color:"#443DCB", cat:"Content",
    ph:"Enter topic, niche or URL...",
    prompt:i=>`You are an expert SEO keyword research specialist. For: "${i}", provide:
1. 10 primary keywords with search intent (informational/navigational/transactional/commercial)
2. 10 long-tail keyword variations
3. 5 semantic/LSI keywords
4. Keyword difficulty (Low/Medium/High) for each
5. Monthly search volume estimate for each
6. Recommended content angle
Be specific and actionable.`},

  { id:"cluster", icon:"🗂️", label:"Keyword Clustering", color:"#6D28D9", cat:"Content",
    ph:"Enter topic or paste keyword list...",
    prompt:i=>`You are an expert SEO topical authority specialist. For: "${i}", provide:
1. Group into 5-7 topical clusters with cluster names
2. For each cluster: 5-8 related keywords
3. Pillar page recommendation for each cluster
4. Content hierarchy (pillar → supporting pages)
5. Internal linking strategy between clusters
6. Search volume priority order
7. Which cluster to target first and why
Be specific and actionable.`},

  { id:"brief", icon:"📝", label:"Content Brief", color:"#2563EB", cat:"Content",
    ph:"Enter target keyword or topic...",
    prompt:i=>`You are an expert SEO content strategist. Create a detailed content brief for: "${i}".
1. Target keyword + 10 secondary keywords
2. Search intent analysis
3. 3 title tag variations (50-60 chars)
4. 2 meta description variations (150-160 chars)
5. Full article outline (H1, H2, H3 structure)
6. 15 NLP/semantic terms to include
7. Competitor content gaps to fill
8. Word count recommendation
9. Internal linking opportunities (5 suggestions)
10. E-E-A-T signals to include
11. FAQ section (5 questions)
Be detailed and ready to use.`},

  { id:"blog", icon:"✍️", label:"Auto Blog Generator", color:"#0891B2", cat:"Content",
    ph:"Enter topic or keyword...",
    prompt:i=>`You are an expert SEO content writer. Write a complete SEO blog post for: "${i}".
Structure:
1. SEO-optimized H1 title
2. Meta description (155 chars)
3. Introduction (hook + keyword naturally placed, 150 words)
4. 5-7 H2 sections with detailed content (200 words each)
5. H3 subsections where needed
6. Natural keyword integration throughout
7. FAQ section (5 Q&As with schema-ready format)
8. Conclusion with CTA
Requirements: E-E-A-T optimized, conversational tone, 1500+ words, publish-ready.`},

  { id:"refresh", icon:"🔄", label:"Content Refresh", color:"#0369A1", cat:"Content",
    ph:"Paste your old content or URL...",
    prompt:i=>`You are an expert SEO content refresh specialist. Analyze this content: "${i}".
1. Content quality score (0-100)
2. What is outdated and needs updating
3. Missing keywords to add
4. New sections to add
5. Sections to remove or rewrite
6. New statistics/data to include
7. Internal linking opportunities
8. Featured snippet optimization
9. Updated meta title + description
10. Priority refresh action plan
Be specific with exact changes needed.`},

  { id:"internal", icon:"🔗", label:"Internal Linking", color:"#059669", cat:"Content",
    ph:"Describe your website and target page...",
    prompt:i=>`You are an expert SEO internal linking specialist. For: "${i}", provide:
1. Internal linking strategy overview
2. Hub pages to create (topic clusters)
3. 15 specific internal link suggestions with anchor text
4. Link equity flow recommendation
5. Orphan page identification advice
6. Silo structure recommendation
7. Priority pages to link to/from
8. Anchor text diversity guidelines
9. Crawl depth optimization tips
Be specific with actual examples.`},

  { id:"faq", icon:"❓", label:"FAQ Generator", color:"#443DCB", cat:"Content",
    ph:"Enter topic or page content...",
    prompt:i=>`You are an expert SEO FAQ specialist. For: "${i}", generate:
1. 15 FAQ questions with detailed answers
2. Questions based on People Also Ask (PAA) patterns
3. Each answer optimized for featured snippets (40-60 words)
4. Complete JSON-LD FAQ schema markup (ready to paste)
5. Long-tail keyword opportunities within FAQs
6. Voice search optimized questions
7. Which FAQs to prioritize and why
Format as ready-to-publish FAQ section.`},

  { id:"programmatic", icon:"⚙️", label:"Programmatic SEO", color:"#6D28D9", cat:"Content",
    ph:"Enter niche or business type...",
    prompt:i=>`You are an expert programmatic SEO specialist. For: "${i}", provide:
1. Programmatic SEO opportunity analysis
2. Page template structure
3. 10 page type ideas (location, category, comparison)
4. URL structure recommendation
5. Dynamic content variables list
6. Internal linking for programmatic pages
7. Schema markup for programmatic pages
8. Duplicate content avoidance strategy
9. Estimated traffic potential
10. Step-by-step implementation plan
Be specific and actionable.`},

  { id:"topical", icon:"🏛️", label:"Topical Authority Builder", color:"#7C3AED", cat:"Content",
    ph:"Enter your niche or domain...",
    prompt:i=>`You are an expert in topical authority and semantic SEO for 2025. For: "${i}", provide:
1. Topical authority score estimate vs top competitors (0-100)
2. Core topic map — identify the 5-7 main topics you MUST own
3. Content coverage gaps — what subtopics are missing
4. Semantic coverage plan: 30 supporting article ideas
5. Pillar page → cluster page architecture (full tree)
6. Entity coverage: people, brands, concepts to mention
7. Internal link architecture between all clusters
8. Topic velocity — publishing order and cadence
9. Cannibalization risks to fix first
10. 90-day topical authority sprint plan
Be structured, specific and ready to implement.`},

  // ── TECHNICAL ────────────────────────────────────────────
  { id:"meta", icon:"🏷️", label:"Meta Tags Generator", color:"#1D4ED8", cat:"Technical",
    ph:"Enter page topic or URL...",
    prompt:i=>`You are an expert SEO meta tag specialist. For: "${i}", generate:
1. 3 title tag variations (50-60 chars)
2. 3 meta description variations (150-160 chars) with CTA
3. 5 focus keywords
4. Open Graph title + description
5. Twitter Card meta tags
6. Canonical URL recommendation
7. Robots meta tag recommendation
8. Why each title variation works
Format with copy-paste ready code.`},

  { id:"onpage", icon:"📋", label:"On-Page SEO Audit", color:"#047857", cat:"Technical",
    ph:"Paste content or enter URL...",
    prompt:i=>`You are an expert on-page SEO auditor. Analyze: "${i}".
1. Overall SEO score (0-100) with breakdown
2. Title tag analysis + recommendations
3. Heading structure (H1-H6) analysis
4. Keyword density + placement
5. Content length vs competition
6. Image optimization check
7. Internal + external linking analysis
8. Top 5 quick wins
9. Top 3 critical issues
Be specific with exact recommendations.`},

  { id:"schema", icon:"🧩", label:"Schema Markup", color:"#0369A1", cat:"Technical",
    ph:"Describe your page or business...",
    prompt:i=>`You are an expert structured data specialist. For: "${i}":
1. All recommended schema types
2. Complete JSON-LD: Organization schema
3. Complete JSON-LD: WebPage/Article schema
4. Complete JSON-LD: FAQ schema (5 Q&As)
5. Complete JSON-LD: Breadcrumb schema
6. Complete JSON-LD: LocalBusiness (if applicable)
7. How each schema boosts CTR and SEO
All code ready to copy-paste.`},

  { id:"robots", icon:"🤖", label:"Robots.txt + Sitemap", color:"#374151", cat:"Technical",
    ph:"Describe your website structure...",
    prompt:i=>`You are an expert technical SEO specialist. For: "${i}", generate:
1. Complete robots.txt file (ready to use)
2. Explanation of each directive
3. XML Sitemap structure recommendation
4. Image sitemap recommendation
5. Sitemap submission checklist
6. Common robots.txt mistakes to avoid
7. Crawl budget optimization tips
Provide actual ready-to-use code.`},

  { id:"cwv", icon:"📊", label:"Core Web Vitals Fix", color:"#DC2626", cat:"Technical",
    ph:"Describe your site or paste CWV scores...",
    prompt:i=>`You are an expert Core Web Vitals specialist. For: "${i}", provide:
1. LCP fixes — target under 2.5s
2. INP fixes — target under 100ms
3. CLS fixes — target under 0.1
4. FCP optimization
5. TTFB improvements
6. Image optimization checklist
7. JavaScript optimization tips
8. CSS optimization tips
9. Hosting/CDN recommendations
10. Priority order for fixes
Be specific with code examples.`},

  { id:"eeat", icon:"🎖️", label:"E-E-A-T Optimizer", color:"#0F4C81", cat:"Technical",
    ph:"Enter your URL, business name or content...",
    prompt:i=>`You are an expert in Google's E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) for 2025. For: "${i}":
1. E-E-A-T score estimate (0-100) with category breakdown
2. Experience signals — what first-hand experience content to add
3. Expertise signals — author bio, credentials, about page fixes
4. Authoritativeness signals — citations, mentions, links to build
5. Trustworthiness signals — reviews, security, disclaimers, policies
6. YMYL check — is this a Your-Money-Your-Life topic? (higher standards apply)
7. Author schema markup (JSON-LD ready)
8. About Us page template for maximum E-E-A-T
9. Content review and update process to stay authoritative
10. Top 10 E-E-A-T quick wins for this site
Be specific with exact changes to make.`},

  { id:"pagespeed", icon:"⚡", label:"Page Speed Check", color:"#D97706", cat:"Technical",
    ph:"Enter full URL (https://...)...", isApi:true, apiType:"pagespeed"},

  // ── RESEARCH ─────────────────────────────────────────────
  { id:"competitor", icon:"🏆", label:"Competitor Analysis", color:"#DC2626", cat:"Research",
    ph:"Enter competitor URL or niche...",
    prompt:i=>`You are an expert SEO competitive analyst. For: "${i}":
1. Competitor content strategy analysis
2. Estimated top 20 keywords they rank for
3. Content gaps they are missing
4. Backlink profile analysis
5. Unique differentiation angle
6. Their strengths to learn from
7. Their weaknesses to exploit
8. 5 quick wins to outrank them
9. 90-day competitive strategy
Be strategic and specific.`},

  { id:"topic", icon:"💡", label:"Topic Research", color:"#CA8A04", cat:"Research",
    ph:"Enter your niche or topic...",
    prompt:i=>`You are an expert SEO content strategist. For niche: "${i}":
1. 10 content pillar ideas with search intent
2. 20 blog post title ideas (SEO optimized)
3. 5 content cluster topics with subtopics
4. People Also Ask questions (20+)
5. Trending angles and content gaps
6. Seasonal content opportunities
7. 8-week content calendar
Be specific and actionable.`},

  { id:"airank", icon:"🎯", label:"AI Rank Check", color:"#443DCB", cat:"Research",
    ph:"Enter keyword or URL...",
    prompt:i=>`You are an expert SEO ranking analyst. For: "${i}":
1. Ranking difficulty score (0-100)
2. Current SERP analysis
3. Top 5 ranking factors
4. Realistic time to reach page 1
5. Content quality requirements
6. Backlink profile needed
7. SERP features likely to appear
8. Featured snippet opportunity
9. 30/60/90 day action plan
Be realistic and specific.`},

  { id:"trend", icon:"📈", label:"Trend Predictor", color:"#0891B2", cat:"Research",
    ph:"Enter niche or topic to predict...",
    prompt:i=>`You are an expert SEO trend prediction specialist. For: "${i}":
1. Current trend analysis (growing/declining/stable)
2. 5 upcoming trend predictions for next 6 months
3. Seasonal patterns to capitalize on
4. Emerging keywords before they peak
5. Content to create NOW before trend peaks
6. Topics to avoid (declining trends)
7. Action plan to capture trending traffic
Be forward-thinking and specific.`},

  { id:"serp", icon:"🔎", label:"SERP Analysis", color:"#374151", cat:"Research",
    ph:"Enter keyword to analyze SERP...",
    prompt:i=>`You are an expert SERP analysis specialist. For keyword: "${i}":
1. Search intent analysis
2. Content type that likely ranks
3. Recommended content format
4. Word count of likely top results
5. Featured snippet opportunity
6. People Also Ask opportunities
7. Local pack opportunity
8. Video carousel opportunity
9. Exact content angle to win this SERP
10. Title format that likely works
Be specific and data-driven.`},

  { id:"reddit", icon:"💬", label:"Reddit & Forum SEO", color:"#FF4500", cat:"Research",
    ph:"Enter niche, keyword or brand name...",
    prompt:i=>`You are an expert in Reddit SEO and community-driven search optimization for 2025. For: "${i}":
1. Reddit opportunity analysis — is this niche active on Reddit?
2. Top 10 subreddits to monitor and participate in
3. Reddit SERP dominance — which queries does Reddit rank #1 for?
4. Forum SEO strategy (Reddit, Quora, niche forums)
5. 20 Reddit thread titles that rank on Google for this niche
6. How to get cited in Reddit threads that rank
7. Question formats people post about this topic
8. Community content gap — questions no one answers well
9. Brand mention strategy in forum discussions
10. Content angles that get upvoted AND rank in Google
Be specific with subreddit names and post angles.`},

  // ── GEO ──────────────────────────────────────────────────
  { id:"geo", icon:"🌐", label:"GEO — AI Visibility", color:"#0F766E", cat:"GEO",
    ph:"Enter brand name or topic...",
    prompt:i=>`You are an expert in Generative Engine Optimization (GEO) for 2026. For: "${i}":
1. AI Search Visibility Score estimate (0-100)
2. How to appear in ChatGPT answers
3. How to appear in Google Gemini responses
4. How to appear in Perplexity citations
5. How to appear in Claude AI answers
6. Content structure for AI citations
7. E-E-A-T signals for AI credibility
8. Entity building strategy
9. Top 10 prompts users ask AI about this topic
10. 30-day GEO action plan
Be specific and forward-thinking.`},

  { id:"geoprompt", icon:"💬", label:"Prompt Optimizer", color:"#0D9488", cat:"GEO",
    ph:"Enter your content topic...",
    prompt:i=>`You are an expert in AI prompt optimization (GEO). For: "${i}":
1. 20 prompts users ask ChatGPT/Gemini/Perplexity
2. For each: how to optimize content to be cited
3. Answer format per prompt
4. Authority signals to include
5. Exact content snippets for AI citation
6. Schema markup to help AI understand content
7. Content update frequency for AI freshness
Be specific with examples.`},

  { id:"aisearch", icon:"🤖", label:"AI Search Tracker", color:"#134E4A", cat:"GEO",
    ph:"Enter brand + competitor names...",
    prompt:i=>`You are an expert AI search visibility analyst. For: "${i}":
1. How ChatGPT would answer queries about this brand
2. How Gemini would present this brand
3. How Perplexity would cite this brand
4. Share of voice vs competitors
5. Why competitors get cited more
6. Content gaps preventing AI citations
7. Authoritative sources to get mentioned on
8. Brand mention building strategy
9. 60-day AI visibility improvement plan
Be specific and actionable.`},

  { id:"entity", icon:"🧠", label:"Entity SEO Builder", color:"#065F46", cat:"GEO",
    ph:"Enter brand or topic name...",
    prompt:i=>`You are an expert entity-based SEO specialist. For: "${i}":
1. Entity type classification
2. Knowledge Graph presence check
3. Entity attributes to establish online
4. Wikipedia page strategy
5. Wikidata entity creation guide
6. Google Business Profile optimization
7. Social proof signals
8. Brand mention strategy
9. Structured data for entity markup
10. Knowledge panel optimization tips
Be specific and actionable.`},

  // ── LOCAL ─────────────────────────────────────────────────
  { id:"local", icon:"📍", label:"Local SEO Optimizer", color:"#B45309", cat:"Local",
    ph:"Enter business name + location...",
    prompt:i=>`You are an expert Local SEO specialist. For: "${i}":
1. Google Business Profile optimization checklist
2. Local keyword strategy
3. NAP consistency audit guide
4. Local citation building (top 20 directories)
5. Review generation strategy
6. Local schema markup (JSON-LD ready)
7. Local landing page optimization
8. Google Maps ranking factors
9. 30-day local SEO action plan
Be specific with exact recommendations.`},

  { id:"gmb", icon:"🗺️", label:"GMB Post Generator", color:"#92400E", cat:"Local",
    ph:"Enter business type + offer/news...",
    prompt:i=>`You are an expert Google Business Profile specialist. For: "${i}", generate:
1. 5 Google Business Profile post variations
2. Offer post with CTA
3. Event post
4. Update/announcement post
5. Product post
6. Best posting schedule
7. Q&A section (10 Q&As)
8. GBP attributes to enable
All posts ready to copy-paste.`},

  { id:"youtube", icon:"▶️", label:"YouTube SEO", color:"#DC2626", cat:"Local",
    ph:"Enter video topic or title...",
    prompt:i=>`You are an expert YouTube SEO specialist. For: "${i}":
1. 5 optimized title variations (60 chars max)
2. Full video description (SEO optimized)
3. 20 tags (mix broad + specific)
4. Thumbnail text suggestion
5. Chapter markers structure
6. End screen CTA recommendations
7. Upload timing recommendation
8. Community post to promote video
Be specific and ready to use.`},

  // ── BACKLINKS ─────────────────────────────────────────────
  { id:"backlink", icon:"🔗", label:"Backlink Strategy", color:"#1E40AF", cat:"Backlinks",
    ph:"Enter domain or niche...",
    prompt:i=>`You are an expert link building specialist. For: "${i}":
1. Link building strategy overview
2. 20 specific backlink opportunity types
3. Guest posting targets
4. HARO/journalist outreach strategy
5. Broken link building approach
6. Skyscraper technique opportunities
7. Digital PR strategy
8. Link quality criteria checklist
9. Toxic link warning signs
10. 90-day link building calendar
Be specific and actionable.`},

  { id:"outreach", icon:"📧", label:"Outreach Generator", color:"#1E3A5F", cat:"Backlinks",
    ph:"Enter target site + your content...",
    prompt:i=>`You are an expert link building outreach specialist. For: "${i}", generate:
1. Guest post pitch (3 email variations)
2. Broken link replacement pitch
3. Resource page inclusion pitch
4. HARO response template
5. Digital PR pitch
For each: Subject line (A/B/C), full email, follow-up sequence (Day 3, 7, 14)
Natural, human, not spammy. Ready to send.`},

  { id:"linkprospect", icon:"🎯", label:"Link Prospect Finder", color:"#1E40AF", cat:"Backlinks",
    ph:"Enter niche + your content topic...",
    prompt:i=>`You are an expert link prospecting specialist. For: "${i}":
1. 30 specific website types to target
2. Google search operators to find prospects
3. Social media prospecting strategy
4. University/edu link opportunities
5. Award/recognition sites to apply to
6. Tool/resource roundup targets
7. Competitor backlink sources to replicate
8. Prospecting email template per type
Give specific, actionable strategies.`},

  // ── TOOLS ─────────────────────────────────────────────────
  { id:"ecommerce", icon:"🛒", label:"E-commerce SEO", color:"#9333EA", cat:"Tools",
    ph:"Enter product/category or store type...",
    prompt:i=>`You are an expert e-commerce SEO specialist. For: "${i}":
1. Product page SEO checklist
2. Category page optimization
3. Product title formula
4. Product description template (SEO optimized)
5. Product schema markup (JSON-LD)
6. Review schema implementation
7. Faceted navigation SEO strategy
8. Canonical tag strategy for variants
9. Out-of-stock page strategy
10. Seasonal SEO calendar
Be specific with examples.`},

  { id:"voice", icon:"🎙️", label:"Voice Search SEO", color:"#443DCB", cat:"Tools",
    ph:"Enter topic or business type...",
    prompt:i=>`You are an expert voice search optimization specialist. For: "${i}":
1. Voice search query patterns
2. 20 voice search keywords (conversational)
3. Featured snippet optimization for voice
4. FAQ content structure for voice
5. Local voice search optimization
6. Structured data for voice answers
7. Position zero targeting strategy
8. Voice search content template
Be specific and actionable.`},

  { id:"humanizer", icon:"🧬", label:"AI Content Humanizer", color:"#0891B2", cat:"Tools",
    ph:"Paste AI-generated content here...",
    prompt:i=>`You are an expert content editor making AI content human. For: "${i}":
1. Humanization score (0-100) of original
2. Rewrite to sound 100% human
3. Add personal anecdotes/examples
4. Vary sentence structure naturally
5. Remove AI patterns (list overused phrases)
6. Add transitional phrases naturally
7. Improve readability score
8. Maintain SEO keywords naturally
9. Final humanized version (ready to publish)
Make it sound like a real expert wrote it.`},

  { id:"contentgap", icon:"🕵️", label:"Content Gap Finder", color:"#DC2626", cat:"Tools",
    ph:"Enter your URL vs competitor URL...",
    prompt:i=>`You are an expert competitive content gap analyst. For: "${i}":
1. Topics competitor covers that you don't
2. Keywords competitor ranks for (top 30)
3. Content format gaps
4. Featured snippet gaps
5. Local SEO gaps
6. Technical SEO gaps
7. Priority gap to fill first (with ROI estimate)
8. 60-day gap closing plan
Be specific and strategic.`},

  { id:"siteaudit", icon:"🏥", label:"Site Health Audit", color:"#047857", cat:"Tools",
    ph:"Enter your domain or describe your site...",
    prompt:i=>`You are an expert technical SEO auditor. For: "${i}":
1. Overall site health score (0-100)
2. Technical SEO issues checklist
3. On-page SEO issues
4. Content quality issues
5. Link profile issues
6. Page speed issues
7. Mobile optimization issues
8. Security issues (HTTPS, etc.)
9. Priority fix order (P1/P2/P3)
10. Estimated traffic impact of each fix
Be comprehensive and specific.`},

  { id:"aishopping", icon:"🛍️", label:"AI Shopping SEO", color:"#1A73E8", cat:"Tools",
    ph:"Enter product name, category or store URL...",
    prompt:i=>`You are an expert in Google AI Overviews Shopping and AI-powered product search optimization for 2025. For: "${i}":
1. AI Shopping visibility score estimate (0-100)
2. How Google AI picks products to recommend
3. Product data feed optimization (title, description, attributes)
4. Product schema markup (JSON-LD) ready to paste
5. Review and rating signals Google AI weighs
6. Price competitiveness signals
7. How to appear in Google's AI-generated product summaries
8. Merchant Center feed quality checklist
9. Visual search optimization (image quality, alt text, angles)
10. 30-day AI Shopping SEO action plan
Be specific with product listing examples.`},
];

export const CATS = ["All","Content","Technical","Research","GEO","Local","Backlinks","Tools"];
// Tool count: 39 (35 original + Topical Authority, Reddit SEO, E-E-A-T Optimizer, AI Shopping SEO)

// ── UPDATED: 4 models — Groq, Gemini, DeepSeek (free), Mistral (free) ──
export const MODELS = {
  groq:     { name:"Groq",     color:"#F97316" },
  gemini:   { name:"Gemini",   color:"#2563EB" },
  deepseek: { name:"DeepSeek", color:"#22C55E" },
  mistral:  { name:"Mistral",  color:"#A855F7" },
};