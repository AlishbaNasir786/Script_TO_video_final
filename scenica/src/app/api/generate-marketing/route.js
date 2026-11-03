import { NextResponse } from "next/server";
import { generateMarketingContent } from "@/lib/marketingClient";
import { runDialogueLock } from "@/lib/dialogueLock";

function isMeaningfulInput(text) {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 30) return false;

  const alphaWords = words.filter(w => w.replace(/[^a-zA-Z0-9]/g, "").length > 1);
  if (alphaWords.length < 20) return false;

  if (/^(.)\1+$/i.test(trimmed.replace(/\s+/g, ""))) return false;

  return true;
}

// POST /api/generate-marketing
// Body: { productDescription: string, showCharacter: boolean }
export async function POST(request) {
  try {
    const { productDescription, showCharacter } = await request.json();

    if (!productDescription || !isMeaningfulInput(productDescription)) {
      return NextResponse.json(
        { error: "Please enter a meaningful product or brand description of at least 30 words." },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Anthropic API key not configured." },
        { status: 500 }
      );
    }

    // showCharacter defaults to true (the "show character" option) if not specified
    const wantsCharacter = showCharacter !== false;

    const result = await generateMarketingContent(productDescription, wantsCharacter);

    if (!result) {
      return NextResponse.json(
        { error: "Could not generate a script from this description. Try adding a bit more detail about the product and audience." },
        { status: 422 }
      );
    }

    // Attach the same word-count-weighted startSecond/endSecond/segment
    // timing the story path gets from runDialogueLock (api/generate/route.js).
    // Without this, marketing scenes reached /api/video with no timing at
    // all, so the video stage fell back to an even split by scene index and
    // narration.js fell back to an even split by scene count too — both
    // less accurate than the real per-scene speaking-time budget.
    const locked = runDialogueLock(result.scenes, result.claudeDialogue);

    return NextResponse.json({
      success: true,
      videoDescription: result.videoDescription,
      showCharacter: result.showCharacter,
      characters: result.characters,
      screenplay: result.screenplay,
      scenes: locked.scenes,
      claudeDialogue: result.claudeDialogue,
      estimatedSeconds: result.estimatedSeconds,
      purposeMode: "marketing",
      timingReport: locked.timingReport
    });

  } catch (error) {
    console.error("Marketing generation error:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong generating your ad script." },
      { status: 500 }
    );
  }
}