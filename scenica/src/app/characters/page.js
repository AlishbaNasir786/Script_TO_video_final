"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Helper to sanitize extracted description snippets by removing markdown formatting,
// quotes, dialogue verbs, and trailing punctuation.
function cleanDescriptionText(str) {
  if (!str) return "";
  const cleaned = str
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/[`_]/g, "")
    .replace(/["“'”].*$/g, "")
    .replace(/\b(says|said|replied|replies|asked|asks|whispered|whispers|shouted|shouts|exclaimed|exclaims|stated|states|noted|notes|added|adds)\b.*$/i, "")
    .replace(/[:,;-]\s*$/g, "")
    .trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "";
}

// ── Dynamic story-derived detail extraction helper ──────────────────────────────
// Mines original story text for appearance, clothing, personality, and gender signal
// so fallback & sync paths use rich story context instead of generic static placeholder strings.
function inferCharacterDetails(name, role, storyText) {
  const nameLower = (name || "").toLowerCase();
  const lower = (storyText || "").toLowerCase();

  const sentences = lower.split(/[.!?]+/).filter(s => nameLower && s.includes(nameLower));
  const context = sentences.join(" ");

  // 1. Gender inference from story pronouns or entity names
  let gender = "Unspecified";
  if (context || nameLower) {
    const hasFemale = /\b(she|her|hers|woman|girl|female|lady|mother|sister|daughter|queen|princess|ms|mrs)\b/i.test(context);
    const hasMale = /\b(he|him|his|man|boy|male|gentleman|father|brother|son|king|prince|mr)\b/i.test(context);
    if (hasFemale && !hasMale) gender = "Female";
    else if (hasMale && !hasFemale) gender = "Male";
    else if (/\b(system|voice|ai|hologram|machine|intercom|entity)\b/i.test(nameLower || context)) gender = "Synthetic Entity";
  }

  // 2. Appearance: extract physical descriptions or visual traits, stripping quotes & markdown
  let appearance = "";
  if (name && storyText) {
    const escName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const descMatch = storyText.match(
      new RegExp(`\\b${escName}\\s+(?:was|is)\\s+([^.!?]{5,60})`, "i")
    );
    if (descMatch) {
      appearance = cleanDescriptionText(descMatch[1]);
    }
  }

  if (!appearance && context) {
    const adjMatch = context.match(/\b(tall|short|old|young|small|large|glowing|weathered|gentle|fierce|quiet|elderly|slender|broad-shouldered|hooded|robed|radiant|shadowy|mysterious)\b[^.!?]{0,40}/i);
    if (adjMatch) {
      appearance = cleanDescriptionText(adjMatch[0]);
    }
  }

  if (!appearance) {
    appearance = role === "Protagonist"
      ? "The central figure of the story, described through their choices and actions."
      : "A key supporting presence in the story, defined through their interactions.";
  }

  // 3. Clothing: garment or attire references near character name
  let clothing = "";
  if (context) {
    const clothMatch = context.match(/\b(wearing|clad in|dressed in|robe|cloak|suit|armor|jacket|hat|boots|tunic|dress|attire|garb|vestment|uniform)\b[^.!?]{0,40}/i);
    if (clothMatch) {
      clothing = clothMatch[0].charAt(0).toUpperCase() + clothMatch[0].slice(1);
    }
  }
  if (!clothing) {
    clothing = "Unspecified — not described in the original story.";
  }

  // 4. Personality: rich narrative trait inference based on story actions
  const traitWords = ["brave", "wise", "curious", "gentle", "stubborn", "kind", "fierce", "cautious", "determined", "playful", "loyal", "mysterious", "quiet", "bold", "persistent", "observant", "inquisitive", "analytical", "protective"];
  const foundTraits = traitWords.filter(t => context.includes(t));

  let personality = "";
  const isArchivist = /\b(archivist|keeper|librarian|scholar|scientist|elder|guardian|master)\b/i.test(nameLower || context);

  if (foundTraits.length > 0) {
    const traitStr = foundTraits.map(t => t[0].toUpperCase() + t.slice(1)).join(", ");
    personality = isArchivist
      ? `${traitStr}, knowledgeable, and secretive; safeguards ancient records and speaks with quiet authority.`
      : `${traitStr} and observant; shaped by their key actions in the story's events.`;
  } else {
    const asksQuestions = /\b(asked|asks|wondered|wonders|questioned|questions|inquired|inquires)\b/i.test(context);
    const givesAnswers = /\b(replied|replies|answered|answers|explained|explains|stated|states)\b/i.test(context);

    if (isArchivist || (givesAnswers && !asksQuestions)) {
      personality = "Mysterious, knowledgeable, and secretive; safeguards ancient records and oversees story developments.";
    } else if (asksQuestions) {
      personality = "Curious and inquisitive; actively questions unexplained events and seeks underlying truths.";
    } else {
      personality = role === "Protagonist"
        ? "Driven by the story's central conflict, revealed through their key choices."
        : "Plays a distinct role in unfolding events, defined by how they interact with other characters.";
    }
  }

  return { appearance, clothing, personality, gender };
}

