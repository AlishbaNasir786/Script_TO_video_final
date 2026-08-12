import { NextResponse } from "next/server";
import { generateMarketingContent } from "@/lib/marketingClient";

// POST /api/generate-marketing
// Body: { productDescription: string, showCharacter: boolean }
export async function POST(request) {
  try {
    const { productDescription, showCharacter } = await request.json();

    if (!productDescription || productDescription.trim().length < 5) {
      return NextResponse.json(
        { error: "Please describe your product or brand in a bit more detail." },
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

    return NextResponse.json({
      success: true,
      videoDescription: result.videoDescription,
      showCharacter: result.showCharacter,
      characters: result.characters,
      screenplay: result.screenplay,
      estimatedSeconds: result.estimatedSeconds,
      purposeMode: "marketing"
    });

  } catch (error) {
    console.error("Marketing generation error:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong generating your ad script." },
      { status: 500 }
    );
  }
}