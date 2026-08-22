"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const [story, setStory] = useState("");
  const [scriptStyle, setScriptStyle] = useState("");
  const [toneStyle, setToneStyle] = useState("");
  const [purposeMode, setPurposeMode] = useState(""); // "marketing" | "story" | ""
  const [showCharacter, setShowCharacter] = useState(true); // marketing mode toggle
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [loadingStep, setLoadingStep] = useState("");

  // Auth State
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [user, setUser] = useState<any>(null);
  const [authError, setAuthError] = useState<string>("");
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authMessage, setAuthMessage] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setAuthLoading(true);

    try {
      if (authMode === "signup") {
        // 1. Register Account in Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() || email.split("@")[0] }
          }
        });
        if (error) throw error;

        // 2. Insert Profile Record into user_profiles Database Table
        if (data.user) {
          await supabase.from("user_profiles").upsert({
            id: data.user.id,
            email: data.user.email,
            full_name: fullName.trim() || email.split("@")[0],
            created_at: new Date().toISOString(),
            last_sign_in_at: new Date().toISOString()
          }, { onConflict: "id" });
        }

        if (data.user && !data.session) {
          setAuthMessage("Passport Created! Please check your email to confirm registration.");
        } else {
          setAuthMessage("Passport Created & Synchronized Successfully!");
          setUser(data.user);
          setTimeout(() => setAuthModalOpen(false), 1200);
        }
      } else {
        // 1. Sign In & Verify Credentials dynamically against Database
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // 2. Sync Last Sign In timestamp in user_profiles Table
        if (data.user) {
          await supabase.from("user_profiles").upsert({
            id: data.user.id,
            email: data.user.email,
            last_sign_in_at: new Date().toISOString()
          }, { onConflict: "id" });
        }

        setAuthMessage("Authenticated! Welcome to your Creator Passport.");
        setUser(data.user);
        setTimeout(() => setAuthModalOpen(false), 1000);
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed. Please check your credentials.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // Suggestions state
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState<boolean>(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState<boolean>(false);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [suggestError, setSuggestError] = useState<string>("");

  const suggestTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const scriptStyles = [
    {
      id: "hollywood",
      label: "Hollywood Film",
      icon: "🎬",
      desc: "Feature-length format, cinematic action lines, dramatic scene structure"
    },
    {
      id: "shortfilm",
      label: "Short Film",
      icon: "🎞️",
      desc: "5 tight scenes max, punchy dialogue, single emotional arc"
    },
    {
      id: "tvepisode",
      label: "TV Episode",
      icon: "📺",
      desc: "Longer scenes, subplots, cliffhanger ending, ensemble dialogue"
    },
    {
      id: "stageplay",
      label: "Stage Play",
      icon: "🎭",
      desc: "Minimal locations, intimate dialogue-driven, theatrical language"
    }
  ];

  const toneStyles = [
    {
      id: "intense",
      label: "Intense & Dark",
      icon: "🌑",
      desc: "Heavy dramatic weight, raw dialogue, unresolved tension"
    },
    {
      id: "warm",
      label: "Light & Warm",
      icon: "☀️",
      desc: "Hopeful register, softer emotional beats, uplifting resolution"
    },
    {
      id: "suspenseful",
      label: "Suspenseful",
      icon: "⚡",
      desc: "Information withheld, slow reveals, mounting dread in each scene"
    },
    {
      id: "poetic",
      label: "Poetic & Literary",
      icon: "✨",
      desc: "Metaphorical language, lyrical action lines, symbolic dialogue"
    }
  ];

  const purposeModes = [
    {
      id: "marketing",
      icon: "💼",
      label: "Marketing & Commercial",
      sublabel: "Professional",
      desc: "Brand stories, product demos & persuasive commercial scripts",
      gradient: "linear-gradient(135deg, #D6BD98, #677D6A, #D6BD98)",
      border: "#677D6A",
      bg: "linear-gradient(135deg, rgba(64,83,76,0.6), rgba(103,125,106,0.3))",
      glow: "0 0 32px rgba(214,189,152,0.25)",
      placeholder: "Describe your product, brand, or service... Tell me what you're promoting, who your target audience is, what problem you solve, and what feeling you want the viewer to walk away with. The richer your brief, the more compelling the commercial.",
    },
    {
      id: "story",
      icon: "🎭",
      label: "Story & Narrative",
      sublabel: "Cinematic",
      desc: "Emotional screenplays, character-driven drama & cinematic storytelling",
      gradient: "linear-gradient(135deg, #D6BD98, #677D6A, #D6BD98)",
      border: "#D6BD98",
      bg: "linear-gradient(135deg, rgba(64,83,76,0.6), rgba(103,125,106,0.3))",
      glow: "0 0 32px rgba(214,189,152,0.25)",
      placeholder: "Describe your story... Tell me about your characters — their names, appearance, personalities, the clothes they wear, the places they inhabit, and how the story unfolds from beginning to end. The richer your description, the more cinematic the result.",
    },
  ];

  const selectedMode = purposeModes.find(m => m.id === purposeMode);
  const textareaPlaceholder = selectedMode?.placeholder ||
    "First select a purpose above, then describe your script — characters, setting, story arc, and what you want the audience to feel...";

  const handleGenreCardClick = () => {
    setTimeout(() => {
      document.getElementById("story-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // Fetch AI enhancement suggestions
  const fetchSuggestions = async (text: string) => {
    if (!text || text.trim().length < 30) return;
    setSuggestError("");
    setIsFetchingSuggestions(true);
    setSuggestionsOpen(true);
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story: text, purposeMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate suggestions.");
      setSuggestions(data.suggestions || []);
    } catch (err: any) {
      setSuggestError(err.message || "Could not load suggestions.");
      setSuggestions([]);
    } finally {
      setIsFetchingSuggestions(false);
    }
  };

  const handleAcceptSuggestion = (suggestion: any) => {
    setAcceptedIds(prev => new Set([...prev, suggestion.id]));
    setStory(prev => {
      const sep = prev.trim().endsWith(".") || prev.trim().endsWith("?") || prev.trim().endsWith("!") ? " " : ". ";
      return prev.trim() + sep + suggestion.addedText;
    });
  };

  const handleStoryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setStory(e.target.value);
    if (suggestions.length > 0) {
      setSuggestions([]);
      setAcceptedIds(new Set());
      setSuggestionsOpen(false);
    }
  };

  const handleGenerate = async () => {
    if (!story.trim()) return;
    setError("");
    setIsGenerating(true);

    try {
      if (purposeMode === "marketing") {
        setLoadingStep("Analysing your brief...");
        await new Promise(r => setTimeout(r, 600));
        setLoadingStep("Writing your commercial script...");

        const response = await fetch("/api/generate-marketing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productDescription: story, showCharacter })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Something went wrong.");

        setLoadingStep("Preparing your commercial experience...");
        await new Promise(r => setTimeout(r, 600));

        sessionStorage.setItem("scenicaResult", JSON.stringify(data));
        sessionStorage.setItem("scenicaStory", story);
               router.push(showCharacter ? "/characters" : "/script");
      } else {
        setLoadingStep("Analysing your story...");
        await new Promise(r => setTimeout(r, 800));
        setLoadingStep("Extracting characters...");
        await new Promise(r => setTimeout(r, 600));
        setLoadingStep("Writing your screenplay...");

        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ story, scriptStyle, toneStyle, purposeMode })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Something went wrong.");

        setLoadingStep("Preparing your cinematic experience...");
        await new Promise(r => setTimeout(r, 600));

        sessionStorage.setItem("scenicaResult", JSON.stringify(data));
        sessionStorage.setItem("scenicaStory", story);
        router.push("/characters");
      }

    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setIsGenerating(false);
      setLoadingStep("");
    }
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(145deg, #1A3636 0%, #162d2d 25%, #1A3636 50%, #142b2b 75%, #0f2222 100%)",
      fontFamily: "'Georgia', serif",
      color: "#D6BD98",
      overflowX: "hidden",
      position: "relative"
    }}>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes floatUp {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
          100% { transform: translateY(0px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes glowPulse {
          0% { box-shadow: 0 0 40px rgba(103,125,106,0.15), 0 0 80px rgba(64,83,76,0.1); }
          50% { box-shadow: 0 0 80px rgba(214,189,152,0.2), 0 0 160px rgba(103,125,106,0.2); }
          100% { box-shadow: 0 0 40px rgba(103,125,106,0.15), 0 0 80px rgba(64,83,76,0.1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes loadingPulse {
          0% { opacity: 0.5; transform: scale(0.98); }
          50% { opacity: 1; transform: scale(1); }
          100% { opacity: 0.5; transform: scale(0.98); }
        }
        @keyframes suggestionIn {
          from { opacity: 0; transform: translateX(-16px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        textarea::placeholder { color: rgba(214,189,152,0.4); font-family: 'Georgia', serif; font-size: 15px; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #1A3636; }
        ::-webkit-scrollbar-thumb { background: #40534C; border-radius: 3px; }
        .nav-link:hover { color: #D6BD98 !important; }
        .style-card:hover { border-color: #D6BD98 !important; background: rgba(64,83,76,0.4) !important; transform: translateY(-3px) !important; }
        .feature-card:hover { background: rgba(64,83,76,0.4) !important; border-color: #D6BD98 !important; box-shadow: 0 20px 60px rgba(26,54,54,0.5) !important; transform: translateY(-8px) !important; }
        .purpose-btn { transition: all 0.28s ease !important; }
        .purpose-btn:hover { transform: translateY(-4px) !important; }
        .suggest-card { animation: suggestionIn 0.35s ease forwards; }
        .suggest-card:hover { border-color: #D6BD98 !important; }
        .accept-btn:hover { transform: scale(1.04) !important; }
      `}</style>

      {/* Background ambient orbs */}
      <div style={{ position: "fixed", top: "-200px", left: "50%", transform: "translateX(-50%)", width: "1000px", height: "700px", background: "radial-gradient(ellipse, rgba(103,125,106,0.2) 0%, transparent 65%)", pointerEvents: "none", zIndex: 0 }}/>
      <div style={{ position: "fixed", bottom: "-150px", right: "-100px", width: "500px", height: "500px", background: "radial-gradient(ellipse, rgba(214,189,152,0.12) 0%, transparent 65%)", pointerEvents: "none", zIndex: 0 }}/>

      {/* LOADING OVERLAY */}
      {isGenerating && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(26,54,54,0.96)", backdropFilter: "blur(20px)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "32px"
        }}>
          <div style={{ width: "70px", height: "70px", border: "3px solid rgba(103,125,106,0.3)", borderTop: "3px solid #D6BD98", borderRadius: "50%", animation: "spin 1s linear infinite" }}/>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "22px", color: "#D6BD98", marginBottom: "12px", letterSpacing: "0.02em", animation: "loadingPulse 2s ease infinite" }}>
              {loadingStep}
            </div>
            <div style={{ fontSize: "13px", color: "rgba(214,189,152,0.6)", letterSpacing: "0.06em", fontFamily: "system-ui" }}>
              ✦ Professional screenplay · Character extraction · Scene building ✦
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            {["Analysing", "Characters", "Screenplay", "Experience"].map((step) => (
              <div key={step} style={{
                padding: "6px 14px", borderRadius: "20px", fontSize: "11px",
                fontFamily: "system-ui", letterSpacing: "0.05em",
                background: loadingStep.toLowerCase().includes(step.toLowerCase()) ? "rgba(103,125,106,0.4)" : "rgba(64,83,76,0.2)",
                border: `1px solid ${loadingStep.toLowerCase().includes(step.toLowerCase()) ? "#D6BD98" : "rgba(103,125,106,0.3)"}`,
                color: loadingStep.toLowerCase().includes(step.toLowerCase()) ? "#D6BD98" : "rgba(214,189,152,0.4)",
                transition: "all 0.5s"
              }}>{step}</div>
            ))}
          </div>
        </div>
      )}

      {/* NAV */}
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "22px 60px", borderBottom: "2.5px solid rgba(103,125,106,0.6)",
        position: "relative", zIndex: 10, background: "rgba(26,54,54,0.85)", backdropFilter: "blur(24px)"
      }}>
        <div style={{
          fontSize: "26px", fontWeight: "800", letterSpacing: "0.16em",
          backgroundImage: "linear-gradient(90deg, #D6BD98, #677D6A, #D6BD98, #677D6A, #D6BD98)",
          backgroundSize: "300% 300%", animation: "shimmer 5s ease infinite",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textTransform: "uppercase"
        }}>Scenica</div>
        <div style={{ display: "flex", gap: "30px", alignItems: "center" }}>
          {["How It Works", "Pricing", "Gallery"].map(item => (
            <span key={item} className="nav-link" style={{ fontSize: "14px", color: "rgba(214,189,152,0.75)", cursor: "pointer", letterSpacing: "0.04em", transition: "color 0.25s", fontFamily: "system-ui, sans-serif", fontWeight: "500" }}>{item}</span>
          ))}

          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "13px", color: "#D6BD98", fontFamily: "system-ui, sans-serif", background: "rgba(64,83,76,0.4)", border: "2px solid rgba(103,125,106,0.5)", padding: "6px 14px", borderRadius: "20px" }}>
                👤 {user.email}
              </span>
              <button onClick={handleSignOut} style={{ padding: "8px 16px", background: "rgba(40,65,65,0.6)", border: "2px solid rgba(103,125,106,0.6)", borderRadius: "20px", color: "#D6BD98", fontSize: "12px", cursor: "pointer", fontFamily: "system-ui, sans-serif", fontWeight: "500" }}>
                Sign Out
              </button>
            </div>
          ) : (
            <button onClick={() => { setAuthModalOpen(true); setAuthError(""); setAuthMessage(""); }} style={{ padding: "11px 28px", background: "linear-gradient(135deg, #40534C, #677D6A)", border: "2.5px solid #D6BD98", borderRadius: "30px", color: "#D6BD98", fontSize: "14px", cursor: "pointer", letterSpacing: "0.05em", fontFamily: "system-ui, sans-serif", fontWeight: "600", boxShadow: "0 4px 24px rgba(26,54,54,0.5)", transition: "all 0.25s" }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.boxShadow = "0 6px 36px rgba(103,125,106,0.6)"; (e.target as HTMLButtonElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.boxShadow = "0 4px 24px rgba(26,54,54,0.5)"; (e.target as HTMLButtonElement).style.transform = "translateY(0)"; }}
            >Sign In / Sign Up</button>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section style={{ position: "relative", zIndex: 10, minHeight: "580px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 48px 60px", overflow: "hidden" }}>
        <div style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: "860px", margin: "0 auto", animation: "fadeIn 0.8s ease forwards" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "11px", letterSpacing: "0.22em", color: "#D6BD98", border: "2.5px solid rgba(214,189,152,0.6)", padding: "8px 22px", borderRadius: "20px", marginBottom: "44px", textTransform: "uppercase", background: "rgba(64,83,76,0.4)", boxShadow: "0 0 30px rgba(103,125,106,0.2)" }}>
            <span>✦</span> Imaginative Intelligence <span>✦</span>
          </div>
          <h1 style={{ fontSize: "clamp(48px, 7.5vw, 88px)", fontWeight: "300", lineHeight: "1.07", marginBottom: "30px", letterSpacing: "-0.02em", color: "#D6BD98" }}>
            Your imagination,<br/>
            <span style={{ backgroundImage: "linear-gradient(135deg, #D6BD98 0%, #677D6A 50%, #D6BD98 100%)", backgroundSize: "200% 200%", animation: "shimmer 5s ease infinite", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontStyle: "italic", fontWeight: "400" }}>cinematic</span>
          </h1>
          <p style={{ fontSize: "18px", color: "rgba(214,189,152,0.85)", lineHeight: "1.85", maxWidth: "500px", margin: "0 auto 52px", fontWeight: "300" }}>
            Describe your story or brand brief. Scenica writes the screenplay, builds your characters, and brings every scene to life with voice, image, and music.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", maxWidth: "260px", margin: "0 auto" }}>
            <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, transparent, rgba(214,189,152,0.4))" }}/>
            <span style={{ color: "#D6BD98", fontSize: "14px" }}>✦</span>
            <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, rgba(214,189,152,0.4), transparent)" }}/>
          </div>
        </div>
      </section>

      {/* GENRE IMAGE CARDS */}
      <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 24px 60px", position: "relative", zIndex: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          {[
            { url: "https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?w=400&q=80", label: "Romance" },
            { url: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400&q=80", label: "Drama" },
            { url: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&q=80", label: "Thriller" },
            { url: "https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?w=400&q=80", label: "Fantasy" }
          ].map((img, i) => (
            <div key={i} onClick={() => handleGenreCardClick()} style={{
              position: "relative", borderRadius: "16px", overflow: "hidden", height: "160px",
              animation: `floatUp 6s ease-in-out infinite`, animationDelay: `${i * 0.3}s`,
              border: "2.5px solid rgba(103,125,106,0.6)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              transition: "transform 0.3s, box-shadow 0.3s", cursor: "pointer"
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-6px) scale(1.02)"; e.currentTarget.style.boxShadow = "0 16px 48px rgba(103,125,106,0.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0) scale(1)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.4)"; }}
            >
              <img src={img.url} alt={img.label} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }}/>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(26,54,54,0.9) 0%, transparent 60%)", display: "flex", alignItems: "flex-end", padding: "14px" }}>
                <span style={{ color: "#D6BD98", fontSize: "12px", fontFamily: "system-ui", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: "700" }}>{img.label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* MAIN INPUT CARD */}
      <section id="story-form" style={{ maxWidth: "840px", margin: "0 auto", padding: "0 24px 80px", position: "relative", zIndex: 10 }}>
        <div style={{
          background: "linear-gradient(160deg, rgba(64,83,76,0.35) 0%, rgba(26,54,54,0.6) 50%, rgba(64,83,76,0.2) 100%)",
          border: "2.5px solid rgba(103,125,106,0.6)", borderRadius: "28px", padding: "52px",
          backdropFilter: "blur(30px)", animation: "glowPulse 7s ease infinite",
          boxShadow: "inset 0 1px 0 rgba(214,189,152,0.15)"
        }}>

          {error && (
            <div style={{ background: "rgba(64,83,76,0.6)", border: "2.5px solid #D6BD98", borderRadius: "12px", padding: "14px 18px", marginBottom: "24px", color: "#D6BD98", fontSize: "14px", fontFamily: "system-ui" }}>
              ⚠️ {error}
            </div>
          )}

          {/* ── PURPOSE MODE BUTTONS ── */}
          <div style={{ marginBottom: "32px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", letterSpacing: "0.18em", color: "#D6BD98", marginBottom: "16px", textTransform: "uppercase", fontFamily: "system-ui, sans-serif", fontWeight: "700" }}>
              <span style={{ color: "#677D6A" }}>✦</span> What are you creating?
              <span style={{ fontSize: "11px", color: "rgba(214,189,152,0.5)", textTransform: "none", letterSpacing: "0", fontWeight: "400", marginLeft: "4px" }}>— choose a purpose to tailor the AI output</span>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              {purposeModes.map(mode => {
                const isSelected = purposeMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    id={`purpose-${mode.id}`}
                    className="purpose-btn"
                    onClick={() => setPurposeMode(isSelected ? "" : mode.id)}
                    style={{
                      padding: "20px 22px",
                      borderRadius: "18px",
                      textAlign: "left",
                      cursor: "pointer",
                      border: `2.5px solid ${isSelected ? "#D6BD98" : "rgba(103,125,106,0.5)"}`,
                      background: isSelected ? "linear-gradient(135deg, rgba(64,83,76,0.6), rgba(103,125,106,0.3))" : "rgba(40,65,65,0.4)",
                      boxShadow: isSelected ? "0 0 32px rgba(214,189,152,0.2)" : "none",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {isSelected && (
                      <div style={{
                        position: "absolute", top: "10px", right: "12px",
                        fontSize: "10px", fontFamily: "system-ui", letterSpacing: "0.08em",
                        padding: "3px 10px", borderRadius: "10px",
                        background: "rgba(64,83,76,0.6)",
                        color: "#D6BD98",
                        border: "2px solid #D6BD98",
                      }}>✓ Selected</div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                      <span style={{ fontSize: "28px" }}>{mode.icon}</span>
                      <div>
                        <div style={{ fontSize: "15px", fontWeight: "700", fontFamily: "system-ui", color: isSelected ? "#D6BD98" : "rgba(214,189,152,0.85)", marginBottom: "2px" }}>{mode.label}</div>
                        <div style={{
                          fontSize: "10px", fontFamily: "system-ui", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: "700",
                          color: "#677D6A"
                        }}>{mode.sublabel}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", color: "rgba(214,189,152,0.7)", fontFamily: "system-ui", lineHeight: "1.55" }}>{mode.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ height: "1px", background: "linear-gradient(90deg, transparent, rgba(103,125,106,0.4), transparent)", marginBottom: "32px" }}/>

          {/* Story Input */}
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", letterSpacing: "0.18em", color: "#D6BD98", marginBottom: "14px", textTransform: "uppercase", fontFamily: "system-ui, sans-serif", fontWeight: "700" }}>
            <span style={{ color: "#677D6A" }}>✦</span>
            {purposeMode === "marketing" ? "Your Marketing Brief" : purposeMode === "story" ? "Your Story" : "Your Script"}
          </label>
          <textarea
            value={story}
            onChange={handleStoryChange}
            placeholder={textareaPlaceholder}
            style={{ width: "100%", minHeight: "195px", background: "rgba(26,54,54,0.6)", border: "2.5px solid rgba(103,125,106,0.6)", borderRadius: "18px", padding: "22px", color: "#D6BD98", fontSize: "15px", lineHeight: "1.85", resize: "vertical", outline: "none", fontFamily: "'Georgia', serif", transition: "border-color 0.3s, box-shadow 0.3s" }}
            onFocus={e => { e.target.style.borderColor = "#D6BD98"; e.target.style.boxShadow = "0 0 0 4px rgba(214,189,152,0.15)"; }}
            onBlur={e => { e.target.style.borderColor = "rgba(103,125,106,0.6)"; e.target.style.boxShadow = "none"; }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", marginBottom: story.trim().length >= 30 ? "20px" : "36px", fontSize: "13px", color: "rgba(214,189,152,0.6)", fontFamily: "system-ui, sans-serif" }}>
            <span>Be as detailed as possible for the best result</span>
            <span style={{ color: story.length > 0 ? "#D6BD98" : "rgba(214,189,152,0.5)" }}>{story.length} characters</span>
          </div>

          {/* ── AI SUGGESTIONS BUTTON ── */}
          {story.trim().length >= 30 && (
            <div style={{ marginBottom: "36px", animation: "fadeInDown 0.4s ease forwards" }}>
              {!suggestionsOpen ? (
                <button
                  id="enhance-script-btn"
                  onClick={() => fetchSuggestions(story)}
                  disabled={isFetchingSuggestions}
                  style={{
                    width: "100%", padding: "14px 22px",
                    background: "linear-gradient(135deg, rgba(64,83,76,0.4), rgba(103,125,106,0.2))",
                    border: "2.5px solid rgba(214,189,152,0.6)",
                    borderRadius: "14px", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                    transition: "all 0.25s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(64,83,76,0.6), rgba(103,125,106,0.3))"; e.currentTarget.style.borderColor = "#D6BD98"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(64,83,76,0.4), rgba(103,125,106,0.2))"; e.currentTarget.style.borderColor = "rgba(214,189,152,0.6)"; }}
                >
                  <span style={{ fontSize: "16px" }}>✨</span>
                  <span style={{ fontSize: "13px", fontFamily: "system-ui", fontWeight: "600", letterSpacing: "0.08em", color: "#D6BD98" }}>
                    ENHANCE WITH AI SUGGESTIONS
                  </span>
                  <span style={{ fontSize: "11px", color: "rgba(214,189,152,0.6)", fontFamily: "system-ui" }}>— optional improvements to your script</span>
                </button>
              ) : (
                <div style={{
                  background: "rgba(40,65,65,0.4)",
                  border: "2.5px solid rgba(214,189,152,0.5)",
                  borderRadius: "18px",
                  padding: "24px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "16px" }}>✨</span>
                      <span style={{ fontSize: "12px", fontFamily: "system-ui", fontWeight: "700", letterSpacing: "0.12em", color: "#D6BD98", textTransform: "uppercase" }}>
                        AI Enhancement Suggestions
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      {!isFetchingSuggestions && suggestions.length > 0 && (
                        <button
                          onClick={() => fetchSuggestions(story)}
                          style={{ padding: "5px 12px", borderRadius: "10px", border: "2px solid rgba(214,189,152,0.5)", background: "rgba(64,83,76,0.4)", color: "#D6BD98", fontSize: "11px", cursor: "pointer", fontFamily: "system-ui", transition: "all 0.2s" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "#D6BD98"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(214,189,152,0.5)"; }}
                        >↺ Refresh</button>
                      )}
                      <button
                        onClick={() => setSuggestionsOpen(false)}
                        style={{ width: "26px", height: "26px", borderRadius: "50%", border: "2px solid rgba(103,125,106,0.5)", background: "rgba(64,83,76,0.4)", color: "#D6BD98", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(103,125,106,0.5)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(64,83,76,0.4)"; }}
                      >✕</button>
                    </div>
                  </div>

                  {/* Loading dots */}
                  {isFetchingSuggestions && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "24px 0" }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{
                          width: "8px", height: "8px", borderRadius: "50%",
                          background: "#D6BD98",
                          animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }}/>
                      ))}
                      <span style={{ marginLeft: "8px", fontSize: "13px", color: "rgba(214,189,152,0.7)", fontFamily: "system-ui" }}>Analysing your script…</span>
                    </div>
                  )}

                  {suggestError && !isFetchingSuggestions && (
                    <div style={{
                      borderRadius: "12px",
                      padding: "16px 20px",
                      background: "rgba(64,83,76,0.4)",
                      border: "2.5px solid #D6BD98",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "14px",
                    }}>
                      <span style={{ fontSize: "20px", flexShrink: 0, marginTop: "1px" }}>⚠️</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "#D6BD98", fontFamily: "system-ui", marginBottom: "4px" }}>
                          {suggestError.includes("quota") || suggestError.includes("429") ? "Daily AI Limit Reached" : "Could Not Load Suggestions"}
                        </div>
                        <div style={{ fontSize: "12px", color: "rgba(214,189,152,0.7)", fontFamily: "system-ui", lineHeight: "1.6" }}>
                          {suggestError.includes("quota") || suggestError.includes("Quota") || suggestError.includes("429")
                            ? suggestError.replace(/(?:Gemini|Claude|Anthropic|AI) API error:.*?\{[\s\S]*?\}/gi, "").trim() || "The free AI quota has been used up today. You can still generate your video — suggestions will be available again tomorrow."
                            : suggestError}
                        </div>
                      </div>
                      <button
                        onClick={() => fetchSuggestions(story)}
                        style={{ flexShrink: 0, padding: "7px 14px", borderRadius: "10px", border: "2px solid #D6BD98", background: "rgba(64,83,76,0.5)", color: "#D6BD98", fontSize: "11px", fontFamily: "system-ui", fontWeight: "600", cursor: "pointer", transition: "all 0.2s" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(103,125,106,0.5)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(64,83,76,0.5)"; }}
                      >↺ Retry</button>
                    </div>
                  )}

                  {/* Suggestion cards */}
                  {!isFetchingSuggestions && suggestions.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {suggestions.map((s, i) => {
                        const isAccepted = acceptedIds.has(s.id);
                        return (
                          <div
                            key={s.id}
                            className="suggest-card"
                            style={{
                              background: isAccepted ? "rgba(103,125,106,0.2)" : "rgba(40,65,65,0.4)",
                              border: `2px solid ${isAccepted ? "#D6BD98" : "rgba(103,125,106,0.5)"}`,
                              borderLeft: `4px solid ${isAccepted ? "#D6BD98" : "#677D6A"}`,
                              borderRadius: "12px",
                              padding: "14px 16px",
                              animationDelay: `${i * 0.06}s`,
                              transition: "border-color 0.25s",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: "13px", fontWeight: "700", color: "#D6BD98", fontFamily: "system-ui", marginBottom: "5px" }}>
                                  {isAccepted ? "✓ " : `${i + 1}. `}{s.title}
                                </div>
                                <div style={{ fontSize: "12px", color: "rgba(214,189,152,0.7)", fontFamily: "system-ui", lineHeight: "1.6", marginBottom: "8px" }}>{s.description}</div>
                                <div style={{ fontSize: "12px", color: "rgba(214,189,152,0.6)", fontFamily: "'Georgia', serif", fontStyle: "italic", lineHeight: "1.6", padding: "8px 12px", background: "rgba(26,54,54,0.5)", borderRadius: "8px", borderLeft: "3px solid #677D6A" }}>
                                  "{s.addedText}"
                                </div>
                              </div>
                              {!isAccepted && (
                                <button
                                  id={`accept-suggestion-${s.id}`}
                                  className="accept-btn"
                                  onClick={() => handleAcceptSuggestion(s)}
                                  style={{
                                    flexShrink: 0,
                                    padding: "8px 16px",
                                    borderRadius: "10px",
                                    border: "2px solid #D6BD98",
                                    background: "linear-gradient(135deg, rgba(64,83,76,0.5), rgba(103,125,106,0.3))",
                                    color: "#D6BD98",
                                    fontSize: "12px",
                                    fontFamily: "system-ui",
                                    fontWeight: "600",
                                    cursor: "pointer",
                                    letterSpacing: "0.05em",
                                    transition: "all 0.2s",
                                    whiteSpace: "nowrap",
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(64,83,76,0.7), rgba(103,125,106,0.5))"; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(64,83,76,0.5), rgba(103,125,106,0.3))"; }}
                                >+ Accept</button>
                              )}
                              {isAccepted && (
                                <div style={{ flexShrink: 0, padding: "8px 14px", borderRadius: "10px", background: "rgba(103,125,106,0.3)", border: "2px solid #D6BD98", color: "#D6BD98", fontSize: "12px", fontFamily: "system-ui", fontWeight: "600" }}>✓ Added</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ fontSize: "11px", color: "rgba(214,189,152,0.5)", fontFamily: "system-ui", textAlign: "center", marginTop: "6px", letterSpacing: "0.04em" }}>
                        Accepted suggestions are automatically added to your script above
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ height: "1px", background: "linear-gradient(90deg, transparent, rgba(103,125,106,0.4), transparent)", marginBottom: "36px" }}/>

          {/* Marketing mode — character toggle */}
          {purposeMode === "marketing" && (
            <div style={{ marginBottom: "44px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", letterSpacing: "0.18em", color: "#D6BD98", marginBottom: "12px", textTransform: "uppercase", fontFamily: "system-ui, sans-serif", fontWeight: "700" }}>
                <span style={{ color: "#677D6A" }}>✦</span> Character Presence
                <span style={{ fontSize: "11px", color: "rgba(214,189,152,0.5)", textTransform: "none", letterSpacing: "0", fontWeight: "400", marginLeft: "4px" }}>— choose how your ad is presented</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {[
                  { id: true, icon: "🎭", label: "Show Character", desc: "1-2 on-screen personas speak the dialogue — brand ambassador or real customer" },
                  { id: false, icon: "📽️", label: "No Character", sublabel: "Professional", desc: "Clean product-only video — on-screen text, product shots, neutral narrator only" }
                ].map(opt => {
                  const isSelected = showCharacter === opt.id;
                  return (
                    <button
                      key={String(opt.id)}
                      id={`char-toggle-${opt.id}`}
                      onClick={() => setShowCharacter(opt.id as boolean)}
                      style={{
                        padding: "18px 20px", borderRadius: "16px", textAlign: "left", cursor: "pointer",
                        border: `2.5px solid ${isSelected ? "#D6BD98" : "rgba(103,125,106,0.5)"}`,
                        background: isSelected ? "linear-gradient(135deg, rgba(64,83,76,0.6), rgba(103,125,106,0.3))" : "rgba(40,65,65,0.4)",
                        boxShadow: isSelected ? "0 0 28px rgba(214,189,152,0.18)" : "none",
                        transition: "all 0.22s", position: "relative", overflow: "hidden"
                      }}
                    >
                      {isSelected && (
                        <div style={{ position: "absolute", top: "8px", right: "10px", fontSize: "10px", fontFamily: "system-ui", letterSpacing: "0.08em", padding: "3px 10px", borderRadius: "10px", background: "rgba(64,83,76,0.6)", color: "#D6BD98", border: "2px solid #D6BD98" }}>✓ Selected</div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                        <span style={{ fontSize: "24px" }}>{opt.icon}</span>
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: "700", fontFamily: "system-ui", color: isSelected ? "#D6BD98" : "rgba(214,189,152,0.85)" }}>{opt.label}</div>
                          {opt.sublabel && <div style={{ fontSize: "10px", fontFamily: "system-ui", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: "700", color: "#677D6A", marginTop: "2px" }}>{opt.sublabel}</div>}
                        </div>
                      </div>
                      <div style={{ fontSize: "12px", color: "rgba(214,189,152,0.7)", fontFamily: "system-ui", lineHeight: "1.5" }}>{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Generate Button */}
          <button
            id="generate-btn"
            onClick={handleGenerate}
            disabled={!story.trim() || isGenerating}
            style={{
              width: "100%", padding: "22px",
              background: story.trim()
                ? "linear-gradient(135deg, #40534C, #677D6A, #40534C)"
                : "rgba(64,83,76,0.2)",
              backgroundSize: story.trim() ? "250% 250%" : "auto",
              animation: story.trim() ? "shimmer 3s ease infinite" : "none",
              border: story.trim() ? "2.5px solid #D6BD98" : "2px solid rgba(103,125,106,0.4)",
              borderRadius: "16px", color: story.trim() ? "#D6BD98" : "rgba(214,189,152,0.4)",
              fontSize: "15px", letterSpacing: "0.14em",
              cursor: story.trim() ? "pointer" : "not-allowed",
              fontFamily: "system-ui, sans-serif", fontWeight: "600",
              boxShadow: story.trim() ? "0 8px 48px rgba(64,83,76,0.6)" : "none",
              textTransform: "uppercase", transition: "all 0.3s"
            }}
            onMouseEnter={e => { if (story.trim()) { (e.target as HTMLButtonElement).style.boxShadow = "0 14px 64px rgba(103,125,106,0.6)"; (e.target as HTMLButtonElement).style.transform = "translateY(-2px)"; }}}
            onMouseLeave={e => { if (story.trim()) { (e.target as HTMLButtonElement).style.boxShadow = "0 8px 48px rgba(64,83,76,0.6)"; (e.target as HTMLButtonElement).style.transform = "translateY(0)"; }}}
          >
            {isGenerating
              ? "✦  Creating your cinematic story..."
              : purposeMode === "marketing"
                ? "✦  Create My Commercial Script"
                : "✦  Create My Cinematic Story"}
          </button>

          <p style={{ textAlign: "center", marginTop: "18px", fontSize: "13px", color: "rgba(214,189,152,0.5)", letterSpacing: "0.06em", fontFamily: "system-ui, sans-serif" }}>
            {purposeMode === "marketing"
              ? "Professional commercial · Brand characters · AI voices · Cinematic production"
              : "Professional screenplay · Character portraits · AI voices · Cinematic music"}
          </p>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ maxWidth: "840px", margin: "0 auto", padding: "0 24px 100px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: "16px", position: "relative", zIndex: 10 }}>
        {[
          { icon: "✍️", title: "Professional Script", desc: "Hollywood-format screenplay crafted by AI", delay: "0s" },
          { icon: "🎭", title: "Character Studio", desc: "AI portraits with consistent character faces", delay: "0.2s" },
          { icon: "🎙️", title: "Distinct Voices", desc: "Unique emotional AI voice per character", delay: "0.4s" },
          { icon: "🎬", title: "Cinematic Player", desc: "Animated scenes with music and subtitles", delay: "0.6s" }
        ].map(f => (
          <div key={f.title} className="feature-card" style={{ background: "rgba(64,83,76,0.25)", border: "2.5px solid rgba(103,125,106,0.5)", borderRadius: "20px", padding: "32px 22px", textAlign: "center", transition: "all 0.3s", animation: `floatUp 6s ease-in-out infinite`, animationDelay: f.delay, backdropFilter: "blur(10px)" }}>
            <div style={{ fontSize: "34px", marginBottom: "16px" }}>{f.icon}</div>
            <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "10px", color: "#D6BD98", letterSpacing: "0.04em", fontFamily: "system-ui, sans-serif" }}>{f.title}</div>
          </div>
        ))}
      </section>

      {/* SUPABASE AUTH MODAL */}
      {authModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.85)", backdropFilter: "blur(18px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "20px"
        }} onClick={() => setAuthModalOpen(false)}>
          <div style={{
            background: "#1A3636", border: "2.5px solid #D6BD98", borderRadius: "24px",
            padding: "42px 40px", width: "100%", maxWidth: "460px", position: "relative",
            boxShadow: "0 14px 70px rgba(0,0,0,0.95)", animation: "fadeIn 0.3s ease forwards"
          }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setAuthModalOpen(false)} style={{
              position: "absolute", top: "18px", right: "22px", background: "none",
              border: "none", color: "#D6BD98", fontSize: "20px", cursor: "pointer"
            }}>✕</button>

            <div style={{ textAlign: "center", marginBottom: "28px" }}>
              <div style={{ fontSize: "11px", letterSpacing: "0.22em", color: "#677D6A", fontFamily: "system-ui, sans-serif", textTransform: "uppercase", marginBottom: "4px" }}>Scenica Studio Security</div>
              <div style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "0.14em", color: "#D6BD98", marginBottom: "6px" }}>CREATOR PASSPORT</div>
              <div style={{ fontSize: "13px", color: "rgba(214,189,152,0.75)", fontFamily: "system-ui, sans-serif" }}>
                {authMode === "signin" ? "Authenticate to access your active workspace" : "Register your verified creator identity"}
              </div>
            </div>

            {/* TAB TOGGLE */}
            <div style={{ display: "flex", background: "rgba(64,83,76,0.3)", borderRadius: "30px", border: "2.5px solid rgba(103,125,106,0.5)", padding: "4px", marginBottom: "24px" }}>
              <button type="button" onClick={() => { setAuthMode("signin"); setAuthError(""); setAuthMessage(""); }} style={{
                flex: 1, padding: "11px", borderRadius: "26px", border: "none",
                background: authMode === "signin" ? "rgba(64,83,76,0.85)" : "transparent",
                color: "#D6BD98", fontSize: "13px", fontWeight: authMode === "signin" ? "700" : "500",
                cursor: "pointer", fontFamily: "system-ui, sans-serif", transition: "all 0.2s",
                boxShadow: authMode === "signin" ? "0 2px 10px rgba(0,0,0,0.3)" : "none"
              }}>Sign In</button>
              <button type="button" onClick={() => { setAuthMode("signup"); setAuthError(""); setAuthMessage(""); }} style={{
                flex: 1, padding: "11px", borderRadius: "26px", border: "none",
                background: authMode === "signup" ? "rgba(64,83,76,0.85)" : "transparent",
                color: "#D6BD98", fontSize: "13px", fontWeight: authMode === "signup" ? "700" : "500",
                cursor: "pointer", fontFamily: "system-ui, sans-serif", transition: "all 0.2s",
                boxShadow: authMode === "signup" ? "0 2px 10px rgba(0,0,0,0.3)" : "none"
              }}>Create Account</button>
            </div>

            <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {authError && (
                <div style={{ background: "rgba(220,53,69,0.18)", border: "2.5px solid #dc3545", color: "#ff8b94", padding: "12px 16px", borderRadius: "14px", fontSize: "13px", fontFamily: "system-ui, sans-serif" }}>
                  ⚠️ {authError}
                </div>
              )}

              {authMessage && (
                <div style={{ background: "rgba(40,167,69,0.18)", border: "2.5px solid #28a745", color: "#85e39d", padding: "12px 16px", borderRadius: "14px", fontSize: "13px", fontFamily: "system-ui, sans-serif" }}>
                  ✓ {authMessage}
                </div>
              )}

              {authMode === "signup" && (
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#D6BD98", marginBottom: "6px", fontFamily: "system-ui, sans-serif", letterSpacing: "0.08em", textTransform: "uppercase" }}>Creator Full Name</label>
                  <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Alishba Nasir" style={{
                    width: "100%", padding: "12px 16px", background: "rgba(64,83,76,0.3)",
                    border: "2.5px solid rgba(103,125,106,0.6)", borderRadius: "14px",
                    color: "#D6BD98", fontSize: "14px", fontFamily: "system-ui, sans-serif", outline: "none"
                  }} />
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#D6BD98", marginBottom: "6px", fontFamily: "system-ui, sans-serif", letterSpacing: "0.08em", textTransform: "uppercase" }}>Work Email Address</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="creator@scenica.ai" style={{
                  width: "100%", padding: "12px 16px", background: "rgba(64,83,76,0.3)",
                  border: "2.5px solid rgba(103,125,106,0.6)", borderRadius: "14px",
                  color: "#D6BD98", fontSize: "14px", fontFamily: "system-ui, sans-serif", outline: "none"
                }} />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#D6BD98", marginBottom: "6px", fontFamily: "system-ui, sans-serif", letterSpacing: "0.08em", textTransform: "uppercase" }}>Account Security Password</label>
                <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={{
                  width: "100%", padding: "12px 16px", background: "rgba(64,83,76,0.3)",
                  border: "2.5px solid rgba(103,125,106,0.6)", borderRadius: "14px",
                  color: "#D6BD98", fontSize: "14px", fontFamily: "system-ui, sans-serif", outline: "none"
                }} />
              </div>

              <button type="submit" disabled={authLoading} style={{
                marginTop: "10px", padding: "14px", background: "linear-gradient(135deg,#40534C,#677D6A)",
                border: "2.5px solid #D6BD98", borderRadius: "30px", color: "#D6BD98",
                fontSize: "14px", fontWeight: "700", cursor: authLoading ? "wait" : "pointer",
                letterSpacing: "0.08em", textTransform: "uppercase", boxShadow: "0 6px 30px rgba(0,0,0,0.5)",
                transition: "all 0.2s"
              }}>
                {authLoading ? "Authenticating..." : authMode === "signin" ? "Sign In to Studio" : "Register Creator Passport"}
              </button>
            </form>
          </div>
        </div>
      )}

    </main>
  );
}