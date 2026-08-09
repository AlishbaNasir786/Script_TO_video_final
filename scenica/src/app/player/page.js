"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Scene backgrounds matched by location ────────────────────────────────────
const SCENE_BG = {
  train:      "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=1600&q=90",
  station:    "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=1600&q=90",
  cafe:       "https://images.unsplash.com/photo-1559564484-f9d4a40c5b91?w=1600&q=90",
  coffee:     "https://images.unsplash.com/photo-1559564484-f9d4a40c5b91?w=1600&q=90",
  rain:       "https://images.unsplash.com/photo-1428592953211-077101b2021b?w=1600&q=90",
  street:     "https://images.unsplash.com/photo-1444723121867-7a241cacace9?w=1600&q=90",
  night:      "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1600&q=90",
  apartment:  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1600&q=90",
  room:       "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1600&q=90",
  office:     "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=90",
  waterfront: "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=1600&q=90",
  bridge:     "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=1600&q=90",
  bosphorus:  "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=1600&q=90",
  forest:     "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1600&q=90",
  park:       "https://images.unsplash.com/photo-1568515387631-8b650bbcdb90?w=1600&q=90",
  default:    "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1600&q=90",
};

function getSceneBg(heading) {
  if (!heading) return SCENE_BG.default;
  const h = heading.toLowerCase();
  for (const [key, url] of Object.entries(SCENE_BG)) {
    if (key !== "default" && h.includes(key)) return url;
  }
  return SCENE_BG.default;
}

// ─── Free cinematic music tracks ───────────────────────────────────────────────
const MUSIC_TRACKS = {
  romantic:   "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  tense:      "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  mysterious: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  sad:        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
  hopeful:    "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
  default:    "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",
};

function getMusicTrack(tone, emotion) {
  const key = [tone, emotion].find(e => e && MUSIC_TRACKS[e?.toLowerCase()]);
  return MUSIC_TRACKS[key?.toLowerCase()] || MUSIC_TRACKS.default;
}

// ─── Inline SVG Avatar ────────────────────────────────────────────────────────
function CharacterAvatarSVG({ char, size = 56 }) {
  const initial = (char?.name || "?")[0].toUpperCase();
  const name = char?.name || "";
  const p = { a: "#1A3636", b: "#40534C", light: "#D6BD98" };
  const s = size;
  const uid = (name + size).replace(/\s/g, "_");
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`pb_${uid}`} cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor={p.b}/>
          <stop offset="100%" stopColor={p.a}/>
        </radialGradient>
      </defs>
      <circle cx={s/2} cy={s/2} r={s/2} fill={`url(#pb_${uid})`}/>
      <text x={s/2} y={s*0.58} textAnchor="middle" dominantBaseline="middle"
        fontSize={s*0.5} fontWeight="100" fontFamily="Georgia,serif"
        fill={p.light} fillOpacity="0.92">{initial}</text>
      <circle cx={s/2} cy={s/2} r={s/2-1} fill="none" stroke={p.light} strokeWidth="1.5" strokeOpacity="0.3"/>
    </svg>
  );
}

// ─── Emotion styles ───────────────────────────────────────────────────────────
const EMO = {
  default: { bg: "rgba(64,83,76,0.3)", text: "#D6BD98", glow: "rgba(214,189,152,0.4)" }
};

function emoStyle() {
  return EMO.default;
}

// ─── Voice assignment per character ──────────────────────────────────────────
function assignVoices(characters) {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return {};

  const englishVoices = voices.filter(v => v.lang.startsWith("en"));
  const femaleVoices = englishVoices.filter(v =>
    /female|woman|girl|zira|samantha|victoria|karen|moira|tessa|fiona|veena|susan|heather/i.test(v.name)
  );
  const maleVoices = englishVoices.filter(v =>
    /male|man|david|daniel|alex|tom|fred|ralph|bruce|lee|james/i.test(v.name)
  );

  const fallbackFemale = englishVoices[0] || voices[0];
  const fallbackMale = englishVoices[1] || englishVoices[0] || voices[0];

  const map = {};
  let fIdx = 0, mIdx = 0;
  characters.forEach(char => {
    const isFemale = (char.gender || "").toLowerCase().includes("female");
    if (isFemale) {
      map[char.name] = femaleVoices[fIdx % Math.max(femaleVoices.length, 1)] || fallbackFemale;
      fIdx++;
    } else {
      map[char.name] = maleVoices[mIdx % Math.max(maleVoices.length, 1)] || fallbackMale;
      mIdx++;
    }
  });
  return map;
}

