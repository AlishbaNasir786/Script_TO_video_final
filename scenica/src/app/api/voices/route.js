import { NextResponse } from "next/server";

// Voice IDs from ElevenLabs free tier
const VOICE_MAP = {
  female: [
    "EXAVITQu4vr4xnSDxMaL", // Sarah - warm female
    "FGY2WhTYpPnrIDTdsKH5", // Laura - soft female
    "XB0fDUnXU5powFXDhCwa", // Charlotte - elegant female
  ],
  male: [
    "TX3LPaxmHKxFdv7VOQHJ", // Liam - young male
    "bIHbv24MWmeRgasZH58o", // Will - deep male
    "nPczCjzI2devNBz1zQrb", // Noah - warm male
  ],
  other: [
    "TX3LPaxmHKxFdv7VOQHJ",
    "EXAVITQu4vr4xnSDxMaL",
  ]
};

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
    const emotionSettings = {
      angry: { stability: 0.3, similarity_boost: 0.8, style: 0.8, use_speaker_boost: true },
      sad: { stability: 0.7, similarity_boost: 0.7, style: 0.4, use_speaker_boost: false },
      joyful: { stability: 0.4, similarity_boost: 0.75, style: 0.7, use_speaker_boost: true },
      tense: { stability: 0.35, similarity_boost: 0.8, style: 0.75, use_speaker_boost: true },
      romantic: { stability: 0.65, similarity_boost: 0.8, style: 0.5, use_speaker_boost: false },
      mysterious: { stability: 0.6, similarity_boost: 0.75, style: 0.6, use_speaker_boost: false },
      vulnerable: { stability: 0.7, similarity_boost: 0.75, style: 0.45, use_speaker_boost: false },
      tender: { stability: 0.7, similarity_boost: 0.8, style: 0.4, use_speaker_boost: false },
      love: { stability: 0.65, similarity_boost: 0.8, style: 0.5, use_speaker_boost: false },
      fierce: { stability: 0.3, similarity_boost: 0.85, style: 0.8, use_speaker_boost: true },
      determined: { stability: 0.45, similarity_boost: 0.8, style: 0.65, use_speaker_boost: true },
      neutral: { stability: 0.5, similarity_boost: 0.75, style: 0.5, use_speaker_boost: false },
    };

    const emotionKey = Object.keys(emotionSettings).find(k =>
      emotion?.toLowerCase().includes(k)
    ) || "neutral";
    const voiceSettings = emotionSettings[emotionKey];

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