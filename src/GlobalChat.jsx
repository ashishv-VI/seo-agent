/**
 * GlobalChat — Floating AI SEO Chatbot
 * Accessible from every page. Two modes:
 * - General: Expert SEO consultant (no client context)
 * - Client: Context-aware with client's real SEO data
 */
import { useState, useEffect, useRef } from "react";
import { useAuth } from "./context/AuthContext";
import Markdown from "./Markdown";

const B = "#443DCB";

const SLASH_COMMANDS = {
  "/fix":      "What are the most critical SEO fixes I should implement right now?",
  "/keywords": "Show me the top keyword opportunities and how to rank for them",
  "/audit":    "Summarize the key technical audit findings and what they mean",
  "/report":   "Give me an executive summary of the overall SEO status",
  "/meta":     "Write an optimized title tag and meta description for the homepage",
  "/schema":   "What schema markup should I add? Provide the JSON-LD code",
  "/local":    "How can I improve local SEO and Google Business Profile ranking?",
  "/speed":    "How do I improve Core Web Vitals and PageSpeed score?",
};

const QUICK_PROMPTS_GENERAL = [
  "What are the most important SEO ranking factors in 2025?",
  "How do I fix Core Web Vitals issues?",
  "Write me a LocalBusiness JSON-LD schema",
  "How do I build high-quality backlinks?",
  "What's the best title tag formula?",
  "How to fix duplicate content issues?",
];

const QUICK_PROMPTS_CLIENT = [
  "What are the top 3 things to fix for this client?",
  "Write an optimized title tag for the homepage",
  "Explain the most critical issue in plain English",
  "What keywords should we target first?",
  "How long until we see ranking improvements?",
  "Generate a quick-win action plan",
];

