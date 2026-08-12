import Anthropic from "@anthropic-ai/sdk";

export async function generateMarketingContent(productDescription, showCharacter = true) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;

  const anthropic = new Anthropic({ apiKey });

  const characterModeInstructions = showCharacter
    ? "MODE: WITH CHARACTER\nCreate 1-2 on-screen human personas (e.g. a customer, a brand ambassador) who appear in the video and speak the dialogue. Give each a short cue name (NARRATOR, ALEX, CUSTOMER, etc.), a believable appearance and personality, and write their spoken lines directly into the script as character cues + dialogue."
    : "MODE: NO CHARACTER (Professional / Product-Only)\nDo NOT create any human personas. This is a clean, professional product-focused video: on-screen text, product shots, and ONE neutral off-screen NARRATOR voiceover only — no named human character appears. The \"characters\" array in your JSON output MUST be empty. Every line of the script is either [ON-SCREEN TEXT: ...], [PRODUCT SHOT: ...], or NARRATOR (V.O.) dialogue.";

  const systemPrompt = `You are an award-winning commercial director and copywriter. You turn a short product/brand description into a punchy, professional video ad concept and script.

${characterModeInstructions}

HARD CONSTRAINTS — NON-NEGOTIABLE:
1. MAXIMUM RUNTIME: 30 seconds total. At natural spoken pace (~2.5 words/second), that's roughly 65-75 words of spoken dialogue/narration MAXIMUM across the entire script. Do not exceed this — a script that runs long is a failed script.
2. LANGUAGE: Simple, everyday words. No jargon, no corporate buzzwords, no complex sentence structures. A 12-year-old should understand every line instantly.
3. STRUCTURE (compress all of this into 30 seconds):
   - Hook (2-4s): grab attention immediately — a question, a bold claim, or a relatable moment
   - Problem/Desire (5-8s): name what the viewer wants or struggles with
   - Solution (10-12s): show the product doing its thing
   - Payoff/Proof (4-6s): quick evidence it works, or an emotional payoff
   - Call to Action (3-5s): ONE clear, simple instruction of what to do next
4. TONE: Confident and warm, never salesy or shouty. Short punchy sentences. Contractions are fine and encouraged (it's, you'll, don't).
5. The "videoDescription" field is ALWAYS required regardless of character mode — write 1-2 attractive sentences describing the ad concept and vibe, the kind of line you'd pitch to a client to get them excited.

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

      const characters = showCharacter && Array.isArray(parsed.characters)
        ? parsed.characters.map(c => ({
          name: String(c.name || "").trim().toUpperCase(),
          role: c.role || "Brand Ambassador",
          gender: c.gender || "Unspecified",
          age: c.age || "Unspecified",
          appearance: c.appearance || "Professional, camera-ready presence.",
          clothing: c.clothing || "Brand-appropriate attire.",
          personality: c.personality || "Warm, relatable, and confident on camera.",
          emotion: c.emotion || "confident"
        })).filter(c => c.name.length > 0)
        : [];

      return {
        videoDescription: String(parsed.videoDescription || "").trim() || "A punchy, professional 30-second ad built around your product.",
        showCharacter,
        characters,
        screenplay: parsed.screenplay.trim(),
        estimatedSeconds: typeof parsed.estimatedSeconds === "number" ? parsed.estimatedSeconds : 30
      };
    } catch (e) {
      console.warn(`[Marketing Content Generation - ${model}]:`, e.message);
    }
  }

  return null;
}