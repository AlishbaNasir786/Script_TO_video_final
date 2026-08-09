import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { character } = await request.json();

    if (!character) {
      return NextResponse.json({ error: "No character data provided" }, { status: 400 });
    }

    const genderTerm = character.gender?.toLowerCase() === "female" ? "woman" :
                       character.gender?.toLowerCase() === "male" ? "man" : "person";

    const prompt = `cinematic portrait photograph ${character.age} year old ${genderTerm} ${character.appearance} wearing ${character.clothing} ${character.emotion} expression dramatic cinematic lighting photorealistic highly detailed`;

    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=768&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1000)}`;

    return NextResponse.json({
      success: true,
      imageUrl: imageUrl,
      characterName: character.name
    });

  } catch (error) {
    console.error("Portrait error:", error);
    return NextResponse.json(
      { error: error.message || "Portrait generation failed" },
      { status: 500 }
    );
  }
}