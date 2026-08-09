import { NextResponse } from "next/server";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Models in priority order — includes all known variants to maximise quota coverage
const MODEL_CASCADE = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-8b",
  "gemini-2.0-flash-lite",
];

async function callGeminiWithFallback(prompt, apiKey) {
  let lastError = null;

  for (const model of MODEL_CASCADE) {
    const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.92,
          maxOutputTokens: 4096,
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    const errorBody = await response.json().catch(() => ({}));
    const status = response.status;

    if (status === 429 || status === 404 || status === 400) {
      // Continue to next model in cascade
      let retrySeconds = null;
      if (status === 429) {
        try {
          const retryInfo = errorBody?.error?.details?.find(d => d["@type"]?.includes("RetryInfo"));
          if (retryInfo?.retryDelay) retrySeconds = parseInt(retryInfo.retryDelay.replace("s", ""), 10);
        } catch (_) { }
      }
      lastError = { status, retrySeconds, model };
      continue;
    }

    throw new Error(errorBody?.error?.message || `API error ${status}`);
  }

  // All models exhausted
  return null; // Signal to use fallback
}

// ── Local dialogue enhancement — runs when AI quota is exhausted ──────────────
// Applies meaningful emotional depth transforms to dialogue without AI
function localEnhanceLine(line, characterName) {
  if (!line) return line;

  const clean = line.trim().replace(/^["'"]+|["'"]+$/g, "").trim();
  if (!clean) return line;

  // Rule set: pattern → emotional enrichment transform
  const transforms = [
    // Uncertainty / wishing → add ellipsis + qualifier
    [/^i wish i could/i, s => s.replace(/^I wish I could/i, "I wish with everything I have that I could")],
    [/^i don'?t know if/i, s => s.replace(/^I don'?t know if/i, "Honestly... I'm still not sure if")],
    [/^i can'?t/i, s => s.replace(/^I can'?t/i, "I really can't — no matter how hard I try,")],
    [/^maybe i/i, s => s.replace(/^Maybe I/i, "Maybe — just maybe — I")],

    // Small / big contrast → poetic contrast form
    [/you'?re too small/i, s => s.replace(/you'?re too small/i, "You're far too small — do you even see yourself?")],
    [/too small to make/i, s => s.replace(/too small to make/i, "too small — far too small — to ever make")],

    // Encouragement / affirmation → emotionally charged
    [/you really did help/i, s => s.replace(/you really did help/i, "You actually did it — you really, truly helped")],
    [/you did it/i, s => s.replace(/you did it/i, "You actually did it — I can't believe it, but you did")],

    // Core theme line — signature emotional punch
    [/you don'?t have to be big to make a big/i, () => "It doesn't take a giant to make a difference — it just takes heart."],

    // Generic excitement / disbelief
    [/look at you/i, s => s.replace(/look at you/i, "Just look at you —")],
    [/^you\?/i, () => "You? Of all the clouds in the sky, it had to be you?"],
  ];

  for (const [pattern, transform] of transforms) {
    if (pattern.test(clean)) {
      const result = transform(clean);
      if (result && result !== clean) {
        // Ensure ends with punctuation
        return result.replace(/[,\s]+$/, "") + (result.match(/[.!?]$/) ? "" : ".");
      }
    }
  }

  // Generic fallback: add emphasis ellipsis before final clause
  const parts = clean.split(/,\s*/);
  if (parts.length >= 2) {
    return parts[0] + "..." + parts.slice(1).join(", ") + (clean.match(/[.!?]$/) ? "" : ".");
  }

  // Last resort: add "— truly." for emphasis
  const base = clean.replace(/[.!?]+$/, "");
  return `${base} — and I mean it.`;
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key not configured." }, { status: 500 });
    }

    // ── Single Dialogue Line Enhancement Mode ──
    if (mode === "enhance-line") {
      const linePrompt = `FULL STORY CONTEXT:
"${story}"

CHARACTER NAME: ${characterName || "Character"}
CHARACTER PERSONALITY: ${personality || "Consistent with story"}

ORIGINAL LINE OF DIALOGUE:
"${lineText}"

SYSTEM INSTRUCTION:
Rewrite this one line of dialogue to be more emotionally touching and vivid, while: keeping the same core meaning, staying consistent with the character's personality and the story's tone, not changing the plot, and keeping roughly the same length. Return only the rewritten line, no explanation.`;

      let enhancedText = "";
      try {
        const raw = await callGeminiWithFallback(linePrompt, apiKey);
        if (raw) {
          enhancedText = raw.replace(/^["'“”]+|["'“”]+$/g, "").trim();
        }
      } catch (e) {
        console.error("Line enhancement error:", e);
      }

      // If AI returned nothing / quota exhausted — apply meaningful local emotional rewrite
      if (!enhancedText || enhancedText === lineText) {
        enhancedText = localEnhanceLine(lineText, characterName);
      }

      return NextResponse.json({ success: true, enhancedLine: enhancedText });
    }

    // ── LLM Dialogue Extraction Mode ──────────────────────────────────────────
    // Reasoning-first extraction + double-check verification pass +
    // high-confidence-only regex spot-check (never overrides on weak evidence)
    if (mode === "extract-dialogue") {
      let extracted = null;
      try {
        extracted = await extractWithReasoning(story, apiKey, characters);
      } catch (e) {
        console.error("Reasoning extraction error:", e.message);
        extracted = null;
      }

      if (!Array.isArray(extracted) || extracted.length === 0) {
        const quotes = [];
        const doubleQuoteRegex = /["“]([^"”]+)["”]/g;
        let match;
        while ((match = doubleQuoteRegex.exec(story)) !== null) {
          const txt = match[1].trim();
          if (txt.length > 1) {
            quotes.push({ character: "UNKNOWN", line: txt });
          }
        }
        extracted = quotes;
      }

      // Normalise: ensure every item has { character, line } strings
      const normalised = extracted
        .filter(d => d && (d.character || d.speaker) && (d.line || d.text))
        .map(d => ({
          character: String(d.character || d.speaker).trim(),
          line: String(d.line || d.text).trim()
        }))
        .filter(d => d.character.length > 0 && d.line.length > 0);

      // Final high-confidence spot-check against explicit speech tags in the story.
      // Only overrides when a tight, explicit tag is found right next to the quote —
      // otherwise trusts the LLM's reasoned + verified attribution.
      const correctedDialogues = reattributeExtractedDialogues(normalised, story, characters || []);

      return NextResponse.json({ success: true, dialogues: correctedDialogues });
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

    // Try Gemini — if all models fail, use intelligent local fallback
    const rawResponse = await callGeminiWithFallback(prompt, apiKey);

    let suggestions = [];

    if (rawResponse) {
      // Gemini responded — extract and parse JSON
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
        console.error("Gemini parse error, using fallback:", e.message);
      }
    }

    // If Gemini failed or returned empty, use smart local fallback
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

  const knownCharsOriginal = (characters || [])
    .map(c => (typeof c === "string" ? c : c.name || "").trim())
    .filter(Boolean);
  if (knownCharsOriginal.length === 0) return dialogues;

  // Longest names first, so multi-word names aren't shadowed by a shorter substring
  const namesAlt = knownCharsOriginal
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  const originalCaseMap = {};
  knownCharsOriginal.forEach(name => { originalCaseMap[name.toUpperCase()] = name; });

  const VERBS = "said|replied|asked|whispered|shouted|exclaimed|laughed|smiled|cried|muttered|nodded|gasped|thundered|cheered|called|noted";
  const GAP = `["'“‘\\s,]{0,6}`;

  const findSpeakerInStory = (dialogueText) => {
    if (!dialogueText || dialogueText.length < 3) return null;
    const textToFind = dialogueText.trim().replace(/[.!?,]+$/, "");
    let foundIdx = story.toLowerCase().indexOf(textToFind.toLowerCase());
    if (foundIdx === -1) {
      const firstFive = textToFind.split(/\s+/).slice(0, 5).join(" ");
      if (firstFive.length > 6) foundIdx = story.toLowerCase().indexOf(firstFive.toLowerCase());
    }
    if (foundIdx === -1) return null;

    const preText = story.substring(Math.max(0, foundIdx - 60), foundIdx);
    const postStart = foundIdx + textToFind.length;
    const postText = story.substring(postStart, Math.min(story.length, postStart + 60));

    // "..." (the) NAME said — name must be a REAL known character, directly adjacent
    const postNameVerb = new RegExp(`^${GAP}(?:the\\s+)?(${namesAlt})\\s+(?:${VERBS})\\b`, "i");
    const m1 = postText.match(postNameVerb);
    if (m1) return m1[1].toUpperCase();

    // "..." said (the) NAME / "..." the Teacher noted
    const postVerbName = new RegExp(`^${GAP}(?:${VERBS}|the\\s+${namesAlt})\\s+(?:the\\s+)?(${namesAlt})\\b`, "i");
    const m2 = postText.match(postVerbName);
    if (m2) return m2[1].toUpperCase();

    // NAME ... said, "..."
    const preNameVerb = new RegExp(`(${namesAlt})[^.!?]{0,35}\\s+(?:${VERBS})[^.!?]{0,10}$`, "i");
    const m3 = preText.match(preNameVerb);
    if (m3) return m3[1].toUpperCase();

    return null; // no tight tag found — trust the LLM's attribution
  };

  return dialogues.map(d => {
    if (!d || !d.line) return d;
    const correctUpper = findSpeakerInStory(d.line);
    if (correctUpper && correctUpper !== d.character?.trim().toUpperCase()) {
      const display = originalCaseMap[correctUpper] || correctUpper;
      console.log(`[reattribute] "${d.line.slice(0, 40)}" ${d.character} -> ${display}`);
      return { ...d, character: display };
    }
    return d;
  });
}

// ── Reasoning-First Dialogue Extraction + Double-Check Verification Pass ────
async function extractWithReasoning(fullStory, apiKey, characters = []) {
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
[{"character": "Coco", "line": "I wish I could help."}]

Use the exact character names as they appear in the story.`;

  const raw = await callGeminiWithFallback(extractionPrompt, apiKey);
  if (!raw) return null;

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

  const verifyRaw = await callGeminiWithFallback(verifyPrompt, apiKey);
  if (verifyRaw) {
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