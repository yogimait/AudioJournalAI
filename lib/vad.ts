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

const TARGET_SAMPLE_RATE = 16000;
const LIVE_CHUNK_SECONDS = 3.2;
const MIN_TRANSCRIBE_SECONDS = 0.2;

const LIVE_CHUNK_SAMPLES = Math.floor(TARGET_SAMPLE_RATE * LIVE_CHUNK_SECONDS);
const MIN_TRANSCRIBE_SAMPLES = Math.floor(TARGET_SAMPLE_RATE * MIN_TRANSCRIBE_SECONDS);

function resetBufferedAudio(): void {
  audioBuffer = [];
  bufferedSampleCount = 0;
}

function pushBufferedAudio(samples: Float32Array): void {
  audioBuffer.push(samples);
  bufferedSampleCount += samples.length;
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

async function flushBufferedTranscription(minSamples: number): Promise<void> {
  if (isFlushing) {
    flushRequested = true;
    return;
  }

  const combined = drainBufferedAudio(minSamples);
  if (!combined) return;

  isFlushing = true;
  try {
    const text = await transcribe(combined);
    if (text) {
      onTranscription?.(text);
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
  resetBufferedAudio();

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
        onStateChange?.("listening");
      }

      if (activity === SpeechActivity.Ended) {
        onStateChange?.("processing");

        // Prefer buffered audio; it tends to preserve speech boundaries better.
        await flushBufferedTranscription(MIN_TRANSCRIBE_SAMPLES);

        // Fallback to segment from VAD in case buffer was too small.
        const segment = VAD.popSpeechSegment();
        if (segment && segment.samples && segment.samples.length >= MIN_TRANSCRIBE_SAMPLES) {
          const text = await transcribe(segment.samples);
          if (text) {
            onTranscription?.(text);
          }
        }

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
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    processorNode.onaudioprocess = (event) => {
      if (isPaused) return;

      const inputData = event.inputBuffer.getChannelData(0);
      const sourceRate = event.inputBuffer.sampleRate || audioContext?.sampleRate || TARGET_SAMPLE_RATE;
      const rawSamples = new Float32Array(inputData);
      const samples = resampleTo16k(rawSamples, sourceRate);
      if (samples.length === 0) return;

      // Feed to VAD for speech detection
      VAD.processSamples(samples);

      // Buffer audio for periodic and final transcription.
      pushBufferedAudio(samples);

      // Long continuous speech should still emit incremental transcripts.
      if (bufferedSampleCount >= LIVE_CHUNK_SAMPLES) {
        void flushBufferedTranscription(MIN_TRANSCRIBE_SAMPLES);
      }
    };

    source.connect(processorNode);
    processorNode.connect(audioContext.destination);

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
    isActive = false;
    isPaused = false;
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
  if (bufferedSampleCount > 0) {
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
  isActive = false;
  isPaused = false;
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
