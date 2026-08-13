import { NextResponse } from "next/server";
import { extractStoryDataWithClaude, callClaude } from "@/lib/anthropicClient";


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
  "NOTE", "END", "BEGIN", "START", "TITLE", "HEADER", "SECTION", "PART", "UNKNOWN"
]);

// ── Local dialogue enhancement — runs when AI quota is exhausted ──────────────
// Applies meaningful emotional depth transforms to dialogue without AI
function localEnhanceLine(line, characterName) {
  if (!line) return line;

  const clean = line.trim().replace(/^[«"'«]+|[»"'»]+$/g, "").trim();
  if (!clean) return line;

  // Rule set: pattern → emotional enrichment transform
  const transforms = [
    // Uncertainty / wishing → add ellipsis + qualifier
    [/^i wish i could/i, s => s.replace(/^I wish I could/i, "I wish with everything I have that I could")],
    [/^i don'?t know if/i, s => s.replace(/^I don'?t know if/i, "Honestly... I'm still not sure if")],
    [/^i can'?t/i, s => s.replace(/^[Ii] can'?t/i, "I really can't — no matter how hard I try,")],
    [/^maybe i/i, s => s.replace(/^Maybe I/i, "Maybe — just maybe — I")],

    // Small / big contrast → poetic contrast form
    [/you'?re too small/i, s => s.replace(/you'?re too small/i, "You're far too small — do you even see yourself?")],
    [/too small to make/i, s => s.replace(/too small to make/i, "too small — far too small — to ever make")],

    // Encouragement / affirmation → emotionally charged
    [/you really did help/i, s => s.replace(/you really did help/i, "You actually did it — you really, truly helped")],
    [/you did it/i, s => s.replace(/you did it/i, "You actually did it — I can't believe it, but you did")],

    // Core theme line — preserve sentence meaning with added emotional cadence
    [/you don'?t have to be big to make a big/i, s => s.replace(/you don'?t have to be big to make a big/i, "You don't have to be big — not at all — to make a truly big")],

    // Generic excitement / disbelief
    [/look at you/i, s => s.replace(/look at you/i, "Just look at you —")],
    [/^you\?/i, () => "You? Of all the people in the world, it had to be you?"],

    // Urgency / time pressure → amplify
    [/no time/i, s => s.replace(/no time/i, "no time left — none at all")],
    [/have to/i, s => s.replace(/have to/i, "absolutely have to")],

    // Truth / honesty → deepen sincerity
    [/the truth/i, s => s.replace(/the truth/i, "the whole truth")],
    [/never told/i, s => s.replace(/never told/i, "never once told")],
    [/hiding something/i, s => s.replace(/hiding something/i, "hiding something all along")],
  ];

  for (const [pattern, transform] of transforms) {
    if (pattern.test(clean)) {
      const result = transform(clean);
      if (result && result !== clean) {
        return result.replace(/[,\s]+$/, "") + (result.match(/[.!?]$/) ? "" : ".");
      }
    }
  }

  // Generic fallback: split on comma for natural dramatic pause
  const parts = clean.split(/,\s*/);
  if (parts.length >= 2) {
    return parts[0] + "... " + parts.slice(1).join(", ") + (clean.match(/[.!?]$/) ? "" : ".");
  }

  // Final fallback: split on last 'and' for natural emphasis
  const andIdx = clean.lastIndexOf(" and ");
  if (andIdx > 10) {
    const before = clean.substring(0, andIdx);
    const after = clean.substring(andIdx + 5);
    return `${before} — and ${after}${clean.match(/[.!?]$/) ? "" : "."}`;
  }

  // Absolute last resort: return the original unchanged (better than adding unnatural text)
  return clean + (clean.match(/[.!?]$/) ? "" : ".");
}

