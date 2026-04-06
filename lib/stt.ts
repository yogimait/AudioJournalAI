/**
 * Speech-to-Text wrapper.
 * Uses RunAnywhere ONNX backend with Whisper Base int8.
 * Must be initialized via runanywhere.ts first.
 */

import { initSTTModel } from "./runanywhere";

const NOISE_TAG_PATTERN = /\[(?:music|noise|silence|blank|laughter|applause)\]|\((?:music|noise|silence|blank|buzzer|beep|laughter|applause)\)/gi;

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9']/g, "");
}

function cleanTranscript(rawText: string): string {
  let text = rawText
    .replace(NOISE_TAG_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  const tokens = text.split(/\s+/);
  const deduped: string[] = [];
  let previousNorm = "";
  let repeatCount = 0;

  for (const token of tokens) {
    const norm = normalizeToken(token);
    if (!norm) continue;

    if (norm === previousNorm) {
      repeatCount += 1;
      if (repeatCount >= 2) {
        continue;
      }
    } else {
      previousNorm = norm;
      repeatCount = 0;
    }

    deduped.push(token);
  }

  text = deduped.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const normTokens = text
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);

  if (normTokens.length >= 6) {
    const counts: Record<string, number> = {};
    let maxCount = 0;
    for (const token of normTokens) {
      counts[token] = (counts[token] || 0) + 1;
      if (counts[token] > maxCount) {
        maxCount = counts[token];
      }
    }

    const uniqueCount = Object.keys(counts).length;
    if (uniqueCount <= 3 && maxCount / normTokens.length >= 0.6) {
      return "";
    }
  }

  return text;
}

/**
 * Transcribe a Float32Array audio segment to text.
 * Audio should be 16kHz mono PCM.
 */
export async function transcribe(audioData: Float32Array): Promise<string> {
  await initSTTModel();

  try {
    const { STT } = await import("@runanywhere/web-onnx");
    const result = await STT.transcribe(audioData);
    const rawText = result.text?.trim() || "";
    return cleanTranscript(rawText);
  } catch (err) {
    console.error("[STT] Transcription failed:", err);
    return "";
  }
}