// ─── Cinematic SVG Avatar — 4-Color Palette System ──────────────────────────────
function CharacterAvatar({ char, size = 220 }) {
  const isFemale = (char.gender || "").toLowerCase().includes("female");
  const initial = (char.name || "?")[0].toUpperCase();
  const name = char.name || "";

  // Exact 4-color palette elements
  const p = {
    a: "#1A3636",
    b: "#40534C",
    accent: "#D6BD98",
    light: "#D6BD98"
  };
  const s = size;
  const uid = name.replace(/\s/g, "_") + "_" + size;

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`bg_${uid}`} cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor={p.b} />
          <stop offset="100%" stopColor={p.a} />
        </radialGradient>
        <radialGradient id={`glow_${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={p.accent} stopOpacity="0.25" />
          <stop offset="100%" stopColor={p.accent} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`clip_${uid}`}>
          <rect width={s} height={s} rx={s * 0.12} />
        </clipPath>
      </defs>

      {/* Base */}
      <rect width={s} height={s} rx={s * 0.12} fill={`url(#bg_${uid})`} />

      {/* Glow center */}
      <ellipse cx={s * 0.5} cy={s * 0.42} rx={s * 0.45} ry={s * 0.38} fill={`url(#glow_${uid})`} />

      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((v, i) => (
        <line key={`h${i}`} x1={0} y1={s * v} x2={s} y2={s * v} stroke={p.accent} strokeOpacity="0.15" strokeWidth="1" />
      ))}
      {[0.25, 0.5, 0.75].map((v, i) => (
        <line key={`v${i}`} x1={s * v} y1={0} x2={s * v} y2={s} stroke={p.accent} strokeOpacity="0.15" strokeWidth="1" />
      ))}

      {/* Corner brackets */}
      {[[0, 0, 1, 1], [s, 0, -1, 1], [0, s, 1, -1], [s, s, -1, -1]].map(([x, y, dx, dy], i) => (
        <g key={`corner_${i}`}>
          <line x1={x} y1={y + dy * s * 0.08} x2={x} y2={y} stroke={p.accent} strokeOpacity="0.5" strokeWidth="1.5" />
          <line x1={x + dx * s * 0.08} y1={y} x2={x} y2={y} stroke={p.accent} strokeOpacity="0.5" strokeWidth="1.5" />
        </g>
      ))}

      {/* Silhouette shape */}
      {isFemale ? (
        <g opacity="0.25">
          <ellipse cx={s * 0.5} cy={s * 0.3} rx={s * 0.14} ry={s * 0.16} fill={p.light} />
          <ellipse cx={s * 0.5} cy={s * 0.22} rx={s * 0.17} ry={s * 0.1} fill={p.light} />
          <rect x={s * 0.33} y={s * 0.22} width={s * 0.06} height={s * 0.22} rx={s * 0.03} fill={p.light} />
          <rect x={s * 0.61} y={s * 0.22} width={s * 0.06} height={s * 0.22} rx={s * 0.03} fill={p.light} />
          <path d={`M${s * 0.28} ${s * 0.52} Q${s * 0.5} ${s * 0.48} ${s * 0.72} ${s * 0.52} L${s * 0.78} ${s * 0.75} L${s * 0.22} ${s * 0.75}Z`} fill={p.light} />
        </g>
      ) : (
        <g opacity="0.25">
          <ellipse cx={s * 0.5} cy={s * 0.3} rx={s * 0.13} ry={s * 0.15} fill={p.light} />
          <ellipse cx={s * 0.5} cy={s * 0.2} rx={s * 0.14} ry={s * 0.07} fill={p.light} />
          <path d={`M${s * 0.24} ${s * 0.52} Q${s * 0.5} ${s * 0.47} ${s * 0.76} ${s * 0.52} L${s * 0.82} ${s * 0.75} L${s * 0.18} ${s * 0.75}Z`} fill={p.light} />
        </g>
      )}

      {/* Large initial */}
      <text
        x={s * 0.5} y={s * 0.56}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={s * 0.48}
        fontWeight="100"
        fontFamily="Georgia, serif"
        fill={p.light}
        fillOpacity="0.92"
        letterSpacing="-4"
      >{initial}</text>

      {/* Bottom strip */}
      <rect x={0} y={s * 0.82} width={s} height={s * 0.18} rx={0} fill={p.a} fillOpacity="0.7" />
      <rect x={0} y={s * 0.88} width={s} height={s * 0.12} rx="0 0 12 12" fill={p.a} fillOpacity="0.5" />

      {/* Name in strip */}
      <text
        x={s * 0.5} y={s * 0.915}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={s * 0.095} fontWeight="600"
        fontFamily="system-ui, sans-serif"
        fill={p.accent} letterSpacing="3"
      >{name.toUpperCase()}</text>

      {/* Emotion dot top right */}
      <circle cx={s * 0.84} cy={s * 0.16} r={s * 0.035} fill={p.light} fillOpacity="0.9" />
      <circle cx={s * 0.84} cy={s * 0.16} r={s * 0.055} fill={p.light} fillOpacity="0.15" />
    </svg>
  );
}

export function PlayerAvatar({ char, size = 56 }) {
  return <CharacterAvatar char={char} size={size} />;
}