// ── Smart local fallback — generates story-specific suggestions from text analysis ──
function buildFallbackSuggestions(story, characters, isMarketing, isCharactersMode) {
  const storyLower = story.toLowerCase();
  const charNames = (characters || []).map(c => c.name).filter(Boolean);
  const hero = charNames[0] || "the main character";
  const second = charNames[1] || null;

  // Extract setting clues from story text
  const settingKeywords = ["village", "city", "forest", "mountain", "ocean", "school", "sky", "cloud", "rain", "sun", "street", "house", "field", "river", "market", "desert"];
  const foundSetting = settingKeywords.find(w => storyLower.includes(w)) || "the world of the story";

  // Extract theme clues
  const isHopeful = /help|hope|dream|wish|brave|courage|try/.test(storyLower);
  const isSad = /loss|grief|alone|lonely|miss|cry|tear/.test(storyLower);
  const isConflict = /fight|argue|disagree|tension|refuse|deny/.test(storyLower);
  const emotionWord = isHopeful ? "hopeful" : isSad ? "melancholic" : isConflict ? "tense" : "reflective";

  if (isCharactersMode && charNames.length > 0) {
    return [
      {
        id: "1",
        title: `Show ${hero}'s silent reaction`,
        description: `A small physical gesture from ${hero} at the climax will make their emotion visible without dialogue.`,
        addedText: `${hero} said nothing. But the expression on their face — quiet, ${emotionWord} — told the whole story.`
      },
      {
        id: "2",
        title: `Deepen ${hero}'s inner decision moment`,
        description: `Adding a brief beat where ${hero} makes a conscious choice deepens the story's emotional stakes.`,
        addedText: `${hero} paused, weighing everything in silence. Then, slowly, they stepped forward — not because it was easy, but because it was right.`
      },
      second ? {
        id: "3",
        title: `${hero} and ${second}'s unspoken moment`,
        description: `A beat of silent understanding between ${hero} and ${second} enriches their relationship without extra dialogue.`,
        addedText: `When ${hero} and ${second} finally looked at each other, no words were needed. Something had shifted between them.`
      } : {
        id: "3",
        title: `Highlight ${hero}'s growth at the end`,
        description: `A closing line showing how ${hero} has changed makes the emotional arc feel complete.`,
        addedText: `${hero} looked back at where they had started — and realised how far they had come.`
      },
      {
        id: "4",
        title: `Add sensory detail to the ${foundSetting}`,
        description: `Bringing the ${foundSetting} to life with one sensory detail makes the scene feel more cinematic.`,
        addedText: `The ${foundSetting} felt different now — the air lighter, the colours brighter, as if the world itself had taken notice.`
      }
    ];
  }

  if (isMarketing) {
    return [
      {
        id: "1",
        title: "Open with the audience's core feeling",
        description: `Starting by naming exactly what your audience feels creates immediate connection.`,
        addedText: `If you've ever felt that there had to be a better way — you were right. And now there is.`
      },
      {
        id: "2",
        title: "Describe the transformation, not the product",
        description: "Audiences connect to outcomes, not features. Describe the life after, not the product itself.",
        addedText: `Imagine what changes when this becomes part of your life. That's the real story we're telling.`
      },
      {
        id: "3",
        title: "End with one clear, confident action",
        description: "A single, specific call-to-action removes decision paralysis and drives conversion.",
        addedText: `One step is all it takes. Take it today — and see what's possible tomorrow.`
      },
      {
        id: "4",
        title: "Add a moment of human truth",
        description: "A brief relatable observation makes the script feel personal instead of promotional.",
        addedText: `The truth is, most people wait until the perfect moment. But the perfect moment is already here.`
      }
    ];
  }

  // Default story mode
  const hasDialogue = /"[^"]*"/.test(story) || story.includes(" said ") || story.includes(" asked ");
  return [
    {
      id: "1",
      title: `Deepen the ${foundSetting} atmosphere`,
      description: `Adding a sensory detail to the ${foundSetting} setting grounds the audience emotionally before the key scene.`,
      addedText: `The ${foundSetting} was quiet — unnaturally so. The kind of quiet that made you hold your breath without knowing why.`
    },
    {
      id: "2",
      title: `Show ${hero}'s emotion through action`,
      description: `What ${hero} does instead of what they say is often more powerful in a short story.`,
      addedText: `${hero} didn't speak. Instead, they did something small — and that small thing changed everything.`
    },
    hasDialogue ? {
      id: "3",
      title: "Add a pause before the key line",
      description: "A beat of silence before the most important line of dialogue gives it much more weight.",
      addedText: `There was a long silence. Then — finally — the words came. And once said, they could not be unsaid.`
    } : {
      id: "3",
      title: `Add one line of honest dialogue`,
      description: `A single, honest spoken line from ${hero} at the turning point makes the audience feel present in the scene.`,
      addedText: `"I didn't know if I could do it," ${hero} admitted quietly. "But I had to try."`
    },
    {
      id: "4",
      title: "Close with a transformed world",
      description: "Ending on a changed environment shows that the story's events had real consequences.",
      addedText: `When it was over, the world looked the same. But it wasn't — and neither were the people in it.`
    }
  ];
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { story, purposeMode, mode, characters, lineText, characterName, personality } = body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "Anthropic API key not configured." }, { status: 500 });
    }

    // ── Single Dialogue Line Enhancement Mode ──
    if (mode === "enhance-line") {
      const linePrompt = `FULL STORY / SCRIPT CONTEXT:
"${story}"

CHARACTER NAME: ${characterName || "Character"}
CHARACTER PERSONALITY: ${personality || "Consistent with story"}

ORIGINAL LINE OF DIALOGUE:
"${lineText}"

CRITICAL DIALOGUE ENHANCEMENT RULES:
1. EASY & CONVERSATIONAL: Use simple, natural everyday words. The dialogue MUST be easy and fluid to speak out loud — no artificial jargon or overly complex academic phrasing.
2. SINGLE COMPLETE SENTENCE: Rewrite as ONE clear, well-formed sentence (approx 12 to 15 words). Do NOT break into multiple choppy sentences or tiny fragments.
3. PRESERVE EXACT MEANING: Keep the exact same core message, facts, and emotional intent of the original sentence.
4. 45-SECOND PACING: Write with natural rhythm and breath pauses suitable for a 45-second total video duration.

Return ONLY the rewritten single sentence of dialogue. No quotation marks, no preamble, no explanations.`;

      let enhancedText = "";
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          const raw = await callClaude(linePrompt, "You are a dialogue polishing expert who strictly preserves the original meaning and message of every sentence.");
          if (raw) {
            enhancedText = raw.replace(/^["'“”]+|["'“”]+$/g, "").trim();
          }
        } catch (e) {
          console.warn("Claude line enhancement warning:", e.message);
        }
      }

      if (!enhancedText) {
        // Claude retry with simpler prompt when first attempt fails
        try {
          const raw = await callClaude(
            `Rewrite this dialogue line to be more vivid while preserving its EXACT meaning and core message. Return only the rewritten line:\n"${lineText}"`,
            "You are a dialogue polishing expert."
          );
          if (raw) {
            enhancedText = raw.replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, "").trim();
          }
        } catch (e) {
          console.error("Claude line enhancement retry error:", e);
        }
      }

      // Local fallback ONLY when Claude returned nothing at all
      // Do NOT fire when Claude returned the original line unchanged — that's an intentional choice
      if (!enhancedText) {
        enhancedText = localEnhanceLine(lineText, characterName);
      }

      return NextResponse.json({ success: true, enhancedLine: enhancedText || lineText });
    }

    // ── LLM Dialogue Extraction Mode ──────────────────────────────────────────
    if (mode === "extract-dialogue") {
      let extracted = null;

      // Primary: Claude single-pass extraction (characters + dialogue attribution)
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          const claudeResult = await extractStoryDataWithClaude(story, purposeMode === "marketing");
          if (claudeResult && Array.isArray(claudeResult.dialogue) && claudeResult.dialogue.length > 0) {
            extracted = claudeResult.dialogue.map(d => ({
              character: String(d.speaker || "").trim().toUpperCase(),
              line: String(d.quote || "").replace(/^[\s*\u201C\u201D"']+|[\s*\u201C\u201D"']+$/g, "").trim()
            }));

            // Sanitize extracted characters against NON_CHAR_NAMES
            const extractedChars = (claudeResult.characters || [])
              .map(c => (typeof c === "string" ? c : c.name || "").trim().toUpperCase());
            const inputChars = (characters || [])
              .map(c => (typeof c === "string" ? c : c.name || "").trim().toUpperCase());
            const knownChars = [...new Set([...extractedChars, ...inputChars])]
              .filter(c => c && c.length > 1 && !NON_CHAR_NAMES.has(c));

            extracted = extracted.map(d => {
              let char = d.character ? d.character.trim().toUpperCase() : "";
              if (!char || NON_CHAR_NAMES.has(char) || char.length <= 1) {
                char = knownChars[0] || "CHARACTER";
              }
              return { ...d, character: char };
            });

            const uniqueSpeakers = [...new Set(extracted.map(d => d.character))];
            if (uniqueSpeakers.length === 1 && knownChars.length >= 2) {
              const soloSpeaker = uniqueSpeakers[0];
              const otherSpeaker = knownChars.find(c => c !== soloSpeaker) || knownChars[1];
              const speakers = [soloSpeaker, otherSpeaker];
              extracted = extracted.map((d, i) => ({ ...d, character: speakers[i % 2] }));
            }

            extracted = extracted.filter(d => d.character.length > 1 && !NON_CHAR_NAMES.has(d.character));
            return NextResponse.json({ success: true, dialogues: extracted });
          }
        } catch (e) {
          console.error("Claude suggest extraction error:", e.message);
        }
      }

      // Dedicated Fallback for Narrated/Unquoted stories:
      if (!Array.isArray(extracted) || extracted.length === 0) {
        try {
          const prompt = `Read this story. The characters communicate through actions or reported speech (without quotation marks).
Adapt their speech into 3 to 6 direct, realistic screenplay dialogue lines spoken back and forth between the characters.

Story:
"${story}"

Return ONLY a valid JSON array of objects, exact format:
[
  { "character": "CHARACTER_NAME_IN_CAPS", "line": "Direct spoken dialogue line." }
]`;

          const raw = await callClaude(prompt, "You are a professional screenplay dialogue adaptor. Return ONLY a valid JSON array.");
          if (raw && typeof raw === "string") {
            const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/g, "").trim();
            const firstB = clean.indexOf("[");
            const lastB = clean.lastIndexOf("]");
            if (firstB !== -1 && lastB !== -1) {
              const parsedArr = JSON.parse(clean.substring(firstB, lastB + 1));
              if (Array.isArray(parsedArr) && parsedArr.length > 0) {
                extracted = parsedArr.map(d => ({
                  character: String(d.character || "").trim().toUpperCase(),
                  line: String(d.line || d.quote || d.text || "").trim()
                }));
              }
            }
          }
        } catch (e) {
          console.error("Narrated dialogue adaptation error:", e.message);
        }
      }

      // Last resort: regex quote extraction
      if (!Array.isArray(extracted) || extracted.length === 0) {
        const quotes = [];
        const cleanStory = story.replace(/\*\*/g, "").replace(/__/g, "");
        const doubleQuoteRegex = /["\u201C]([^"\u201D]+)["\u201D]/g;
        let match;
        while ((match = doubleQuoteRegex.exec(cleanStory)) !== null) {
          const txt = match[1].trim();
          if (txt.length > 1) quotes.push({ character: "UNKNOWN", line: txt });
        }
        extracted = quotes;
      }

      // Normalise: every item must be { character, line }
      const normalised = (extracted || [])
        .filter(d => d && (d.character || d.speaker) && (d.line || d.text))
        .map(d => ({
          character: String(d.character || d.speaker).trim(),
          line: String(d.line || d.text).replace(/^[\s*\u201C\u201D"']+|[\s*\u201C\u201D"']+$/g, "").trim()
        }))
        .filter(d => d.character.length > 0 && d.line.length > 0);

      // Final regex spot-check (only against explicit tags, never overrides Claude)
      const correctedDialogues = reattributeExtractedDialogues(normalised, story, characters || []);

      // Final Guarantee Pass: Ensure ZERO UNKNOWN characters are ever returned to the client
      const knownList = (characters || [])
        .map(c => (typeof c === "string" ? c : c.name || "").trim().toUpperCase())
        .filter(Boolean);

      const finalCleanedDialogues = correctedDialogues.map((d, i) => {
        let char = d.character ? d.character.trim().toUpperCase() : "UNKNOWN";
        if (char === "UNKNOWN" || char === "") {
          if (knownList.length > 0) {
            const prevChar = i > 0 ? correctedDialogues[i - 1]?.character?.toUpperCase() : null;
            const nextChar = i < correctedDialogues.length - 1 ? correctedDialogues[i + 1]?.character?.toUpperCase() : null;
            if (prevChar && prevChar !== "UNKNOWN" && knownList.length >= 2) {
              const otherChar = knownList.find(c => c !== prevChar) || knownList[0];
              char = otherChar;
            } else if (nextChar && nextChar !== "UNKNOWN" && knownList.length >= 2) {
              const otherChar = knownList.find(c => c !== nextChar) || knownList[0];
              char = otherChar;
            } else {
              char = knownList[i % knownList.length];
            }
          } else {
            const firstWordInStory = (story.match(/\*\*([^*]+)\*\*/)?.[1] || story.match(/([A-Z][a-z]+)/)?.[1] || "CHARACTER").toUpperCase();
            char = firstWordInStory;
          }
        }
        return { ...d, character: char };
      });

      return NextResponse.json({ success: true, dialogues: finalCleanedDialogues });
    }

    const isCharactersMode = mode === "characters";
    const isMarketing = purposeMode === "marketing";
    const charNames = (characters || []).map(c => c.name).join(", ");

    let prompt = "";

    if (isCharactersMode) {
      prompt = `You are a story analyst. Read this story carefully and generate exactly 4 character enhancement suggestions that fit ONLY this specific story.

STORY: "${story}"
CHARACTERS: ${charNames}

RULES: Reference THIS story's specific characters and events. Keep addedText to 1-2 short sentences matching the story's tone. Keep description to 1 sentence.

Return ONLY this JSON (no text before or after, no markdown):
[{"id":"1","title":"short title","description":"one sentence why this fits.","addedText":"1-2 sentences matching story tone."},{"id":"2","title":"short title","description":"one sentence why this fits.","addedText":"1-2 sentences matching story tone."},{"id":"3","title":"short title","description":"one sentence why this fits.","addedText":"1-2 sentences matching story tone."},{"id":"4","title":"short title","description":"one sentence why this fits.","addedText":"1-2 sentences matching story tone."}]`;

    } else if (isMarketing) {
      prompt = `You are a marketing expert. Read this script and generate exactly 4 story-specific enhancement suggestions.

SCRIPT: "${story}"

RULES: Be specific to THIS product/brand. Keep addedText to 1-2 short sentences. Keep description to 1 sentence.

Return ONLY this JSON (no text before or after, no markdown):
[{"id":"1","title":"short title","description":"one sentence.","addedText":"1-2 sentences."},{"id":"2","title":"short title","description":"one sentence.","addedText":"1-2 sentences."},{"id":"3","title":"short title","description":"one sentence.","addedText":"1-2 sentences."},{"id":"4","title":"short title","description":"one sentence.","addedText":"1-2 sentences."}]`;

    } else {
      prompt = `You are a story development expert. Read this story and generate exactly 4 enhancement suggestions that fit ONLY this specific story.

STORY: "${story}"

RULES: Reference THIS story's actual characters, setting, and events. Prefer deepening existing moments over adding new plot. Keep addedText to 1-2 short sentences using the SAME vocabulary and tone as the original. Keep description to 1 sentence.

Return ONLY this JSON (no text before or after, no markdown):
[{"id":"1","title":"short title","description":"one sentence.","addedText":"1-2 sentences matching story tone."},{"id":"2","title":"short title","description":"one sentence.","addedText":"1-2 sentences matching story tone."},{"id":"3","title":"short title","description":"one sentence.","addedText":"1-2 sentences matching story tone."},{"id":"4","title":"short title","description":"one sentence.","addedText":"1-2 sentences matching story tone."}]`;
    }

    // Call Claude for suggestions
    let rawResponse = null;
    try {
      rawResponse = await callClaude(prompt, "You are an expert story development assistant.");
    } catch (e) {
      console.warn("Claude suggestion call failed:", e.message);
    }

    let suggestions = [];

    if (rawResponse) {
      // Extract and parse JSON from AI response
      const startIdx = rawResponse.indexOf("[");
      const endIdx = rawResponse.lastIndexOf("]");
      let cleanText = (startIdx !== -1 && endIdx > startIdx)
        ? rawResponse.substring(startIdx, endIdx + 1)
        : rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();

      try {
        const parsed = JSON.parse(cleanText);
        suggestions = parsed
          .map((s, i) => ({
            id: String(s.id || i + 1),
            title: s.title || "",
            description: s.description || "",
            addedText: s.addedText || ""
          }))
          .filter(s => s.title && s.addedText);
      } catch (e) {
        console.error("AI parse error, using local fallback:", e.message);
      }
    }

    // If AI returned nothing or empty, use smart local fallback
    if (suggestions.length === 0) {
      suggestions = buildFallbackSuggestions(story, characters, isMarketing, isCharactersMode);
    }

    return NextResponse.json({ success: true, suggestions });

  } catch (error) {
    console.error("Suggestion error:", error);
    // Even on hard error — return fallback suggestions so the user always sees something useful
    try {
      const body = await request.json().catch(() => ({}));
      const fallback = buildFallbackSuggestions(
        body.story || "",
        body.characters || [],
        body.purposeMode === "marketing",
        body.mode === "characters"
      );
      return NextResponse.json({ success: true, suggestions: fallback });
    } catch (_) {
      return NextResponse.json({ error: error.message || "Failed to generate suggestions." }, { status: 500 });
    }
  }
}


