import Anthropic from "@anthropic-ai/sdk";

export async function generateMarketingContent(productDescription, showCharacter = true) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;

  const anthropic = new Anthropic({ apiKey });

  const characterModeInstructions = showCharacter
    ? "MODE: WITH CHARACTER — COMPULSORY SINGLE CHARACTER\nCreate EXACTLY 1 primary on-screen human persona (e.g. ALEX, CUSTOMER, or BRAND AMBASSADOR) who appears in the video and speaks ALL dialogue throughout the script. NEVER create multiple characters. Give this single persona a short cue name, a believable camera-ready appearance and personality, and write ALL character dialogue lines under this single character cue."
    : "MODE: NO CHARACTER (Professional / Product-Only)\nDo NOT create any human personas. This is a clean, professional product-focused video: on-screen text, product shots, and ONE neutral off-screen NARRATOR voiceover only — no named human character appears. The \"characters\" array in your JSON output MUST be empty. Every line of the script is either [ON-SCREEN TEXT: ...], [PRODUCT SHOT: ...], or NARRATOR (V.O.) dialogue.";

  const systemPrompt = `You are a professional commercial scriptwriter. Generate a complete marketing advertisement using ONLY the actual product information provided by the user.

${characterModeInstructions}

CRITICAL ANTI-META RULE — READ CAREFULLY:
The instructions in this prompt are NOT advertisement content. Never turn these instructions into dialogue, narration, scenes, character statements, claims, or marketing messages. Words such as "truth", "fake", "made up", "trust", "claims", "requirements", "user input", "instructions", "grounded", or "do not invent" must NOT appear in the generated advertisement under any circumstances.

MOST IMPORTANT RULE — NO META ADVERTISING:
The advertisement must be ABOUT THE PRODUCT DESCRIBED BY THE USER, NOT ABOUT THE PROCESS OF MAKING AN ADVERTISEMENT. Never create dialogue criticizing advertisements, discussing fake advertising, discussing honesty/truthfulness, explaining AI rules, or talking about "this ad". The final output MUST feel like a genuine, high-end commercial for the user's actual product.

STRICT GROUNDED INFORMATION RULE:
Use the user's original product description, features, benefits, target audience, setting, and supplied details as the source material.
- You may expand and creatively phrase information that the user has provided.
- You must NEVER introduce new unprovided facts (e.g. do NOT invent new unstated ingredients, new health/medical claims, certifications, percentages, prices, discounts, guarantees, competitor comparisons, or unstated organic/natural/sugar-free claims unless explicitly provided).

EXACT 45-SECOND RUNTIME & PACING:
- Total spoken dialogue / voiceover word budget: EXACTLY 85 to 95 spoken words across all character dialogue/narration lines (~35-38 seconds spoken audio + 7-10 seconds of visual action beats & dramatic pauses = EXACTLY 45 SECONDS TOTAL RUNTIME).
- Build the advertisement naturally through 4 scenes:
  Hook (0-10s) → Product Introduction (10-22s) → User-Provided Features & Experience (22-35s) → Ending & Call to Action (35-45s).

FORMAT RULES for the "screenplay" field — plain text, no markdown, no HTML:

SCENE HEADING:
INT./EXT. LOCATION - TIME OF DAY

ON-SCREEN TEXT (when relevant):
[ON-SCREEN TEXT: "Crispy, Cheesy, Spicy."]

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
  "estimatedSeconds": 45
}

If showCharacter is false, "characters" MUST be an empty array [].`;

  const userPrompt = `USER'S ACTUAL PRODUCT REQUEST:
"""
${productDescription}
"""

Generate the complete 45-second grounded advertisement JSON now, focusing strictly on the product above. Return ONLY the JSON object.`;

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

      let characters = showCharacter && Array.isArray(parsed.characters)
        ? parsed.characters.map(c => ({
          name: String(c.name || "").trim().toUpperCase(),
          role: c.role || "Brand Ambassador",
          gender: c.gender || "Unspecified",
          age: c.age || "Unspecified",
          appearance: c.appearance || "Professional, camera-ready presence.",
          clothing: c.clothing || "Brand-appropriate attire.",
          personality: c.personality || "Warm, relatable, and confident on camera.",
          emotion: c.emotion || "confident",
          dialogueCount: claudeDialogue.length > 0 ? claudeDialogue.length : 4
        })).filter(c => c.name.length > 0).slice(0, 1)
        : [];

      if (showCharacter && characters.length === 0) {
        characters = [{
          name: "ALEX",
          role: "Brand Ambassador",
          gender: "Unspecified",
          age: "25-30",
          appearance: "Warm, relatable, and camera-ready presence.",
          clothing: "Casual modern attire.",
          personality: "Friendly, engaging, and trustworthy.",
          emotion: "confident",
          dialogueCount: claudeDialogue.length > 0 ? claudeDialogue.length : 4
        }];
      }

      return {
        videoDescription: String(parsed.videoDescription || "").trim() || "A punchy, professional 45-second ad built around your product.",
        showCharacter,
        characters,
        screenplay: screenplayText,
        scenes,
        claudeDialogue,
        estimatedSeconds: typeof parsed.estimatedSeconds === "number" ? parsed.estimatedSeconds : 45
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