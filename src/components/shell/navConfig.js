// Enterprise Information Architecture (M10.2) — single source of truth for
// workspace navigation. Groups the existing pages into the 5-section hierarchy.
//
// NOTE: `page` values map to EXISTING App.jsx page keys (no new destinations,
// no removed functionality). Items whose primary home is inside the client
// Control Room carry `via: "controlRoom"` + `tab` so the shell/breadcrumbs can
// describe where they live without changing how they render.

export const NAV_SECTIONS = [
  {
    id: "overview", label: "Overview", icon: "🏠",
    items: [
      { id: "command",  label: "Command Center",  page: "clients", via: "controlRoom", tab: "command",  icon: "🛰️" },
      { id: "health",   label: "Health",          page: "clients", via: "controlRoom", tab: "health",   icon: "🩺" },
      { id: "activity", label: "Activity",        page: "clients", via: "controlRoom", tab: "overview", icon: "📇" },
    ],
  },
  {
    id: "ai", label: "AI Workspace", icon: "✨",
    items: [
      { id: "copilot",     label: "SEO Copilot",        page: "clients", via: "controlRoom", tab: "copilot",       icon: "💬" },
      { id: "tasks",       label: "Task Center",        page: "clients", via: "controlRoom", tab: "taskcenter",    icon: "🗂️" },
      { id: "answeropt",   label: "Answer Optimization",page: "clients", via: "controlRoom", tab: "answeropt",     icon: "🎯" },
      { id: "visibility",  label: "LLM Visibility",     page: "clients", via: "controlRoom", tab: "llmvisibility", icon: "🛰️" },
    ],
  },
  {
    id: "operations", label: "SEO Operations", icon: "⚙️",
    items: [
      { id: "pipeline",  label: "Pipeline",   page: "clients", via: "controlRoom", tab: "overview", icon: "🔧" },
      { id: "ranktracker", label: "Rankings", page: "ranktracker", icon: "📡" },
      { id: "audit",     label: "Technical",  page: "audit",   icon: "🏥" },
      { id: "calendar",  label: "Content",    page: "calendar", icon: "📅" },
      { id: "approvals", label: "Approvals",  page: "clients", via: "controlRoom", tab: "overview", icon: "✅" },
    ],
  },
  {
    id: "analytics", label: "Analytics", icon: "📊",
    items: [
      { id: "gsc",     label: "Reports (GSC)", page: "gsc",   icon: "📈" },
      { id: "ga4",     label: "GA4 Analytics", page: "ga4",   icon: "📊" },
      { id: "agency",  label: "Agency Dashboard", page: "agency", icon: "🏢" },
    ],
  },
  {
    id: "admin", label: "Administration", icon: "🛡️",
    items: [
      { id: "users",    label: "User Management", page: "users",   icon: "👥" },
      { id: "clients",  label: "Client Profile",  page: "clients", icon: "🏢" },
      { id: "settings", label: "Settings",        page: "__settings", icon: "⚙️" }, // opens settings modal
    ],
  },
];

// Flatten for search / breadcrumb lookup.
export const NAV_INDEX = NAV_SECTIONS.flatMap(s =>
  s.items.map(it => ({ ...it, section: s.label, sectionId: s.id }))
);

export function findNavByPage(page, tab) {
  return NAV_INDEX.find(it => it.page === page && (tab == null || it.tab === tab)) || null;
}
