import { NextResponse } from "next/server";
import { extractStoryDataWithClaude, callClaude } from "@/lib/anthropicClient";

export async function POST(request) {
  try {
    const { story, scriptStyle, toneStyle, purposeMode } = await request.json();
    const isMarketing = purposeMode === "marketing";

    if (!story || story.trim().length < 10) {
      return NextResponse.json(
        { error: "Please provide a more detailed story description." },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Anthropic API key not configured." },
        { status: 500 }
      );
    }

    const scriptStyleInstructions = {
      hollywood: `FORMAT: Write as a 45-second cinematic screenplay (3-4 scenes max). High dramatic stakes, written to exactly 85-95 spoken words total.`,
      shortfilm: `FORMAT: Write as a 45-second short film screenplay (3 scenes max). One clear emotional arc, written to exactly 85-95 spoken words total.`,
      tvepisode: `FORMAT: Write as a 45-second teaser scene (3 scenes max). Dramatic hook ending, written to exactly 85-95 spoken words total.`,
      stageplay: `FORMAT: Write as a 45-second intimate stage scene. Pure dialogue focus, written to exactly 85-95 spoken words total.`
    };

    const toneStyleInstructions = {
      intense: `TONE: Heavy dramatic weight. Raw dialogue. Leave tension unresolved.`,
      warm: `TONE: Warmth and hope as underlying register. Uplifting resolution.`,
      suspenseful: `TONE: Withhold information deliberately. Short clipped dialogue.`,
      poetic: `TONE: Literary and metaphorical language. Lyrical action lines.`
    };

    const scriptInstruction = scriptStyleInstructions[scriptStyle] || `FORMAT: Write as a 45-second Hollywood screenplay with 3 tight scenes (85 to 95 spoken words total).`;
    const toneInstruction = toneStyleInstructions[toneStyle] || `TONE: Authentic emotional depth and human warmth.`;

    // ── MARKETING MODE: different character and script prompts ──────────────────
    const marketingCharacterPrompt = `You are a professional marketing strategist and scriptwriter. Extract all speakers/personas from this marketing script and return ONLY a valid JSON array. No explanation, no markdown, no backticks — just raw JSON.

Marketing Script: ${story}

CRITICAL: The "name" must be the SHORT CUE NAME (e.g. "NARRATOR", "CUSTOMER", "CEO", "ALEX").
Create logical speaker personas if not explicitly named.

Return this exact format:
[
  {
    "name": "SHORT CUE NAME IN CAPS (e.g. NARRATOR, ALEX, CUSTOMER)",
    "role": "Narrator/Brand Ambassador/Customer/Expert/Protagonist",
    "age": "approximate age as number string",
    "gender": "Male/Female/Other",
    "appearance": "professional appearance: attire, presence, visual impression suitable for brand",
    "clothing": "professional or brand-appropriate clothing they wear",
    "personality": "2-3 sentences: their authority, relatability, brand alignment, and how they connect with the audience",
    "emotion": "their dominant tone (one word: hopeful/determined/joyful/confident/warm/inspiring)"
  }
]

Return ONLY the JSON array. Nothing else.`;

    const marketingScriptPrompt = `You are an award-winning commercial scriptwriter. Write a complete professional marketing/commercial screenplay for a maximum 60-second video.

MARKETING BRIEF: ${story}
SPEAKERS: PLACEHOLDER

FORMAT: Write as a professional TV commercial / brand video script. Maximum 6 scenes.
STRUCTURE: Hook (5s) → Problem (10s) → Solution (20s) → Proof/Benefit (15s) → Call to Action (10s)
LANGUAGE: Persuasive, professional, emotionally resonant. Every word earns its place.
TONE: Confident, inspiring, authentic. Never salesy or gimmicky.

CRITICAL NAME RULE: Every character cue MUST use the EXACT same name as the "name" field above.

CRITICAL FORMAT RULES — follow EXACTLY. No HTML, no markdown, no blockquotes, no <center> tags:

SCENE HEADING:
INT. LOCATION NAME - TIME OF DAY

ACTION LINE (plain prose, present tense):
The character walks confidently into frame.

CHARACTER CUE (name ALONE on its own line, ALL CAPS):
NARRATOR

PARENTHETICAL:
(warmly, direct to camera)

DIALOGUE (plain text, no quotes, no > symbols):
Every great story starts with a single decision.

EMOTION TAG:
[EMOTION: inspiring]

Write the complete commercial script now. Start with FADE IN: and end with FADE OUT.`;

    // ── STORY MODE: standard character and script prompts ───────────────────────
    const storyCharacterPrompt = `You are a precise story analyst. Extract all characters from this story and return ONLY a valid JSON array. No explanation, no markdown, no backticks — just raw JSON.

Story: ${story}

CRITICAL RULES — read every rule carefully:

1. NAME: Use the EXACT name from the story, in ALL CAPS, as the cue name. No stuttering or duplicate letters (e.g. "PROTAGONIST" not "PPROTAGONIST").

2. GENDER: ONLY set "Male" or "Female" if the story EXPLICITLY uses gendered words for that character (he/him/she/her/boy/girl/man/woman/king/queen etc.). If the story does NOT specify gender for this character, you MUST set "gender": "Unspecified".

3. AGE: ONLY set an age or age group if the story EXPLICITLY states it (e.g. "10-year-old", "elderly", "teenager"). If the story does NOT specify age, you MUST set "age": "Unspecified".

4. ROLE: ONLY mark as "Antagonist" if the character actively and continuously opposes the protagonist. A character who is doubtful, discouraging, or sceptical but later positive is "Supporting", NOT "Antagonist". Default to "Protagonist" for the main character and "Supporting" for all others unless clearly otherwise.

5. APPEARANCE / CLOTHING / PERSONALITY: Clearly distinguish what is STATED in the story vs what you are inferring. Begin inferred details with "(Inferred) ".

Return this exact format:
[
  {
    "name": "EXACT NAME FROM STORY IN CAPS (e.g. PROTAGONIST, CHARACTER)",
    "role": "Protagonist/Supporting/Antagonist/Love Interest",
    "age": "Exact age from story OR Unspecified",
    "gender": "Male/Female/Unspecified",
    "appearance": "Only what story states, or (Inferred) prefix for additions",
    "clothing": "Only what story states, or (Inferred) prefix for additions",
    "personality": "Based strictly on story actions/words. Label inferences with (Inferred).",
    "emotion": "their dominant emotional state (one word: longing/mysterious/joyful/tense/sad/hopeful/conflicted)"
  }
]

Return ONLY the JSON array. Nothing else.`;

    const storyScriptPrompt = `You are a professional Hollywood screenwriter. Write a complete 45-second cinematic screenplay using the user's input as the primary creative direction.

STORY: ${story}
CHARACTERS: PLACEHOLDER

${scriptInstruction}
${toneInstruction}

PRIORITY RULE — HIGHEST PRIORITY TO USER DETAILS:
1. The user's explicitly provided details always have the HIGHEST PRIORITY.
2. If the user provides specific information about characters, personalities, relationships, setting, events, or storyline, preserve and follow those details accurately. Do not contradict, replace, or remove important information provided by the user.
3. If the user does NOT provide specific information, creatively fill missing details with appropriate, attractive, and contextually relevant ideas.

GENERIC INPUT HANDLING:
If the user's story input is short or generic (e.g. "Two friends meet after many years"), do not produce a short or incomplete script. Intelligently expand the concept into a complete, creative, and visually attractive 45-second video script:
- Develop the setting, emotions, character interaction, dialogue, emotional build-up/conflict, and satisfying ending to create a complete 45-second cinematic story.

HARD RUNTIME & NARRATIVE STRUCTURE CONSTRAINT — 45 SECONDS TOTAL:
1. COMPLETE 3-ACT STORY ARC (Compressed into 45s):
   - Strong Introduction (0-12s) → Development & Build-up (12-25s) → Climax / Reveal (25-36s) → Satisfying Resolution & Ending (36-45s).
2. SPOKEN DIALOGUE + VISUAL PAUSES BUDGET:
   - Spoken dialogue word budget: 85 to 95 spoken words total (~35-38 seconds spoken audio).
   - Visual action beats & dramatic pauses: 7 to 10 seconds total of on-screen visual beats and cinematic pauses.
   - Combined total video runtime = EXACTLY 45 SECONDS TOTAL.
3. SCENE BUDGET: 3 to 4 short, punchy scenes max. Do NOT write long multi-page screenplays.

MANDATORY NARRATIVE COMPLETION RULE:
- If the input story or dialogue snippet cuts off abruptly or ends on an unanswered question (e.g. "What about you?"), you MUST naturally resolve it.
- Write closing lines to complete the 3-act arc: answer the question (Climax) and deliver a warm, decisive closing line (Final Resolution).

CRITICAL ANTI-META RULE:
The instructions in this prompt are generation rules ONLY. Never turn words such as "user", "AI enhancement", "requirements", "grounding", "instructions", or "generation" into story content or dialogue.

CRITICAL DIALOGUE ATTRIBUTION & ACCURACY RULE — THIS IS MANDATORY:
1. For every line of dialogue in quotes or after colons (e.g. "Speaker: 'Quote...'"), identify the EXACT character who speaks it.
2. NEVER assign a line of dialogue to a character unless the story explicitly indicates that specific character is speaking.
3. You MUST copy those EXACT spoken words into the screenplay dialogue blocks. Do NOT paraphrase, shorten, expand, or rewrite any spoken words from the original story.

CRITICAL NAME RULE: Every character cue in the screenplay MUST use the EXACT same name as the "name" field in the character list above (e.g. "PROTAGONIST", "CHARACTER"). Never stutter or duplicate letters. This is mandatory.

CRITICAL FORMAT RULES — follow EXACTLY:

SCENE HEADING (always this exact format):
INT. LOCATION NAME - TIME OF DAY

ACTION LINE (plain prose, present tense):
The character walks into the room.

CHARACTER CUE (character name ALONE on its own line, ALL CAPS, no tags, no formatting):
SARA

PARENTHETICAL (on next line, in parentheses):
(softly)

DIALOGUE (plain text on next line, no quotes, no > symbols):
I have been waiting for you my whole life.

EMOTION TAG (on line after dialogue):
[EMOTION: longing]

EXAMPLE OF CORRECT FORMAT:
FADE IN:

INT. ISTANBUL CAFE - DAY

Rain falls outside the window. SARA sits alone, stirring her coffee.

KARIM
(hesitating at the door)
Is this seat taken?
[EMOTION: nervous hope]

SARA
It is now.
[EMOTION: quiet warmth]

END EXAMPLE.

WRONG — never do this:
<center>KARIM</center>
> dialogue text

WRONG — never use markdown blockquotes or HTML tags anywhere.

Write the complete screenplay now. Start with FADE IN: and end with FADE OUT.`;

    // ═══════════════════════════════════════════════════════════════
    // STEP 1 — PRIMARY: Claude extracts characters AND dialogue
    // attribution together in one contextual pass. Trusted as ground
    // truth — nothing downstream overrides it.
    // ═══════════════════════════════════════════════════════════════
    let characters = [];
    let claudeDialogueMap = null;
    let claudeDialogueList = [];

    const claudeResult = await extractStoryDataWithClaude(story, isMarketing);
    if (claudeResult && claudeResult.characters && claudeResult.characters.length > 0) {
      characters = claudeResult.characters;
      claudeDialogueList = claudeResult.dialogue || [];
      claudeDialogueMap = new Map();
      claudeDialogueList.forEach(d => {
        const key = d.quote.toLowerCase().replace(/[.!?,]+$/, "").trim();
        if (key) claudeDialogueMap.set(key, d.speaker);
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 1b — FALLBACK ONLY: If extractStoryDataWithClaude returned nothing
    // ═══════════════════════════════════════════════════════════════
    if (!characters || characters.length === 0) {
      const characterPrompt = isMarketing ? marketingCharacterPrompt : storyCharacterPrompt;
      try {
        const characterText = await callClaude(characterPrompt, "You are a precise story analyst. Return ONLY valid JSON, no prose.");
        if (characterText && typeof characterText === "string") {
          const firstBracket = characterText.indexOf("[");
          const lastBracket = characterText.lastIndexOf("]");
          const cleanCharText = (firstBracket !== -1 && lastBracket > firstBracket)
            ? characterText.substring(firstBracket, lastBracket + 1)
            : characterText.replace(/```json/gi, "").replace(/```/g, "").trim();
          characters = JSON.parse(cleanCharText);
        }
      } catch (e) {
        console.error("Claude character extraction (simplified) error:", e);
        characters = [];
      }
    }

    // ── Post-process ONLY IF Claude map was unavailable ──
    // Claude's output is trusted 100% as ground truth and MUST NOT be touched by legacy regex blocklists.
    if (!claudeDialogueMap) {
      const COMMON_ADJECTIVES = new Set([
        "SMALL", "LITTLE", "BIG", "LARGE", "GREAT", "OLD", "NEW", "YOUNG", "ANCIENT", "BRIGHT", "DARK", "LIGHT",
        "GLOWING", "MYSTERIOUS", "MAGICAL", "STRANGE", "BEAUTIFUL", "UGLY", "TALL", "SHORT", "THIN", "FAT",
        "RAINY", "SUNNY", "COLD", "HOT", "WET", "DRY", "WARM", "COOL", "SILENT", "LOUD", "SOFT", "HARD",
        "BRAVE", "WISE", "EVIL", "GOOD", "HAPPY", "SAD", "ANGRY", "SCARED", "SURPRISED", "HOPEFUL", "FEARFUL",
        "POINTED", "FOUND", "PICKED", "APPEARED", "WALKED", "STOOD", "SAT", "LOOKED", "TURNED", "SMILED",
        "SUDDENLY", "SLOWLY", "QUICKLY", "SOFTLY", "LOUDLY", "CAREFULLY", "FINALLY", "ALREADY", "NEARLY",
        "TOWARD", "UNDER", "ABOVE", "BENEATH", "BESIDE", "INSIDE", "OUTSIDE", "BEYOND", "THROUGH", "BETWEEN"
      ]);

      const invalidNames = new Set([
        "AND", "OR", "BUT", "SO", "THEIR", "THEIRS", "ITS", "THEY", "THE", "A", "AN", "THIS", "THAT", "SHE", "HE", "IT", "WE", "YOU", "I",
        "AND THE FARMERS", "THEIR BOOMING", "BOOMING", "FARMERS", "FARMER", "VILLAGERS", "VILLAGER",
      ]);

      const storyLower = story.toLowerCase();
      characters = (characters || [])
        .map(c => {
          const cleanedName = (c.name || "").trim().toUpperCase();
          const nameLower = (cleanedName || c.name || "").toLowerCase();

          const sentences = storyLower.split(/[.!?]+/).filter(s =>
            nameLower && s.includes(nameLower)
          );

          let age = c.age || "Unspecified";
          if (age === "Unspecified" && sentences.length > 0) {
            const charContext = sentences.join(" ");
            if (/\b(\d+[\s-]?year[\s-]?old|child|baby|infant|teenager|teen|toddler)\b/.test(charContext)) {
              age = "Child";
            } else if (/\b(elderly|old man|old woman|grandfather|grandmother)\b/.test(charContext)) {
              age = "Elderly";
            } else if (/\b(adult|man|woman)\b/.test(charContext)) {
              age = "Adult";
            }
          }

          let appearance = c.appearance || c.description || "";
          if (!appearance || appearance.toLowerCase().includes("visual profile for")) {
            const descMatch = story.match(new RegExp(`\\b${cleanedName}\\s+(?:was|is)\\s+([^.!?]{5,60})`, "i"));
            if (descMatch) {
              appearance = descMatch[1].trim();
              appearance = appearance.charAt(0).toUpperCase() + appearance.slice(1);
            } else {
              const adjCtx = (nameLower ? storyLower.split(/[.!?]+/).filter(s => s.includes(nameLower)).join(" ") : "");
              const adjMatch = adjCtx.match(/\b(tall|short|old|young|weathered|glowing|hooded|robed|slender|fierce|gentle|quiet|elderly|mysterious|radiant|shadowy)\b[^.!?]{0,40}/i);
              appearance = adjMatch
                ? adjMatch[0].charAt(0).toUpperCase() + adjMatch[0].slice(1)
                : (c.role === "Protagonist"
                    ? "The central figure of the story, defined through their actions."
                    : "A supporting presence in the story, defined through their interactions.");
            }
          }

          let clothing = c.clothing || "";
          if (!clothing || clothing.toLowerCase().includes("suitable attire")) {
            const clothCtx = (nameLower ? storyLower.split(/[.!?]+/).filter(s => s.includes(nameLower)).join(" ") : "");
            const clothMatch = clothCtx.match(/\b(wearing|clad in|dressed in|robe|cloak|suit|armor|jacket|hat|boots|tunic|dress|attire|garb|uniform|coat)\b[^.!?]{0,40}/i);
            clothing = clothMatch
              ? clothMatch[0].charAt(0).toUpperCase() + clothMatch[0].slice(1)
              : "Not described in the original story.";
          }

          let personality = c.personality || "";
          if (!personality || personality.length < 5) {
            const traitWords = ["brave","wise","curious","gentle","stubborn","kind","fierce","cautious","determined","playful","loyal","mysterious","bold","persistent","observant","clever","reckless","compassionate"];
            const charCtx = (nameLower ? storyLower.split(/[.!?]+/).filter(s => s.includes(nameLower)).join(" ") : "");
            const foundTraits = traitWords.filter(t => charCtx.includes(t));
            personality = foundTraits.length > 0
              ? `${foundTraits.slice(0,3).map(t => t[0].toUpperCase()+t.slice(1)).join(", ")} — shaped by the story's events.`
              : (c.role === "Protagonist"
                  ? "Driven by the story's central conflict, revealed through choices and dialogue."
                  : "Defined by how they interact with the other characters in the story.");
          }

          const description = c.description || `${appearance} (${personality})`;
          const dialogueCount = typeof c.dialogueCount === "number" && c.dialogueCount > 0
            ? c.dialogueCount
            : (story.match(new RegExp(`\\b${cleanedName}\\b`, "gi")) || []).length;

          return {
            ...c,
            name: cleanedName,
            role: c.role || "Supporting",
            gender: c.gender || "Unspecified",
            age,
            dialogueCount,
            description,
            appearance,
            clothing,
            personality,
            emotion: c.emotion || "hopeful"
          };
        })
        .filter(c => {
          if (!c.name) return false;
          const nameUp = c.name.toUpperCase();
          if (invalidNames.has(nameUp)) return false;
          if (COMMON_ADJECTIVES.has(nameUp)) return false;
          return c.name.length > 1;
        });

      if (characters && characters.length > 0) {
        let maxCount = -1;
        let protagonistIdx = 0;
        characters.forEach((c, idx) => {
          const count = typeof c.dialogueCount === "number" ? c.dialogueCount : 0;
          if (count > maxCount) {
            maxCount = count;
            protagonistIdx = idx;
          }
        });

        characters = characters.map((c, idx) => ({
          ...c,
          name: (c.name || "").trim().toUpperCase(),
          role: idx === protagonistIdx ? "Protagonist" : "Supporting"
        }));
      }
    }

    // Step 2: Build the script prompt with actual character names substituted
    const charListStr = characters.map(c => `${c.name} (${c.role}, ${c.age}, ${c.gender})`).join(", ");
    const scriptPrompt = isMarketing
      ? marketingScriptPrompt.replace("PLACEHOLDER", charListStr)
      : storyScriptPrompt.replace("PLACEHOLDER", charListStr);

    let rawScreenplay = "";
    try {
      rawScreenplay = await callClaude(scriptPrompt, "You are a professional Hollywood screenplay writer.");
    } catch (e) {
      console.warn("Claude screenplay generation failed, using local fallback:", e.message);
      const fallbackResult = await buildFallbackScreenplayAndCharacters(story, characters, isMarketing);
      const correctedScenes = claudeDialogueMap
        ? applyDialogueMap(fallbackResult.scenes, claudeDialogueMap)
        : reattributeDialogueFromStoryLegacy(fallbackResult.scenes, story, fallbackResult.characters);
      return NextResponse.json({
        success: true,
        characters: fallbackResult.characters,
        screenplay: fallbackResult.screenplay,
        scenes: correctedScenes,
        claudeDialogue: claudeDialogueList,
        genre: isMarketing ? "marketing" : (scriptStyle || "hollywood"),
        tone: isMarketing ? "professional" : (toneStyle || "warm"),
        purposeMode: purposeMode || "story",
        isFallback: true
      });
    }

    const screenplay = cleanScreenplay(rawScreenplay);

    // Step 3: Apply trusted Claude map. Legacy regex only if Claude was unavailable.
    const rawScenes = parseScenes(screenplay, characters);
    let scenes = claudeDialogueMap
      ? applyDialogueMap(rawScenes, claudeDialogueMap)
      : reattributeDialogueFromStoryLegacy(rawScenes, story, characters);

    // Strict 45-Second Runtime Cap (Max 4 scenes)
    if (Array.isArray(scenes) && scenes.length > 4) {
      scenes = scenes.slice(0, 4);
    }

    // Word Budget Trimmer: Cap total spoken dialogue to 95 words max (~45s max)
    let totalWordCount = 0;
    if (Array.isArray(claudeDialogueList) && claudeDialogueList.length > 0) {
      const trimmedList = [];
      for (const item of claudeDialogueList) {
        const wCount = (item.quote || "").trim().split(/\s+/).filter(Boolean).length;
        if (totalWordCount + wCount <= 98 || trimmedList.length === 0) {
          trimmedList.push(item);
          totalWordCount += wCount;
        } else {
          break;
        }
      }
      claudeDialogueList = trimmedList;
    }

    let sceneWordAcc = 0;
    scenes = scenes.map(sc => {
      const trimmedDialogue = [];
      for (const d of (sc.dialogue || [])) {
        const wCount = (d.text || "").trim().split(/\s+/).filter(Boolean).length;
        if (sceneWordAcc + wCount <= 98 || trimmedDialogue.length === 0) {
          trimmedDialogue.push(d);
          sceneWordAcc += wCount;
        } else {
          break;
        }
      }
      return { ...sc, dialogue: trimmedDialogue };
    }).filter(sc => (sc.dialogue && sc.dialogue.length > 0) || (sc.action && sc.action.length > 10));

    return NextResponse.json({
      success: true,
      characters,
      screenplay,
      scenes,
      claudeDialogue: claudeDialogueList,
      genre: isMarketing ? "marketing" : (scriptStyle || "hollywood"),
      tone: isMarketing ? "professional" : (toneStyle || "warm"),
      purposeMode: purposeMode || "story",
      estimatedSeconds: 45
    });

  } catch (error) {
    console.error("Generation error:", error);
    const cleanMsg = error.message || "Something went wrong. Please try again.";
    return NextResponse.json(
      { error: cleanMsg },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// TRUSTED PATH: Apply Claude ground-truth quote→speaker map to scenes.
// ═══════════════════════════════════════════════════════════════════
function applyDialogueMap(scenes, dialogueMap) {
  if (!scenes || scenes.length === 0 || !dialogueMap || dialogueMap.size === 0) return scenes;

  const calcOverlap = (str1, str2) => {
    const set1 = new Set(str1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const set2 = new Set(str2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    if (set1.size === 0 || set2.size === 0) return 0;
    let intersection = 0;
    for (const w of set1) {
      if (set2.has(w)) intersection++;
    }
    return intersection / Math.max(set1.size, set2.size);
  };

  const findSpeaker = (text) => {
    if (!text) return null;
    const clean = text.trim().replace(/[.!?,]+$/, "").toLowerCase().trim();

    // 1. Exact quote match
    if (dialogueMap.has(clean)) return dialogueMap.get(clean);

    // 2. High-scoring similarity match (> 50% word overlap)
    let bestMatch = null;
    let maxScore = 0;

    for (const [mapKey, speaker] of dialogueMap.entries()) {
      const score = calcOverlap(clean, mapKey);
      if (score > maxScore && score >= 0.5) {
        maxScore = score;
        bestMatch = speaker;
      }
    }

    if (bestMatch) return bestMatch;

    // 3. Substring match fallback (for long paraphrased quotes)
    const words = clean.split(/\s+/);
    if (words.length >= 4) {
      const prefix = words.slice(0, 4).join(" ");
      for (const [mapKey, speaker] of dialogueMap.entries()) {
        if (mapKey.startsWith(prefix)) return speaker;
      }
    }

    return null;
  };

  return scenes.map(sc => ({
    ...sc,
    dialogue: (sc.dialogue || []).map(d => {
      if (!d || !d.text) return d;
      const matched = findSpeaker(d.text);
      if (matched && matched !== d.character?.trim().toUpperCase()) {
        return { ...d, character: matched };
      }
      return d;
    })
  }));
}

// ── Ground-truth dialogue attribution from raw story ──────────────────────────────────────────
//
// Step 1: Pre-parse story to build a definitive quote→speaker map using two formats:
//   A) Prose format:  `CharacterName said/whispered/asked, "Quote text"`
//                    `"Quote text" CharacterName replied`
//   B) Colon format:  `CharacterName: "Quote text"` or `CharacterName: Quote text`
//
// Step 2: Reattribute every screenplay dialogue line using this map as ground truth.
// Works dynamically for ANY story and ANY character set — nothing is hardcoded.
function buildDialogueAttributionMap(storyText, characters) {
  const map = new Map();
  if (!storyText || !characters || characters.length === 0) return map;

  const knownChars = (characters || []).map(c => typeof c === "string" ? c : (c.name || "")).filter(Boolean);
  const genderMap = new Map();
  (characters || []).forEach(c => {
    if (typeof c === "object" && c && c.name) {
      genderMap.set(c.name.trim().toUpperCase(), c.gender || "Unspecified");
    }
  });

  const VERBS = "said|says|replied|replies|asked|asks|whispered|whispers|shouted|shouts|exclaimed|exclaims|laughed|laughs|smiled|smiles|cried|cries|muttered|mutters|nodded|nods|gasped|gasps|thundered|thunders|cheered|cheers|called|calls|noted|notes|answered|answers|responded|responds|declared|declares|announced|announces|added|adds|echoed|echoes|bellowed|bellows|intoned|intones|chimed|chimes|murmured|murmurs|breathed|breathes|questions|questioned|activates|activated|states|stated|transmits|transmitted|broadcasts|displays|displayed|emits|emitted|projects|projected|crackles|crackled|buzzes|buzzed|rings|rang|beeps|beeped";

  // Match dialogue quotes: "Quote" (double quotes only, not apostrophes in contractions)
  const quoteRegex = /["“]([^"”]+)["”]/g;
  let match;

  while ((match = quoteRegex.exec(storyText)) !== null) {
    const quote = match[1].trim();
    const index = match.index;

    // Bound preText to sentence boundary (do not jump past previous quotes or double newlines)
    const rawPre = storyText.substring(0, index);
    const lastQuoteIdx = Math.max(rawPre.lastIndexOf('"'), rawPre.lastIndexOf('”'), rawPre.lastIndexOf('\n\n'));
    const sentencePre = lastQuoteIdx >= 0 ? rawPre.substring(lastQuoteIdx + 1) : rawPre;
    const preTextRaw = sentencePre.substring(Math.max(0, sentencePre.length - 150));
    const preText = preTextRaw.replace(/\b(?:lowered|raised|cleared|in|with)\s+(?:his|her|their|a|the)?\s*(?:voice|throat|breath|tone)\s*(?:and)?\b/gi, " ");

    // Bound postText to sentence boundary (do not jump past next quote or newline)
    const rawPost = storyText.substring(index + match[0].length, Math.min(storyText.length, index + match[0].length + 80));
    const nextQuoteOrNL = Math.min(
      rawPost.indexOf('"') === -1 ? 999 : rawPost.indexOf('"'),
      rawPost.indexOf('“') === -1 ? 999 : rawPost.indexOf('“'),
      rawPost.indexOf('\n') === -1 ? 999 : rawPost.indexOf('\n')
    );
    const postText = rawPost.substring(0, nextQuoteOrNL);

    let speaker = null;
    let maxMatchPos = -1;

    const matchKnownChar = (rawName) => {
      if (!rawName) return null;
      const norm = rawName.trim().toLowerCase();
      const wordsInNorm = norm.split(/\s+/);
      if (wordsInNorm.length > 5) return null;

      for (const char of knownChars) {
        if (char.toLowerCase() === norm) return char;
      }
      for (const char of knownChars) {
        const charLower = char.toLowerCase();
        const charWords = charLower.split(/\s+/);
        if (wordsInNorm.some(w => charWords.includes(w) && w.length > 2)) {
          return char;
        }
      }
      return null;
    };

    // 0. Self-identification inside quote (e.g. "this is Captain Miller", "I am Merlin")
    const selfIdMatch = quote.match(/\b(?:this is|I am|my name is)\s+([A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+){0,2})\b/i);
    if (selfIdMatch) {
      const selfName = matchKnownChar(selfIdMatch[1]) || selfIdMatch[1].trim().toUpperCase();
      if (selfName) {
        speaker = selfName;
        maxMatchPos = 1000;
      }
    }

    // 1. Direct speech verb in preText
    if (!speaker) {
      for (const char of knownChars) {
        const esc = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const verbRe = new RegExp(`\\b${esc}\\b[\\s\\S]*?\\b(?:${VERBS})\\b`, "gi");
        let m;
        while ((m = verbRe.exec(preText)) !== null) {
          if (m.index > maxMatchPos) {
            maxMatchPos = m.index;
            speaker = char;
          }
        }
        const colonRe = new RegExp(`\\b${esc}\\b:`, "gi");
        while ((m = colonRe.exec(preText)) !== null) {
          if (m.index > maxMatchPos) {
            maxMatchPos = m.index;
            speaker = char;
          }
        }
      }
    }

    // 2. Generic speaker match in preText
    if (!speaker) {
      const genericSpeakerRe = new RegExp(`([A-Z][a-zA-Z.]+(?:\\s+[A-Z][a-zA-Z.]+){0,2})\\b[^.!?]{0,40}?\\b(?:${VERBS})\\b`, "gi");
      let gm;
      while ((gm = genericSpeakerRe.exec(preText)) !== null) {
        const matchedChar = matchKnownChar(gm[1]);
        if (matchedChar && gm.index > maxMatchPos) {
          maxMatchPos = gm.index;
          speaker = matchedChar;
        }
      }
    }

    // 3. Pronoun speech verb in preText
    if (!speaker) {
      const resolvePronounSpeaker = (preTxt, quoteIdx, pronounRe, genderWanted) => {
        let best = { pos: -1, char: null };
        let pm;
        while ((pm = pronounRe.exec(preTxt)) !== null) {
          const storyBeforeQuote = storyText.substring(0, quoteIdx);
          let lastPos = -1, lastChar = null;
          for (const cName of knownChars) {
            const g = genderMap.get(cName.toUpperCase());
            if (g && g !== "Unspecified" && g !== genderWanted) continue;
            const esc = cName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const matches = [...storyBeforeQuote.matchAll(new RegExp(`\\b${esc}\\b`, "gi"))];
            if (matches.length) {
              const pos = matches[matches.length - 1].index;
              if (pos > lastPos) { lastPos = pos; lastChar = cName; }
            }
          }
          if (lastChar && pm.index > best.pos) best = { pos: pm.index, char: lastChar };
        }
        return best;
      };

      const femaleMatch = resolvePronounSpeaker(preText, index, new RegExp(`\\b(she|her)\\b[\\s\\S]*?\\b(?:${VERBS})\\b`, "gi"), "Female");
      if (femaleMatch.char && femaleMatch.pos > maxMatchPos) {
        maxMatchPos = femaleMatch.pos;
        speaker = femaleMatch.char;
      }

      const maleMatch = resolvePronounSpeaker(preText, index, new RegExp(`\\b(he|him|his)\\b[\\s\\S]*?\\b(?:${VERBS})\\b`, "gi"), "Male");
      if (maleMatch.char && maleMatch.pos > maxMatchPos) {
        maxMatchPos = maleMatch.pos;
        speaker = maleMatch.char;
      }
    }

    // 4. Direct post-speech tag in postText
    if (!speaker) {
      for (const char of knownChars) {
        const esc = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const postVerbRe = new RegExp(`^[^a-zA-Z]*\\b(?:${VERBS})\\b\\s+(?:the\\s+)?\\b${esc}\\b`, "i");
        const postNameRe = new RegExp(`^[^a-zA-Z]*\\b${esc}\\b\\s+(?:the\\s+)?\\b(?:${VERBS})\\b`, "i");
        if (postVerbRe.test(postText) || postNameRe.test(postText)) {
          speaker = char;
          break;
        }
      }
    }

    if (speaker) {
      const cleanKey = quote.toLowerCase().replace(/[.!?,'"\u201C\u201D]+$/g, "").trim();
      map.set(cleanKey, speaker);
    }
  }

  return map;
}

// ── LEGACY FALLBACK: only used when Claude is entirely unavailable ──
function reattributeDialogueFromStoryLegacy(scenes, story, characters = []) {
  if (!story || !scenes || scenes.length === 0) return scenes;

  // Build ground-truth map from story text using full character objects
  const attributionMap = buildDialogueAttributionMap(story, characters);

  const findSpeakerForLine = (dialogueText) => {
    if (!dialogueText || dialogueText.length < 2) return null;

    const cleanText = dialogueText.trim().replace(/[.!?,]+$/, "").toLowerCase().trim();

    // 1. Exact match in attribution map
    if (attributionMap.has(cleanText)) return attributionMap.get(cleanText);

    // 2. Partial key match (first 6 words)
    const partialKey = cleanText.split(/\s+/).slice(0, 6).join(" ");
    if (partialKey.length > 5 && attributionMap.has(partialKey)) return attributionMap.get(partialKey);

    // 3. Scan all map keys for substring overlap (handles slight paraphrasing)
    for (const [key, speaker] of attributionMap.entries()) {
      if (key.length > 8 && cleanText.includes(key.substring(0, Math.min(key.length, 20)))) {
        return speaker;
      }
    }

    return null; // No match — trust LLM output
  };

  return scenes.map(sc => ({
    ...sc,
    dialogue: (sc.dialogue || []).map(d => {
      if (!d || !d.text) return d;
      const correctSpeaker = findSpeakerForLine(d.text);
      if (correctSpeaker && correctSpeaker !== d.character?.trim().toUpperCase()) {
        console.log(`[reattribute] "${d.text.substring(0, 40)}" ${d.character} → ${correctSpeaker}`);
        return { ...d, character: correctSpeaker };
      }
      return d;
    })
  }));
}

// ── Intelligent Local Screenplay & Character Generator Fallback ────────────────────
// Guarantees zero downtime even when AI provider rate limit is exceeded.
// Uses LLM dialogue extraction with the exact user-specified prompt;
// falls back to regex attribution only if the LLM call itself fails.
async function buildFallbackScreenplayAndCharacters(story, existingChars, isMarketing) {
  let characters = (existingChars && existingChars.length > 0) ? existingChars : extractCharactersLocally(story);

  let dialoguePairs = [];

  // ── Step 1: Claude-based dialogue extraction ─────────────────────────────────
  let llmSucceeded = false;
  if (process.env.ANTHROPIC_API_KEY) {
    const extractPrompt = `Read this story and extract every line of dialogue. For each line, identify exactly which character said it, using context and conversational flow — not just nearby names (a character's name may appear in someone else's line, e.g. being addressed directly, so use who is actually speaking, not just who is mentioned).

Return ONLY valid JSON in this exact format, no other text:
[
  {"character": "Character Name", "line": "Dialogue line text."}
]

Story:
"""
${story}
"""`;

    try {
      const raw = await callClaude(extractPrompt, "You are a dialogue extraction expert. Return ONLY valid JSON, no prose.");
      if (raw) {
        const cleaned = raw
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```\s*$/, "")
          .trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed) && parsed.length > 0) {
          dialoguePairs = parsed
            .filter(d => d && typeof d.character === "string" && typeof d.line === "string")
            .map(d => ({
              speaker: d.character.trim().toUpperCase(),
              text: cleanDialogueText(d.line.trim()),
              parenthetical: ""
            }))
            .filter(d => d.speaker.length > 0 && d.text.length > 1);
          llmSucceeded = dialoguePairs.length > 0;
        }
      }
    } catch (e) {
      console.warn("LLM dialogue extraction in fallback failed, using regex:", e.message);
    }
  }

  // ── Step 2: Regex fallback if LLM failed ─────────────────────────────
  if (!llmSucceeded) {
    const extractedQuotes = extractDialogueQuotesFromStory(story);
    extractedQuotes.forEach(item => {
      const text = cleanDialogueText(item.text);
      if (!text || text.length < 2) return;

      // ── Pre-text: look at the immediately preceding sentence ──────────
      const rawPre = story.substring(Math.max(0, item.index - 220), item.index);
      const sentenceBreak = rawPre.search(/[.!?][^.!?]*$/);
      const preText = sentenceBreak >= 0 ? rawPre.substring(sentenceBreak) : rawPre;

      // ── Post-text: look at ~120 chars AFTER the quote ─────────────────
      // Prose like "said The Bigger Clouds" / "exclaimed Coco" appears here
      const quoteEnd = item.index + item.text.length + 2; // +2 for quotes
      const postText = story.substring(quoteEnd, Math.min(story.length, quoteEnd + 120));

      const knownChars = (characters || []).map(c => c.name?.trim().toUpperCase()).filter(Boolean);

      // Build ground-truth attribution for this quote from preText + postText
      const SPEECH_VERBS_FB = "said|replied|asked|whispered|shouted|exclaimed|laughed|smiled|cried|muttered|nodded|gasped|thundered|cheered|called|answered|responded|declared|announced|added|echoed|bellowed|intoned|chimed|murmured|breathed";

      const detectSpeaker = (txt) => {
        if (!txt) return null;
        // Strip possessive 's to handle "woman's voice echoed" → "woman voice echoed"
        const stripped = txt.replace(/'s\b/gi, " ");
        // Direct character name match
        for (const cName of knownChars) {
          if (!cName) continue;
          const esc = cName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(`\\b${esc}\\b`, "i").test(stripped)) return cName;
        }
        for (const cName of knownChars) {
          if (!cName) continue;
          const firstWord = cName.split(/\s+/)[0];
          if (firstWord.length > 2) {
            const esc = firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (new RegExp(`\\b${esc}\\b`, "i").test(stripped)) return cName;
          }
        }
        return null;
      };

      // Pronoun resolver: she/her → first female-pronoun character, he/him → first male
      const resolvePronouns = (txt) => {
        if (!txt) return null;
        if (/\b(she|her)\b/i.test(txt)) {
          // Find the character referenced by female pronoun — search preceding story text
          const storyBefore = story.substring(0, item.index);
          for (const cName of knownChars) {
            const esc = cName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (new RegExp(`\\b${esc}\\b`, "i").test(storyBefore)) return cName;
          }
          return knownChars[0] || null;
        }
        if (/\b(he|him|his)\b/i.test(txt)) {
          const storyBefore = story.substring(0, item.index);
          // Find last-mentioned male character
          let lastPos = -1, lastChar = null;
          for (const cName of knownChars) {
            const esc = cName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const matches = [...storyBefore.matchAll(new RegExp(`\\b${esc}\\b`, "gi"))];
            if (matches.length > 0) {
              const pos = matches[matches.length - 1].index;
              if (pos > lastPos) { lastPos = pos; lastChar = cName; }
            }
          }
          return lastChar;
        }
        return null;
      };

      let speaker = "";

      // 1. Check postText first (e.g. "Finn said" / "said Finn")
      const postSpeechMatch = postText.match(
        /\b(?:said|replied|asked|whispered|shouted|exclaimed|laughed|smiled|cried|muttered|nodded|gasped|thundered|cheered|called|answered|echoed|murmured|bellowed)\s+(?:the\s+)?([A-Za-z\s]+)/i
      );
      if (postSpeechMatch) {
        speaker = detectSpeaker(postSpeechMatch[0]) || "";
      }

      // 2. Check preText for direct character name + verb
      if (!speaker) {
        speaker = detectSpeaker(preText) || "";
      }

      // 3. Pronoun resolution from preText (she whispered / he said)
      if (!speaker) {
        speaker = resolvePronouns(preText) || "";
      }

      // 4. Fallback: UNKNOWN (never infer or guess)
      if (!speaker) {
        speaker = "UNKNOWN";
      }

      // ── Parenthetical from preText ────────────────────────────────────
      const actionMatch = preText.match(/\b(smiled|laughed|giggled|muttered|whispered|shouted|cried|nodded|gasped|exclaimed)\b/i);
      const parenthetical = actionMatch ? `(${actionMatch[1].toLowerCase()})` : "";

      dialoguePairs.push({ speaker, text, parenthetical });
    });
  }

  // ── Step 3: Build clean screenplay from dialogue pairs (no raw story prose) ──
  const lines = [
    "FADE IN:",
    "",
    "EXT. STORY LOCATION - DAY",
    ""
  ];

  if (dialoguePairs.length > 0) {
    dialoguePairs.forEach(pair => {
      lines.push(pair.speaker);
      if (pair.parenthetical) lines.push(pair.parenthetical);
      lines.push("[EMOTION: hopeful]");
      lines.push(pair.text);
      lines.push("");
    });
  } else {
    // Action-driven screenplay when story contains no direct spoken quotes
    lines.push(story.trim());
    lines.push("");
  }

  lines.push("FADE OUT.");
  const screenplay = lines.join("\n");
  const scenes = parseScenes(screenplay, characters);

  return { characters, screenplay, scenes };
}

// Safely extract dialogue quotes without splitting on apostrophes in contractions (don't, you're, didn't)
function extractDialogueQuotesFromStory(story) {
  if (!story) return [];

  // Protect contraction apostrophes (don't, didn't, can't, I'm, you're, he's, she's, it's, etc.)
  const protectedStory = story.replace(/\b([a-zA-Z]+)['’]([a-zA-Z]+)\b/g, "$1__APOS__$2");
  const quotes = [];

  // 1. Double quotes: "..." or “...”
  const doubleQuoteRegex = /["“]([^"”]+)["”]/g;
  let dMatch;
  while ((dMatch = doubleQuoteRegex.exec(protectedStory)) !== null) {
    const rawText = dMatch[1].replace(/__APOS__/g, "'");
    quotes.push({ index: dMatch.index, text: rawText });
  }

  // 2. Single quotes: '...' ONLY when surrounded by non-word chars (not inside words)
  if (quotes.length === 0) {
    const singleQuoteRegex = /(?:^|[\s,.:;!?])['‘]([^'’]+)['’](?:$|[\s,.:;!?])/g;
    let sMatch;
    while ((sMatch = singleQuoteRegex.exec(protectedStory)) !== null) {
      const rawText = sMatch[1].replace(/__APOS__/g, "'");
      quotes.push({ index: sMatch.index, text: rawText });
    }
  }

  return quotes;
}

// Clean and capitalize dialogue text cleanly with proper ending punctuation
function cleanDialogueText(raw) {
  if (!raw) return "";
  let clean = raw.trim().replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  if (!clean) return "";

  // Fix trailing comma before period (e.g. "do it,." -> "do it.")
  clean = clean.replace(/,\./g, ".").replace(/,$/g, "");

  // Capitalize first letter
  clean = clean.charAt(0).toUpperCase() + clean.slice(1);

  // Add ending punctuation if missing
  if (!/[.!?]$/.test(clean)) {
    clean += ".";
  }

  return clean;
}

// Extract character names accurately from story text without AI
function extractCharactersLocally(story) {
  const ignoreWords = new Set([
    "ONCE", "UPON", "THE", "A", "AN", "IN", "ON", "AT", "TO", "THEY", "HE", "SHE", "IT", "WE", "YOU", "I",
    "THEN", "WHEN", "AS", "BUT", "SO", "IF", "WHAT", "HOW", "WHY", "WHO", "WHERE", "WHICH", "WHOM", "LOOK", "OH", "THERE", "WAS", "HERE",
    "AND", "OR", "SO", "THEIR", "THEIRS", "ITS", "THIS", "THAT", "THESE", "THOSE", "AFTER", "BEFORE", "WHILE", "UNTIL", "WITH", "FROM",
    "FADE", "INT", "EXT", "DAY", "NIGHT", "CUT", "SCENE", "END", "START", "ONE", "SOME", "MANY",
    "ALL", "EVERY", "VILLAGE", "CLOUDS", "CLOUD", "SUN", "SKY", "RAIN", "WATER", "LAND", "EARTH", "FLOWER", "FLOWERS",
    "TREE", "TREES", "PEOPLE", "PARK", "STREET", "HOUSE", "TOWN", "CITY", "FOREST", "MOUNTAIN", "OCEAN",
    "WORLD", "MORNING", "EVENING", "TIME", "WAY", "THING", "THINGS", "PLACE", "PLACES", "STORY", "FEET",
    "HANDS", "EYES", "FACE", "HEAD", "HEART", "SOUL", "VOICE", "NAME", "HERO", "FOLLOW", "CAN",
    "COULD", "WOULD", "WILL", "SHALL", "SHOULD", "MAY", "MIGHT", "MUST", "DO", "DOES", "DID", "DON'T",
    "SMILED", "LAUGHED", "MUTTERED", "GIGGLED", "WHISPERED", "SHOUTED", "SAID", "REPLIED", "NODDED", "EXCLAIMED",
    // Common dialogue/sentence-opening words that look like proper nouns when capitalised
    "CURIOUS", "SUDDENLY", "YOUR", "BECAUSE", "PERHAPS", "ALTHOUGH", "HOWEVER", "MEANWHILE", "THEREFORE",
    "JUST", "ONLY", "EVEN", "STILL", "ALREADY", "YET", "SOON", "NEVER", "ALWAYS", "SOMETIMES",
    "SOMETHING", "NOTHING", "EVERYTHING", "SOMEONE", "NOBODY", "ANYONE", "EVERYONE"
  ]);

  const COMMON_ADJECTIVES_LOCAL = new Set([
    "SMALL", "LITTLE", "BIG", "LARGE", "GREAT", "OLD", "NEW", "YOUNG", "ANCIENT", "BRIGHT", "DARK", "LIGHT",
    "GLOWING", "MYSTERIOUS", "MAGICAL", "STRANGE", "BEAUTIFUL", "UGLY", "TALL", "SHORT", "THIN", "FAT",
    "RAINY", "SUNNY", "COLD", "HOT", "WET", "DRY", "WARM", "COOL", "SILENT", "LOUD", "SOFT", "HARD",
    "BRAVE", "WISE", "EVIL", "GOOD", "HAPPY", "SAD", "ANGRY", "SCARED", "SURPRISED", "HOPEFUL", "FEARFUL",
    "POINTED", "FOUND", "PICKED", "APPEARED", "WALKED", "STOOD", "SAT", "LOOKED", "TURNED", "SMILED",
    "SUDDENLY", "SLOWLY", "QUICKLY", "SOFTLY", "LOUDLY", "CAREFULLY", "FINALLY", "ALREADY", "NEARLY",
    "TOWARD", "UNDER", "ABOVE", "BENEATH", "BESIDE", "INSIDE", "OUTSIDE", "BEYOND", "THROUGH", "BETWEEN",
    // Past-tense action verbs — never valid character names
    "TOUCHED", "HELD", "STEPPED", "MOVED", "KNELT", "RAN", "FELL", "CLIMBED", "JUMPED", "REACHED",
    "OPENED", "CLOSED", "GRABBED", "PUSHED", "PULLED", "LIFTED", "DROPPED", "PLACED", "CARRIED", "THREW",
    "NOTICED", "HEARD", "FELT", "KNEW", "THOUGHT", "REALIZED", "DECIDED", "REMEMBERED", "DISCOVERED",
    "HOLDING", "STARING", "WAITING", "WATCHING", "RUNNING", "STANDING", "SITTING", "KNEELING",
    "ECHOED", "ANSWERED", "STATED", "CONTINUED", "CALLED", "REPLIED", "WHISPERED", "SHOUTED"
  ]);

  const candidates = [];
  const seen = new Set();

  // Strip dialogue quotes to avoid picking up capitalized first words of dialogue
  // Handle ASCII " and curly " " quotes, and markdown **bold** formatting
  const narrativeOnly = story
    .replace(/\*\*"[^"]*"\*\*/g, "")          // markdown **"..."** bold dialogue
    .replace(/\*\*"[^"]*"\*\*/g, "")          // markdown **"..."** curly bold dialogue
    .replace(/"[^"]*"/g, "")                   // ASCII "..."
    .replace(/\u201C[^\u201D]*\u201D/g, "")   // curly "..."
    .replace(/\*\*[^*]+\*\*/g, "");           // any remaining markdown bold

  // 1. Find Proper Nouns capitalized in narrative text (e.g. Aira)
  const propNouns = narrativeOnly.match(/\b[A-Z][a-z]{2,20}\b/g) || [];
  propNouns.forEach(name => {
    const upper = name.toUpperCase();
    if (!ignoreWords.has(upper) && !COMMON_ADJECTIVES_LOCAL.has(upper) && !seen.has(upper)) {
      seen.add(upper);
      candidates.push(upper);
    }
  });

  // 2. Find core animals / speaker nouns / entity nouns (e.g. "fox", "wizard", "sailor", "voice", "stranger")
  const speakerNouns = [
    "FOX", "WIZARD", "KNIGHT", "NARRATOR", "KING", "QUEEN", "PRINCESS", "PRINCE", "DRAGON", "ROBOT",
    "BEAR", "WOLF", "LION", "OWL", "VOICE", "SHADOW", "STRANGER", "SPIRIT", "MAN", "WOMAN", "GHOST",
    "CREATURE", "ELDER", "BEAST", "GUARDIAN", "GUIDE", "TEACHER", "STUDENT", "CHILD", "FAIRY", "ALCHEMIST",
    "SAILOR", "CAPTAIN", "PIRATE", "TRAVELER", "WANDERER", "SEEKER", "HUNTER", "HERMIT", "MESSENGER", "WARRIOR",
    "KEEPER", "GUARD", "SOLDIER", "OFFICER", "DOCTOR", "NURSE", "PRIEST", "MONK", "SHERIFF", "DETECTIVE",
    "WITCH", "SORCERER", "ORACLE", "PROPHET", "REBEL", "EXILE", "SCOUT", "RANGER", "ARCHER", "BLACKSMITH"
  ];
  speakerNouns.forEach(noun => {
    if (new RegExp(`\\b${noun}\\b`, "i").test(story) && !seen.has(noun)) {
      // Special check for VOICE: don't extract VOICE if it only appears in possessive/manner phrases like "his voice", "her voice", "my voice"
      if (noun === "VOICE") {
        const isStandaloneSubject = /\b(?:a|an|the|soft|dark|deep|mysterious|distant|unknown|woman's|man's)\s+voice\b/i.test(story);
        const isOnlyPossessive = /\b(?:his|her|my|your|their|our)\s+voice\b/i.test(story) && !isStandaloneSubject;
        if (isOnlyPossessive) return;
      }
      seen.add(noun);
      candidates.push(noun);
    }
  });

  // 3. Dynamic speech entity extraction: match nouns that directly precede speech verbs (tight match)
  // e.g. "voice echoed" / "sailor replied" / "woman's voice echoed" → VOICE/SAILOR/WOMAN
  // Excluded: "touched ... whispered" (TOUCHED is now in COMMON_ADJECTIVES_LOCAL blocklist)
  const SPEECH_VERBS_REGEX = "said|replied|asked|whispered|shouted|exclaimed|laughed|smiled|cried|muttered|nodded|gasped|thundered|cheered|called|answered|responded|declared|announced|added|echoed|bellowed|intoned|chimed|murmured";
  const speechEntityRegex = new RegExp(`(?:a|an|the|soft|dark|mysterious|old|young|quiet|brave)?\\s*([A-Za-z]{3,20})\\b(?:'s\\s+[A-Za-z]+)?\\s+(?:${SPEECH_VERBS_REGEX})\\b`, "gi");
  let seMatch;
  while ((seMatch = speechEntityRegex.exec(narrativeOnly)) !== null) {
    const nounCandidate = seMatch[1].toUpperCase();
    if (!ignoreWords.has(nounCandidate) && !COMMON_ADJECTIVES_LOCAL.has(nounCandidate) && !seen.has(nounCandidate)) {
      seen.add(nounCandidate);
      candidates.push(nounCandidate);
    }
  }

  // Default fallback if no character names found
  if (candidates.length === 0) {
    candidates.push("PROTAGONIST");
  }

  const storyLower = story.toLowerCase();

  return candidates.map((name, idx) => {
    const nameLower = name.toLowerCase();
    const sentences = storyLower.split(/[.!?]+/).filter(s => nameLower && s.includes(nameLower));
    const charContext = sentences.join(" ");

    let gender = "Unspecified";
    if (charContext) {
      const hasMale = /\b(he|him|his|boy|man|male|brother|father|son|king|prince|mr)\b/.test(charContext);
      const hasFemale = /\b(she|her|hers|girl|woman|female|sister|mother|daughter|queen|princess|ms|mrs)\b/.test(charContext);
      if (hasMale && !hasFemale) gender = "Male";
      else if (hasFemale && !hasMale) gender = "Female";
    }

    let age = "Unspecified";
    if (charContext) {
      if (/\b(\d+[\s-]?year[\s-]?old|child|baby|infant|teenager|teen|toddler)\b/.test(charContext)) {
        age = "Child";
      } else if (/\b(elderly|old man|old woman|grandfather|grandmother)\b/.test(charContext)) {
        age = "Elderly";
      } else if (/\b(adult|man|woman)\b/.test(charContext)) {
        age = "Adult";
      }
    }

    let appearance = "";
    const descMatch = story.match(new RegExp(`\\b${name}\\s+(?:was|is)\\s+([^.!?]{5,60})`, "i"));
    if (descMatch) {
      appearance = descMatch[1].trim();
      appearance = appearance.charAt(0).toUpperCase() + appearance.slice(1);
    } else {
      appearance = "A key character in the story.";
    }

    let clothingLocal = "";
    const clothCtxLocal = (sentences || []).join(" ").toLowerCase();
    const clothMatchLocal = clothCtxLocal.match(/\b(wearing|clad in|dressed in|robe|cloak|suit|armor|jacket|hat|boots|tunic|dress|attire|garb|uniform|coat)\b[^.!?]{0,40}/i);
    clothingLocal = clothMatchLocal ? clothMatchLocal[0].charAt(0).toUpperCase() + clothMatchLocal[0].slice(1) : "Not described in the original story.";

    const traitWordsLocal = ["brave","wise","curious","gentle","stubborn","kind","fierce","cautious","determined","playful","loyal","mysterious","bold","persistent","observant","clever","compassionate"];
    const foundTraitsLocal = traitWordsLocal.filter(t => charContext.includes(t));
    const personalityLocal = foundTraitsLocal.length > 0
      ? `${foundTraitsLocal.slice(0,3).map(t => t[0].toUpperCase()+t.slice(1)).join(", ")} — shaped by the story's events.`
      : (idx === 0
          ? "Driven by the story's central conflict, revealed through choices and dialogue."
          : "Defined by how they interact with the other characters in the story.");

    return {
      name,
      role: idx === 0 ? "Protagonist" : "Supporting",
      age,
      gender,
      appearance,
      clothing: clothingLocal,
      personality: personalityLocal,
      emotion: "hopeful"
    };
  });
}

// Extract proper noun name phrase and clean candidate speaker names
function cleanSpeakerName(raw) {
  if (!raw) return { name: "", action: "" };

  let text = raw.trim();

  const stopWords = new Set([
    "AND", "OR", "BUT", "SO", "THEN", "WHEN", "WHILE", "AS", "IF", "THEIR", "THEIRS", "ITS",
    "MY", "YOUR", "HIS", "HER", "OUR", "THESE", "THOSE", "THE", "A", "AN", "THIS", "THAT",
    "HE", "SHE", "IT", "THEY", "WE", "YOU", "I", "HERO", "HOUSE", "TOWN", "CITY", "STORY", "WATER", "HEAT",
    "OUT", "SOFTLY", "LOUDLY", "GENTLY", "WARMLY", "QUIETLY", "SLOWLY", "QUICKLY", "AWAY", "BACK", "UP", "DOWN",
    "INTO", "UNMENTIONED", "FLOATED", "CALLED"
  ]);

  if (stopWords.has(text.toUpperCase())) {
    return { name: "", action: "" };
  }

  // Extract leading proper noun phrase (e.g. "Finn called out..." -> "Finn", "Star floated..." -> "Star")
  const propMatch = text.match(/^(?:The\s+|Mr\.\s+|Mrs\.\s+|Dr\.\s+|Professor\s+|Captain\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/);
  if (propMatch) {
    text = propMatch[0].trim();
  }

  // Strip leading conjunctions, possessives, articles, and phrases
  text = text.replace(/^(?:and|or|but|so|then|when|while|as|if|their|theirs|its|my|your|his|her|our|these|those|the|a|an)\s+/gi, "").trim();

  // Strip trailing action verbs, prepositions, adverbs, and location/description clauses
  text = text.replace(/\s+\b(?:hung|lived|sat|walked|stood|flew|floated|was|were|had|is|are|outside|inside|near|by|in|at|under|over|with|from|facing|looking|watching|holding|carrying|protecting|shining|glowing|who|that|which|called|said|replied|asked|out|softly|loudly|gently|warmly|quietly)\b.*/gi, "").trim();

  let cleanName = sanitizeName(text);
  const words = cleanName.split(/\s+/);
  if (words.length > 3) {
    cleanName = words.slice(0, 2).join(" ");
  }

  if (!cleanName || stopWords.has(cleanName) || cleanName.length < 2) {
    return { name: "", action: "" };
  }

  return { name: cleanName, action: "" };
}

// Aggressively remove leading duplicate letters from character names
// e.g. CCOCO → COCO, BBIGGER CLOUDS → BIGGER CLOUDS, SSSARA → SARA
function sanitizeName(name) {
  if (!name) return "";
  const words = name.trim().toUpperCase().split(/\s+/);
  const cleanWords = words.map(word => {
    while (word.length > 2 && word[0] === word[1] && /[A-Z]/.test(word[0])) {
      word = word.substring(1);
    }
    return word;
  });
  return cleanWords.join(" ");
}

// Remove any HTML/markdown formatting added despite instructions
function cleanScreenplay(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/<center>\s*([^<]+?)\s*<\/center>/gi, "$1")
    .replace(/^>\s*/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function parseScenes(screenplay, characters) {
  const cleaned = cleanScreenplay(screenplay);
  const lines = cleaned.split("\n");
  const scenes = [];
  let currentScene = null;
  let currentDialogue = [];

  // Build clean map of character names and aliases dynamically
  const charMap = new Map();

  (characters || []).forEach(c => {
    const sName = sanitizeName(c.name);
    if (sName) {
      charMap.set(sName, c.name);
      if (sName.startsWith("THE ")) {
        charMap.set(sName.replace(/^THE\s+/, ""), c.name);
      } else {
        charMap.set("THE " + sName, c.name);
      }
      const firstWord = sName.split(/\s+/)[0];
      if (firstWord.length > 2) charMap.set(firstWord, c.name);
    }
  });

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // ── Scene heading ──
    if (line.match(/^(INT\.|EXT\.|INT\/EXT\.)/i)) {
      if (currentScene) {
        currentScene.dialogue = currentDialogue;
        scenes.push(currentScene);
      }
      currentScene = {
        id: scenes.length + 1,
        heading: line,
        location: extractLocation(line),
        timeOfDay: extractTimeOfDay(line),
        action: "",
        dialogue: [],
        emotion: detectSceneEmotion(lines, i)
      };
      currentDialogue = [];
      continue;
    }

    if (!currentScene) continue;

    // Skip blanks, FADE, CUT TO
    if (!line) continue;
    if (line.match(/^(FADE IN:|FADE OUT\.|CUT TO:|SMASH CUT:|DISSOLVE TO:)/i)) continue;

    // Check if line is a Character Cue
    const sanitizedLine = sanitizeName(line.replace(/\s*\([^)]+\)\s*$/, ""));
    const isKnownChar = charMap.has(sanitizedLine) || charMap.has(sanitizedLine.split(/\s+/)[0]);

    if (isKnownChar && line.length < 40 && !line.match(/^(INT\.|EXT\.|FADE|CUT TO|THE END)/i)) {
      const charName = charMap.get(sanitizedLine) || charMap.get(sanitizedLine.split(/\s+/)[0]) || sanitizedLine;
      let j = i + 1;

      // Skip blank lines
      while (j < lines.length && !lines[j].trim()) j++;

      // Optional parenthetical
      let parenthetical = "";
      if (j < lines.length && lines[j].trim().startsWith("(") && lines[j].trim().endsWith(")")) {
        parenthetical = lines[j].trim().replace(/[()]/g, "").trim();
        j++;
        while (j < lines.length && !lines[j].trim()) j++;
      }

      // Collect ONLY true spoken dialogue line(s)
      const dialogueParts = [];
      while (j < lines.length) {
        const dRaw = lines[j].trim();
        if (!dRaw) break;
        if (dRaw.match(/^(INT\.|EXT\.|FADE|CUT TO)/i)) break;
        if (dRaw.match(/^\[EMOTION:/i)) { j++; continue; }

        // Stop if next line is another character cue
        const dSan = sanitizeName(dRaw.replace(/\s*\([^)]+\)\s*$/, ""));
        if (charMap.has(dSan) || charMap.has(dSan.split(/\s+/)[0])) break;

        // Stop if line is an Action line (Narration / Scene description)
        // Action lines are prose that describe events rather than quoted dialogue
        const looksLikeAction = !dRaw.startsWith('"') && !dRaw.startsWith("(") && dRaw.length > 80;
        if (looksLikeAction && dialogueParts.length > 0) break;

        const clean = dRaw.replace(/\[EMOTION:[^\]]+\]/gi, "").trim();
        if (clean && !clean.startsWith("(")) dialogueParts.push(clean);
        j++;
        break; // A dialogue block is usually 1-2 lines directly under character cue
      }

      const text = dialogueParts.join(" ").trim();
      if (text.length > 1) {
        const blockText = lines.slice(i, j + 2).join(" ");
        const emotionMatch = blockText.match(/\[EMOTION:\s*([^\]]+)\]/i);
        currentDialogue.push({
          character: charName,
          parenthetical,
          text,
          emotion: emotionMatch ? emotionMatch[1].trim() : "neutral"
        });
      }
      i = j - 1;
      continue;
    }

    // ── Action Line (Narration / Description) ──
    if (!line.match(/^\[EMOTION:/i)) {
      currentScene.action += (currentScene.action ? " " : "") + line;
    }
  }

  if (currentScene) {
    currentScene.dialogue = currentDialogue;
    scenes.push(currentScene);
  }

  return scenes.filter(s => s.dialogue.length > 0 || s.action.length > 15);
}

function extractLocation(heading) {
  return heading.split(/[-—]/)[0].replace(/^(INT\.|EXT\.|INT\/EXT\.)\s*/i, "").trim();
}

function extractTimeOfDay(heading) {
  const parts = heading.split(/[-—]/);
  return parts.length > 1 ? parts[parts.length - 1].trim() : "DAY";
}

function detectSceneEmotion(lines, sceneIndex) {
  const emotionKeywords = {
    tense: ["tension", "confrontation", "anger", "fight", "argue", "shout"],
    romantic: ["love", "kiss", "embrace", "romantic", "heart", "tender"],
    sad: ["cry", "tears", "grief", "loss", "mourn", "weep"],
    joyful: ["laugh", "celebrate", "happy", "joy", "smile", "delight"],
    mysterious: ["shadow", "dark", "secret", "whisper", "hidden", "mystery"],
    hopeful: ["hope", "future", "dream", "promise", "begin", "new"],
    vulnerable: ["afraid", "fear", "tremble", "confess", "broken", "alone"]
  };

  const nearbyText = lines.slice(sceneIndex, sceneIndex + 10).join(" ").toLowerCase();
  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    if (keywords.some(k => nearbyText.includes(k))) return emotion;
  }
  return "neutral";
}