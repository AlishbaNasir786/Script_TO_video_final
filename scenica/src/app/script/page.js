"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Script() {
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("screenplay");
  const [selectedScene, setSelectedScene] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const stored = sessionStorage.getItem("scenicaResult");
    if (!stored) { router.push("/"); return; }
    setResult(JSON.parse(stored));
  }, []);

  if (!result) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(145deg,#1A3636,#162d2d)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#D6BD98", fontSize: "18px", fontFamily: "Georgia,serif" }}>Loading screenplay...</div>
    </div>
  );

  const { characters, screenplay, scenes, genre, tone } = result;

  function ec() {
    return "#D6BD98";
  }

  function cleanLine(text) {
    return text
      .replace(/<center>\s*([^<]+?)\s*<\/center>/gi, "$1")
      .replace(/^>\s*/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();
  }

  const renderScreenplay = () => {
    const lines = screenplay.split("\n");
    return lines.map((rawLine, i) => {
      const line = cleanLine(rawLine);
      if (!line) return <div key={i} style={{ height: "14px" }} />;

      if (line.match(/^(FADE IN:|FADE OUT\.|CUT TO:|SMASH CUT:|DISSOLVE TO:)/i)) {
        return (
          <div key={i} style={{ fontSize: "12px", color: "rgba(214,189,152,0.5)", fontFamily: "'Courier New',monospace", letterSpacing: "0.08em", textTransform: "uppercase", margin: "16px 0 4px", textAlign: line.startsWith("FADE IN") ? "left" : "right", fontStyle: "italic" }}>
            {line}
          </div>
        );
      }

      if (line.match(/^(INT\.|EXT\.|INT\/EXT\.)/i)) {
        return (
          <div key={i} style={{ fontSize: "13px", fontWeight: "700", color: "#D6BD98", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "32px", marginBottom: "10px", fontFamily: "'Courier New',monospace", padding: "8px 14px", background: "rgba(64,83,76,0.4)", borderLeft: "3px solid #D6BD98", borderRadius: "0 8px 8px 0" }}>
            {line}
          </div>
        );
      }

      if (line.match(/^\[EMOTION:/i)) {
        const m = line.match(/\[EMOTION:\s*([^\]]+)\]/i);
        const emotion = m ? m[1].trim() : "neutral";
        return (
          <div key={i} style={{ display: "flex", justifyContent: "center", margin: "4px 0 10px" }}>
            <span style={{ padding: "2px 12px", borderRadius: "12px", fontSize: "10px", fontFamily: "system-ui", background: "rgba(64,83,76,0.4)", color: "#D6BD98", border: "1px solid rgba(103,125,106,0.3)", letterSpacing: "0.06em", textTransform: "capitalize" }}>
              {emotion}
            </span>
          </div>
        );
      }

      if (line.match(/^[A-Z][A-Z\s''\-\.]{1,}$/) && line.length < 45 && !line.match(/^(INT\.|EXT\.|FADE|CUT TO|SMASH|DISSOLVE)/i)) {
        return (
          <div key={i} style={{ fontSize: "13px", fontWeight: "700", color: "#D6BD98", letterSpacing: "0.1em", textAlign: "center", marginTop: "22px", marginBottom: "2px", fontFamily: "'Courier New',monospace" }}>
            {line}
          </div>
        );
      }

      if (line.startsWith("(") && line.endsWith(")")) {
        return (
          <div key={i} style={{ fontSize: "13px", color: "rgba(214,189,152,0.6)", fontStyle: "italic", textAlign: "center", fontFamily: "'Courier New',monospace", marginBottom: "3px" }}>
            {line}
          </div>
        );
      }

      const clean = line.replace(/\[EMOTION:[^\]]+\]/gi, "").trim();
      if (!clean) return null;

      const isAction = !!clean.match(/^[A-Z][a-z]/);
      return (
        <div key={i} style={{
          fontSize: isAction ? "14px" : "15px",
          color: isAction ? "rgba(214,189,152,0.6)" : "#D6BD98",
          lineHeight: "1.78",
          fontFamily: "'Georgia',serif",
          fontStyle: isAction ? "italic" : "normal",
          marginBottom: "3px",
          maxWidth: isAction ? "580px" : "500px",
          margin: "0 auto 3px"
        }}>
          {clean}
        </div>
      );
    });
  };

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(145deg,#1A3636 0%,#162d2d 25%,#1A3636 50%,#142b2b 75%,#0f2222 100%)", fontFamily: "'Georgia',serif", color: "#D6BD98", position: "relative" }}>
      <style>{`
        @keyframes shimmer{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:#1A3636}
        ::-webkit-scrollbar-thumb{background:#40534C;border-radius:3px}
        .scene-item:hover{border-color:#D6BD98!important;background:rgba(64,83,76,0.4)!important}
      `}</style>

      <div style={{ position: "fixed", top: "-180px", left: "50%", transform: "translateX(-50%)", width: "800px", height: "600px", background: "radial-gradient(ellipse,rgba(103,125,106,0.2) 0%,transparent 65%)", pointerEvents: "none", zIndex: 0 }} />

      {/* NAV */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 56px", borderBottom: "2.5px solid rgba(103,125,106,0.6)", position: "sticky", top: 0, zIndex: 50, background: "rgba(26,54,54,0.85)", backdropFilter: "blur(24px)" }}>
        <div style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "0.16em", backgroundImage: "linear-gradient(90deg,#D6BD98,#677D6A,#D6BD98,#677D6A,#D6BD98)", backgroundSize: "300% 300%", animation: "shimmer 5s ease infinite", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textTransform: "uppercase", cursor: "pointer" }} onClick={() => router.push("/")}>Scenica</div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => router.push("/characters")} style={{ padding: "10px 20px", background: "rgba(64,83,76,0.4)", border: "2px solid rgba(103,125,106,0.5)", borderRadius: "30px", color: "#D6BD98", fontSize: "13px", cursor: "pointer", fontFamily: "system-ui", letterSpacing: "0.04em", transition: "all 0.24s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#D6BD98"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(103,125,106,0.5)"; }}>
            ← Characters
          </button>
          <button onClick={() => router.push("/player")} style={{ padding: "10px 24px", background: "linear-gradient(135deg,#40534C,#677D6A)", border: "2.5px solid #D6BD98", borderRadius: "30px", color: "#D6BD98", fontSize: "13px", cursor: "pointer", fontFamily: "system-ui", fontWeight: "600", boxShadow: "0 4px 20px rgba(26,54,54,0.5)", letterSpacing: "0.04em", transition: "all 0.24s" }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 32px rgba(103,125,106,0.6)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(26,54,54,0.5)"; e.currentTarget.style.transform = "translateY(0)"; }}>
            ▶ Play Cinematic
          </button>
        </div>
      </nav>

      {/* HEADER */}
      <section style={{ maxWidth: "960px", margin: "0 auto", padding: "48px 32px 28px", animation: "fadeIn 0.7s ease forwards" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "11px", letterSpacing: "0.18em", color: "#D6BD98", border: "2.5px solid rgba(103,125,106,0.5)", padding: "5px 15px", borderRadius: "20px", marginBottom: "18px", textTransform: "uppercase", background: "rgba(64,83,76,0.4)" }}>
          <span>✦</span> Professional Screenplay
        </div>
        <h1 style={{ fontSize: "clamp(28px,4vw,46px)", fontWeight: "300", letterSpacing: "-0.02em", color: "#D6BD98", marginBottom: "16px" }}>
          Your <span style={{ backgroundImage: "linear-gradient(135deg,#D6BD98,#677D6A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontStyle: "italic" }}>screenplay</span>
        </h1>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {[genre, tone, `${characters.length} Characters`, `${scenes?.length || 0} Scenes`].map((tag, i) => (
            <span key={i} style={{ padding: "5px 14px", borderRadius: "20px", background: "rgba(64,83,76,0.4)", border: "2px solid rgba(103,125,106,0.5)", fontSize: "12px", color: "#D6BD98", fontFamily: "system-ui" }}>
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* TABS */}
      <section style={{ maxWidth: "960px", margin: "0 auto", padding: "0 32px 20px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          {[["screenplay", "✍️ Full Screenplay"], ["scenes", "🎬 Scene Breakdown"]].map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: "10px 24px", borderRadius: "30px", border: `2.5px solid ${activeTab === tab ? "#D6BD98" : "rgba(103,125,106,0.5)"}`, background: activeTab === tab ? "rgba(64,83,76,0.6)" : "rgba(40,65,65,0.4)", color: "#D6BD98", fontSize: "13px", cursor: "pointer", transition: "all 0.2s", fontFamily: "system-ui", fontWeight: "500", letterSpacing: "0.04em" }}>
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* CONTENT */}
      <section style={{ maxWidth: "960px", margin: "0 auto", padding: "0 32px 80px" }}>

        {/* FULL SCREENPLAY */}
        {activeTab === "screenplay" && (
          <div style={{ background: "rgba(40,65,65,0.4)", border: "2.5px solid rgba(103,125,106,0.5)", borderRadius: "24px", padding: "52px 64px", backdropFilter: "blur(20px)", animation: "fadeIn 0.5s ease forwards" }}>
            <div style={{ maxWidth: "600px", margin: "0 auto" }}>
              {renderScreenplay()}
            </div>
          </div>
        )}

        {/* SCENE BREAKDOWN */}
        {activeTab === "scenes" && (
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "20px", animation: "fadeIn 0.5s ease forwards" }}>

            {/* Scene list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {(scenes || []).map((scene, i) => (
                <div key={i} className="scene-item" onClick={() => setSelectedScene(i)} style={{ padding: "14px 16px", borderRadius: "14px", cursor: "pointer", background: selectedScene === i ? "rgba(64,83,76,0.6)" : "rgba(40,65,65,0.3)", border: `2.5px solid ${selectedScene === i ? "#D6BD98" : "rgba(103,125,106,0.4)"}`, transition: "all 0.2s" }}>
                  <div style={{ fontSize: "10px", color: "#677D6A", fontFamily: "system-ui", letterSpacing: "0.08em", marginBottom: "4px", textTransform: "uppercase" }}>Scene {scene.id}</div>
                  <div style={{ fontSize: "13px", color: selectedScene === i ? "#D6BD98" : "rgba(214,189,152,0.8)", fontFamily: "system-ui", lineHeight: "1.4", marginBottom: "4px" }}>{scene.location}</div>
                  <div style={{ fontSize: "11px", color: "rgba(214,189,152,0.5)", fontFamily: "system-ui" }}>{scene.timeOfDay} · {scene.dialogue?.length || 0} lines</div>
                  <span style={{ display: "inline-block", marginTop: "6px", padding: "2px 8px", borderRadius: "8px", fontSize: "10px", fontFamily: "system-ui", background: "rgba(64,83,76,0.4)", color: "#D6BD98", border: "2px solid rgba(103,125,106,0.4)", textTransform: "capitalize" }}>
                    {scene.emotion}
                  </span>
                </div>
              ))}
            </div>

            {/* Scene detail */}
            {scenes && scenes[selectedScene] && (
              <div style={{ background: "rgba(40,65,65,0.4)", border: "2.5px solid rgba(103,125,106,0.5)", borderRadius: "20px", padding: "32px", backdropFilter: "blur(20px)" }}>
                <div style={{ fontSize: "11px", color: "#677D6A", fontFamily: "system-ui", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "6px" }}>Scene {scenes[selectedScene].id}</div>
                <div style={{ fontSize: "18px", fontWeight: "600", color: "#D6BD98", fontFamily: "'Courier New',monospace", marginBottom: "4px" }}>{scenes[selectedScene].heading}</div>
                <div style={{ fontSize: "13px", color: "rgba(214,189,152,0.5)", fontFamily: "system-ui", marginBottom: "22px" }}>{scenes[selectedScene].timeOfDay}</div>

                {scenes[selectedScene].action && (
                  <div style={{ fontSize: "14px", color: "rgba(214,189,152,0.8)", lineHeight: "1.78", marginBottom: "24px", fontStyle: "italic", padding: "16px 18px", background: "rgba(26,54,54,0.4)", borderRadius: "10px", borderLeft: "3px solid #677D6A" }}>
                    {scenes[selectedScene].action}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {(scenes[selectedScene].dialogue || []).map((line, i) => (
                    <div key={i} style={{ background: "rgba(26,54,54,0.4)", border: "2px solid rgba(103,125,106,0.4)", borderLeft: "4px solid #D6BD98", borderRadius: "10px", padding: "14px 16px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "700", color: "#D6BD98", fontFamily: "'Courier New',monospace", letterSpacing: "0.08em", marginBottom: "5px" }}>{line.character}</div>
                      {line.parenthetical && <div style={{ fontSize: "12px", color: "rgba(214,189,152,0.5)", fontStyle: "italic", marginBottom: "5px", fontFamily: "system-ui" }}>({line.parenthetical})</div>}
                      <div style={{ fontSize: "15px", color: "#D6BD98", lineHeight: "1.68", marginBottom: "8px", fontFamily: "'Georgia', serif" }}>"{line.text}"</div>
                      <span style={{ padding: "2px 9px", borderRadius: "10px", fontSize: "10px", fontFamily: "system-ui", background: "rgba(64,83,76,0.4)", color: "#D6BD98", border: "2px solid rgba(103,125,106,0.4)", textTransform: "capitalize" }}>{line.emotion}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* BOTTOM */}
      <section style={{ maxWidth: "960px", margin: "0 auto", padding: "0 32px 80px", display: "flex", gap: "14px", justifyContent: "center" }}>
        <button onClick={() => router.push("/characters")} style={{ padding: "13px 30px", background: "rgba(64,83,76,0.4)", border: "2px solid rgba(103,125,106,0.5)", borderRadius: "30px", color: "#D6BD98", fontSize: "14px", cursor: "pointer", fontFamily: "system-ui", fontWeight: "500", letterSpacing: "0.04em", transition: "all 0.24s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#D6BD98"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(103,125,106,0.5)"; }}>
          ← Back to Characters
        </button>
        <button onClick={() => router.push("/player")} style={{ padding: "13px 30px", background: "linear-gradient(135deg,#40534C,#677D6A)", border: "2.5px solid #D6BD98", borderRadius: "30px", color: "#D6BD98", fontSize: "14px", cursor: "pointer", fontFamily: "system-ui", fontWeight: "600", letterSpacing: "0.04em", boxShadow: "0 6px 28px rgba(26,54,54,0.5)", transition: "all 0.24s" }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 8px 40px rgba(103,125,106,0.6)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 6px 28px rgba(26,54,54,0.5)"; e.currentTarget.style.transform = "translateY(0)"; }}>
          ▶ Play Cinematic Experience
        </button>
      </section>
    </main>
  );
}