function CodeBlock({ code, dark }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position:"relative", margin:"8px 0" }}>
      <pre style={{ background:dark?"#0d0d0d":"#f3f4f6", border:`1px solid ${dark?"#2a2a2a":"#e5e7eb"}`, borderRadius:8, padding:"10px 12px", fontSize:11, overflowX:"auto", margin:0, color:dark?"#e2e8f0":"#1f2937", lineHeight:1.6 }}>
        <code>{code}</code>
      </pre>
      <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(()=>setCopied(false),2000); }}
        style={{ position:"absolute", top:6, right:6, padding:"3px 8px", borderRadius:5, background:copied?"#059669":dark?"#222":"#e5e7eb", color:copied?"#fff":dark?"#888":"#6b7280", border:"none", fontSize:10, cursor:"pointer", fontWeight:600 }}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function MessageBubble({ msg, dark, onFollowUp }) {
  const bg2   = dark ? "#1a1a1a" : "#ffffff";
  const bdr   = dark ? "#2a2a2a" : "#e0e0d8";
  const txt   = dark ? "#e8e8e8" : "#1a1a18";
  const isUser = msg.role === "user";

  // Parse content: split on code blocks
  function renderContent(text) {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith("```")) {
        const code = part.replace(/^```\w*\n?/, "").replace(/```$/, "");
        return <CodeBlock key={i} code={code} dark={dark} />;
      }
      return <Markdown key={i} text={part} dark={dark} />;
    });
  }

  if (isUser) {
    return (
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:10 }}>
        <div style={{ maxWidth:"80%", background:B, color:"#fff", borderRadius:"14px 14px 3px 14px", padding:"9px 13px", fontSize:13, lineHeight:1.5 }}>
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:6 }}>
        <div style={{ width:26, height:26, borderRadius:"50%", background:`${B}22`, border:`1px solid ${B}44`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:13 }}>🤖</div>
        <div style={{ maxWidth:"88%", background:bg2, border:`1px solid ${bdr}`, borderRadius:"3px 14px 14px 14px", padding:"9px 13px", fontSize:13, lineHeight:1.6, color:txt }}>
          {msg.loading ? (
            <div style={{ display:"flex", gap:4, alignItems:"center" }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:B, opacity:0.7, animation:"bounce 1s infinite", animationDelay:`${i*0.15}s` }} />
              ))}
            </div>
          ) : renderContent(msg.content)}
        </div>
      </div>

      {/* Copy AI response */}
      {!msg.loading && (
        <div style={{ paddingLeft:34, display:"flex", gap:6, alignItems:"center" }}>
          <CopyBtn text={msg.content} dark={dark} />
          {msg.toolSuggestion && (
            <button onClick={() => onFollowUp?.(`open_tool:${msg.toolSuggestion.page}`)}
              style={{ fontSize:10, padding:"3px 8px", borderRadius:6, background:`${B}15`, color:B, border:`1px solid ${B}33`, cursor:"pointer", fontWeight:600 }}>
              Open {msg.toolSuggestion.label} →
            </button>
          )}
        </div>
      )}

      {/* Follow-up chips */}
      {!msg.loading && msg.followUps?.length > 0 && (
        <div style={{ paddingLeft:34, marginTop:6, display:"flex", flexWrap:"wrap", gap:5 }}>
          {msg.followUps.map((q, i) => (
            <button key={i} onClick={() => onFollowUp?.(q)}
              style={{ fontSize:11, padding:"4px 10px", borderRadius:12, background:dark?"#1a1a1a":"#f0f0ea", border:`1px solid ${dark?"#2a2a2a":"#e0e0d8"}`, color:dark?"#aaa":"#555", cursor:"pointer", textAlign:"left", lineHeight:1.3 }}>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyBtn({ text, dark }) {
  const [c, setC] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setC(true); setTimeout(()=>setC(false),2000); }}
      style={{ fontSize:10, padding:"2px 7px", borderRadius:5, background:"transparent", border:`1px solid ${dark?"#333":"#e0e0d8"}`, color:dark?"#666":"#aaa", cursor:"pointer" }}>
      {c ? "Copied" : "Copy"}
    </button>
  );
}

export default function GlobalChat({ dark, currentPage, onNavigate }) {
  const { user, API } = useAuth();
  const [open,          setOpen]          = useState(false);
  const [mode,          setMode]          = useState("general"); // "general" | "client"
  const [clientId,      setClientId]      = useState("");
  const [clients,       setClients]       = useState([]);
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [showCmds,      setShowCmds]      = useState(false);
  const [unread,        setUnread]        = useState(0);
  const bottomRef   = useRef(null);
  const inputRef    = useRef(null);

  const bg2   = dark ? "#111"    : "#ffffff";
  const bg3   = dark ? "#1a1a1a" : "#f0f0ea";
  const bdr   = dark ? "#222"    : "#e0e0d8";
  const txt   = dark ? "#e8e8e8" : "#1a1a18";
  const txt2  = dark ? "#888"    : "#888";

  async function getToken() {
    try { return await user?.getIdToken?.() || ""; } catch { return ""; }
  }

  // Load clients for Client Mode dropdown
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getToken();
        const res   = await fetch(`${API}/api/clients`, { headers: { Authorization: `Bearer ${token}` } });
        const data  = await res.json();
        if (data.clients?.length) setClients(data.clients);
      } catch { /* non-blocking */ }
    })();
  }, [user]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (!open && messages.length > 0 && messages[messages.length-1].role === "ai") {
      setUnread(u => u + 1);
    }
  }, [messages]);

  useEffect(() => { if (open) { setUnread(0); inputRef.current?.focus(); } }, [open]);

  // Detect tool suggestions from AI response
  function detectTool(text) {
    const lower = text.toLowerCase();
    const map = [
      { keywords:["backlink","link building","link profile"], page:"backlink", label:"Backlink Analyzer" },
      { keywords:["rank tracker","keyword position","ranking"], page:"ranktracker", label:"Rank Tracker" },
      { keywords:["competitor gap","competitor keyword"], page:"competitorgap", label:"Competitor Gap" },
      { keywords:["site audit","technical audit"], page:"audit", label:"Site Audit" },
      { keywords:["serp preview","serp simulator","snippet"], page:"serpsimulator", label:"SERP Simulator" },
      { keywords:["meta preview","title tag preview"], page:"metapreview", label:"Meta Previewer" },
      { keywords:["ai writer","write content","generate content"], page:"writer", label:"AI Writer" },
      { keywords:["sitemap","xml sitemap"], page:"sitemap", label:"Sitemap Generator" },
      { keywords:["content calendar","content plan"], page:"calendar", label:"Content Calendar" },
    ];
    for (const t of map) {
      if (t.keywords.some(k => lower.includes(k))) return t;
    }
    return null;
  }

  async function send(text) {
    const raw = text.trim();
    if (!raw || loading) return;

    // Resolve slash commands
    const finalText = SLASH_COMMANDS[raw] || raw;

    setMessages(m => [...m, { role:"user", content: raw === finalText ? raw : `${raw}\n\u2192 ${finalText}`, ts:Date.now() }]);
    setMessages(m => [...m, { role:"ai", content:"", loading:true, ts:Date.now() }]);
    setInput("");
    setLoading(true);
    setShowCmds(false);

    try {
      const token = await getToken();
      const history = messages.filter(m => !m.loading).slice(-8).map(m => ({ role:m.role==="user"?"user":"assistant", content:m.content }));

      let url;
      if (mode === "client" && clientId) {
        url = `${API}/api/chat/${clientId}/chat`;
      } else {
        url = `${API}/api/chat/general`;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ message: finalText, history }),
      });
      const data = await res.json();

      const toolSuggestion = detectTool(data.response || "");

      setMessages(m => {
        const copy = [...m];
        const last = copy.findIndex(x => x.loading);
        if (last !== -1) {
          copy[last] = {
            role: "ai",
            content: data.response || data.error || "No response",
            followUps: data.followUps || [],
            toolSuggestion,
            action: data.action,
            ts: Date.now(),
          };
        }
        return copy;
      });
    } catch (e) {
      setMessages(m => {
        const copy = [...m];
        const last = copy.findIndex(x => x.loading);
        if (last !== -1) copy[last] = { role:"ai", content:"Connection error. Check your API keys in Settings.", followUps:[], ts:Date.now() };
        return copy;
      });
    }
    setLoading(false);
  }

  function handleFollowUp(text) {
    if (text.startsWith("open_tool:")) {
      onNavigate?.(text.replace("open_tool:", ""));
    } else {
      send(text);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
    if (e.key === "/" && !input) setShowCmds(true);
    if (e.key === "Escape") setShowCmds(false);
  }

  const quickPrompts = mode === "client" && clientId ? QUICK_PROMPTS_CLIENT : QUICK_PROMPTS_GENERAL;
  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Bounce animation keyframes */}
      <style>{`
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
      `}</style>

      {/* Floating button */}
      {!open && (
        <button onClick={() => setOpen(true)} style={{
          position:"fixed", bottom:24, right:24, zIndex:9999,
          width:52, height:52, borderRadius:"50%",
          background:`linear-gradient(135deg, ${B}, #6B62E8)`,
          border:"none", cursor:"pointer", boxShadow:"0 4px 20px rgba(68,61,203,0.4)",
          display:"flex", alignItems:"center", justifyContent:"center",
          animation:"pulse 3s ease-in-out infinite",
          transition:"transform 0.2s",
        }}>
          <span style={{ fontSize:22 }}>🤖</span>
          {unread > 0 && (
            <div style={{ position:"absolute", top:0, right:0, width:16, height:16, borderRadius:"50%", background:"#DC2626", color:"#fff", fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {unread}
            </div>
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position:"fixed", bottom:24, right:24, zIndex:9999,
          width:400, height:580, borderRadius:16,
          background:bg2, border:`1px solid ${bdr}`,
          boxShadow:"0 8px 40px rgba(0,0,0,0.25)",
          display:"flex", flexDirection:"column",
          animation:"slideUp 0.25s ease-out",
          overflow:"hidden",
        }}>

          {/* Header */}
          <div style={{ background:`linear-gradient(135deg, ${B}, #6B62E8)`, padding:"12px 16px", flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:18 }}>🤖</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>SEO AI Assistant</div>
                  <div style={{ fontSize:10, color:"#a5b4fc" }}>
                    {loading ? "Thinking..." : mode === "client" && clientId ? `Client: ${clients.find(c=>c.id===clientId)?.name || "Selected"}` : "General SEO Expert"}
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {messages.length > 0 && (
                  <button onClick={() => setMessages([])} title="Clear chat"
                    style={{ background:"transparent", border:"none", color:"#a5b4fc", cursor:"pointer", fontSize:12, padding:"2px 6px" }}>
                    Clear
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  style={{ background:"transparent", border:"none", color:"#fff", cursor:"pointer", fontSize:18, lineHeight:1, padding:"2px 4px" }}>
                  ×
                </button>
              </div>
            </div>

            {/* Mode toggle */}
            <div style={{ display:"flex", gap:6, marginTop:10 }}>
              <button onClick={() => setMode("general")}
                style={{ flex:1, padding:"5px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:600,
                  background: mode==="general" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
                  color: mode==="general" ? "#fff" : "#a5b4fc" }}>
                🌐 General
              </button>
              <button onClick={() => setMode("client")} disabled={clients.length===0}
                style={{ flex:2, padding:"5px", borderRadius:8, border:"none", cursor:clients.length===0?"not-allowed":"pointer", fontSize:11, fontWeight:600,
                  background: mode==="client" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
                  color: mode==="client" ? "#fff" : "#a5b4fc", opacity:clients.length===0?0.5:1 }}>
                🏢 Client Mode
              </button>
            </div>

            {/* Client selector */}
            {mode === "client" && clients.length > 0 && (
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                style={{ width:"100%", marginTop:8, padding:"6px 8px", borderRadius:8, border:"none", background:"rgba(255,255,255,0.15)", color:"#fff", fontSize:12, outline:"none", cursor:"pointer" }}>
                <option value="">— Select a client —</option>
                {clients.map(c => <option key={c.id} value={c.id} style={{ color:"#000" }}>{c.name} {c.seoScore ? `(Score: ${c.seoScore})` : ""}</option>)}
              </select>
            )}
          </div>

          {/* Messages area */}
          <div style={{ flex:1, overflowY:"auto", padding:"14px 14px 4px", display:"flex", flexDirection:"column" }}>
            {isEmpty && (
              <div style={{ margin:"auto", width:"100%" }}>
                <div style={{ textAlign:"center", marginBottom:16 }}>
                  <div style={{ fontSize:32, marginBottom:6 }}>🤖</div>
                  <div style={{ fontSize:13, fontWeight:700, color:txt, marginBottom:4 }}>
                    {mode === "client" && clientId ? "Ask me anything about this client" : "Ask me anything about SEO"}
                  </div>
                  <div style={{ fontSize:11, color:txt2 }}>
                    Type / for slash commands · Supports markdown & code
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {quickPrompts.slice(0, 4).map((p, i) => (
                    <button key={i} onClick={() => send(p)}
                      style={{ textAlign:"left", padding:"8px 12px", borderRadius:10, background:bg3, border:`1px solid ${bdr}`, color:txt2, fontSize:11, cursor:"pointer", lineHeight:1.4 }}>
                      {p}
                    </button>
                  ))}
                </div>

                {/* Slash commands hint */}
                <div style={{ marginTop:12, padding:"8px 12px", background:`${B}10`, borderRadius:10, border:`1px solid ${B}22` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:B, marginBottom:4 }}>⚡ Slash Commands</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                    {Object.keys(SLASH_COMMANDS).map(cmd => (
                      <button key={cmd} onClick={() => send(cmd)}
                        style={{ fontSize:10, padding:"2px 8px", borderRadius:6, background:`${B}15`, color:B, border:`1px solid ${B}33`, cursor:"pointer", fontWeight:600 }}>
                        {cmd}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} dark={dark} onFollowUp={handleFollowUp} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Slash commands dropdown */}
          {showCmds && (
            <div style={{ position:"absolute", bottom:70, left:14, right:14, background:bg2, border:`1px solid ${bdr}`, borderRadius:10, boxShadow:"0 4px 20px rgba(0,0,0,0.15)", overflow:"hidden", zIndex:10 }}>
              {Object.entries(SLASH_COMMANDS).map(([cmd, desc]) => (
                <button key={cmd} onClick={() => { setInput(cmd); setShowCmds(false); inputRef.current?.focus(); }}
                  style={{ width:"100%", display:"flex", gap:10, padding:"8px 12px", background:"transparent", border:"none", cursor:"pointer", textAlign:"left", borderBottom:`1px solid ${bdr}` }}>
                  <span style={{ fontSize:11, fontWeight:700, color:B, minWidth:70 }}>{cmd}</span>
                  <span style={{ fontSize:11, color:txt2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{desc.slice(0, 50)}...</span>
                </button>
              ))}
            </div>
          )}

          {/* Input area */}
          <div style={{ padding:"10px 12px", borderTop:`1px solid ${bdr}`, flexShrink:0, background:bg2 }}>
            <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => { setInput(e.target.value); if (e.target.value === "/") setShowCmds(true); else if (!e.target.value.startsWith("/")) setShowCmds(false); }}
                onKeyDown={handleKeyDown}
                placeholder={mode === "client" && clientId ? "Ask about this client's SEO..." : "Ask any SEO question... (/ for commands)"}
                rows={1}
                style={{ flex:1, padding:"9px 12px", borderRadius:10, border:`1px solid ${bdr}`, background:bg3, color:txt, fontSize:13, outline:"none", resize:"none", fontFamily:"inherit", lineHeight:1.4, maxHeight:80, overflowY:"auto" }}
              />
              <button onClick={() => send(input)} disabled={loading || !input.trim()}
                style={{ padding:"9px 14px", borderRadius:10, background: loading||!input.trim() ? (dark?"#1a1a1a":"#e5e5e5") : B, color: loading||!input.trim() ? (dark?"#444":"#aaa") : "#fff", border:"none", cursor: loading||!input.trim() ? "not-allowed":"pointer", fontSize:14, fontWeight:700, flexShrink:0 }}>
                {loading ? "..." : "↑"}
              </button>
            </div>
            <div style={{ fontSize:10, color:txt2, marginTop:5, textAlign:"center" }}>
              Enter to send · Shift+Enter new line · / for commands
            </div>
          </div>
        </div>
      )}
    </>
  );
}
