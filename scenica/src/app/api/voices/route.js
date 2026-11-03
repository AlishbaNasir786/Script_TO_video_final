import { NextResponse } from "next/server";
import { VOICE_MAP, EMOTION_VOICE_SETTINGS } from "@/lib/elevenLabs";

export async function POST(request) {
  try {
    const { text, characterName, gender, emotion, voiceIndex } = await request.json();

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 });
    }

    // Select voice based on gender and index
    const genderKey = gender?.toLowerCase() === "female" ? "female" :
                      gender?.toLowerCase() === "male" ? "male" : "other";
    const voices = VOICE_MAP[genderKey];
    const voiceId = voices[voiceIndex % voices.length];

    // Map emotion to voice settings
    const emotionKey = Object.keys(EMOTION_VOICE_SETTINGS).find(k =>
      emotion?.toLowerCase().includes(k)
    ) || "neutral";
    const voiceSettings = EMOTION_VOICE_SETTINGS[emotionKey];

    // Call ElevenLabs API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
          "Accept": "audio/mpeg"
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_multilingual_v2",
          voice_settings: voiceSettings
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("ElevenLabs error:", error);
      return NextResponse.json(
        { error: "Voice generation failed: " + error },
        { status: response.status }
      );
    }

    // Return audio as base64
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");

    return NextResponse.json({
      success: true,
      audio: base64Audio,
      voiceId,
      characterName
    });

  } catch (error) {
    console.error("Voice generation error:", error);
    return NextResponse.json(
      { error: error.message || "Voice generation failed" },
      { status: 500 }
    );
  }
}