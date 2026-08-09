import { NextResponse } from "next/server";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const MODEL_CASCADE = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-8b",
  "gemini-2.0-flash-lite",
];

async function callGemini(prompt, apiKey) {
  let lastError = null;

  for (const model of MODEL_CASCADE) {
    const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.85,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 4096,
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }

      const errorBody = await response.json().catch(() => ({}));
      const status = response.status;

      if (status === 429 || status === 404 || status === 400) {
        let retrySeconds = null;
        if (status === 429) {
          try {
            const retryInfo = errorBody?.error?.details?.find(d => d["@type"]?.includes("RetryInfo"));
            if (retryInfo?.retryDelay) retrySeconds = parseInt(retryInfo.retryDelay.replace("s", ""), 10);
          } catch (_) {}
        }
        lastError = { status, retrySeconds, model, message: errorBody?.error?.message };
        continue;
      }

      throw new Error(errorBody?.error?.message || `API error ${status}`);
    } catch (e) {
      if (e.message && !e.message.includes("API error")) {
        lastError = e;
        continue;
      }
      throw e;
    }
  }

  if (lastError?.status === 429) {
    const waitMsg = lastError.retrySeconds
      ? ` Please wait ${lastError.retrySeconds} seconds and try again.`
      : " Daily free tier limit reached for today. Please try again later.";
    throw new Error(`AI quota limit reached.${waitMsg}`);
  }

  throw lastError || new Error("AI generation service temporarily unavailable.");
}

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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key not configured." },
        { status: 500 }
      );
    }

    const scriptStyleInstructions = {
      hollywood: `FORMAT: Write as a full Hollywood feature film screenplay. Minimum 7 scenes. Build toward a climactic confrontation. Use CUT TO: between scenes.`,
      shortfilm: `FORMAT: Write as a tight short film screenplay. Maximum 5 scenes. One clear emotional arc. Ending must hit hard.`,
      tvepisode: `FORMAT: Write as a TV episode screenplay. 8-10 scenes, ensemble dialogue, multiple locations. End on a cliffhanger.`,
      stageplay: `FORMAT: Write as a stage play. Maximum 2 settings. All drama through dialogue. Rich theatrical language.`
    };

    const toneStyleInstructions = {
      intense: `TONE: Heavy dramatic weight. Raw, unfiltered dialogue. Characters say things they cannot take back. Leave tension unresolved.`,
      warm: `TONE: Warmth and hope as the underlying register. Characters reach toward each other. Uplifting resolution.`,
      suspenseful: `TONE: Withhold information deliberately. Build dread through what is NOT said. Short clipped dialogue in tense moments.`,
      poetic: `TONE: Literary and metaphorical language. Action lines like prose poetry. Dialogue with double meanings.`
    };

    const scriptInstruction = scriptStyleInstructions[scriptStyle] || `FORMAT: Write as a professional Hollywood screenplay with 6-8 complete scenes.`;
    const toneInstruction = toneStyleInstructions[toneStyle] || `TONE: Authentic emotional depth, balancing drama with human warmth.`;

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

1. NAME: Use the EXACT name from the story, in ALL CAPS, as the cue name. No stuttering or duplicate letters (e.g. "COCO" not "CCOCO", "BIGGER CLOUDS" not "BBIGGER CLOUDS").

2. GENDER: ONLY set "Male" or "Female" if the story EXPLICITLY uses gendered words for that character (he/him/she/her/boy/girl/man/woman/king/queen etc.). If the story does NOT specify gender for this character, you MUST set "gender": "Unspecified".

3. AGE: ONLY set an age or age group if the story EXPLICITLY states it (e.g. "10-year-old", "elderly", "teenager"). If the story does NOT specify age, you MUST set "age": "Unspecified".

4. ROLE: ONLY mark as "Antagonist" if the character actively and continuously opposes the protagonist. A character who is doubtful, discouraging, or sceptical but later positive is "Supporting", NOT "Antagonist". Default to "Protagonist" for the main character and "Supporting" for all others unless clearly otherwise.

5. APPEARANCE / CLOTHING / PERSONALITY: Clearly distinguish what is STATED in the story vs what you are inferring. Begin inferred details with "(Inferred) ".

