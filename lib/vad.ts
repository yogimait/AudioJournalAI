/**
 * Voice Activity Detection with buffered STT pipeline.
 * Audio Stream → VAD → Segment Buffer → STT
 *
 * Accumulates audio segments, flushes complete speech to STT on speech-end.
 */

import { initVADModel } from "./runanywhere";
import { transcribe } from "./stt";

type OnTranscriptionCallback = (text: string) => void;
type OnStateChangeCallback = (state: "idle" | "listening" | "processing") => void;

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let processorNode: ScriptProcessorNode | null = null;
let audioBuffer: Float32Array[] = [];
let onTranscription: OnTranscriptionCallback | null = null;
let onStateChange: OnStateChangeCallback | null = null;
let isActive = false;
let isPaused = false;
let isStarting = false;
let isFlushing = false;
let flushRequested = false;
let bufferedSampleCount = 0;
let isSpeechActive = false;
let preRollBuffer = new Float32Array(0);
let speechLikeSampleCount = 0;

const TARGET_SAMPLE_RATE = 16000;
const MIN_TRANSCRIBE_SECONDS = 0.6;
const MAX_CHUNK_SECONDS = 6.0;
const PRE_ROLL_SECONDS = 0.25;
const ENERGY_GATE_RMS = 0.008;
const MIN_SPEECHLIKE_SECONDS = 0.25;

const MIN_TRANSCRIBE_SAMPLES = Math.floor(TARGET_SAMPLE_RATE * MIN_TRANSCRIBE_SECONDS);
const MAX_CHUNK_SAMPLES = Math.floor(TARGET_SAMPLE_RATE * MAX_CHUNK_SECONDS);
const PRE_ROLL_SAMPLES = Math.floor(TARGET_SAMPLE_RATE * PRE_ROLL_SECONDS);
const MIN_SPEECHLIKE_SAMPLES = Math.floor(TARGET_SAMPLE_RATE * MIN_SPEECHLIKE_SECONDS);

function resetBufferedAudio(): void {
  audioBuffer = [];
  bufferedSampleCount = 0;
  speechLikeSampleCount = 0;
}

function resetPreRoll(): void {
  preRollBuffer = new Float32Array(0);
}

function pushBufferedAudio(samples: Float32Array): void {
  audioBuffer.push(samples);
  bufferedSampleCount += samples.length;
}

function updatePreRoll(samples: Float32Array): void {
  if (PRE_ROLL_SAMPLES <= 0 || samples.length === 0) return;

  if (samples.length >= PRE_ROLL_SAMPLES) {
    preRollBuffer = samples.slice(samples.length - PRE_ROLL_SAMPLES);
    return;
  }

  const merged = new Float32Array(preRollBuffer.length + samples.length);
  merged.set(preRollBuffer, 0);
  merged.set(samples, preRollBuffer.length);

  if (merged.length <= PRE_ROLL_SAMPLES) {
    preRollBuffer = merged;
    return;
  }

  preRollBuffer = merged.slice(merged.length - PRE_ROLL_SAMPLES);
}

function drainBufferedAudio(minSamples: number): Float32Array | null {
  if (bufferedSampleCount < minSamples || audioBuffer.length === 0) {
    return null;
  }

  const combined = new Float32Array(bufferedSampleCount);
  let offset = 0;
  for (const chunk of audioBuffer) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  resetBufferedAudio();
  return combined;
}

function resampleTo16k(samples: Float32Array, sourceSampleRate: number): Float32Array {
  if (!Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0 || sourceSampleRate === TARGET_SAMPLE_RATE) {
    return samples;
  }

  const ratio = TARGET_SAMPLE_RATE / sourceSampleRate;
  const outputLength = Math.max(1, Math.round(samples.length * ratio));
  const resampled = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const sourceIndex = i / ratio;
    const lower = Math.floor(sourceIndex);
    const upper = Math.min(lower + 1, samples.length - 1);
    const weight = sourceIndex - lower;
    resampled[i] = samples[lower] * (1 - weight) + samples[upper] * weight;
  }

  return resampled;
}

function getRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    sumSquares += s * s;
  }

  return Math.sqrt(sumSquares / samples.length);
}

function splitIntoChunks(samples: Float32Array, maxChunkSamples: number): Float32Array[] {
  if (samples.length <= maxChunkSamples) {
    return [samples];
  }

  const chunks: Float32Array[] = [];
  for (let start = 0; start < samples.length; start += maxChunkSamples) {
    const end = Math.min(start + maxChunkSamples, samples.length);
    const chunk = samples.slice(start, end);

    if (chunk.length < MIN_TRANSCRIBE_SAMPLES) {
      if (chunks.length === 0) {
        chunks.push(chunk);
      }
      break;
    }

    chunks.push(chunk);
  }

  return chunks;
}

