import Anthropic from "@anthropic-ai/sdk";

export async function generateMarketingContent(productDescription, showCharacter = true) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;

  const anthropic = new Anthropic({ apiKey });

  const characterModeInstructions = showCharacter
    ? "MODE: WITH CHARACTER\nCreate EXACTLY 1 primary on-screen human persona (e.g. ALEX, CUSTOMER, or BRAND AMBASSADOR) who appears in the video and speaks ALL the dialogue throughout the script. Do NOT split the script among multiple characters. Give this single persona a short cue name, a believable camera-ready appearance and personality, and write ALL character dialogue lines under this single character."
    : "MODE: NO CHARACTER (Professional / Product-Only)\nDo NOT create any human personas. This is a clean, professional product-focused video: on-screen text, product shots, and ONE neutral off-screen NARRATOR voiceover only — no named human character appears. The \"characters\" array in your JSON output MUST be empty. Every line of the script is either [ON-SCREEN TEXT: ...], [PRODUCT SHOT: ...], or NARRATOR (V.O.) dialogue.";

  const systemPrompt = `You are an award-winning commercial director and copywriter. You turn a short product/brand description into a punchy, professional video ad concept and script.

${characterModeInstructions}

HARD CONSTRAINTS — NON-NEGOTIABLE & ABSOLUTE:
1. EXACT DURATION & COMPLETE AD ARC: 28 TO 30 SECONDS TOTAL RUNTIME.
   - You MUST write a complete commercial arc: Starting Hook (0-6s) → Problem/Climax (6-18s) → Complete Final Ending & Call to Action (18-30s). Do NOT cut off mid-thought.
   - Spoken Word Budget: 50 to 58 spoken words across all character dialogue/narration lines (~20-22 seconds spoken audio + 8-10 seconds of on-screen visual product beats and dramatic pauses = EXACTLY 28-30 seconds total video duration).
   - Keep total spoken word count strictly between 50 and 58 words.
2. LANGUAGE: Simple, everyday words. No jargon, no corporate buzzwords, no complex sentence structures. A 12-year-old should understand every line instantly.
3. 28-30 SECOND TIMELINE STRUCTURE:
   - Starting Hook (0-6s): Grab attention immediately (10-12 words)
   - Problem & Climax (6-18s): Establish tension and high-impact solution (22-25 words)
   - Complete Final Ending & CTA (18-30s): Decisive resolution and memorable action step (15-18 words)
4. TONE: Confident and warm, never salesy or shouty. Short punchy sentences. Contractions are fine and encouraged (it's, you'll, don't).
5. The "videoDescription" field is ALWAYS required regardless of character mode — write 1-2 attractive sentences describing the ad concept and vibe, the kind of line you'd pitch to a client to get them excited.

6. MANDATORY MULTI-LINE DIALOGUE REQUIREMENT (3 to 4 LINES):
   - The character/narrator MUST have 3 to 4 distinct dialogue lines spoken across the 3 scenes (Scene 1 Hook line, Scene 2 Problem/Solution line, Scene 3 Call to Action line).
   - NEVER write only 1 dialogue line. Split the spoken script into 3 to 4 distinct dialogue cues throughout the screenplay.

FORMAT RULES for the "screenplay" field — plain text, no markdown, no HTML:

SCENE HEADING:
INT./EXT. LOCATION - TIME OF DAY

ON-SCREEN TEXT (when relevant):
[ON-SCREEN TEXT: "Tired of slow mornings?"]

CHARACTER CUE (only if showCharacter is true; ALL CAPS on its own line):
ALEX

DIALOGUE (plain text, no quotes):
This changed everything for me.

NARRATOR CUE (always allowed, especially when showCharacter is false):
NARRATOR (V.O.)

Write FADE IN: at the start and FADE OUT. at the end.

Return ONLY a valid raw JSON object, no markdown, no explanation, no backticks. Exact shape:

{
  "videoDescription": "1-2 attractive sentences describing the ad concept.",
  "characters": [
    {
      "name": "SHORT CUE NAME IN CAPS",
      "role": "Narrator" | "Brand Ambassador" | "Customer" | "Expert",
      "age": "approximate age or Unspecified",
      "gender": "Male" | "Female" | "Unspecified",
      "appearance": "brief professional visual description",
      "clothing": "brand-appropriate attire",
      "personality": "1-2 sentences on their vibe and relatability",
      "emotion": "one word — dominant tone"
    }
  ],
  "screenplay": "the complete formatted script as described above",
  "estimatedSeconds": integer
}

If showCharacter is false, "characters" MUST be an empty array [].`;

  const userPrompt = `PRODUCT / BRAND DESCRIPTION:
"""
${productDescription}
"""

Generate the complete 30-second-max ad concept and script now, following every rule above exactly. Return ONLY the JSON object.`;

  const models = [
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-5-20250929"
  ];

  for (const model of models) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 3072,
        temperature: 0.8,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const textContent = typeof response.content?.[0]?.text === "string" ? response.content[0].text : "";
      if (!textContent) continue;

      const cleanJson = textContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(cleanJson);

      if (!parsed || typeof parsed.screenplay !== "string" || !parsed.screenplay.trim()) continue;

      const screenplayText = parsed.screenplay.trim();
      const { scenes, claudeDialogue } = parseMarketingScreenplay(screenplayText, parsed.characters || []);

      const characters = showCharacter && Array.isArray(parsed.characters)
        ? parsed.characters.map(c => ({
            name: String(c.name || "").trim().toUpperCase(),
            role: c.role || "Brand Ambassador",
            gender: c.gender || "Unspecified",
            age: c.age || "Unspecified",
            appearance: c.appearance || "Professional, camera-ready presence.",
            clothing: c.clothing || "Brand-appropriate attire.",
            personality: c.personality || "Warm, relatable, and confident on camera.",
            emotion: c.emotion || "confident",
            dialogueCount: claudeDialogue.length > 0 ? claudeDialogue.length : 3
          })).filter(c => c.name.length > 0).slice(0, 1)
        : [];

      return {
        videoDescription: String(parsed.videoDescription || "").trim() || "A punchy, professional 30-second ad built around your product.",
        showCharacter,
        characters,
        screenplay: screenplayText,
        scenes,
        claudeDialogue,
        estimatedSeconds: typeof parsed.estimatedSeconds === "number" ? parsed.estimatedSeconds : 30
      };
    } catch (e) {
      console.warn(`[Marketing Content Generation - ${model}]:`, e.message);
    }
  }

  return null;
}

