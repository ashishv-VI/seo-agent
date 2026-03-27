export default function Markdown({ text, dark }) {
  const lines = text.split("\n");
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // H1
    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} style={{ fontSize:18, fontWeight:700, color: dark?"#fff":"#111", margin:"16px 0 8px", borderBottom: dark?"1px solid #333":"1px solid #ddd", paddingBottom:6 }}>{parseLine(line.slice(2))}</h1>);
    }
    // H2
    else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} style={{ fontSize:15, fontWeight:600, color: dark?"#e8e8e8":"#222", margin:"14px 0 6px" }}>{parseLine(line.slice(3))}</h2>);
    }
    // H3
    else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} style={{ fontSize:13, fontWeight:600, color: dark?"#ccc":"#333", margin:"10px 0 4px" }}>{parseLine(line.slice(4))}</h3>);
    }
    // HR
    else if (line.match(/^━+$/) || line.match(/^─+$/) || line.match(/^=+$/)) {
      elements.push(<hr key={i} style={{ border:"none", borderTop: dark?"1px solid #333":"1px solid #ddd", margin:"10px 0" }} />);
    }
    // Bullet list
    else if (line.match(/^[\-\*•] /)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^[\-\*•] /)) {
        items.push(<li key={i} style={{ margin:"3px 0", lineHeight:1.6 }}>{parseLine(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} style={{ paddingLeft:20, margin:"6px 0", color: dark?"#ccc":"#444" }}>{items}</ul>);
      continue;
    }
    // Numbered list
    else if (line.match(/^\d+\. /)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(<li key={i} style={{ margin:"4px 0", lineHeight:1.6 }}>{parseLine(lines[i].replace(/^\d+\. /, ""))}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} style={{ paddingLeft:22, margin:"6px 0", color: dark?"#ccc":"#444" }}>{items}</ol>);
      continue;
    }
    // Code block
    else if (line.startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} style={{ background: dark?"#0d0d0d":"#f5f5f5", border: dark?"1px solid #333":"1px solid #ddd", borderRadius:8, padding:"12px 14px", fontSize:12, overflowX:"auto", margin:"8px 0", lineHeight:1.6, color: dark?"#a8e6cf":"#2d6a4f", fontFamily:"monospace" }}>
          {codeLines.join("\n")}
        </pre>
      );
    }
    // Blockquote
    else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} style={{ borderLeft: dark?"3px solid #443DCB":"3px solid #443DCB", paddingLeft:12, margin:"6px 0", color: dark?"#aaa":"#555", fontStyle:"italic", fontSize:13 }}>
          {parseLine(line.slice(2))}
        </blockquote>
      );
    }
    // Empty line
    else if (line.trim() === "") {
      elements.push(<div key={i} style={{ height:6 }} />);
    }
    // Normal paragraph
    else {
      elements.push(
        <p key={i} style={{ margin:"3px 0", lineHeight:1.75, color: dark?"#e0e0e0":"#333", fontSize:13 }}>
          {parseLine(line)}
        </p>
      );
    }
    i++;
  }

  return <div style={{ fontSize:13 }}>{elements}</div>;
}

function parseLine(text) {
  if (!text) return "";
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold+Italic
    const biMatch = remaining.match(/^(.*?)\*\*\*(.*?)\*\*\*/s);
    if (biMatch && biMatch[1] !== undefined) {
      if (biMatch[1]) parts.push(<span key={key++}>{biMatch[1]}</span>);
      parts.push(<strong key={key++}><em>{biMatch[2]}</em></strong>);
      remaining = remaining.slice(biMatch[0].length);
      continue;
    }
    // Bold
    const bMatch = remaining.match(/^(.*?)\*\*(.*?)\*\*/s);
    if (bMatch && bMatch[1] !== undefined) {
      if (bMatch[1]) parts.push(<span key={key++}>{bMatch[1]}</span>);
      parts.push(<strong key={key++} style={{ fontWeight:600 }}>{bMatch[2]}</strong>);
      remaining = remaining.slice(bMatch[0].length);
      continue;
    }
    // Italic
    const iMatch = remaining.match(/^(.*?)\*(.*?)\*/s);
    if (iMatch && iMatch[1] !== undefined) {
      if (iMatch[1]) parts.push(<span key={key++}>{iMatch[1]}</span>);
      parts.push(<em key={key++}>{iMatch[2]}</em>);
      remaining = remaining.slice(iMatch[0].length);
      continue;
    }
    // Inline code
    const cMatch = remaining.match(/^(.*?)`(.*?)`/s);
    if (cMatch && cMatch[1] !== undefined) {
      if (cMatch[1]) parts.push(<span key={key++}>{cMatch[1]}</span>);
      parts.push(<code key={key++} style={{ background:"#443DCB22", color:"#6B62E8", padding:"1px 5px", borderRadius:4, fontSize:12, fontFamily:"monospace" }}>{cMatch[2]}</code>);
      remaining = remaining.slice(cMatch[0].length);
      continue;
    }
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }
  return parts;
}