// ─── Shared dialogue extractor ─────────────────────────────────────────────────
function getCharacterDialogue(screenplay, characterName, scenes, dialogueRows = []) {
  const charNameNorm = (characterName || "").trim().toUpperCase();
  const dialogues = [];

  // 1. Check dialogueRows (has extracted & AI-enhanced lines for this character)
  if (dialogueRows && Array.isArray(dialogueRows) && dialogueRows.length > 0) {
    dialogueRows.forEach(row => {
      const rowChar = (row.character || "").trim().toUpperCase();
      if (
        rowChar === charNameNorm ||
        (rowChar.length > 2 && charNameNorm.includes(rowChar)) ||
        (charNameNorm.length > 2 && rowChar.includes(charNameNorm))
      ) {
        dialogues.push({
          text: row.enhanced || row.original,
          original: row.original,
          emotion: row.emotion || "neutral",
          parenthetical: row.parenthetical || "",
          isEnhanced: row.status === "done" && !!row.enhanced
        });
      }
    });
  }

  // 2. Check scenes fallback
  if (dialogues.length === 0 && scenes && Array.isArray(scenes)) {
    scenes.forEach(sc => {
      (sc.dialogue || []).forEach(d => {
        const dChar = (d.character || "").trim().toUpperCase();
        if (
          dChar && (
            dChar === charNameNorm ||
            (dChar.length > 2 && charNameNorm.includes(dChar)) ||
            (charNameNorm.length > 2 && dChar.includes(charNameNorm))
          ) && d.text
        ) {
          dialogues.push({
            text: d.text,
            original: d.text,
            emotion: d.emotion || "neutral",
            parenthetical: d.parenthetical || "",
            isEnhanced: d.isEnhanced || false
          });
        }
      });
    });
  }

  // 3. Fallback: parse raw screenplay text
  if (dialogues.length === 0 && screenplay) {
    const cleaned = screenplay
      .replace(/<center>\s*([^<]+?)\s*<\/center>/gi, "$1")
      .replace(/^>\s*/gm, "")
      .replace(/<[^>]+>/g, "");

    const lines = cleaned.split("\n");
    const nameUpper = characterName.toUpperCase().trim();

    function matchesCue(rawCue) {
      if (!rawCue || typeof rawCue !== "string") return false;
      const c = rawCue.replace(/\s*\([^)]+\)\s*/g, "").replace(/:$/, "").trim();
      return c === nameUpper || (c.length > 2 && nameUpper.includes(c));
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (matchesCue(line.toUpperCase())) {
        let parenthetical = "";
        let j = i + 1;
        if (j < lines.length && lines[j].trim().startsWith("(")) {
          parenthetical = lines[j].trim().replace(/[()]/g, "").trim();
          j++;
        }
        const parts = [];
        while (j < lines.length) {
          const l = lines[j].trim();
          if (!l || l.match(/^(INT\.|EXT\.|FADE|CUT|SCENE)/i) || (l === l.toUpperCase() && l.length < 30 && !l.includes("."))) {
            break;
          }
          if (!l.startsWith("[EMOTION:")) parts.push(l);
          j++;
        }
        const text = parts.join(" ").trim();
        if (text.length >= 2) {
          dialogues.push({ text, original: text, emotion: "neutral", parenthetical });
        }
      }
    }
  }

  const seen = new Set();
  return dialogues.filter(d => {
    const key = (d.text || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emotionColor() {
  return "#D6BD98";
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function Characters() {
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [acceptedIds, setAcceptedIds] = useState(new Set());
  const [showSuggestionsPanel, setShowSuggestionsPanel] = useState(false);
  const [enhancingIndex, setEnhancingIndex] = useState(null);
  const [dialogueRows, setDialogueRows] = useState([]);
  const [enhancingRowIdx, setEnhancingRowIdx] = useState(null);
  const [isEnhancingAll, setIsEnhancingAll] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored = sessionStorage.getItem("scenicaResult");
    if (!stored) { router.push("/"); return; }
    let parsed = JSON.parse(stored);

    const storyText = sessionStorage.getItem("scenicaStory") || "";

    // ── UNIVERSAL NON-CHARACTER name guard ─────────────────────────────────
    // Strip pronouns, articles, conjunctions from whatever /api/generate returned.
    // This is a safety net against any upstream extraction bugs.
    // The list is language-level words only — never story-specific names.
    const NON_CHAR_NAMES = new Set([
      // Pronouns & articles
      "SHE", "HE", "THEY", "IT", "WE", "YOU", "I", "ME", "HIM", "HER", "THEM",
      "THE", "A", "AN", "AND", "OR", "BUT", "SO", "IF", "ON", "AT", "IN",
      "BECAUSE", "THEN", "WHEN", "THAT", "THIS", "WHAT", "HOW", "WHY", "WHERE",
      "SUDDENLY", "BEFORE", "AFTER", "THUS", "THOSE", "THESE", "WHICH", "ONCE",
      // Affirmations / negations
      "YES", "NO", "OKAY", "OK", "SURE", "INDEED", "PERHAPS", "MAYBE", "NEVER", "ALWAYS",
      // Screenplay format labels — NEVER character names
      "DIALOGUE", "ACTION", "SCENE", "SHOT", "CUT", "FADE", "SMASH", "DISSOLVE",
      "INT", "EXT", "NARRATOR", "NARRATION", "VOICE", "OVER", "CONTINUED",
      "SCRIPT", "SCREENPLAY", "CHARACTER", "PROTAGONIST", "ANTAGONIST",
      // Common false-positives from formatting
      "NOTE", "END", "BEGIN", "START", "TITLE", "HEADER", "SECTION", "PART",
    ]);
    // Also reject possessive forms like "NAME'S" regardless of the name
    const isPossessive = (name) => /^[A-Z]+'S$/.test(name);

    if (Array.isArray(parsed.characters) && parsed.characters.length > 0) {
      const cleaned = parsed.characters.filter(c => {
        const nameUp = (c.name || "").trim().toUpperCase();
        return nameUp.length > 1 && !NON_CHAR_NAMES.has(nameUp) && !isPossessive(nameUp);
      });
      if (cleaned.length !== parsed.characters.length) {
        parsed = { ...parsed, characters: cleaned };
        sessionStorage.setItem("scenicaResult", JSON.stringify(parsed));
      }
    }

    // ── Auto-recover character list if empty after guard above ───────────────
        const isProductOnly = parsed.showCharacter === false;
    if (!isProductOnly && (!parsed.characters || !Array.isArray(parsed.characters) || parsed.characters.length === 0)) {
      // Priority 1: extract from parsed scenes (dialogue attribution already done by Claude)
      const sceneChars = new Set();
      (parsed.scenes || []).forEach(sc => {
        (sc.dialogue || []).forEach(d => {
          if (d && d.character) {
            const up = d.character.trim().toUpperCase();
            if (!NON_CHAR_NAMES.has(up) && up.length > 1) sceneChars.add(up);
          }
        });
      });

      let rebuilt = Array.from(sceneChars).map((name, idx) => {
        const role = idx === 0 ? "Protagonist" : "Supporting";
        const { appearance, clothing, personality, gender } = inferCharacterDetails(name, role, storyText);
        return {
          name,
          role,
          gender,
          age: "Unspecified",
          appearance,
          clothing,
          personality,
          emotion: "hopeful"
        };
      });

      // Priority 2: extract bold names OR proper noun names from story text
      if (rebuilt.length === 0 && storyText) {
        const found = new Set();

        // 2a. Match bold names (e.g. **LARA**, **Guardian**, **Arthur**)
        const boldMatches = [...storyText.matchAll(/\*\*([A-Za-z][A-Za-z\s]{1,25})\*\*/g)];
        for (const bm of boldMatches) {
          const up = bm[1].trim().toUpperCase();
          if (up.length > 1 && !NON_CHAR_NAMES.has(up) && !isPossessive(up) && !/^\d+$/.test(up)) {
            found.add(up);
          }
        }

        // 2b. Match capitalized proper nouns (e.g. Lara, Guardian, Arthur, Merlin)
        if (found.size === 0) {
          const words = storyText.match(/\b[A-Z][a-z]{2,20}\b/g) || [];
          for (const w of words) {
            const up = w.toUpperCase();
            if (!NON_CHAR_NAMES.has(up) && !isPossessive(up)) {
              found.add(up);
            }
          }
        }

        rebuilt = Array.from(found).slice(0, 6).map((name, idx) => {
          const role = idx === 0 ? "Protagonist" : "Supporting";
          const { appearance, clothing, personality, gender } = inferCharacterDetails(name, role, storyText);
          return { name, role, gender, age: "Unspecified", appearance, clothing, personality, emotion: "hopeful" };
        });
      }

      if (rebuilt.length > 0) {
        parsed = { ...parsed, characters: rebuilt };
        sessionStorage.setItem("scenicaResult", JSON.stringify(parsed));
      }
    }

    setResult(parsed);

    const ALIAS_MAP = {};
    const STOP_WORDS = new Set([
      "THE", "A", "AN", "AND", "OR", "BUT", "SO", "IF", "ON", "AT", "IN", "TO", "OF", "WITH", "BY",
      "SHE", "HE", "THEY", "IT", "WE", "YOU", "I", "ME", "HIM", "HER", "THEM",
      "BECAUSE", "THEN", "WHEN", "THAT", "THIS", "WHAT", "HOW", "WHY", "WHERE"
    ]);
    if (parsed?.characters) {
      parsed.characters.forEach(c => {
        if (!c || !c.name) return;
        const norm = c.name.trim().toUpperCase();
        if (!STOP_WORDS.has(norm)) {
          ALIAS_MAP[norm] = norm;
          const cleanName = norm.replace(/^THE\s+/, "").trim();
          if (cleanName && !STOP_WORDS.has(cleanName)) {
            ALIAS_MAP[cleanName] = norm;
            ALIAS_MAP["THE " + cleanName] = norm;
          }
          const words = cleanName.split(/\s+/).filter(w => !STOP_WORDS.has(w) && w.length > 2);
          words.forEach(w => { ALIAS_MAP[w] = norm; });
        }
      });
    }

    const resolveChar = (name) => {
      if (!name) return name;
      const up = name.trim().toUpperCase();
      const withoutThe = up.replace(/^THE\s+/, "").trim();
      return ALIAS_MAP[up] || ALIAS_MAP[withoutThe] || up;
    };

    // ── Dialogue rows: 4-tier pipeline ──────────────────────────────────────
    // Tier 0: parsed.claudeDialogue  — saved directly from /api/generate Step 1 (most reliable)
    // Tier 1: parsed.scenes[].dialogue — from screenplay parser
    // Tier 2: quote regex over raw storyText
    // Tier 3: fresh Claude API call  — only if all above return 0
    const buildRowsFromScenes = async () => {
      const rows = [];

      // Tier 1 — Full screenplay scenes (contains complete 3-act arc with intro, climax & closing resolution)
      let sceneRows = [];
      (parsed?.scenes || []).forEach(sc => {
        (sc.dialogue || []).forEach(d => {
          if (!d || !d.text || !d.character) return;
          const charName = resolveChar(d.character) || d.character.trim().toUpperCase();
          sceneRows.push({ character: charName, original: d.text, enhanced: "", emotion: d.emotion || "neutral", parenthetical: d.parenthetical || "", status: "idle" });
        });
      });

      if (sceneRows.length >= (parsed?.claudeDialogue?.length || 0) && sceneRows.length > 0) {
        sceneRows.forEach(r => rows.push(r));
      } else if (Array.isArray(parsed?.claudeDialogue) && parsed.claudeDialogue.length > 0) {
        parsed.claudeDialogue.forEach(d => {
          const charName = resolveChar(d.speaker) || (d.speaker || "").trim().toUpperCase();
          const text = (d.quote || "").trim();
          if (charName && text) {
            rows.push({ character: charName, original: text, enhanced: "", emotion: "neutral", parenthetical: "", status: "idle" });
          }
        });
      }

      // Tier 2 — quote regex
      if (rows.length === 0 && storyText) {
        let charList = (parsed?.characters || []).map(c => c.name.toUpperCase());
        if (charList.length < 2) {
          const boldNames = [...storyText.matchAll(/\*\*([A-Za-z][A-Za-z\s]{1,25})\*\*/g)].map(m => m[1].trim().toUpperCase());
          const extraChars = [...new Set(boldNames)].filter(n => !NON_CHAR_NAMES.has(n) && n.length > 1);
          charList = [...new Set([...charList, ...extraChars])];
          if (charList.length < 2) charList.push(storyText.match(/\b(system|voice|hologram|intercom|speaker|guardian|ai|keeper)\b/i)?.[1]?.toUpperCase() || "SYSTEM");
        }
        const quoteRegex = /[""]([^""]+)[""]/g;
        let qm; let idx = 0;
        while ((qm = quoteRegex.exec(storyText)) !== null) {
          const txt = qm[1].trim();
          if (txt.length > 2) { rows.push({ character: charList[idx % charList.length], original: txt, enhanced: "", emotion: "neutral", parenthetical: "", status: "idle" }); idx++; }
        }
      }

      // Tier 3 — fresh Claude call (only for narrated stories with zero literal quotes)
      if (rows.length === 0 && storyText) {
        try {
          const res = await fetch("/api/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ story: storyText, mode: "extract-dialogue", characters: parsed?.characters || [] })
          });
          if (res.ok) {
            const data = await res.json();
            (data.dialogues || []).forEach(d => {
              const charName = resolveChar(d.character) || (d.character || "").trim().toUpperCase();
              const text = (d.line || d.text || "").trim();
              if (charName && text) rows.push({ character: charName, original: text, enhanced: "", emotion: "neutral", parenthetical: "", status: "idle" });
            });
          }
        } catch (e) { console.warn("Claude dialogue fallback failed:", e); }
      }

      const validRows = rows.filter(r => r.character && !NON_CHAR_NAMES.has(r.character.trim().toUpperCase()));
      
      // 45-Second Rule Enforcer: Cap dialogue rows to 95 total spoken words max (~45s)
      let wordAccumulator = 0;
      const cappedRows = [];
      for (const r of validRows) {
        const lineWords = (r.original || "").trim().split(/\s+/).filter(Boolean).length;
        if (wordAccumulator + lineWords <= 98 || cappedRows.length === 0) {
          cappedRows.push(r);
          wordAccumulator += lineWords;
        } else {
          break;
        }
      }

      setDialogueRows(cappedRows);
      if (cappedRows.length > 0) autoEnhanceAll(cappedRows, parsed);

      // Sync new speakers into character cards
      if (rows.length > 0) {
        const existingNames = new Set((parsed.characters || []).map(c => (c.name || "").trim().toUpperCase()));
        const newSpeakers = [];
        [...new Set(rows.map(r => (r.character || "").trim().toUpperCase()))].forEach((spk, spkIdx) => {
          if (spk && spk.length > 1 && !existingNames.has(spk) && !NON_CHAR_NAMES.has(spk)) {
            const role = (existingNames.size === 0 && spkIdx === 0) ? "Protagonist" : "Supporting";
            const { appearance, clothing, personality, gender } = inferCharacterDetails(spk, role, storyText);
            newSpeakers.push({ name: spk, role, gender, age: "Unspecified", appearance, clothing, personality, emotion: "mysterious" });
            existingNames.add(spk);
          }
        });
        if (newSpeakers.length > 0) {
          const mergedChars = [...(parsed.characters || []), ...newSpeakers];
          parsed = { ...parsed, characters: mergedChars };
          sessionStorage.setItem("scenicaResult", JSON.stringify(parsed));
          setResult({ ...parsed });
        }
      }
    };

    buildRowsFromScenes();
  }, []);

  const fetchCharacterSuggestions = async () => {
    if (!result) return;
    setIsFetchingSuggestions(true);
    setShowSuggestionsPanel(true);
    try {
      const storyText = sessionStorage.getItem("scenicaStory") || "";
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story: storyText,
          mode: "characters",
          characters: result.characters || [],
          purposeMode: result.purposeMode || "story"
        })
      });
      const data = await res.json();
      if (res.ok) setSuggestions(data.suggestions || []);
    } catch (e) {
      console.error("Suggestion error:", e);
    } finally {
      setIsFetchingSuggestions(false);
    }
  };

  const handleAcceptSuggestion = (sug) => {
    setAcceptedIds(prev => new Set([...prev, sug.id]));
    if (!result || !result.characters?.length) return;

    const updatedChars = result.characters.map((char, idx) => {
      if (selected ? char.name === selected.name : idx === 0) {
        return {
          ...char,
          personality: (char.personality ? char.personality + " " : "") + sug.addedText
        };
      }
      return char;
    });

    const updatedResult = { ...result, characters: updatedChars };
    setResult(updatedResult);
    if (selected) {
      const updatedSel = updatedChars.find(c => c.name === selected.name);
      if (updatedSel) setSelected(updatedSel);
    }
    sessionStorage.setItem("scenicaResult", JSON.stringify(updatedResult));
  };

      useEffect(() => {
    if (!result?.characters?.length) return;
    const pending = result.characters.filter(c => !c.imageUrl);
    if (pending.length === 0) return;
    let cancelled = false;
    console.log("AUTO-PORTRAIT starting for:", pending.map(c => c.name));

    const cacheKey = (ch) => `${ch.name}|${(ch.appearance || "").slice(0, 40)}`;

    const apply = (ch, url, prompt) => {
      if (cancelled) return;
      setResult(prev => {
        const chars = prev.characters.map(c =>
          c.name === ch.name ? { ...c, imageUrl: url, imagePrompt: prompt } : c
        );
        const next = { ...prev, characters: chars };
        sessionStorage.setItem("scenicaResult", JSON.stringify(next));
        return next;
      });
      setSelected(prev =>
        prev && prev.name === ch.name ? { ...prev, imageUrl: url, imagePrompt: prompt } : prev
      );
    };

    Promise.allSettled(pending.map(async (ch) => {
      const saved = JSON.parse(sessionStorage.getItem("scenicaPortraits") || "{}");
      if (saved[cacheKey(ch)]) {
        apply(ch, saved[cacheKey(ch)].url, saved[cacheKey(ch)].prompt);
        return;
      }
      const res = await fetch("/api/portraits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character: ch }),
      });
      const data = await res.json();
      if (data.error || !data.imageUrl) throw new Error(data.error || "no image returned");
      const map = JSON.parse(sessionStorage.getItem("scenicaPortraits") || "{}");
      map[cacheKey(ch)] = { url: data.imageUrl, prompt: data.promptUsed };
      sessionStorage.setItem("scenicaPortraits", JSON.stringify(map));
      apply(ch, data.imageUrl, data.promptUsed);
    })).then(results => {
      results.forEach((r, i) => {
        if (r.status === "rejected") console.error("AUTO-PORTRAIT failed:", pending[i].name, String(r.reason));
      });
    });

    return () => { cancelled = true; };
  }, [result?.characters?.map(c => `${c.name}:${c.imageUrl ? 1 : 0}`).join("|")]);

    const [portraitLoading, setPortraitLoading] = useState(false);

  async function generatePortrait() {
    if (!selected || portraitLoading) return;
    setPortraitLoading(true);
    try {
      const res = await fetch("/api/portraits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character: selected }),
      });
      const data = await res.json();
      if (!data.imageUrl) throw new Error(data.error || "No image returned");

      const updatedChars = (result.characters || []).map(c =>
        c.name === selected.name
          ? { ...c, imageUrl: data.imageUrl, imagePrompt: data.promptUsed }
          : c
      );
      const updatedResult = { ...result, characters: updatedChars };
      setResult(updatedResult);
      setSelected(updatedChars.find(c => c.name === selected.name));
      sessionStorage.setItem("scenicaResult", JSON.stringify(updatedResult));
    } catch (e) {
      alert("Image generation failed: " + e.message);
    } finally {
      setPortraitLoading(false);
    }
  }
  const handleEnhanceLine = async (lineText, idx) => {
    if (!selected || !result) return;
    setEnhancingIndex(idx);
    try {
      const storyText = sessionStorage.getItem("scenicaStory") || "";
      const cleanLineText = (lineText || "").replace(/\s*—\s*(and I mean it|truly|from the bottom of my heart|believe me)\.?$/i, "").trim();
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story: storyText,
          mode: "enhance-line",
          lineText: cleanLineText,
          characterName: selected.name,
          personality: selected.personality || ""
        })
      });
      const data = await res.json();
      if (res.ok && data.enhancedLine) {
        const newLine = data.enhancedLine;

        let updatedScreenplay = result.screenplay || "";
        if (lineText && updatedScreenplay.includes(lineText)) {
          updatedScreenplay = updatedScreenplay.replace(lineText, newLine);
        }

        const updatedScenes = (result.scenes || []).map(sc => ({
          ...sc,
          dialogue: (sc.dialogue || []).map(d => {
            if (d.text === lineText) {
              return { ...d, text: newLine, isEnhanced: true };
            }
            return d;
          })
        }));

        const updatedResult = {
          ...result,
          screenplay: updatedScreenplay,
          scenes: updatedScenes
        };

        setResult(updatedResult);
        sessionStorage.setItem("scenicaResult", JSON.stringify(updatedResult));
      }
    } catch (e) {
      console.error("Line enhancement error:", e);
    } finally {
      setEnhancingIndex(null);
    }
  };

  const autoEnhanceAll = async (initialRows, parsedResult) => {
    const storyText = sessionStorage.getItem("scenicaStory") || "";
    setIsEnhancingAll(true);

    let liveResult = parsedResult ? { ...parsedResult } : null;

    for (let idx = 0; idx < initialRows.length; idx++) {
      const row = initialRows[idx];
      setEnhancingRowIdx(idx);
      setDialogueRows(prev => prev.map((r, i) => i === idx ? { ...r, status: "loading" } : r));
 // Never rewrite dialogue the user quoted directly in their story
      const userQuoted = storyText && row.original &&
        storyText.replace(/\s+/g, " ").includes(row.original.replace(/\.$/, "").trim());
      if (userQuoted) {
        setDialogueRows(prev => prev.map((r, i) =>
          i === idx ? { ...r, enhanced: row.original, status: "done" } : r
        ));
        continue;
      }

      let newLine = "";
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);

        const res = await fetch("/api/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            story: storyText,
            mode: "enhance-line",
            lineText: row.original,
            characterName: row.character,
            personality: ""
          })
        });
        clearTimeout(timer);

        const data = await res.json();
        if (res.ok && data.enhancedLine) {
          newLine = data.enhancedLine;
        }
      } catch (e) {
        console.warn(`Line enhancement timeout/error for row ${idx}:`, e);
      }

      if (!newLine) {
        newLine = row.original;
      }

      setDialogueRows(prev => prev.map((r, i) => i === idx ? { ...r, enhanced: newLine, status: "done" } : r));

      if (liveResult) {
        const updatedScenes = (liveResult.scenes || []).map(sc => ({
          ...sc,
          dialogue: (sc.dialogue || []).map(d => {
            if (
              d.character?.trim().toUpperCase() === row.character.trim().toUpperCase() &&
              d.text === row.original
            ) {
              return { ...d, text: newLine, isEnhanced: true };
            }
            return d;
          })
        }));

        let updatedScreenplay = liveResult.screenplay || "";
        if (row.original && updatedScreenplay.includes(row.original)) {
          updatedScreenplay = updatedScreenplay.replace(row.original, newLine);
        }

        liveResult = { ...liveResult, scenes: updatedScenes, screenplay: updatedScreenplay };
        setResult(liveResult);
        sessionStorage.setItem("scenicaResult", JSON.stringify(liveResult));
      }
    }

    setEnhancingRowIdx(null);
    setIsEnhancingAll(false);
  };

  if (!result) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(145deg,#1A3636,#162d2d)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#D6BD98", fontSize: "18px", fontFamily: "Georgia,serif" }}>Loading your story...</div>
    </div>
  );

  const { characters, screenplay, genre, tone } = result;

  const displayCharacters = characters || [];

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(145deg,#1A3636 0%,#162d2d 25%,#1A3636 50%,#142b2b 75%,#0f2222 100%)", fontFamily: "'Georgia',serif", color: "#D6BD98", position: "relative" }}>
      <style>{`
        @keyframes shimmer{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:translateX(0)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:#1A3636}
        ::-webkit-scrollbar-thumb{background:#40534C;border-radius:3px}
        .char-card{transition:all 0.28s ease!important}
        .char-card:hover{border-color:#D6BD98!important;transform:translateY(-5px)!important;box-shadow:0 18px 52px rgba(64,83,76,0.4)!important}
      `}</style>

      <div style={{ position: "fixed", top: "-180px", left: "50%", transform: "translateX(-50%)", width: "900px", height: "600px", background: "radial-gradient(ellipse,rgba(103,125,106,0.2) 0%,transparent 65%)", pointerEvents: "none", zIndex: 0 }} />

      {/* NAV */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 56px", borderBottom: "2.5px solid rgba(103,125,106,0.6)", position: "sticky", top: 0, zIndex: 50, background: "rgba(26,54,54,0.85)", backdropFilter: "blur(24px)" }}>
        <div style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "0.16em", backgroundImage: "linear-gradient(90deg,#D6BD98,#677D6A,#D6BD98,#677D6A,#D6BD98)", backgroundSize: "300% 300%", animation: "shimmer 5s ease infinite", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textTransform: "uppercase", cursor: "pointer" }} onClick={() => router.push("/")}>Scenica</div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ padding: "5px 15px", borderRadius: "20px", background: "rgba(64,83,76,0.4)", border: "2px solid rgba(103,125,106,0.5)", fontSize: "12px", color: "#D6BD98", fontFamily: "system-ui", letterSpacing: "0.05em" }}>
            {result.purposeMode === "marketing" ? "💼 Marketing" : "🎭 Story"} · {genre} · {tone}
          </div>
          <button onClick={() => router.push("/script")} style={{ padding: "10px 26px", background: "linear-gradient(135deg,#40534C,#677D6A)", border: "2.5px solid #D6BD98", borderRadius: "30px", color: "#D6BD98", fontSize: "13px", cursor: "pointer", fontFamily: "system-ui", fontWeight: "600", boxShadow: "0 4px 20px rgba(26,54,54,0.5)", letterSpacing: "0.04em", transition: "all 0.25s" }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 32px rgba(103,125,106,0.6)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(26,54,54,0.5)"; e.currentTarget.style.transform = "translateY(0)"; }}>
            View Full Script →
          </button>
        </div>
      </nav>

      {/* HEADER */}
      <section style={{ maxWidth: "1140px", margin: "0 auto", padding: "52px 32px 24px", animation: "fadeIn 0.7s ease forwards" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "11px", letterSpacing: "0.18em", color: "#D6BD98", border: "2.5px solid rgba(103,125,106,0.5)", padding: "5px 15px", borderRadius: "20px", marginBottom: "18px", textTransform: "uppercase", background: "rgba(64,83,76,0.4)" }}>
              <span>✦</span> Character Roster
            </div>
            <h1 style={{ fontSize: "clamp(30px,4.5vw,52px)", fontWeight: "300", letterSpacing: "-0.02em", color: "#D6BD98", marginBottom: "10px" }}>
              Meet your <span style={{ backgroundImage: "linear-gradient(135deg,#D6BD98,#677D6A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontStyle: "italic" }}>characters</span>
            </h1>
            <p style={{ fontSize: "15px", color: "rgba(214,189,152,0.7)", fontFamily: "system-ui" }}>
              {displayCharacters.length} character{displayCharacters.length !== 1 ? "s" : ""} extracted · Click any card to explore their full profile and dialogue
            </p>
          </div>
        </div>
      </section>

      {/* LAYOUT */}
      <section style={{ maxWidth: "1140px", margin: "0 auto", padding: "0 32px 80px", display: "flex", gap: "24px", alignItems: "flex-start" }}>

        {/* Cards */}
        <div style={{ flex: selected ? "0 0 420px" : "1", transition: "flex 0.35s ease" }}>
          <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1fr" : "repeat(auto-fill,minmax(240px,1fr))", gap: "20px" }}>
            {displayCharacters.map((char, i) => {
              const dialogues = getCharacterDialogue(screenplay, char.name, result.scenes, dialogueRows);
              const isSel = selected?.name === char.name;

              return (
                <div key={i} className="char-card"
                  onClick={() => setSelected(isSel ? null : char)}
                  style={{ background: isSel ? "linear-gradient(160deg,rgba(64,83,76,0.6),rgba(103,125,106,0.3))" : "rgba(40,65,65,0.4)", border: `2.5px solid ${isSel ? "#D6BD98" : "rgba(103,125,106,0.5)"}`, borderRadius: "20px", overflow: "hidden", cursor: "pointer", boxShadow: isSel ? "0 8px 44px rgba(26,54,54,0.5)" : "none", animation: `fadeIn 0.5s ease ${i * 0.08}s both` }}>

                  {/* Avatar */}
                  <div style={{ display: "flex", justifyContent: "center", paddingTop: "24px", paddingBottom: "8px" }}>
                    <div style={{ borderRadius: "14px", overflow: "hidden", boxShadow: isSel ? "0 0 32px rgba(214,189,152,0.3)" : "0 4px 24px rgba(0,0,0,0.5)" }}>
                                           {char.imageUrl ? (
                        <img src={char.imageUrl} alt={char.name}
                          style={{ width: 180, height: 220, objectFit: "cover", borderRadius: 14 }} />
                      ) : (
                        <CharacterAvatar char={char} size={180} />
                      )}
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ padding: "12px 18px 18px" }}>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "#D6BD98", marginBottom: "3px" }}>{char.name}</div>
                    <div style={{ fontSize: "11px", color: "#677D6A", fontFamily: "system-ui", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: "600", marginBottom: "10px" }}>{char.role || "Character"}</div>
                    <p style={{
                      fontSize: "12px",
                      color: "rgba(214,189,152,0.7)",
                      fontFamily: "system-ui",
                      lineHeight: "1.6",
                      marginBottom: "12px",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden"
                    }}>
                      {cleanDescriptionText(char.appearance) || char.personality || "No description available."}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {char.age && <span style={{ padding: "3px 10px", borderRadius: "12px", background: "rgba(64,83,76,0.4)", border: "2.5px solid rgba(103,125,106,0.5)", fontSize: "11px", color: "#D6BD98", fontFamily: "system-ui" }}>{char.age}</span>}
                      {char.emotion && <span style={{ padding: "3px 10px", borderRadius: "12px", background: "rgba(64,83,76,0.4)", border: "2.5px solid rgba(103,125,106,0.5)", fontSize: "11px", color: "#D6BD98", fontFamily: "system-ui", textTransform: "capitalize" }}>{char.emotion}</span>}
                      <span style={{ padding: "3px 10px", borderRadius: "12px", background: "rgba(64,83,76,0.3)", border: "2.5px solid rgba(103,125,106,0.4)", fontSize: "11px", color: "rgba(214,189,152,0.7)", fontFamily: "system-ui" }}>
                        {dialogues.length} line{dialogues.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (() => {
          const dialogues = getCharacterDialogue(screenplay, selected.name, result.scenes, dialogueRows);

          return (
            <div style={{ flex: 1, animation: "slideIn 0.32s ease forwards", position: "sticky", top: "82px", maxHeight: "calc(100vh - 100px)", overflowY: "auto", borderRadius: "22px", background: "rgba(40,65,65,0.5)", border: "2.5px solid rgba(103,125,106,0.5)", backdropFilter: "blur(22px)", overflow: "hidden" }}>

              {/* Avatar header */}
              <div style={{ background: "linear-gradient(160deg,rgba(64,83,76,0.8),rgba(26,54,54,1))", padding: "32px", display: "flex", alignItems: "center", gap: "24px", borderBottom: "2.5px solid rgba(103,125,106,0.5)" }}>
                <div style={{ borderRadius: "16px", overflow: "hidden", boxShadow: "0 0 40px rgba(214,189,152,0.2), 0 8px 32px rgba(0,0,0,0.6)", flexShrink: 0 }}>
                  {selected.imageUrl ? (
  <img src={selected.imageUrl} alt={selected.name}
    style={{ width: 120, height: 160, objectFit: "cover", borderRadius: 12 }} />
) : (
  <CharacterAvatar char={selected} size={120} />
)}
{!selected.imageUrl && (
  <button onClick={generatePortrait} disabled={portraitLoading}
    style={{ marginTop: 10, padding: "8px 14px", borderRadius: 8, cursor: "pointer" }}>
    {portraitLoading ? "Generating…" : "Generate Image"}
  </button>
)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "11px", color: "#677D6A", fontFamily: "system-ui", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: "700", marginBottom: "6px" }}>{selected.role}</div>
                  <h2 style={{ fontSize: "28px", fontWeight: "300", color: "#D6BD98", letterSpacing: "0.04em", marginBottom: "4px" }}>{selected.name}</h2>
                  <div style={{ fontSize: "13px", color: "rgba(214,189,152,0.7)", fontFamily: "system-ui" }}>{selected.age} · {selected.gender}</div>
                  <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                    <span style={{ padding: "4px 12px", borderRadius: "12px", background: "rgba(64,83,76,0.5)", border: "2.5px solid rgba(103,125,106,0.5)", fontSize: "11px", color: "#D6BD98", fontFamily: "system-ui", textTransform: "capitalize" }}>{selected.emotion}</span>
                    <span style={{ padding: "4px 12px", borderRadius: "12px", background: "rgba(64,83,76,0.3)", border: "2.5px solid rgba(103,125,106,0.4)", fontSize: "11px", color: "rgba(214,189,152,0.7)", fontFamily: "system-ui" }}>{dialogues.length} lines</span>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ width: "30px", height: "30px", borderRadius: "50%", background: "rgba(64,83,76,0.5)", border: "2.5px solid rgba(103,125,106,0.5)", color: "#D6BD98", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(103,125,106,0.6)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(64,83,76,0.5)"; }}>✕</button>
              </div>

              {/* Details */}
              <div style={{ padding: "26px 28px", overflowY: "auto", maxHeight: "calc(100vh - 280px)" }}>
                {[
                  { label: "Appearance", value: selected.appearance || selected.personality, icon: "👁" },
                  { label: "Clothing", value: selected.clothing, icon: "🎭" },
                  { label: "Personality", value: selected.personality, icon: "✦" },
                ].map(item => item.value && (
                  <div key={item.label} style={{ marginBottom: "20px" }}>
                    <div style={{ fontSize: "11px", letterSpacing: "0.13em", color: "#677D6A", textTransform: "uppercase", fontFamily: "system-ui", fontWeight: "700", marginBottom: "7px" }}>{item.icon} {item.label}</div>
                    <div style={{ fontSize: "14px", color: "rgba(214,189,152,0.85)", lineHeight: "1.78", fontFamily: "system-ui" }}>{item.value}</div>
                  </div>
                ))}

                <div style={{ height: "1px", background: "linear-gradient(90deg,transparent,rgba(103,125,106,0.3),transparent)", margin: "22px 0" }} />

                <div style={{ fontSize: "11px", letterSpacing: "0.13em", color: "#677D6A", textTransform: "uppercase", fontFamily: "system-ui", fontWeight: "700", marginBottom: "16px" }}>
                  🎬 Dialogue Lines ({dialogues.length})
                </div>

                {dialogues.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {dialogues.map((line, i) => {
                      const isBusy = enhancingIndex === i;
                      return (
                        <div key={i} style={{ background: "rgba(26,54,54,0.4)", border: "2.5px solid rgba(103,125,106,0.5)", borderLeft: "4px solid #D6BD98", borderRadius: "12px", padding: "14px 16px", animation: `fadeIn 0.35s ease ${i * 0.03}s both` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                            <div style={{ fontSize: "10px", color: "rgba(214,189,152,0.6)", fontFamily: "'Courier New',monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                              {selected.name}{line.parenthetical ? `  (${line.parenthetical})` : ""}
                            </div>
                            <button
                              onClick={() => handleEnhanceLine(line.text, i)}
                              disabled={isBusy}
                              style={{
                                background: line.isEnhanced ? "rgba(103,125,106,0.3)" : "rgba(64,83,76,0.4)",
                                border: "2.5px solid #D6BD98",
                                borderRadius: "8px", padding: "3px 9px",
                                color: "#D6BD98",
                                fontSize: "10px", fontFamily: "system-ui", fontWeight: "600",
                                cursor: "pointer", transition: "all 0.2s"
                              }}
                            >
                              {isBusy ? "✨ Enhancing..." : line.isEnhanced ? "✓ AI Enhanced" : "✨ Enhance Line"}
                            </button>
                          </div>
                          <div style={{ fontSize: "14px", color: "#D6BD98", lineHeight: "1.72", fontFamily: "'Georgia',serif", fontStyle: "italic", marginBottom: "9px" }}>"{line.text}"</div>
                          <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: "10px", fontSize: "10px", fontFamily: "system-ui", background: "rgba(64,83,76,0.4)", color: "#D6BD98", border: "2.5px solid rgba(103,125,106,0.5)", textTransform: "capitalize", letterSpacing: "0.05em" }}>{line.emotion}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ background: "rgba(26,54,54,0.4)", border: "2.5px solid rgba(103,125,106,0.5)", borderRadius: "12px", padding: "22px", textAlign: "center" }}>
                    <div style={{ fontSize: "26px", marginBottom: "8px" }}>📝</div>
                    <div style={{ color: "rgba(214,189,152,0.6)", fontSize: "13px", fontFamily: "system-ui" }}>No dialogue found for {selected.name}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </section>

      {/* DIALOGUE ENHANCEMENT TABLE — Only show for story mode */}
      {result.purposeMode !== "marketing" ? (
        <section style={{ maxWidth: "1140px", margin: "0 auto", padding: "0 32px 60px", animation: "fadeIn 0.6s ease forwards" }}>
          <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "11px", letterSpacing: "0.18em", color: "#D6BD98", border: "2.5px solid rgba(103,125,106,0.5)", padding: "5px 15px", borderRadius: "20px", marginBottom: "12px", textTransform: "uppercase", background: "rgba(64,83,76,0.4)" }}>
                <span>✦</span> Dialogue Enhancement Studio
              </div>
              <h2 style={{ fontSize: "22px", fontWeight: "300", color: "#D6BD98", letterSpacing: "-0.01em" }}>
                Original &amp; <span style={{ backgroundImage: "linear-gradient(135deg,#D6BD98,#677D6A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontStyle: "italic" }}>AI-Enhanced</span> Dialogue
              </h2>
            </div>
            {/* Status pill */}
            {dialogueRows.length > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "8px 16px", borderRadius: "14px", fontSize: "12px",
                fontFamily: "system-ui", fontWeight: "600",
                background: "rgba(64,83,76,0.4)",
                border: "2.5px solid #D6BD98",
                color: "#D6BD98"
              }}>
                {isEnhancingAll ? (
                  <>
                    <span style={{ display: "inline-block", width: "9px", height: "9px", border: "2px solid rgba(214,189,152,0.4)", borderTop: "2px solid #D6BD98", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    Enhancing {dialogueRows.filter(r => r.status === "done").length}/{dialogueRows.length} lines...
                  </>
                ) : dialogueRows.every(r => r.status === "done") ? (
                  <>✓ All {dialogueRows.length} lines enhanced</>
                ) : (
                  <>✨ Enhancement ready</>
                )}
              </div>
            )}
          </div>
          {dialogueRows.length === 0 ? (
            <div style={{ background: "rgba(40,65,65,0.4)", border: "2.5px solid rgba(103,125,106,0.5)", borderRadius: "20px", padding: "36px 24px", textAlign: "center", backdropFilter: "blur(20px)" }}>
              <div style={{ fontSize: "32px", marginBottom: "10px" }}>📖</div>
              <div style={{ fontSize: "16px", color: "#D6BD98", fontWeight: "600", marginBottom: "6px" }}>Action-Driven Story (No Direct Spoken Dialogue)</div>
              <div style={{ fontSize: "13px", color: "rgba(214,189,152,0.7)", fontFamily: "system-ui", maxWidth: "520px", margin: "0 auto" }}>This story is narrated visually through action and description. There are no direct spoken dialogue quotes in the original text to enhance.</div>
            </div>
          ) : (
            /* Table */
            <div style={{ background: "rgba(40,65,65,0.4)", border: "2.5px solid rgba(103,125,106,0.5)", borderRadius: "20px", overflow: "hidden", backdropFilter: "blur(20px)" }}>
              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: "0", padding: "14px 24px", background: "rgba(64,83,76,0.6)", borderBottom: "2px solid rgba(103,125,106,0.5)" }}>
                {["Character", "Original", "Enhanced"].map((h, i) => (
                  <div key={i} style={{ fontSize: "10px", fontFamily: "system-ui", fontWeight: "700", letterSpacing: "0.14em", color: "#D6BD98", textTransform: "uppercase" }}>{h}</div>
                ))}
              </div>

              {/* Rows */}
              {dialogueRows.map((row, idx) => {
                const isBusy = row.status === "loading";
                const isDone = row.status === "done";
                return (
                  <div
                    key={idx}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px 1fr 1fr",
                      gap: "0",
                      padding: "16px 24px",
                      borderBottom: idx < dialogueRows.length - 1 ? "1.5px solid rgba(103,125,106,0.3)" : "none",
                      background: isDone ? "rgba(103,125,106,0.15)" : idx % 2 === 0 ? "rgba(64,83,76,0.2)" : "transparent",
                      transition: "background 0.4s",
                      alignItems: "center"
                    }}
                  >
                    {/* Character */}
                    <div style={{ paddingRight: "16px" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "4px 10px", borderRadius: "10px", background: "rgba(64,83,76,0.4)", border: "2px solid rgba(103,125,106,0.4)" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#D6BD98", flexShrink: 0 }} />
                        <span style={{ fontSize: "11px", fontFamily: "system-ui", fontWeight: "700", color: "#D6BD98", letterSpacing: "0.06em", textTransform: "uppercase" }}>{row.character}</span>
                      </div>
                      {row.parenthetical && <div style={{ fontSize: "10px", color: "rgba(214,189,152,0.5)", fontFamily: "system-ui", fontStyle: "italic", marginTop: "5px", paddingLeft: "2px" }}>({row.parenthetical})</div>}
                      {isDone && <div style={{ marginTop: "5px", fontSize: "9px", color: "#D6BD98", fontFamily: "system-ui", fontWeight: "700", letterSpacing: "0.06em" }}>✓ AI ENHANCED</div>}
                      {isBusy && <div style={{ marginTop: "5px", display: "flex", alignItems: "center", gap: "4px", fontSize: "9px", color: "#D6BD98", fontFamily: "system-ui" }}><span style={{ display: "inline-block", width: "7px", height: "7px", border: "1.5px solid rgba(214,189,152,0.3)", borderTop: "1.5px solid #D6BD98", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />enhancing...</div>}
                    </div>

                    {/* Original */}
                    <div style={{ paddingRight: "20px", borderRight: "1.5px solid rgba(103,125,106,0.3)" }}>
                      <div style={{ fontSize: "13px", color: "rgba(214,189,152,0.7)", fontFamily: "'Georgia',serif", fontStyle: "italic", lineHeight: "1.65" }}>
                        &ldquo;{row.original}&rdquo;
                      </div>
                    </div>

                    {/* Enhanced */}
                    <div style={{ paddingLeft: "20px" }}>
                      {isDone ? (
                        row.enhanced && row.enhanced.trim() !== row.original.trim() ? (
                          <div style={{ fontSize: "13px", color: "#D6BD98", fontFamily: "'Georgia',serif", fontStyle: "italic", lineHeight: "1.65", animation: "fadeIn 0.5s ease forwards" }}>
                            &ldquo;{row.enhanced}&rdquo;
                          </div>
                        ) : (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "8px", background: "rgba(103,125,106,0.2)", border: "1px solid rgba(103,125,106,0.4)", fontSize: "11px", color: "rgba(214,189,152,0.75)", fontFamily: "system-ui", fontStyle: "normal", letterSpacing: "0.04em" }}>
                            ✦ Already Cinematic
                          </div>
                        )
                      ) : isBusy ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "rgba(214,189,152,0.6)", fontSize: "12px", fontFamily: "system-ui", fontStyle: "italic" }}>
                          Rewriting for emotional impact...
                        </div>
                      ) : (
                        <div style={{ fontSize: "12px", color: "rgba(214,189,152,0.3)", fontFamily: "system-ui", fontStyle: "italic" }}>—</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {/* BOTTOM */}
      <section style={{ maxWidth: "1140px", margin: "0 auto", padding: "0 32px 80px", display: "flex", gap: "14px", justifyContent: "center" }}>
        <button onClick={() => router.push("/")} style={{ padding: "13px 30px", background: "rgba(64,83,76,0.4)", border: "2px solid rgba(103,125,106,0.5)", borderRadius: "30px", color: "#D6BD98", fontSize: "14px", cursor: "pointer", fontFamily: "system-ui", fontWeight: "500", letterSpacing: "0.04em", transition: "all 0.24s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#D6BD98"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(103,125,106,0.5)"; }}>
          ← Create New Story
        </button>
        <button onClick={() => router.push("/script")} style={{ padding: "13px 30px", background: "linear-gradient(135deg,#40534C,#677D6A)", border: "2.5px solid #D6BD98", borderRadius: "30px", color: "#D6BD98", fontSize: "14px", cursor: "pointer", fontFamily: "system-ui", fontWeight: "600", letterSpacing: "0.04em", boxShadow: "0 6px 28px rgba(26,54,54,0.5)", transition: "all 0.24s" }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 8px 40px rgba(103,125,106,0.6)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 6px 28px rgba(26,54,54,0.5)"; e.currentTarget.style.transform = "translateY(0)"; }}>
          View Full Script & Scenes →
        </button>
      </section>
    </main>
  );
}