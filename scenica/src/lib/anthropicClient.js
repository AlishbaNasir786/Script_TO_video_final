import Anthropic from "@anthropic-ai/sdk";

/**
 * Extracts BOTH character profiles AND full dialogue attribution from a story
 * in a single Claude call.
 *
 * Returns:
 * {
 *   characters: [{ name, role, gender, age, dialogueCount, description, appearance, clothing, personality, emotion }],
 *   dialogue:   [{ speaker: "ZARA", quote: "Exact quote text as it appears in the story" }, ...]
 * }
 */
export async function extractStoryDataWithClaude(scriptText, isMarketing = false) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return null;
  }

  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = `You are a professional screenplay analyst. You read a story (in ANY language, ANY style, ANY length) and extract two things with full contextual understanding: the cast of characters, and exactly who speaks every line of dialogue.

═══ CHARACTER EXTRACTION RULES ═══

1. PROPER NAMES / ENTITIES ONLY: Extract only actual character names or unique speaking entities.
   ✅ CORRECT: "AIRA", "FOX", "MERLIN", "NARRATOR", "KEEPER", "VOICE", "SPEAKER"
   ❌ WRONG: adjectives ("SMALL", "MYSTERIOUS", "GLOWING"), verbs ("FOUND", "POINTED"), sentence-openers ("SUDDENLY", "BECAUSE")

2. DESCRIPTIVE REFERENCES → ONE CONSISTENT ENTITY:
   - "a small glowing fox" → name: "FOX"
   - "an old wise wizard" → name: "WIZARD"
   - "an old woman's voice" / "a hidden speaker" → pick ONE label ("VOICE" or "SPEAKER") and use it consistently for every mention of this same audio entity throughout the story.

3. ALIAS UNIFICATION: If a character is called by name AND by title/role/pronoun elsewhere ("Aldric" / "the king" / "he"), treat these as ONE character, using their proper name as the canonical "name" field.

4. dialogueCount: exact integer count of this character's spoken lines.

═══ DIALOGUE ATTRIBUTION & ADAPTATION RULES ═══

1. IF THE STORY CONTAINS LITERAL QUOTED DIALOGUE ("..."):
   Extract 100% of spoken quotes verbatim without quote marks, attributed to the correct canonical character name.

2. IF THE STORY CONTAINS NO LITERAL QUOTATION MARKS ("..."):
   The story describes speech or interactions through narrative prose (e.g., "MIRA asks why the door is opening...", "The KEEPER replies that it only opens...").
   In this case, you MUST adapt the narrated speech into 3–7 direct screenplay dialogue lines spoken back and forth by the characters.
   For example:
   - "MIRA asks why the door is opening now after being sealed for centuries." → speaker: "MIRA", quote: "Why is this door opening now after being sealed for centuries?"
   - "The KEEPER replies that it only opens when the person who originally sealed it returns." → speaker: "KEEPER", quote: "Because it only opens when the person who originally sealed it returns."
   - "MIRA asks if she was the one who sealed it." → speaker: "MIRA", quote: "You mean I was the one who sealed it?"
   - "The KEEPER explains that she was, but she also erased her own memory..." → speaker: "KEEPER", quote: "You were, but you also erased your memory so you would never remember."

CRITICAL MANDATE: EVERY story — whether it contains explicit quotation marks or narrated/indirect speech — MUST return dialogue entries in your JSON output. Never return an empty "dialogue" array if characters communicate in any way.

Resolve attribution using full context:
- Audio entities ("a hidden speaker answers", "the voice replies", "the intercom states") → map to the audio speaker entity (e.g. VOICE / SPEAKER).
- Pronouns ("she whispered", "he replied") → resolve to the correct character using gender, narrative flow, and who was last active.
- Indirect references ("the keeper replied", "a soft voice answered") → resolve to the correct unified entity from your character list.

Return ONLY a valid raw JSON object. No markdown, no explanation, no backticks. Exact shape:

{
  "characters": [
    {
      "name": "CANONICAL NAME IN ALL CAPS",
      "role": "Protagonist" | "Supporting" | "Antagonist" | "Narrator" | "Love Interest",
      "gender": "Male" | "Female" | "Unspecified",
      "age": "explicit age/age-group OR Unspecified",
      "dialogueCount": integer,
      "description": "comprehensive physical + personality description",
      "appearance": "visual appearance details",
      "clothing": "clothing and attire",
      "personality": "key traits based on story evidence",
      "emotion": "dominant emotional state in ONE word"
    }
  ],
  "dialogue": [
    { "speaker": "CANONICAL NAME IN ALL CAPS", "quote": "exact quoted text" }
  ]
}`;

  const userPrompt = `${isMarketing ? "MARKETING SCRIPT" : "STORY / SCREENPLAY"}:
"""
${scriptText}
"""

Extract the characters and full dialogue attribution now, following every rule above exactly. Return ONLY the JSON object.`;

  const models = [
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-5-20251101"
  ];

  for (const model of models) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const textContent = typeof response.content?.[0]?.text === "string" ? response.content[0].text : "";
      if (!textContent) continue;
      const cleanJson = textContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(cleanJson);

      if (!parsed || !Array.isArray(parsed.characters) || parsed.characters.length === 0) {
        continue;
      }

      // ── Universal character name sanitizer ────────────────────────────────
      // Pronouns, articles, conjunctions, and sentence-openers must NEVER be
      // character names — even if Claude hallucinates them.
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

      const characters = parsed.characters
        .map(c => {
          const role = c.role || "Supporting";
          const appearance = c.appearance || c.description || (role === "Protagonist" ? "The central figure of the story, described through their actions." : "A supporting presence in the story.");
          const clothing = c.clothing || "Unspecified — not described in the original story.";
          const personality = c.personality || (role === "Protagonist" ? "Driven by the story's central conflict, revealed through choices." : "Defined by how they interact with other characters.");
          return {
            name: String(c.name || "").trim().toUpperCase(),
            role,
            gender: c.gender || "Unspecified",
            age: c.age || "Unspecified",
            dialogueCount: typeof c.dialogueCount === "number" ? c.dialogueCount : 0,
            description: c.description || `${appearance} (${personality})`,
            appearance,
            clothing,
            personality,
            emotion: c.emotion || "hopeful"
          };
        })
        .filter(c => c.name.length > 1 && !NON_CHAR_NAMES.has(c.name));

      if (characters.length === 0) continue;

      // validNames must be declared BEFORE the speaker-registration block below uses it
      const validNames = new Set(characters.map(c => c.name));

      // Register any speaking entity present in Claude's dialogue output into characters
      // (e.g. SYSTEM, VOICE, GUARDIAN, HOLOGRAM) so no dialogue quotes are ever discarded.
      (parsed.dialogue || []).forEach(d => {
        if (d && typeof d.speaker === "string" && d.speaker.trim().length > 0) {
          const raw = d.speaker.trim().toUpperCase().replace(/^THE\s+/, "");
          if (raw.length > 1 && !NON_CHAR_NAMES.has(raw) && !validNames.has(raw)) {
            const role = "Supporting";
            const appearance = "Speaking entity in the story, communicating through spoken dialogue.";
            const clothing = "Unspecified — not described in the original story.";
            const personality = "Interacts with the main characters during key story events.";
            characters.push({
              name: raw,
              role,
              gender: "Unspecified",
              age: "Unspecified",
              dialogueCount: 0,
              description: `${appearance} (${personality})`,
              appearance,
              clothing,
              personality,
              emotion: "mysterious"
            });
            validNames.add(raw);
          }
        }
      });

      const femaleChar = characters.find(c => c.gender === "Female")?.name || null;
      const maleChar = characters.find(c => c.gender === "Male")?.name || null;
      const resolveAlias = (rawSpeaker) => {
        if (validNames.has(rawSpeaker)) return rawSpeaker;
        const withoutThe = rawSpeaker.replace(/^THE\s+/, "");
        if (validNames.has(withoutThe)) return withoutThe;
        if (rawSpeaker === "SHE" || rawSpeaker === "HER") return femaleChar || characters[0]?.name;
        if (rawSpeaker === "HE" || rawSpeaker === "HIM") return maleChar || characters[0]?.name;
        if (rawSpeaker.length > 2) {
          for (const name of validNames) {
            if (name.includes(rawSpeaker) || rawSpeaker.includes(name)) return name;
          }
        }
        return null;
      };

      const dialogue = Array.isArray(parsed.dialogue)
        ? parsed.dialogue
            .filter(d => d && typeof d.speaker === "string" && typeof d.quote === "string" && d.quote.trim().length > 0)
            .map(d => {
              const rawSpeaker = String(d.speaker || "").trim().toUpperCase();
              const resolvedSpeaker = resolveAlias(rawSpeaker);
              return resolvedSpeaker
                ? { speaker: resolvedSpeaker, quote: String(d.quote || "").trim() }
                : null;
            })
            .filter(Boolean)
        : [];

      // Update dialogue counts for all characters
      characters.forEach(c => {
        const count = dialogue.filter(d => d.speaker === c.name).length;
        if (count > 0) c.dialogueCount = count;
      });

      return { characters, dialogue };
    } catch (e) {
      console.warn(`[Claude Story Extract - ${model}]:`, e.message);
    }
  }

  return null;
}

/**
 * General helper to call Anthropic Claude API with automatic model fallback cascade.
 */
export async function callClaude(userPrompt, systemPrompt = "", maxTokens = 4096) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;

  const anthropic = new Anthropic({ apiKey });
  const models = [
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-5-20251101"
  ];

  for (const model of models) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature: 0.7,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: "user", content: userPrompt }]
      });
      const text = response.content?.[0]?.text;
      if (typeof text === "string" && text.trim().length > 0) return text;
    } catch (e) {
      console.warn(`[Claude Call - ${model}]:`, e.message);
    }
  }

  return null;
}

/**
 * Character extraction array wrapper for backward compatibility.
 */
export async function extractCharactersWithClaude(scriptText, isMarketing = false) {
  const result = await extractStoryDataWithClaude(scriptText, isMarketing);
  return result ? result.characters : null;
}