async function flushBufferedTranscription(minSamples: number): Promise<void> {
  if (isFlushing) {
    flushRequested = true;
    return;
  }

  const speechLikeSamples = speechLikeSampleCount;
  if (speechLikeSamples < MIN_SPEECHLIKE_SAMPLES) {
    console.debug("[VAD] Flush skipped: segment has no speech-like energy.");
    resetBufferedAudio();
    return;
  }

  const combined = drainBufferedAudio(minSamples);
  if (!combined) {
    console.debug("[VAD] Flush skipped: insufficient buffered samples.");
    return;
  }

  isFlushing = true;
  try {
    const chunks = splitIntoChunks(combined, MAX_CHUNK_SAMPLES);
    const transcripts: string[] = [];

    for (const chunk of chunks) {
      const text = await transcribe(chunk);
      if (text) {
        transcripts.push(text);
      }
    }

    const mergedText = transcripts.join(" ").replace(/\s+/g, " ").trim();
    if (mergedText) {
      onTranscription?.(mergedText);
    }
  } catch (err) {
    console.error("[VAD] Buffered transcription failed:", err);
  } finally {
    isFlushing = false;
    if (flushRequested) {
      flushRequested = false;
      void flushBufferedTranscription(minSamples);
    }
  }
}

/**
 * Start the VAD→STT pipeline.
 * Captures microphone audio, detects speech, buffers segments, then transcribes.
 */
export async function startListening(
  callbacks: {
    onTranscription: OnTranscriptionCallback;
    onStateChange?: OnStateChangeCallback;
  }
): Promise<void> {
  if (isActive || isStarting) return;

  isStarting = true;
  isPaused = false;
  flushRequested = false;
  isFlushing = false;
  isSpeechActive = false;
  resetBufferedAudio();
  resetPreRoll();

  onTranscription = callbacks.onTranscription;
  onStateChange = callbacks.onStateChange || null;

  try {
    await initVADModel();

    // Set up VAD speech activity callback
    const { VAD } = await import("@runanywhere/web-onnx");
    const { SpeechActivity } = await import("@runanywhere/web");

    VAD.onSpeechActivity(async (activity) => {
      if (activity === SpeechActivity.Started) {
        resetBufferedAudio();
        if (preRollBuffer.length > 0) {
          pushBufferedAudio(preRollBuffer);
        }
        isSpeechActive = true;
        console.debug("[VAD] Speech started");
        onStateChange?.("listening");
      }

      if (activity === SpeechActivity.Ended) {
        if (!isSpeechActive && speechLikeSampleCount < MIN_SPEECHLIKE_SAMPLES) {
          console.debug("[VAD] Speech ended without enough buffered audio.");
          return;
        }

        isSpeechActive = false;
        console.debug("[VAD] Speech ended, flushing buffered audio");
        onStateChange?.("processing");

        // Single transcription flow per speech segment.
        await flushBufferedTranscription(MIN_TRANSCRIBE_SAMPLES);

        resetBufferedAudio();
        onStateChange?.("listening");
      }
    });

    // Capture microphone audio
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(mediaStream);

    // Process audio chunks
    processorNode = audioContext.createScriptProcessor(2048, 1, 1);
    processorNode.onaudioprocess = (event) => {
      if (isPaused) return;

      const inputData = event.inputBuffer.getChannelData(0);
      const sourceRate = event.inputBuffer.sampleRate || audioContext?.sampleRate || TARGET_SAMPLE_RATE;
      const rawSamples = new Float32Array(inputData);
      const samples = resampleTo16k(rawSamples, sourceRate);
      if (samples.length === 0) return;
      const rms = getRms(samples);
      const hasSpeechLikeEnergy = rms >= ENERGY_GATE_RMS;

      // Feed to VAD for speech detection
      VAD.processSamples(samples);

      if (isSpeechActive || hasSpeechLikeEnergy) {
        pushBufferedAudio(samples);
      }

      if (hasSpeechLikeEnergy) {
        speechLikeSampleCount += samples.length;
      }

      updatePreRoll(samples);
    };

    source.connect(processorNode);
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    processorNode.connect(silentGain);
    silentGain.connect(audioContext.destination);

    isActive = true;
    onStateChange?.("listening");
  } catch (err) {
    // Release partially initialized resources if startup fails.
    processorNode?.disconnect();
    processorNode = null;

    if (audioContext) {
      await audioContext.close();
      audioContext = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    resetBufferedAudio();
    resetPreRoll();
    isActive = false;
    isPaused = false;
    isSpeechActive = false;
    console.error("[VAD] Failed to start listening:", err);
    onStateChange?.("idle");
    throw err;
  } finally {
    isStarting = false;
  }
}

/**
 * Stop the VAD→STT pipeline and release resources.
 */
export async function stopListening(): Promise<void> {
  if (!isActive) return;

  // Process any remaining buffered audio
  if (bufferedSampleCount > 0 && speechLikeSampleCount >= MIN_SPEECHLIKE_SAMPLES) {
    onStateChange?.("processing");
    await flushBufferedTranscription(MIN_TRANSCRIBE_SAMPLES);
  }

  // Cleanup
  processorNode?.disconnect();
  processorNode = null;

  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  resetBufferedAudio();
  resetPreRoll();
  isActive = false;
  isPaused = false;
  isSpeechActive = false;
  flushRequested = false;
  isFlushing = false;
  onStateChange?.("idle");
}

/**
 * Check if the VAD pipeline is currently active.
 */
export function isListeningActive(): boolean {
  return isActive;
}

export function isListeningPaused(): boolean {
  return isPaused;
}

export function pauseListening(): void {
  isPaused = true;
  onStateChange?.("idle");
}

export function resumeListening(): void {
  isPaused = false;
  onStateChange?.("listening");
}