function parseMarketingScreenplay(screenplay, rawCharacters) {
  const charName = (rawCharacters[0]?.name || "SPEAKER").trim().toUpperCase();
  const lines = screenplay.split("\n").map(l => l.trim()).filter(Boolean);
  const dialogueList = [];
  const scenes = [];
  let currentScene = null;
  let currentSpeaker = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^(INT\.|EXT\.|INT\/EXT\.)/i)) {
      if (currentScene) scenes.push(currentScene);
      currentScene = {
        id: scenes.length + 1,
        heading: line,
        location: line.split(/[-—]/)[0].replace(/^(INT\.|EXT\.|INT\/EXT\.)\s*/i, "").trim(),
        timeOfDay: "DAY",
        action: "",
        dialogue: [],
        emotion: "confident"
      };
      currentSpeaker = null;
      continue;
    }

    if (line.match(/^[A-Z0-9\s._'-]{2,30}$/) && !line.includes("FADE") && !line.includes("SCENE") && !line.startsWith("[")) {
      currentSpeaker = line.replace(/\s*\(V\.O\.\)/i, "").trim();
      continue;
    }

    if (currentSpeaker && !line.startsWith("(") && !line.startsWith("[")) {
      const text = line.replace(/^["'“”]+|["'“”]+$/g, "").trim();
      if (text.length > 3) {
        dialogueList.push({ speaker: currentSpeaker, quote: text });
        if (currentScene) {
          currentScene.dialogue.push({
            character: currentSpeaker,
            text,
            parenthetical: "",
            emotion: "confident"
          });
        }
      }
      currentSpeaker = null;
      continue;
    }
  }

  if (currentScene) scenes.push(currentScene);

  // Fallback: If no scenes detected, create 1 scene with all dialogue
  if (scenes.length === 0 && dialogueList.length > 0) {
    scenes.push({
      id: 1,
      heading: "INT. STUDIO - DAY",
      location: "STUDIO",
      timeOfDay: "DAY",
      action: "Product commercial scene",
      dialogue: dialogueList.map(d => ({ character: d.speaker, text: d.quote, parenthetical: "", emotion: "confident" })),
      emotion: "confident"
    });
  }

  return { scenes, claudeDialogue: dialogueList };
}