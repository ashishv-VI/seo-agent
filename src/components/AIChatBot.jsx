import { useState, useRef, useEffect } from "react";

const SUGGESTIONS = [
  { icon: "📊", text: "What is my current health score?" },
  { icon: "🔴", text: "Show my top critical issues" },
  { icon: "🎯", text: "What should I fix first this week?" },
  { icon: "🔍", text: "Show content gap keywords" },
  { icon: "✍️", text: "Write a meta description for my homepage" },
  { icon: "🚀", text: "Run full SEO analysis now" },
];

export default function AIChatBot({ dark, clientId, getToken, API }) {
  const [open,    setOpen]    = useState(false);
  const [messages,setMessages]= useState([]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  const B   = "#443DCB";
  const bg  = dark ? "#0f0f18" : "#ffffff";
  const bg2 = dark ? "#1a1a28" : "#f5f7ff";
  const bdr = dark ? "#2a2a40" : "#e0e4f0";
  const txt = dark ? "#e8e8f0" : "#1a1a18";
  const mt  = dark ? "#888"    : "#777";

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: "Hey! Main aapka SEO Expert AI hun 🤖\n\nMujhe is client ka pura data pata hai — health score, issues, keywords, competitors sab kuch.\n\nKuch bhi pucho ya neeche se quick question select karo!",
        time: new Date(),
      }]);
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");
    const userMsg = { role: "user", content: msg, time: new Date() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setLoading(true);

    try {
      const token   = await getToken();
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const res     = await fetch(`${API}/api/chat/${clientId}`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ message: msg, history }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role:    "assistant",
        content: data.response || data.error || "Kuch gadbad ho gayi, dobara try karo.",
        action:  data.action  || null,
        meta:    data.meta    || null,
        time:    new Date(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant", content: "Connection error. Please try again.", time: new Date(),
      }]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function MsgBubble({ m }) {
    const isUser = m.role === "user";
    const lines  = (m.content || "").split("\n");
    return (
      <div style={{ display:"flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom:14, alignItems:"flex-end", gap:8 }}>
        {!isUser && (
          <div style={{
            width:30, height:30, borderRadius:"50%", flexShrink:0,
            background:`linear-gradient(135deg,${B},#3730b8)`,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:14,
          }}>🤖</div>
        )}
        <div style={{ maxWidth:"78%" }}>
          <div style={{
            padding:"10px 14px",
            borderRadius: isUser ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
            background:   isUser ? `linear-gradient(135deg,${B},#3730b8)` : bg2,
            color:        isUser ? "#fff" : txt,
            fontSize:13, lineHeight:1.65,
            border: isUser ? "none" : `1px solid ${bdr}`,
            boxShadow: isUser ? `0 2px 12px rgba(68,61,203,0.3)` : "none",
          }}>
            {lines.map((line,i) => {
              if (!line) return <div key={i} style={{height:4}}/>;
              if (line.match(/^[-•]\s/)) return <div key={i} style={{paddingLeft:8,marginBottom:2}}>{line}</div>;
              if (line.match(/^\d+\.\s/)) return <div key={i} style={{paddingLeft:8,marginBottom:2}}>{line}</div>;
              // bold **text**
              const parts = line.split(/\*\*([^*]+)\*\*/g);
              return (
                <div key={i} style={{marginBottom:2}}>
                  {parts.map((p,j) => j%2===1 ? <strong key={j}>{p}</strong> : p)}
                </div>
              );
            })}
            {m.action && (
              <div style={{ marginTop:10, padding:"7px 10px", borderRadius:8, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", fontSize:11, color: isUser ? "#fff" : B, fontWeight:700 }}>
                {m.action.type === "run_pipeline" ? "🚀 Pipeline started in background!" : `✅ ${m.action.type} executed`}
              </div>
            )}
          </div>
          <div style={{ fontSize:10, color:mt, marginTop:3, textAlign: isUser ? "right" : "left", paddingLeft:4 }}>
            {m.time?.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}
          </div>
        </div>
        {isUser && (
          <div style={{
            width:30, height:30, borderRadius:"50%", flexShrink:0,
            background:"#424143", display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, color:"#fff", fontWeight:700,
          }}>U</div>
        )}
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes chatSlideUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes dotBounce   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes fabPulse    { 0%,100%{box-shadow:0 4px 24px rgba(68,61,203,0.5)} 50%{box-shadow:0 4px 40px rgba(68,61,203,0.8)} }
      `}</style>

      {/* ── Floating Button ─────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="SEO Expert AI"
        style={{
          position:"fixed", bottom:24, right:24, zIndex:9001,
          width:58, height:58, borderRadius:"50%", border:"none",
          background:`linear-gradient(135deg,${B},#3730b8)`,
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:24, transition:"transform .25s ease",
          transform: open ? "rotate(45deg) scale(1.05)" : "scale(1)",
          animation: open ? "none" : "fabPulse 3s ease infinite",
        }}
      >
        {open ? "✕" : "🤖"}
      </button>

      {/* ── Chat Panel ──────────────────────────────────── */}
      {open && (
        <div style={{
          position:"fixed", bottom:96, right:24, zIndex:9000,
          width:390, height:600, borderRadius:22,
          background:bg, border:`1px solid ${bdr}`,
          boxShadow:`0 24px 80px rgba(0,0,0,${dark?"0.7":"0.18"})`,
          display:"flex", flexDirection:"column", overflow:"hidden",
          animation:"chatSlideUp .25s ease",
        }}>

          {/* Header */}
          <div style={{
            padding:"14px 18px",
            background:`linear-gradient(135deg,${B},#3730b8)`,
            display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0,
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{
                width:38, height:38, borderRadius:"50%",
                background:"rgba(255,255,255,0.15)", backdropFilter:"blur(4px)",
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:18,
              }}>🤖</div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:"#fff" }}>SEO Expert AI</div>
                <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"rgba(255,255,255,0.75)" }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:"#4ade80" }}/>
                  Online · Client data loaded
                </div>
              </div>
            </div>
            <button
              onClick={() => { setMessages([]); }}
              title="Clear chat"
              style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, padding:"4px 10px", color:"#fff", cursor:"pointer", fontSize:11, fontWeight:600 }}
            >Clear</button>
          </div>

          {/* Messages area */}
          <div style={{ flex:1, overflowY:"auto", padding:"14px 14px 6px", scrollbarWidth:"thin" }}>

            {messages.map((m, i) => <MsgBubble key={i} m={m} />)}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display:"flex", alignItems:"flex-end", gap:8, marginBottom:14 }}>
                <div style={{ width:30, height:30, borderRadius:"50%", background:`linear-gradient(135deg,${B},#3730b8)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🤖</div>
                <div style={{ padding:"12px 16px", background:bg2, borderRadius:"4px 18px 18px 18px", border:`1px solid ${bdr}` }}>
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{
                        width:8, height:8, borderRadius:"50%", background:B,
                        animation:`dotBounce .8s ease ${i*0.18}s infinite`,
                      }}/>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Suggestion chips — only on first open */}
            {messages.length <= 1 && !loading && (
              <div style={{ marginTop:8 }}>
                <div style={{ fontSize:11, color:mt, textAlign:"center", marginBottom:10 }}>— Quick Questions —</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                  {SUGGESTIONS.map((s,i) => (
                    <button key={i} onClick={() => send(s.text)} style={{
                      padding:"6px 11px", borderRadius:20, border:`1px solid ${bdr}`,
                      background:bg2, color:txt, fontSize:11, cursor:"pointer",
                      display:"flex", alignItems:"center", gap:5,
                      transition:"border-color .15s, background .15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = B; e.currentTarget.style.background = dark ? "#1e1e30" : "#eef2ff"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = bdr; e.currentTarget.style.background = bg2; }}
                    >
                      <span>{s.icon}</span>{s.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{ padding:"12px 14px 14px", borderTop:`1px solid ${bdr}`, flexShrink:0 }}>
            <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Kuch bhi pucho SEO ke baare mein..."
                rows={1}
                style={{
                  flex:1, padding:"10px 13px", borderRadius:14,
                  border:`1.5px solid ${input.trim() ? B : bdr}`,
                  background:bg2, color:txt, fontSize:13,
                  resize:"none", outline:"none", fontFamily:"inherit", lineHeight:1.5,
                  transition:"border-color .2s",
                }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                style={{
                  width:42, height:42, borderRadius:"50%", border:"none", flexShrink:0,
                  background: input.trim() && !loading ? `linear-gradient(135deg,${B},#3730b8)` : bdr,
                  color:"#fff", cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  fontSize:18, display:"flex", alignItems:"center", justifyContent:"center",
                  transition:"background .2s, transform .1s",
                  transform: input.trim() && !loading ? "scale(1.05)" : "scale(1)",
                }}
              >➤</button>
            </div>
            <div style={{ fontSize:10, color:mt, textAlign:"center", marginTop:7 }}>
              Enter = send · Shift+Enter = new line
            </div>
          </div>
        </div>
      )}
    </>
  );
}
