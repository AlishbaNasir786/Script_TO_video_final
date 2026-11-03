import Anthropic from "@anthropic-ai/sdk";

export async function generateMarketingContent(productDescription, showCharacter = true) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;

  const anthropic = new Anthropic({ apiKey });

  const characterModeInstructions = showCharacter
    ? "MODE: WITH CHARACTER — COMPULSORY SINGLE CHARACTER\nCreate EXACTLY 1 primary on-screen human persona (e.g. ALEX, CUSTOMER, or BRAND AMBASSADOR) who appears in the video and speaks ALL dialogue throughout the script. NEVER create multiple characters. Give this single persona a short cue name, a believable camera-ready appearance and personality, and write ALL character dialogue lines under this single character cue."
    : "MODE: NO CHARACTER (Professional / Product-Only)\nDo NOT create any human personas. This is a clean, professional product-focused video: on-screen text, product shots, and ONE neutral off-screen NARRATOR voiceover only — no named human character appears. The \"characters\" array in your JSON output MUST be empty. Every line of the script is either [ON-SCREEN TEXT: ...], [PRODUCT SHOT: ...], or NARRATOR (V.O.) dialogue.";

  const systemPrompt = `You are a professional commercial scriptwriter and director. Generate a complete, attractive advertisement suitable for an approximately 45-second video, using the user's input as the primary creative direction.

${characterModeInstructions}

PRIORITY RULE — HIGHEST PRIORITY TO USER DETAILS:
1. The user's explicitly provided details always have the HIGHEST PRIORITY.
2. If the user provides specific information about characters, personalities, setting, product details, ingredients, features, benefits, target audience, dialogue, or storyline, preserve and follow those details accurately. Do not contradict, replace, or remove important information provided by the user.
3. If the user does NOT provide specific information, creatively fill missing details with appropriate, attractive, and contextually relevant ideas.

USER DIALOGUE VERBATIM RULE — NON-NEGOTIABLE:
- If the user's brief contains exact quoted lines or specific scripts for the character, those lines are FINAL.
- Use them VERBATIM in the screenplay — do NOT paraphrase, reword, reorder, or improve them.
- Only write NEW creative dialogue for scenes or moments the user did NOT explicitly specify.
- Never replace or rewrite a user-provided quote, even if you think it could be improved.

GENERIC INPUT HANDLING:
If the user's input is very short or generic (e.g. "A spicy and cheesy crunchy snack"), do not produce a short or incomplete script. Intelligently expand the concept into a complete, creative, and visually attractive 45-second video script:
- Create an engaging advertisement around that concept by developing an appropriate setting, character, actions, expressions, product interaction, atmosphere, dialogue, and advertising flow.
- You may create creative presentation context (e.g. character enjoying the snack, game-night setting, dramatic product shots, playful dialogue).
- BUT NEVER invent unsupported factual claims (e.g. specific unstated ingredients, health benefits, nutritional values, certifications, percentages, prices, discounts, or medical claims unless explicitly provided).

MARKETING COMMERCIAL STRUCTURE (45 SECONDS TOTAL):
Attention-Grabbing Hook (0-10s) → Product Introduction (10-22s) → User-Provided Features & Experience (22-35s) → Strong CTA & Ending (35-45s).
MANDATORY SPOKEN DIALOGUE BUDGET — NON-NEGOTIABLE:
- You MUST write EXACTLY 85 TO 95 SPOKEN WORDS total across all dialogue/narration lines (~38 to 40 seconds of pure spoken audio + 5 to 7 seconds of visual action beats & pauses = EXACTLY 45 SECONDS TOTAL RUNTIME).
- Write 5 to 6 complete, rich, meaningful spoken dialogue sentences across 4 scenes.
- NEVER WRITE SHORT DIALOGUE UNDER 85 SPOKEN WORDS (do NOT produce 40, 50, or 60 word scripts).

CRITICAL ANTI-META RULE:
The instructions in this prompt are generation rules ONLY. Never turn words such as "user", "AI enhancement", "requirements", "grounding", "instructions", or "generation" into advertisement content, dialogue, or narration. The ad must be ABOUT THE PRODUCT DESCRIBED BY THE USER, NOT ABOUT THE PROCESS OF MAKING AN AD.

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
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-6"
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

// Exported under an explicit test name so the parser can be verified
// directly, without an Anthropic call. The generator above uses it as-is.
export function parseMarketingScreenplayForTest(screenplay, rawCharacters) {
  return parseMarketingScreenplay(screenplay, rawCharacters);
}

function parseMarketingScreenplay(screenplay, rawCharacters) {
  const charName = (rawCharacters[0]?.name || "SPEAKER").trim().toUpperCase();
  const lines = screenplay.split("\n").map(l => l.trim()).filter(Boolean);
  const dialogueList = [];
  const scenes = [];
  let currentScene = null;
  let currentSpeaker = null;

  // Accumulate visual description onto the scene it belongs to. Without
  // this, every marketing scene reached the video stage with action: "" —
  // so the only thing describing the shot was the location heading, and the
  // video model had nothing to actually render. That is what made marketing
  // videos look empty next to story videos, whose parser has always
  // collected action lines.
  const addAction = (text) => {
    if (!currentScene || !text) return;
    currentScene.action += (currentScene.action ? " " : "") + text;
  };

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
        onScreenText: [],
        emotion: "confident"
      };
      currentSpeaker = null;
      continue;
    }

    if (line.match(/^(FADE IN:|FADE OUT\.|CUT TO:|DISSOLVE TO:)/i)) {
      currentSpeaker = null;
      continue;
    }

    // Bracketed production cues.
    if (line.startsWith("[")) {
      const onScreen = line.match(/^\[ON-SCREEN TEXT:\s*(.+?)\]\s*$/i);
      if (onScreen && currentScene) {
        // Kept for the script page, but deliberately NOT pushed into the
        // action text: the video prompt forbids readable words on screen
        // (Fal's classifier treats rendered text as printed media), and the
        // burned-in subtitles already carry the message.
        currentScene.onScreenText.push(onScreen[1].replace(/^["'“”]+|["'“”]+$/g, "").trim());
        currentSpeaker = null;
        continue;
      }
      const cue = line.match(/^\[(?:PRODUCT SHOT|VISUAL|SHOT|B-ROLL|ACTION):\s*(.+?)\]\s*$/i);
      if (cue) {
        addAction(cue[1].trim());
        currentSpeaker = null;
        continue;
      }
      // Any other bracketed direction is still visual information.
      addAction(line.replace(/^\[|\]$/g, "").trim());
      currentSpeaker = null;
      continue;
    }

    // Character cue, with any trailing parenthetical stripped first:
    // "NARRATOR (V.O.)", "ALEX (CONT'D)", "ALEX (O.S.)".
    //
    // The parenthetical MUST be removed before the all-caps test, not after.
    // The old test ran against the raw line, whose brackets are not in the
    // allowed character set — so a "NARRATOR (V.O.)" cue never matched and
    // every narrator line was silently dropped. In product-only commercials,
    // where the narrator speaks all of it, that meant no dialogue survived
    // at all: no voice track, and no subtitles.
    const cueName = line.replace(/\s*\([^)]*\)\s*$/, "").replace(/:$/, "").trim();
    if (
      cueName &&
      cueName.length <= 30 &&
      /^[A-Z0-9][A-Z0-9\s._'-]*$/.test(cueName) &&
      !cueName.includes("FADE") &&
      !cueName.includes("SCENE")
    ) {
      currentSpeaker = cueName;
      continue;
    }

    if (currentSpeaker && !line.startsWith("(")) {
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

    // Parentheticals are delivery notes, not visual description.
    if (line.startsWith("(")) {
      currentSpeaker = null;
      continue;
    }

    // Anything left is prose action/description — the shot itself.
    addAction(line);
    currentSpeaker = null;
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
      onScreenText: [],
      emotion: "confident"
    });
  }

  // A scene with no visual description at all gives the video model nothing
  // to render but a location name. Fall back to a neutral, product-focused
  // beat derived from the heading rather than sending an empty shot.
  scenes.forEach((scene) => {
    if (!scene.action || !scene.action.trim()) {
      const where = scene.location ? scene.location.toLowerCase() : "the setting";
      scene.action = `Clean, well-lit commercial photography in ${where}, with the product presented clearly in frame.`;
    }
  });

  return { scenes, claudeDialogue: dialogueList };
}