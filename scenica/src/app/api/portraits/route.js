import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════════
// /api/portraits — character reference image generation via fal.ai
//
// Replaces the old pollinations.ai version. Uses Nano Banana Pro, the model
// chosen for this project because it holds character identity across
// regenerations — which matters because these images become the @Image
// references for video generation later.
//
// Design rules baked into the prompt (learned from earlier fal testing):
//   • Reference-sheet style: neutral expression, plain background, flat
//     even lighting. Emotion and setting belong to the SHOT, not the
//     character — a "nervous" reference makes the character nervous in
//     every video clip forever.
//   • User-provided details win: the extraction pass already copies the
//     user's own description into appearance/clothing when the story
//     provides one, so building the prompt from those fields automatically
//     honours the user's description. Fields left "Unspecified" are
//     omitted and the model fills them in.
//   • The fal-hosted output URL is returned directly. NEVER download and
//     re-upload these images elsewhere — re-uploaded files trip fal's
//     likeness filter; fal-hosted URLs pass.
//
// Requires FAL_KEY in .env.local
// ═══════════════════════════════════════════════════════════════════════════

// Flip to "fal-ai/nano-banana" (cheaper) while developing if you want to
// save credits; switch back to pro for anything you'll keep.
const FAL_MODEL = "fal-ai/nano-banana";

function clean(value) {
  const v = String(value || "").trim();
  if (!v || /^unspecified$/i.test(v) || /^unknown$/i.test(v)) return "";
  return v;
}

function buildPortraitPrompt(character) {
  const genderTerm =
    character.gender?.toLowerCase() === "female" ? "woman" :
    character.gender?.toLowerCase() === "male" ? "man" : "person";

  const age = clean(character.age) ? `${clean(character.age)}-year-old ` : "";
  const appearance = clean(character.appearance);
  const clothing = clean(character.clothing);
  const personality = clean(character.personality);

  const parts = [
    `Full body character reference, front view, of a ${age}${genderTerm}.`,
    appearance ? `Appearance: ${appearance}.` : "",
    clothing
      ? `Wearing: ${clothing}.`
      : "Wearing simple, timeless everyday clothing appropriate to the character.",
    personality ? `Their bearing subtly suggests: ${personality}.` : "",
    // Reference-sheet constraints — do not change these:
    "Neutral relaxed expression, arms at sides, looking directly at camera.",
    "Plain light grey studio background. Flat, even, shadowless lighting.",
        "High-quality 3D animated film style, warm and expressive, clean professional character design.",
  ].filter(Boolean);

  return parts.join(" ");
}

export async function POST(request) {
  try {
    const { character } = await request.json();

    if (!character || !character.name) {
      return NextResponse.json({ error: "No character data provided" }, { status: 400 });
    }
    if (!process.env.FAL_KEY) {
      return NextResponse.json(
        { error: "FAL_KEY is missing from .env.local" },
        { status: 500 }
      );
    }

    const prompt = buildPortraitPrompt(character);

    const falRes = await fetch(`https://fal.run/${FAL_MODEL}`, {
      method: "POST",
      headers: {
        "Authorization": `Key ${process.env.FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        num_images: 1,
        aspect_ratio: "3:4",     // portrait framing, full body fits
        output_format: "png",
      }),
    });

    if (!falRes.ok) {
      const detail = await falRes.text().catch(() => "");
      console.error("fal error", falRes.status, detail.slice(0, 300));
      return NextResponse.json(
        { error: `Image generation failed (${falRes.status})` },
        { status: 502 }
      );
    }

    const data = await falRes.json();
    const imageUrl =
      data?.images?.[0]?.url ||
      data?.image?.url ||
      null;

    if (!imageUrl) {
      console.error("fal response had no image url:", JSON.stringify(data).slice(0, 300));
      return NextResponse.json({ error: "No image returned" }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      imageUrl,                    // fal-hosted — pass this URL onward, never re-upload
      promptUsed: prompt,          // stored so the video stage can reuse the exact wording
      characterName: character.name,
    });
  } catch (error) {
    console.error("Portrait error:", error);
    return NextResponse.json(
      { error: error.message || "Portrait generation failed" },
      { status: 500 }
    );
  }
}