Return this exact format:
[
  {
    "name": "EXACT NAME FROM STORY IN CAPS (e.g. COCO, BIGGER CLOUDS)",
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

    const storyScriptPrompt = `You are a professional Hollywood screenwriter. Write a complete screenplay.

STORY: ${story}
CHARACTERS: PLACEHOLDER

${scriptInstruction}
${toneInstruction}

CRITICAL DIALOGUE RULE — THIS IS MANDATORY:
The original story above may contain spoken dialogue in quotes or after colons. You MUST copy those EXACT words into the screenplay dialogue blocks. Do NOT paraphrase, shorten, expand, or rewrite any spoken words from the original story. If the original says 'Look at the sky!' then the screenplay MUST say exactly: Look at the sky! — nothing else.

CRITICAL NAME RULE: Every character cue in the screenplay MUST use the EXACT same name as the "name" field in the character list above. (e.g. "COCO", "BIGGER CLOUDS"). Never stutter or duplicate letters (NO CCOCO, NO BBIGGER CLOUDS). This is mandatory.

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

    // Step 1: Extract characters using the appropriate prompt
    const characterPrompt = isMarketing ? marketingCharacterPrompt : storyCharacterPrompt;

    let characters = [];
    try {
      const characterText = await callGemini(characterPrompt, apiKey);
      const cleanCharText = characterText.replace(/```json/g, "").replace(/```/g, "").trim();
      characters = JSON.parse(cleanCharText);

      const invalidNames = new Set([
        "AND", "OR", "BUT", "SO", "THEIR", "THEIRS", "ITS", "THEY", "THE", "A", "AN", "THIS", "THAT",
        "AND THE FARMERS", "THEIR BOOMING", "BOOMING", "FARMERS", "FARMER", "VILLAGERS", "VILLAGER"
      ]);

      // ── Post-process: clean names and enforce character-specific story-accuracy ──
      const storyLower = story.toLowerCase();
      characters = characters
        .map(c => {
          const { name: cleanedName } = cleanSpeakerName(c.name);
          const nameLower = (cleanedName || c.name || "").toLowerCase();

          // Find sentences in the story mentioning this specific character
          const sentences = storyLower.split(/[.!?]+/).filter(s =>
            nameLower && s.includes(nameLower)
          );
          const charContext = sentences.join(" ");

          // Gender: check if gendered pronouns/words exist in THIS character's context
          let gender = "Unspecified";
          if (charContext) {
            const hasMale   = /\b(he|him|his|boy|man|male|brother|father|son|king|prince|mr)\b/.test(charContext);
            const hasFemale = /\b(she|her|hers|girl|woman|female|sister|mother|daughter|queen|princess|ms|mrs)\b/.test(charContext);
            if (hasMale && !hasFemale) gender = "Male";
            else if (hasFemale && !hasMale) gender = "Female";
          } else if (c.gender === "Male" || c.gender === "Female") {
            gender = c.gender;
          }

          // Age: check if explicit age indicators exist in THIS character's context
          let age = "Unspecified";
          if (charContext) {
            if (/\b(\d+[\s-]?year[\s-]?old|child|baby|infant|teenager|teen|toddler)\b/.test(charContext)) {
              age = "Child";
            } else if (/\b(elderly|old man|old woman|grandfather|grandmother)\b/.test(charContext)) {
              age = "Elderly";
            } else if (/\b(adult|man|woman)\b/.test(charContext)) {
              age = "Adult";
            }
          } else if (c.age && c.age !== "Unspecified") {
            age = c.age;
          }

          // Clean appearance placeholder text
          let appearance = c.appearance || "";
          if (!appearance || appearance.toLowerCase().includes("visual profile for")) {
            const descMatch = story.match(new RegExp(`\\b${cleanedName}\\s+(?:was|is)\\s+([^.!?]{5,60})`, "i"));
            appearance = descMatch ? descMatch[1].trim() : "A key character in the story.";
            appearance = appearance.charAt(0).toUpperCase() + appearance.slice(1);
          }

          return { ...c, name: cleanedName, gender, age, appearance };
        })
        .filter(c => c.name && !invalidNames.has(c.name.toUpperCase()) && c.name.length > 1);
    } catch (e) {
      console.error("Character extraction error:", e);
      characters = [];
    }

    // Step 2: Build the script prompt with actual character names substituted
    const charListStr = characters.map(c => `${c.name} (${c.role}, ${c.age}, ${c.gender})`).join(", ");
    const scriptPrompt = isMarketing
      ? marketingScriptPrompt.replace("PLACEHOLDER", charListStr)
      : storyScriptPrompt.replace("PLACEHOLDER", charListStr);

    let rawScreenplay = "";
    try {
      rawScreenplay = await callGemini(scriptPrompt, apiKey);
    } catch (err) {
      console.error("Screenplay generation API error, using intelligent local generator fallback:", err.message);
      const fallbackResult = await buildFallbackScreenplayAndCharacters(story, characters, isMarketing, apiKey);
      // Correct any misattributions using raw story text as ground truth
      const correctedScenes = reattributeDialogueFromStory(fallbackResult.scenes, story, fallbackResult.characters);
      return NextResponse.json({
        success: true,
        characters: fallbackResult.characters,
        screenplay: fallbackResult.screenplay,
        scenes: correctedScenes,
        genre: isMarketing ? "marketing" : (scriptStyle || "hollywood"),
        tone: isMarketing ? "professional" : (toneStyle || "warm"),
        purposeMode: purposeMode || "story",
        isFallback: true
      });
    }

    // Clean up any HTML/markdown Gemini sneaks in
    const screenplay = cleanScreenplay(rawScreenplay);

    // Step 3: Parse scenes and dialogue, then correct any Gemini misattributions
    const rawScenes = parseScenes(screenplay, characters);
    const scenes = reattributeDialogueFromStory(rawScenes, story, characters);

    return NextResponse.json({
      success: true,
      characters,
      screenplay,
      scenes,
      genre: isMarketing ? "marketing" : (scriptStyle || "hollywood"),
      tone: isMarketing ? "professional" : (toneStyle || "warm"),
      purposeMode: purposeMode || "story"
    });

  } catch (error) {
    console.error("Generation error:", error);
    // Format error message cleanly without raw JSON if possible
    const cleanMsg = error.message ? error.message.replace(/Gemini API error:\s*\{.*?\}/s, "AI limit reached. Please try again later.") : "Something went wrong. Please try again.";
    return NextResponse.json(
      { error: cleanMsg },
      { status: 500 }
    );
  }
}

// ── Post-processing: correct character misattribution using raw story as ground truth ──
//
// Dynamically matches dialogue entries to the correct extracted character using
// preText/postText speech tags, pronoun resolution, and addressee exclusion.
// Works for ANY story and ANY character set without hardcoded names.
function reattributeDialogueFromStory(scenes, story, characters = []) {
  if (!story || !scenes || scenes.length === 0) return scenes;

  const knownChars = (characters || []).map(c => c.name?.trim().toUpperCase()).filter(Boolean);

  const detectSpeaker = (txt) => {
    if (!txt) return null;

    // 1. Direct match against known character full names
    for (const cName of knownChars) {
      if (!cName) continue;
      const esc = cName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${esc}\\b`, "i").test(txt)) {
        return cName;
      }
    }

    // 2. Match without "THE " prefix if present
    for (const cName of knownChars) {
      if (!cName) continue;
      const stripped = cName.replace(/^THE\s+/, "");
      if (stripped.length > 2) {
        const esc = stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${esc}\\b`, "i").test(txt)) {
          return cName;
        }
      }
    }

    // 3. Match first word token if length > 2 (e.g. "Finn" -> "FINN")
    for (const cName of knownChars) {
      if (!cName) continue;
      const firstWord = cName.split(/\s+/)[0];
      if (firstWord.length > 2) {
        const esc = firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${esc}\\b`, "i").test(txt)) {
          return cName;
        }
      }
    }

    return null;
  };

  const findSpeakerInStory = (dialogueText) => {
    if (!dialogueText || dialogueText.length < 3) return null;

    // Strip trailing punctuation to widen the search surface
    const textToFind = dialogueText.trim().replace(/[.!?,]+$/, "");
    let foundIdx = story.toLowerCase().indexOf(textToFind.toLowerCase());

    // If verbatim not found, try just the first 5 words (handles paraphrasing)
    if (foundIdx === -1) {
      const firstFive = textToFind.split(/\s+/).slice(0, 5).join(" ");
      if (firstFive.length > 6) {
        foundIdx = story.toLowerCase().indexOf(firstFive.toLowerCase());
      }
    }
    if (foundIdx === -1) return null;

    // Tight 60-character window before and after quote
    const rawPreTrim = story.substring(Math.max(0, foundIdx - 60), foundIdx).trimEnd();
    const preText = rawPreTrim.replace(/["'“‘\s]+$/, "").replace(/[.!?]+$/, "").trim();

    const postStart = foundIdx + textToFind.length;
    const postText = story.substring(postStart, Math.min(story.length, postStart + 60));

    const VERBS = "said|replied|asked|whispered|shouted|exclaimed|laughed|smiled|cried|muttered|nodded|gasped|thundered|cheered|called";

    // High confidence 1: "..." Coco said
    const nameVerbRe = new RegExp(
      `^[^a-zA-Z]*([A-Za-z][a-z]+(?:\\s+(?:the\\s+)?[A-Za-z][a-z]+)*)\\s+(?:${VERBS})`, "i"
    );
    const nameVerbMatch = postText.match(nameVerbRe);
    if (nameVerbMatch) {
      const s = detectSpeaker(nameVerbMatch[1]);
      if (s) return s;
    }

    // High confidence 2: "..." said Coco
    const verbNameRe = new RegExp(
      `^[^a-zA-Z]*(?:${VERBS})\\s+(?:the\\s+)?([A-Za-z][a-z]+(?:\\s+[A-Za-z][a-z]+)*)`, "i"
    );
    const verbNameMatch = postText.match(verbNameRe);
    if (verbNameMatch) {
      const s = detectSpeaker(verbNameMatch[1]);
      if (s) return s;
    }

    // High confidence 3: Coco said, "..."
    const preVerbRe = new RegExp(
      `([A-Za-z][a-z]+(?:\\s+(?:the\\s+)?[A-Za-z][a-z]+)*)\\s+(?:${VERBS})[^.!?]*$`, "i"
    );
    const preVerbMatch = preText.match(preVerbRe);
    if (preVerbMatch) {
      const s = detectSpeaker(preVerbMatch[1]);
      if (s) return s;
    }

    // No tight explicit tag found — trust LLM output instead of guessing
    return null;
  };

  return scenes.map(sc => ({
    ...sc,
    dialogue: (sc.dialogue || []).map(d => {
      if (!d || !d.text) return d;
      const correctSpeaker = findSpeakerInStory(d.text);
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
async function buildFallbackScreenplayAndCharacters(story, existingChars, isMarketing, apiKey) {
  let characters = (existingChars && existingChars.length > 0) ? existingChars : extractCharactersLocally(story);

  let dialoguePairs = [];

  // ── Step 1: LLM-based dialogue extraction (exact user-specified prompt) ───────
  let llmSucceeded = false;
  if (apiKey) {
    const extractPrompt = `Read this story and extract every line of dialogue. For each line, identify exactly which character said it, using context and conversational flow — not just nearby names (a character's name may appear in someone else's line, e.g. being addressed directly, so use who is actually speaking, not just who is mentioned).

Return ONLY valid JSON in this exact format, no other text:
[
  {"character": "Coco", "line": "I wish I could help."},
  {"character": "The bigger clouds", "line": "You're too small to make a difference!"}
]

Story:
"""
${story}
"""`;

    try {
      const raw = await callGemini(extractPrompt, apiKey);
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
      const detectSpeaker = (txt) => {
        if (!txt) return null;
        for (const cName of knownChars) {
          if (!cName) continue;
          const esc = cName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(`\\b${esc}\\b`, "i").test(txt)) return cName;
        }
        for (const cName of knownChars) {
          if (!cName) continue;
          const firstWord = cName.split(/\s+/)[0];
          if (firstWord.length > 2) {
            const esc = firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (new RegExp(`\\b${esc}\\b`, "i").test(txt)) return cName;
          }
        }
        return null;
      };

      let speaker = "";

      // 1. Check postText first (e.g. "Finn said")
      const postSpeechMatch = postText.match(
        /\b(?:said|replied|asked|whispered|shouted|exclaimed|laughed|smiled|cried|muttered|nodded|gasped|thundered|cheered|called)\s+(?:the\s+)?([A-Za-z\s]+)/i
      );
      if (postSpeechMatch) {
        speaker = detectSpeaker(postSpeechMatch[0]) || "";
      }

      // 2. Fall back to preText if postText gave no answer
      if (!speaker) {
        speaker = detectSpeaker(preText) || "";
      }

      // 3. Fallback: UNKNOWN (never infer or guess)
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
    "THEN", "WHEN", "AS", "BUT", "SO", "IF", "WHAT", "HOW", "WHY", "LOOK", "OH", "THERE", "WAS", "HERE",
    "FADE", "INT", "EXT", "DAY", "NIGHT", "CUT", "SCENE", "END", "START", "ONE", "DAY", "SOME", "MANY",
    "ALL", "EVERY", "THIS", "THAT", "THESE", "THOSE", "AFTER", "BEFORE", "WHILE", "UNTIL", "WITH", "FROM",
    "VILLAGE", "CLOUDS", "CLOUD", "SUN", "SKY", "RAIN", "WATER", "LAND", "EARTH", "FLOWER", "FLOWERS",
    "TREE", "TREES", "PEOPLE", "PARK", "STREET", "HOUSE", "TOWN", "CITY", "FOREST", "MOUNTAIN", "OCEAN",
    "WORLD", "MORNING", "EVENING", "TIME", "WAY", "THING", "THINGS", "PLACE", "PLACES", "STORY", "FEET",
    "HANDS", "EYES", "FACE", "HEAD", "HEART", "SOUL", "VOICE", "NAME", "LITTLE", "BIG", "GREAT",
    "OLD", "YOUNG", "NEW", "FIRST", "LAST", "MAIN", "OTHER", "ANOTHER", "MUCH", "LONG", "SHORT",
    "HIGH", "LOW", "HOT", "COLD", "DRY", "WET", "DARK", "LIGHT", "CLEAR", "BRIGHT", "HERO",
    "SMILED", "LAUGHED", "MUTTERED", "GIGGLED", "WHISPERED", "SHOUTED", "SAID", "REPLIED", "NODDED", "EXCLAIMED"
  ]);

  const candidates = [];

  // 1. Dialogue cues before speech verbs or quotes/colons
  const speakerRegex = /\b([A-Z][A-Za-z0-9_\s]{1,35}?)\s*(?:says|said|replied|replies|shouted|shouts|asked|asks|cried|cries|yelled|yells|muttered|mutters|whispered|whispers|smiled|smiles|laughed|laughs|giggled|giggles|nodded|nods|exclaimed|exclaims|called|calls|:)/gi;
  let spMatch;
  while ((spMatch = speakerRegex.exec(story)) !== null) {
    const rawCandidate = spMatch[1].trim();
    const { name: cleanCandidate } = cleanSpeakerName(rawCandidate);
    if (cleanCandidate && !ignoreWords.has(cleanCandidate.toUpperCase())) {
      candidates.push(cleanCandidate);
    }
  }

  // 2. Character names mentioned after "named" / "known as" (e.g. "cloud named Coco")
  // Do not match preposition phrases like "called out into"
  const namedRegex = /\b(?:named|known as)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  let namedMatch;
  while ((namedMatch = namedRegex.exec(story)) !== null) {
    const { name: cleanCandidate } = cleanSpeakerName(namedMatch[1].trim());
    if (cleanCandidate) candidates.push(cleanCandidate);
  }

  // 3. Known multi-word character names like "Bigger Clouds" or "Little Cloud"
  if (/bigger\s+clouds?/i.test(story) || /big\s+clouds?/i.test(story)) candidates.push("BIGGER CLOUDS");
  if (/coco\b/i.test(story) || /little\s+cloud/i.test(story)) candidates.push("COCO");

  // Sanitize and filter unique valid names
  const uniqueCleanNames = [];
  const seen = new Set();

  candidates.forEach(raw => {
    const { name: clean } = cleanSpeakerName(raw);
    if (clean && clean.length > 1 && !ignoreWords.has(clean) && !seen.has(clean)) {
      seen.add(clean);
      uniqueCleanNames.push(clean);
    }
  });

  // Default fallback if no character names found
  if (uniqueCleanNames.length === 0) {
    const propMatch = story.match(/\b[A-Z][a-z]{2,20}\b/g);
    if (propMatch && propMatch.length > 0) {
      const valid = propMatch.find(w => !ignoreWords.has(w.toUpperCase()));
      if (valid) uniqueCleanNames.push(valid.toUpperCase());
    }
    if (uniqueCleanNames.length === 0) {
      uniqueCleanNames.push("PROTAGONIST");
    }
  }

  const storyLower = story.toLowerCase();

  return uniqueCleanNames.map((name, idx) => {
    const nameLower = name.toLowerCase();
    const sentences = storyLower.split(/[.!?]+/).filter(s => nameLower && s.includes(nameLower));
    const charContext = sentences.join(" ");

    let gender = "Unspecified";
    if (charContext) {
      const hasMale   = /\b(he|him|his|boy|man|male|brother|father|son|king|prince|mr)\b/.test(charContext);
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

    return {
      name,
      role: idx === 0 ? "Protagonist" : "Supporting",
      age,
      gender,
      appearance,
      clothing: "Unspecified",
      personality: idx === 0 ? "Determined and brave character." : "Supporting character in the story.",
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
    "INTO", "DARK", "DISTANCE", "VOICE", "UNMENTIONED", "FLOATED", "CALLED", "INTO THE DARK"
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

// Remove any HTML/markdown formatting Gemini adds despite instructions
function cleanScreenplay(text) {
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