// ═══════════════════════════════════════════════════════════════════════════
// elevenLabs.js — shared ElevenLabs config and client
//
// The video pipeline uses ElevenLabs only for SUBTITLE TIMING:
// forcedAlign() / transcribeWords() measure when each line is actually
// spoken in the generated clip's own audio (see subtitleAlignment.js).
// No speech is synthesized for the film.
//
// Voice IDs and emotion presets below are used by the /api/voices route
// and the (currently unused) narration track builder in narration.js.
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

/** True when an ElevenLabs key is configured. Never throws. */
export function hasElevenLabsKey() {
  try {
    getElevenLabsKey();
    return true;
  } catch {
    return false;
  }
}

async function postMultipart(url, form, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": getElevenLabsKey() },
      body: form,
      signal: controller.signal
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`ElevenLabs ${new URL(url).pathname} failed (${response.status}): ${body.slice(0, 300)}`);
    }
    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Forced alignment: given an audio file and the exact text spoken in it,
 * return per-character and per-word timings.
 *
 * Response shape: { characters: [{text,start,end}], words: [{text,start,end,loss}], loss }
 * `characters` indexes 1:1 into the submitted text. `loss` is lower-is-better;
 * correctly matched speech measures ~0.5-0.6, mismatched text ~3.5+.
 *
 * The key needs the "Forced Alignment" permission. Billed like speech-to-text
 * (per audio duration), so a 15s clip costs very little.
 */
export async function forcedAlign(audioBuffer, text, fileName = "clip.wav") {
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: "audio/wav" }), fileName);
  form.append("text", text);
  return postMultipart("https://api.elevenlabs.io/v1/forced-alignment", form, 90000);
}

/**
 * Speech-to-text with word timestamps. Used only as a fallback when forced
 * alignment says the expected text does not match what was actually said
 * (e.g. the video model skipped or reworded a line).
 *
 * Returns the `words` array: [{ text, start, end, type: "word"|"spacing"|"audio_event", logprob }].
 * The key needs the "Speech to Text" permission.
 */
export async function transcribeWords(audioBuffer, fileName = "clip.wav") {
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: "audio/wav" }), fileName);
  form.append("model_id", "scribe_v2");
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "false");
  const data = await postMultipart("https://api.elevenlabs.io/v1/speech-to-text", form, 90000);
  return Array.isArray(data?.words) ? data.words : [];
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