// ── Ground-truth speaker spot-check for extract-dialogue mode ───────────────
function reattributeExtractedDialogues(dialogues, story, characters = []) {
  if (!story || !dialogues || dialogues.length === 0) return dialogues;

  const NON_CHARACTERS = new Set([
    "CREATURE", "TABLET", "DEVICE", "EXPERIMENT", "RECORD", "RECORDS", "MESSAGE",
    "MEMORY", "MEMORIES", "WORLD", "CITY", "FORCE", "TRUTH", "PATH", "ANCIENT",
    "SECRET", "WARNING", "CIVILIZATION", "PERSON", "THING", "PEOPLE", "RELIC",
    "VAULT", "CHAMBER", "SYMBOL", "SYMBOLS", "MIND", "TIME", "HISTORY", "JOURNEY",
    "SUDDENLY", "BECAUSE", "SOMETHING", "EVERYONE", "ANYONE", "SOMEONE", "NOTHING",
    "SHE", "HE", "THEY", "IT", "WE", "YOU", "I", "THE", "A", "AN", "THIS", "THAT",
    "THESE", "THOSE", "WHAT", "WHEN", "WHERE", "WHY", "HOW", "THEN", "THUS", "BEFORE", "AFTER"
  ]);

  let knownCharsOriginal = (characters || [])
    .map(c => (typeof c === "string" ? c : c.name || "").trim())
    .filter(c => {
      const up = c.toUpperCase();
      return up.length > 0 && !NON_CHARACTERS.has(up);
    });

  if (knownCharsOriginal.length === 0) {
    const autoSet = new Set();
    const boldMatches = [...story.matchAll(/\*\*([^*]+)\*\*/g)];
    for (const bm of boldMatches) {
      const name = bm[1].trim();
      const up = name.toUpperCase();
      if (name.length > 1 && !/^(the|a|an)$/i.test(name) && !NON_CHARACTERS.has(up)) {
        autoSet.add(up);
      }
    }
    const SPEECH_VERBS_REGEX = "said|says|replied|replies|asked|asks|whispered|whispers|shouted|shouts|exclaimed|exclaims|laughed|laughs|smiled|smiles|cried|cries|muttered|mutters|nodded|nods|gasped|gasps|thundered|thunders|cheered|cheers|called|calls|answered|answers|responded|responds|declared|declares|announced|announces|added|adds|questions|questioned|echoes|echoed|speaks|spoke";
    const preVerbRegex = new RegExp(`(?:the\\s+)?([A-Z][a-zA-Z.]+(?:\\s+[A-Z][a-zA-Z.]+){0,2})\\b[^.!?]{0,40}?\\b(?:${SPEECH_VERBS_REGEX})\\b`, "gi");
    let vm;
    while ((vm = preVerbRegex.exec(story)) !== null) {
      const name = vm[1].trim();
      const up = name.toUpperCase();
      if (name.length > 1 && !NON_CHARACTERS.has(up)) {
        autoSet.add(up);
      }
    }
    if (/\b(voice|speaker|intercom|echo)\b/i.test(story)) {
      autoSet.add("VOICE");
    }
    knownCharsOriginal = Array.from(autoSet);
  }

  if (knownCharsOriginal.length === 0) return dialogues;

  // Sort: Proper character names come BEFORE generic audio/role entities (e.g. VOICE, NARRATOR)
  knownCharsOriginal.sort((a, b) => {
    const isAudioA = /^(VOICE|SPEAKER|NARRATOR|KEEPER|GUARDIAN)$/i.test(a);
    const isAudioB = /^(VOICE|SPEAKER|NARRATOR|KEEPER|GUARDIAN)$/i.test(b);
    if (isAudioA && !isAudioB) return 1;
    if (!isAudioA && isAudioB) return -1;
    return 0;
  });

  const VERBS = "said|says|replied|replies|asked|asks|whispered|whispers|shouted|shouts|exclaimed|exclaims|laughed|laughs|smiled|smiles|cried|cries|muttered|mutters|nodded|nods|gasped|gasps|thundered|thunders|cheered|cheers|called|calls|noted|notes|answered|answers|responded|responds|declared|declares|announced|announces|added|adds|echoed|echoes|bellowed|bellows|intoned|intones|chimed|chimes|murmured|murmurs|breathed|breathes|questions|questioned|activates|activated|states|stated|transmits|transmitted|broadcasts|displays|displayed|emits|emitted|projects|projected|crackles|crackled|buzzes|buzzed|rings|rang|beeps|beeped";

  // Build a quote → speaker map from the raw story
  const attributionMap = new Map();
  const quoteRegex = /["“]([^"”]+)["”]/g;
  let qm;

  const matchKnownChar = (rawName) => {
    if (!rawName) return null;
    const norm = rawName.trim().toLowerCase();
    const wordsInNorm = norm.split(/\s+/);
    if (wordsInNorm.length > 5) return null;

    for (const char of knownCharsOriginal) {
      if (char.toLowerCase() === norm) return char;
    }
    for (const char of knownCharsOriginal) {
      const charLower = char.toLowerCase();
      const charWords = charLower.split(/\s+/);
      if (wordsInNorm.some(w => charWords.includes(w) && w.length > 2)) {
        return char;
      }
    }
    return null;
  };

  while ((qm = quoteRegex.exec(story)) !== null) {
    const quoteText = qm[1].trim();
    const index = qm.index;

    const rawPre = story.substring(0, index);
    const lastQuoteIdx = Math.max(rawPre.lastIndexOf('"'), rawPre.lastIndexOf('”'), rawPre.lastIndexOf('\n\n'));
    const sentencePre = lastQuoteIdx >= 0 ? rawPre.substring(lastQuoteIdx + 1) : rawPre;
    const preTextRaw = sentencePre.substring(Math.max(0, sentencePre.length - 150));
    const preText = preTextRaw.replace(/\b(?:lowered|raised|cleared|in|with|to)\s+(?:his|her|their|my|your|a|the)?\s*(?:voice|throat|breath|tone)\s*(?:and)?\b/gi, " ");
    const postText = story.substring(index + qm[0].length, Math.min(story.length, index + qm[0].length + 80));

    let speaker = null;
    let maxMatchPos = -1;

    // 0a. Self-identification inside quote (e.g. "this is Captain Miller", "I am Merlin")
    const selfIdMatch = quoteText.match(/\b(?:this is|I am|my name is)\s+([A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+){0,2})\b/i);
    if (selfIdMatch) {
      const selfName = matchKnownChar(selfIdMatch[1]) || selfIdMatch[1].trim().toUpperCase();
      if (selfName && !NON_CHARACTERS.has(selfName)) {
        speaker = selfName;
        maxMatchPos = 1000;
      }
    }

    // 0. Colon-format speaker right before quote (e.g. "A flickering hologram activates: "Quote"")
    const tightPre = preText.substring(Math.max(0, preText.length - 45));
    if (!/["”\n]/.test(tightPre)) {
      const colonMatch = tightPre.match(/(?:the\s+)?([A-Za-z][a-zA-Z\s]{1,30}):\s*$/i);
      if (colonMatch) {
        const matched = matchKnownChar(colonMatch[1]);
        if (matched) {
          speaker = matched;
          maxMatchPos = 999;
        }
      }
    }

    // 1. Direct speech verb in preText
    for (const char of knownCharsOriginal) {
      const esc = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const verbRe = new RegExp(`\\b${esc}\\b[\\s\\S]*?\\b(?:${VERBS})\\b`, "gi");
      let m;
      while ((m = verbRe.exec(preText)) !== null) {
        if (m.index > maxMatchPos) {
          maxMatchPos = m.index;
          speaker = char;
        }
      }
    }

    // 2. Generic speaker match in preText (e.g. "a glowing fox said", "old woman's voice echoed")
    if (!speaker) {
      const strippedPre = preText.replace(/'s\b/gi, " ");
      const genericSpeakerRe = new RegExp(`([A-Z][a-zA-Z.]+(?:\\s+[A-Z][a-zA-Z.]+){0,2})\\b[^.!?]{0,40}?\\b(?:${VERBS})\\b`, "gi");
      let gm;
      while ((gm = genericSpeakerRe.exec(strippedPre)) !== null) {
        const matched = matchKnownChar(gm[1]);
        if (matched && gm.index > maxMatchPos) {
          maxMatchPos = gm.index;
          speaker = matched;
        }
      }
    }

    // 3. Gender-aware pronoun resolution in preText
    const femaleVerbRe = new RegExp(`\\b(she|her)\\b[\\s\\S]*?\\b(?:${VERBS})\\b`, "gi");
    let fm;
    while ((fm = femaleVerbRe.exec(preText)) !== null) {
      if (fm.index > maxMatchPos) {
        maxMatchPos = fm.index;
        const storyBefore = story.substring(0, index);
        let lastFemale = null;
        let lastFemalePos = -1;
        for (const char of knownCharsOriginal) {
          const esc = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const occurrences = [...storyBefore.matchAll(new RegExp(`\\b${esc}\\b`, "gi"))];
          if (occurrences.length > 0) {
            const pos = occurrences[occurrences.length - 1].index;
            if (pos > lastFemalePos) { lastFemalePos = pos; lastFemale = char; }
          }
        }
        speaker = lastFemale || knownCharsOriginal[0];
      }
    }

    const maleVerbRe = new RegExp(`\\b(he|him|his)\\b[\\s\\S]*?\\b(?:${VERBS})\\b`, "gi");
    let mm;
    while ((mm = maleVerbRe.exec(preText)) !== null) {
      if (mm.index > maxMatchPos) {
        maxMatchPos = mm.index;
        const storyBefore = story.substring(0, index);
        let lastMale = null;
        let lastMalePos = -1;
        for (const char of knownCharsOriginal) {
          const esc = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const occurrences = [...storyBefore.matchAll(new RegExp(`\\b${esc}\\b`, "gi"))];
          if (occurrences.length > 0) {
            const pos = occurrences[occurrences.length - 1].index;
            if (pos > lastMalePos) { lastMalePos = pos; lastMale = char; }
          }
        }
        speaker = lastMale || knownCharsOriginal[0];
      }
    }

    // 4. Post-text verb match
    if (!speaker) {
      for (const char of knownCharsOriginal) {
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
      const cleanKey = quoteText.toLowerCase().replace(/[.!?,'"\u201C\u201D]+$/g, "").trim();
      attributionMap.set(cleanKey, speaker);
    }
  }

  const mapped = dialogues.map(d => {
    if (!d || !d.line) return d;
    const cleanKey = d.line.toLowerCase().replace(/[.!?,'"\u201C\u201D]+$/g, "").trim();
    const correctSpeaker = attributionMap.get(cleanKey);
    if (correctSpeaker && (d.character === "UNKNOWN" || d.character?.trim().toUpperCase() !== correctSpeaker.toUpperCase())) {
      return { ...d, character: correctSpeaker };
    }
    return d;
  });

  // ── Conversational Alternation Pass ──────────────────────────────────────────
  // For 2-character dialogues, resolve any remaining UNKNOWN lines by dialogue turn-taking
  const knownNamesUpper = knownCharsOriginal.map(c => (typeof c === "string" ? c : c.name || "").toUpperCase());
  if (knownNamesUpper.length >= 2) {
    const charA = knownNamesUpper[0];
    const charB = knownNamesUpper[1];

    for (let i = 0; i < mapped.length; i++) {
      if (!mapped[i].character || mapped[i].character === "UNKNOWN") {
        const prevChar = i > 0 ? mapped[i - 1].character?.toUpperCase() : null;
        const nextChar = i < mapped.length - 1 ? mapped[i + 1].character?.toUpperCase() : null;

        if (prevChar === charB || nextChar === charB) {
          mapped[i] = { ...mapped[i], character: charA };
        } else if (prevChar === charA || nextChar === charA) {
          mapped[i] = { ...mapped[i], character: charB };
        } else if (i % 2 === 0) {
          mapped[i] = { ...mapped[i], character: charA };
        } else {
          mapped[i] = { ...mapped[i], character: charB };
        }
      }
    }
  }

  return mapped;
}

// ── Reasoning-First Dialogue Extraction + Double-Check Verification Pass ────
async function extractWithReasoning(fullStory, characters = []) {
  const charListHint = (characters && characters.length > 0)
    ? `\nKnown characters in this story: ${characters.map(c => (typeof c === "string" ? c : c.name || c)).join(", ")}. Use these EXACT names in the "character" field.`
    : "";

  const extractionPrompt = `Read this story very carefully.

Story:
"""
${fullStory}
"""${charListHint}

TASK: List every character in this story. Then, one quote at a time, 
determine EXACTLY who spoke it — based on who is actually talking, 
not just whose name appears nearest the quote. A character's name can 
appear in a line spoken BY SOMEONE ELSE (e.g. someone addressing them, 
or being described), so don't default to "nearest name."

Work through the story in order, quote by quote. For each quote, briefly 
state your reasoning (who says the surrounding narration belongs to, 
who is being addressed vs who is speaking) before deciding the speaker.

After your reasoning, output a final answer on its own line starting 
with "FINAL_JSON:" followed by a JSON array like this:
[{"character": "Character Name", "line": "Dialogue line text."}]

Use the exact character names as they appear in the story.`;

  const raw = await callClaude(extractionPrompt, "You are a precise story dialogue analyst. Follow instructions exactly.");
  console.log("[extractWithReasoning raw]:", raw ? String(raw).substring(0, 300) : "null");
  if (!raw || typeof raw !== "string") return null;

  const marker = 'FINAL_JSON:';
  const idx = raw.indexOf(marker);

  let jsonPart = "";
  if (idx !== -1) {
    jsonPart = raw.slice(idx + marker.length).trim();
  } else {
    jsonPart = raw.trim();
  }

  jsonPart = jsonPart.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/g, '').trim();

  let attributions = null;
  try {
    const firstBracket = jsonPart.indexOf('[');
    const lastBracket = jsonPart.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      jsonPart = jsonPart.substring(firstBracket, lastBracket + 1);
    }
    attributions = JSON.parse(jsonPart);
  } catch (e) {
    console.warn("Reasoning extraction pass 1 JSON parse error:", e.message);
    return null;
  }

  if (!Array.isArray(attributions) || attributions.length === 0) {
    return attributions;
  }

  // --- Double-check Verification pass ---
  const verifyPrompt = `Here is a story and a proposed list of who said each line:

Story:
"""
${fullStory}
"""

Proposed attributions:
${JSON.stringify(attributions, null, 2)}

Check EACH attribution against the story. If any line is assigned to 
the wrong character, correct it. Pay special attention to lines where 
one character is addressed by name but ANOTHER character is speaking.

Output ONLY the corrected JSON array, same format, no explanation.`;

  const verifyRaw = await callClaude(verifyPrompt, "You are a precise story dialogue analyst. Return only valid JSON.");
  if (verifyRaw && typeof verifyRaw === "string") {
    let cleanedVerify = verifyRaw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/g, '').trim();
    const fb = cleanedVerify.indexOf('[');
    const lb = cleanedVerify.lastIndexOf(']');
    if (fb !== -1 && lb !== -1) {
      cleanedVerify = cleanedVerify.substring(fb, lb + 1);
    }
    try {
      const verified = JSON.parse(cleanedVerify);
      if (Array.isArray(verified) && verified.length > 0) {
        return verified;
      }
    } catch (_) {
      // If verification pass fails to parse, fall back to first pass attributions
    }
  }

  return attributions;
}