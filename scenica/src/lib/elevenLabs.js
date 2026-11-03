// ═══════════════════════════════════════════════════════════════════════════
// elevenLabs.js — shared ElevenLabs TTS config and client
//
// Single source of truth for voice IDs and emotion presets. Used by
// narration.js (the real 45s pipeline's dialogue track) and by the
// /api/voices route (kept for standalone use).
//
// pickVoiceId() is deterministic: the same character name always resolves to
// the same voice ID, in every job, forever. That is what keeps a character's
// voice consistent across the 3 independently-generated Seedance clips once
// the dialogue audio comes from here instead of from Seedance itself.
// ═══════════════════════════════════════════════════════════════════════════

export const VOICE_MAP = {
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

export const EMOTION_VOICE_SETTINGS = {
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

export function resolveVoiceSettingsForEmotion(emotion) {
  const key = Object.keys(EMOTION_VOICE_SETTINGS).find((k) => String(emotion || "").toLowerCase().includes(k)) || "neutral";
  return EMOTION_VOICE_SETTINGS[key];
}

export function getElevenLabsKey() {
  // Trimmed, and with surrounding quotes stripped: a .env.local written or
  // edited on Windows can leave a trailing carriage return, and a pasted key
  // is sometimes wrapped in quotes. Either is invisible in the file but
  // makes the API reject the key outright — surfacing as a confusing 401
  // ("key revoked") rather than the formatting issue it actually is.
  const key = String(process.env.ELEVENLABS_API_KEY || "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!key) {
    throw new Error("ELEVENLABS_API_KEY is not configured. Set it in your environment before generating a video.");
  }
  return key;
}

// Simple, stable string hash (djb2) — good enough to distribute names evenly
// across a small voice pool without pulling in a dependency.
function hashString(value) {
  let hash = 5381;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Deterministically pick a voice ID for a character. Same name + gender
 * always yields the same voice ID, so a character's voice never drifts
 * across the 3 segments of a job, or across separate jobs/renders of the
 * same script.
 */
export function pickVoiceId(characterName, gender) {
  const genderKey = String(gender || "").toLowerCase() === "female"
    ? "female"
    : String(gender || "").toLowerCase() === "male"
      ? "male"
      : "other";
  const pool = VOICE_MAP[genderKey];
  const index = hashString(characterName) % pool.length;
  return pool[index];
}

/**
 * Check the key works and there is enough quota, BEFORE any video credits
 * are spent.
 *
 * This is a free GET — it consumes no characters. It exists because the
 * voice track is built at the very END of the job, after three Seedance
 * renders have already been paid for; discovering a dead key at that point
 * would waste the entire video spend and silently ship a film with no
 * dialogue.
 *
 * Deliberately fails CLOSED only on a definite rejection (bad key, known
 * insufficient quota). A network blip or an unexpected response shape lets
 * the job continue rather than blocking a paid render on a flaky check.
 *
 * @param {number} charactersNeeded total characters about to be synthesized
 * @returns {Promise<{ok: boolean, reason?: string, remaining?: number}>}
 */
export async function verifyElevenLabsReady(charactersNeeded = 0) {
  const apiKey = getElevenLabsKey();

  let response;
  try {
    response = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      method: "GET",
      headers: { "xi-api-key": apiKey }
    });
  } catch (error) {
    return { ok: true, reason: `voice quota check skipped (network): ${error.message}` };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: "The ElevenLabs API key was rejected. Check ELEVENLABS_API_KEY." };
  }
  if (!response.ok) {
    return { ok: true, reason: `voice quota check skipped (HTTP ${response.status})` };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { ok: true, reason: "voice quota check skipped (unreadable response)" };
  }

  const used = Number(data?.character_count);
  const limit = Number(data?.character_limit);
  if (!Number.isFinite(used) || !Number.isFinite(limit)) {
    return { ok: true, reason: "voice quota check skipped (no quota fields)" };
  }

  const remaining = limit - used;
  if (remaining < charactersNeeded) {
    return {
      ok: false,
      remaining,
      reason: `Not enough ElevenLabs quota for this script: ${charactersNeeded} characters needed, ${remaining} remaining.`
    };
  }

  return { ok: true, remaining };
}

/**
 * Synthesize one line of speech. Returns a raw audio Buffer (mp3).
 * One retry on failure — a transient ElevenLabs error should not fail the
 * whole 45s render by itself.
 */
export async function synthesizeSpeech(text, voiceId, emotion) {
  const apiKey = getElevenLabsKey();
  const voiceSettings = resolveVoiceSettingsForEmotion(emotion);

  const call = async () => {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
        "Accept": "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: voiceSettings
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`ElevenLabs TTS failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    return Buffer.from(await response.arrayBuffer());
  };

  try {
    return await call();
  } catch (error) {
    console.warn(`[elevenLabs] synthesis failed, retrying once: ${error.message}`);
    return call();
  }
}