function speechParams(emotion) {
  const e = (emotion || "").toLowerCase();
  if (e.includes("tense") || e.includes("angry") || e.includes("rage"))
    return { rate: 1.15, pitch: 0.85, volume: 1 };
  if (e.includes("sad") || e.includes("grief") || e.includes("devastat"))
    return { rate: 0.82, pitch: 0.78, volume: 0.9 };
  if (e.includes("joyful") || e.includes("happy") || e.includes("delight"))
    return { rate: 1.1, pitch: 1.2, volume: 1 };
  if (e.includes("mysterious") || e.includes("whisper") || e.includes("secret"))
    return { rate: 0.88, pitch: 0.92, volume: 0.85 };
  if (e.includes("romantic") || e.includes("longing") || e.includes("tender"))
    return { rate: 0.9, pitch: 1.05, volume: 0.95 };
  if (e.includes("scared") || e.includes("fearful") || e.includes("panic"))
    return { rate: 1.2, pitch: 1.15, volume: 1 };
  if (e.includes("hopeful") || e.includes("warm"))
    return { rate: 0.95, pitch: 1.08, volume: 0.95 };
  return { rate: 1.0, pitch: 1.0, volume: 1 };
}

// ─── Main Player ──────────────────────────────────────────────────────────────
export default function Player() {
  const [result, setResult] = useState(null);
  const [currentScene, setCurrentScene] = useState(0);
  const [currentLine, setCurrentLine] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [voicesReady, setVoicesReady] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [volume, setVolume] = useState(0.3);

  const timerRef = useRef(null);
  const controlsRef = useRef(null);
  const audioRef = useRef(null);
  const voiceMapRef = useRef({});
  const router = useRouter();

  useEffect(() => {
    const stored = sessionStorage.getItem("scenicaResult");
    if (!stored) { router.push("/"); return; }
    setResult(JSON.parse(stored));

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) setVoicesReady(true);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.cancel(); };
  }, []);

  useEffect(() => {
    if (result && voicesReady) {
      voiceMapRef.current = assignVoices(result.characters || []);
    }
  }, [result, voicesReady]);

  useEffect(() => {
    if (!result) return;
    const track = getMusicTrack(result.tone, result.scenes?.[currentScene]?.emotion);
    if (!audioRef.current) {
      audioRef.current = new Audio(track);
      audioRef.current.loop = true;
      audioRef.current.volume = volume;
    } else {
      audioRef.current.src = track;
      audioRef.current.load();
    }
    if (isPlaying && musicEnabled) {
      audioRef.current.play().catch(() => {});
    }
  }, [currentScene, result]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying && musicEnabled) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, musicEnabled]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    clearTimeout(controlsRef.current);
    window.speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
  }, []);

  const hideControlsSoon = () => {
    clearTimeout(controlsRef.current);
    controlsRef.current = setTimeout(() => setShowControls(false), 3500);
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (isPlaying) hideControlsSoon();
  };

  const playLine = useCallback((sceneIdx, lineIdx, playableScenesArr) => {
    const sc = playableScenesArr[sceneIdx];
    if (!sc) {
      setIsPlaying(false); setCompleted(true);
      if (audioRef.current) audioRef.current.pause();
      return;
    }

    const dialogueList = sc.dialogue || [];

    if (!dialogueList.length || lineIdx >= dialogueList.length) {
      setIsTransitioning(true);
      setShowSubtitle(false);
      timerRef.current = setTimeout(() => {
        const nextScene = sceneIdx + 1;
        if (nextScene < playableScenesArr.length) {
          setCurrentScene(nextScene);
          setCurrentLine(0);
          setIsTransitioning(false);
          playLine(nextScene, 0, playableScenesArr);
        } else {
          setIsTransitioning(false);
          setIsPlaying(false);
          setCompleted(true);
          if (audioRef.current) audioRef.current.pause();
        }
      }, 1400);
      return;
    }

    setCurrentScene(sceneIdx);
    setCurrentLine(lineIdx);
    setShowSubtitle(true);

    const lineObj = dialogueList[lineIdx];

    if (voiceEnabled && lineObj.text) {
      window.speechSynthesis.cancel();
      const synth = new SpeechSynthesisUtterance(lineObj.text);
      const assignedVoice = voiceMapRef.current[lineObj.character];
      if (assignedVoice) synth.voice = assignedVoice;

      const params = speechParams(lineObj.emotion);
      synth.rate = params.rate;
      synth.pitch = params.pitch;
      synth.volume = params.volume;

      let fallbackTriggered = false;

      const advanceNext = () => {
        if (fallbackTriggered) return;
        fallbackTriggered = true;
        timerRef.current = setTimeout(() => {
          playLine(sceneIdx, lineIdx + 1, playableScenesArr);
        }, 600);
      };

      synth.onend = advanceNext;
      synth.onerror = advanceNext;

      const durationEstimate = Math.max(3000, (lineObj.text.length / 15) * 1000 + 1000);
      timerRef.current = setTimeout(advanceNext, durationEstimate);

      window.speechSynthesis.speak(synth);

    } else {
      const displayDuration = Math.max(3500, lineObj.text.length * 70);
      timerRef.current = setTimeout(() => {
        playLine(sceneIdx, lineIdx + 1, playableScenesArr);
      }, displayDuration);
    }
  }, [voiceEnabled]);

  const play = () => {
    const playableScenesArr = (result?.scenes || []).filter(s => s && (s.dialogue?.length > 0 || (s.action && s.action.length > 5)));
    if (!playableScenesArr.length) return;

    if (completed) {
      setCompleted(false);
      setCurrentScene(0);
      setCurrentLine(0);
    }

    setIsPlaying(true);
    hideControlsSoon();

    if (audioRef.current && musicEnabled) {
      audioRef.current.play().catch(() => {});
    }

    const startScene = completed ? 0 : currentScene;
    const startLineIdx = completed ? 0 : currentLine;
    playLine(startScene, startLineIdx, playableScenesArr);
  };

  const pause = () => {
    setIsPlaying(false);
    setShowControls(true);
    clearTimeout(timerRef.current);
    clearTimeout(controlsRef.current);
    window.speechSynthesis.cancel();
    if (audioRef.current) audioRef.current.pause();
  };

  const restart = () => {
    clearTimeout(timerRef.current);
    window.speechSynthesis.cancel();
    if (audioRef.current) audioRef.current.pause();
    setCurrentScene(0); setCurrentLine(0);
    setCompleted(false); setShowSubtitle(false);
    setIsPlaying(false); setShowControls(true); setIsTransitioning(false);
  };

  const jumpScene = (i) => {
    clearTimeout(timerRef.current);
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setCurrentScene(i); setCurrentLine(0);
    setShowSubtitle(false); setShowControls(true);
    setCompleted(false); setIsTransitioning(false);
  };

  if (!result) return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#D6BD98", fontSize: "18px", fontFamily: "Georgia,serif" }}>Loading cinematic experience...</div>
    </div>
  );

  const { scenes, characters, genre, tone } = result;
  const playableScenes = (scenes || []).filter(s => s && (s.dialogue?.length > 0 || (s.action && s.action.length > 5)));

  if (!playableScenes?.length) return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
      <div style={{ fontSize: "32px", marginBottom: "8px" }}>🎬</div>
      <div style={{ color: "#D6BD98", fontSize: "18px", fontFamily: "Georgia,serif", marginBottom: "4px" }}>No scenes to play.</div>
      <div style={{ color: "rgba(214,189,152,0.6)", fontSize: "14px", fontFamily: "system-ui" }}>The screenplay was generated but no scenes with dialogue were found.</div>
      <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
        <button onClick={() => router.push("/script")} style={{ padding: "12px 28px", background: "rgba(64,83,76,0.4)", border: "1px solid rgba(103,125,106,0.4)", borderRadius: "30px", color: "#D6BD98", fontSize: "14px", cursor: "pointer", fontFamily: "system-ui" }}>← View Script</button>
        <button onClick={() => router.push("/")} style={{ padding: "12px 28px", background: "linear-gradient(135deg,#40534C,#677D6A)", border: "1px solid #D6BD98", borderRadius: "30px", color: "#D6BD98", fontSize: "14px", cursor: "pointer", fontFamily: "system-ui" }}>Try Again</button>
      </div>
    </div>
  );

  const scene = playableScenes[currentScene] || playableScenes[0];
  const line = scene?.dialogue?.[currentLine];
  const es = emoStyle();
  const bgImage = getSceneBg(scene?.heading);
  const speaker = characters?.find(c => c.name?.toUpperCase() === line?.character?.toUpperCase());

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden", cursor: showControls ? "default" : "none" }} onMouseMove={handleMouseMove}>
      <style>{`
        @keyframes kenBurns{0%{transform:scale(1) translate(0,0)}100%{transform:scale(1.08) translate(-1.5%,-1%)}}
        @keyframes kenBurns2{0%{transform:scale(1.06) translate(1%,0)}100%{transform:scale(1) translate(-1%,1%)}}
        @keyframes fadeInUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes shimmer{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes pulse{0%{opacity:0.5;transform:scale(1)}50%{opacity:1;transform:scale(1.1)}100%{opacity:0.5;transform:scale(1)}}
        @keyframes avatarIn{from{opacity:0;transform:translateY(-12px) scale(0.85)}to{opacity:1;transform:translateY(0) scale(1)}}
        *{box-sizing:border-box;margin:0;padding:0}
      `}</style>

      {/* BACKGROUND — Pure dark vignette corners */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center", animation: `${currentScene % 2 === 0 ? "kenBurns" : "kenBurns2"} 24s ease-in-out infinite alternate`, filter: isTransitioning ? "brightness(0)" : "brightness(0.45)", transition: "filter 1.4s ease" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 45%, rgba(0,0,0,0.85) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.98) 100%)" }} />

      {/* TOP BAR */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 30, padding: "18px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent)", opacity: showControls ? 1 : 0, transition: "opacity 0.5s" }}>
        <div style={{ fontSize: "20px", fontWeight: "800", letterSpacing: "0.16em", backgroundImage: "linear-gradient(90deg,#D6BD98,#677D6A,#D6BD98)", backgroundSize: "200%", animation: "shimmer 4s ease infinite", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textTransform: "uppercase", cursor: "pointer", fontFamily: "Georgia,serif" }} onClick={() => router.push("/")}>Scenica</div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Music toggle */}
          <button onClick={() => setMusicEnabled(p => !p)} title={musicEnabled ? "Mute music" : "Enable music"} style={{ padding: "6px 12px", background: "rgba(64,83,76,0.5)", backdropFilter: "blur(10px)", border: `2.5px solid ${musicEnabled ? "#D6BD98" : "rgba(103,125,106,0.5)"}`, borderRadius: "20px", color: "#D6BD98", fontSize: "13px", cursor: "pointer", fontFamily: "system-ui", transition: "all 0.2s" }}>
            {musicEnabled ? "🎵 Music" : "🔇 Music"}
          </button>
          {/* Voice toggle */}
          <button onClick={() => setVoiceEnabled(p => !p)} title={voiceEnabled ? "Mute voices" : "Enable voices"} style={{ padding: "6px 12px", background: "rgba(64,83,76,0.5)", backdropFilter: "blur(10px)", border: `2.5px solid ${voiceEnabled ? "#D6BD98" : "rgba(103,125,106,0.5)"}`, borderRadius: "20px", color: "#D6BD98", fontSize: "13px", cursor: "pointer", fontFamily: "system-ui", transition: "all 0.2s" }}>
            {voiceEnabled ? "🎙 Voices" : "🔕 Voices"}
          </button>
          {/* Volume slider */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#D6BD98" }}>🔊</span>
            <input type="range" min="0" max="1" step="0.05" value={volume} onChange={e => setVolume(parseFloat(e.target.value))}
              style={{ width: "70px", accentColor: "#D6BD98", cursor: "pointer" }} />
          </div>
          <div style={{ padding: "5px 14px", borderRadius: "20px", background: "rgba(64,83,76,0.5)", backdropFilter: "blur(10px)", border: "2px solid rgba(103,125,106,0.5)", fontSize: "12px", color: "#D6BD98", fontFamily: "system-ui" }}>{genre} · {tone}</div>
          <button onClick={() => router.push("/script")} style={{ padding: "7px 16px", background: "rgba(64,83,76,0.5)", backdropFilter: "blur(10px)", border: "2.5px solid #D6BD98", borderRadius: "20px", color: "#D6BD98", fontSize: "12px", cursor: "pointer", fontFamily: "system-ui", transition: "all 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(103,125,106,0.6)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(64,83,76,0.5)"}>Script ↗</button>
        </div>
      </div>

      {/* SCENE LABEL */}
      {showControls && scene && (
        <div style={{ position: "absolute", top: "74px", left: "28px", zIndex: 30, animation: "fadeIn 0.4s ease forwards" }}>
          <div style={{ fontSize: "10px", color: "rgba(214,189,152,0.6)", fontFamily: "system-ui", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: "3px" }}>Scene {currentScene + 1} of {scenes.length}</div>
          <div style={{ fontSize: "13px", color: "#D6BD98", fontFamily: "system-ui", letterSpacing: "0.04em" }}>{scene.heading}</div>
        </div>
      )}

      {/* EMOTION INDICATOR */}
      {isPlaying && line && (
        <div style={{ position: "absolute", top: "74px", right: "28px", zIndex: 30, display: "flex", alignItems: "center", gap: "7px", opacity: showControls ? 1 : 0.55, transition: "opacity 0.5s" }}>
          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#D6BD98", boxShadow: "0 0 10px rgba(214,189,152,0.5)", animation: "pulse 2s ease infinite" }} />
          <span style={{ fontSize: "11px", color: "#D6BD98", fontFamily: "system-ui", letterSpacing: "0.1em", textTransform: "uppercase" }}>{line.emotion}</span>
        </div>
      )}

      {/* SUBTITLE AREA */}
      <div style={{ position: "absolute", bottom: "155px", left: "50%", transform: "translateX(-50%)", width: "88%", maxWidth: "820px", zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center" }}>

        {isPlaying && line && showSubtitle && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "0" }}>
            {/* Speaker avatar */}
            {speaker && (
              <div style={{ animation: "avatarIn 0.4s ease forwards", marginBottom: "-18px", zIndex: 2 }}>
                <div style={{ borderRadius: "50%", overflow: "hidden", border: "2.5px solid #D6BD98", boxShadow: "0 0 24px rgba(214,189,152,0.4), 0 4px 20px rgba(0,0,0,0.8)" }}>
                  <CharacterAvatarSVG char={speaker} size={60} />
                </div>
              </div>
            )}

            {/* Subtitle box */}
            <div style={{ animation: "fadeInUp 0.4s ease forwards", width: "100%", textAlign: "center" }}>
              <div style={{ display: "inline-block", padding: "24px 40px 20px", background: "rgba(26,54,54,0.85)", backdropFilter: "blur(18px)", borderRadius: "20px", border: "2.5px solid rgba(214,189,152,0.6)", boxShadow: "0 8px 48px rgba(0,0,0,0.7)", maxWidth: "100%" }}>
                {/* Character name */}
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#D6BD98", letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "system-ui", marginBottom: "10px" }}>
                  {line.character}{line.parenthetical ? <span style={{ fontWeight: "400", opacity: 0.7 }}> · {line.parenthetical}</span> : ""}
                </div>
                {/* Dialogue text */}
                <div style={{ fontSize: "clamp(17px,2.3vw,23px)", color: "#D6BD98", lineHeight: "1.55", fontFamily: "Georgia,serif", fontWeight: "300", textShadow: "0 2px 16px rgba(0,0,0,0.95)", letterSpacing: "0.01em" }}>
                  "{line.text}"
                </div>
              </div>
            </div>
          </div>
        )}

        {!isPlaying && !completed && (
          <div style={{ animation: "fadeIn 1s ease forwards", textAlign: "center" }}>
            <div style={{ color: "rgba(214,189,152,0.7)", fontSize: "16px", fontFamily: "Georgia,serif", fontStyle: "italic", marginBottom: "8px" }}>
              Press play to begin your cinematic experience
            </div>
            <div style={{ fontSize: "12px", color: "rgba(214,189,152,0.4)", fontFamily: "system-ui", letterSpacing: "0.06em" }}>
              {voiceEnabled ? "🎙 Voices on" : "🔕 Voices off"} · {musicEnabled ? "🎵 Music on" : "🔇 Music off"}
            </div>
          </div>
        )}

        {completed && (
          <div style={{ animation: "fadeInUp 0.8s ease forwards", textAlign: "center" }}>
            <div style={{ fontSize: "12px", color: "rgba(214,189,152,0.6)", fontFamily: "system-ui", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: "12px" }}>✦  THE END  ✦</div>
            <div style={{ fontSize: "24px", color: "#D6BD98", fontFamily: "Georgia,serif", fontStyle: "italic", marginBottom: "6px" }}>Your story has been told.</div>
            <div style={{ fontSize: "13px", color: "rgba(214,189,152,0.6)", fontFamily: "system-ui" }}>{genre} · {tone} · {scenes.length} scenes</div>
            <button onClick={restart} style={{ marginTop: "20px", padding: "12px 28px", background: "linear-gradient(135deg,#40534C,#677D6A)", border: "2.5px solid #D6BD98", borderRadius: "30px", color: "#D6BD98", fontSize: "14px", cursor: "pointer", fontFamily: "system-ui", fontWeight: "600", boxShadow: "0 4px 24px rgba(26,54,54,0.5)" }}>
              ↺ Watch Again
            </button>
          </div>
        )}
      </div>

      {/* BOTTOM CONTROLS */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 30, padding: "14px 28px 22px", background: "linear-gradient(to top, rgba(0,0,0,0.92), transparent)", opacity: showControls ? 1 : 0, transition: "opacity 0.5s" }}>

        {/* Progress bar */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
            <span style={{ fontSize: "10px", color: "rgba(214,189,152,0.6)", fontFamily: "system-ui" }}>Scene {currentScene + 1} / {playableScenes.length}</span>
            <span style={{ fontSize: "10px", color: "rgba(214,189,152,0.6)", fontFamily: "system-ui" }}>Line {currentLine + 1} / {scene?.dialogue?.length || 0}</span>
          </div>
          <div style={{ height: "2px", background: "rgba(64,83,76,0.6)", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: "2px", background: "#D6BD98", width: `${(currentScene / Math.max(playableScenes.length - 1, 1)) * 100}%`, transition: "width 0.6s ease" }} />
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px" }}>
          {[
            { icon: "↺", title: "Restart", fn: restart },
            { icon: "⏮", title: "Prev Scene", fn: () => jumpScene(Math.max(0, currentScene - 1)) },
          ].map(b => (
            <button key={b.title} onClick={b.fn} title={b.title} style={{ width: "42px", height: "42px", borderRadius: "50%", background: "rgba(64,83,76,0.5)", backdropFilter: "blur(10px)", border: "2px solid rgba(103,125,106,0.5)", color: "#D6BD98", fontSize: "17px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(103,125,106,0.6)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(64,83,76,0.5)"}>
              {b.icon}
            </button>
          ))}

          <button onClick={isPlaying ? pause : play} style={{ width: "62px", height: "62px", borderRadius: "50%", background: "linear-gradient(135deg,#40534C,#677D6A)", border: "2.5px solid #D6BD98", color: "#D6BD98", fontSize: "22px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 28px rgba(26,54,54,0.5)", transition: "all 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "0 6px 38px rgba(103,125,106,0.7)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "0 4px 28px rgba(26,54,54,0.5)"}>
            {isPlaying ? "⏸" : "▶"}
          </button>

          {[
            { icon: "⏭", title: "Next Scene", fn: () => jumpScene(Math.min(playableScenes.length - 1, currentScene + 1)) },
            { icon: "✍", title: "View Script", fn: () => router.push("/script") },
          ].map(b => (
            <button key={b.title} onClick={b.fn} title={b.title} style={{ width: "42px", height: "42px", borderRadius: "50%", background: "rgba(64,83,76,0.5)", backdropFilter: "blur(10px)", border: "2px solid rgba(103,125,106,0.5)", color: "#D6BD98", fontSize: "17px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(103,125,106,0.6)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(64,83,76,0.5)"}>
              {b.icon}
            </button>
          ))}
        </div>

        {/* Scene dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: "7px", marginTop: "12px" }}>
          {playableScenes.map((s, i) => (
            <button key={i} onClick={() => jumpScene(i)} title={`Scene ${i + 1}: ${s.location}`} style={{ width: currentScene === i ? "28px" : "7px", height: "7px", borderRadius: "4px", background: currentScene === i ? "#D6BD98" : "rgba(103,125,106,0.4)", border: "none", cursor: "pointer", transition: "all 0.3s ease", padding: 0 }} />
          ))}
        </div>
      </div>
    </div>
  );
}