import { analyzeText, type AnalysisResult } from "@/lib/analysis";

interface AnalysisJob {
  entryId: string;
  text: string;
}

export interface AnalysisQueueResult {
  entryId: string;
  text: string;
  analysis: AnalysisResult;
}

type ResultListener = (result: AnalysisQueueResult) => void;
type ErrorListener = (entryId: string, text: string, error: unknown) => void;

const queue: AnalysisJob[] = [];
const latestTextByEntry = new Map<string, string>();
const resultListeners = new Set<ResultListener>();
const errorListeners = new Set<ErrorListener>();

let isProcessing = false;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function enqueueAnalysis(entryId: string, text: string): void {
  const normalized = normalizeText(text);
  if (!normalized) return;

  if (latestTextByEntry.get(entryId) === normalized) {
    return;
  }

  latestTextByEntry.set(entryId, normalized);
  queue.push({ entryId, text: normalized });
  void processQueue();
}

export function subscribeAnalysisQueue(
  onResult: ResultListener,
  onError?: ErrorListener
): () => void {
  resultListeners.add(onResult);
  if (onError) {
    errorListeners.add(onError);
  }

  return () => {
    resultListeners.delete(onResult);
    if (onError) {
      errorListeners.delete(onError);
    }
  };
}

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) continue;

      const latestText = latestTextByEntry.get(next.entryId);
      if (latestText !== next.text) {
        continue;
      }

      try {
        const analysis = await analyzeText(next.text);

        // Skip stale results if a newer transcript for this entry is queued.
        if (latestTextByEntry.get(next.entryId) !== next.text) {
          continue;
        }

        const result: AnalysisQueueResult = {
          entryId: next.entryId,
          text: next.text,
          analysis,
        };

        for (const listener of resultListeners) {
          listener(result);
        }
      } catch (error) {
        for (const listener of errorListeners) {
          listener(next.entryId, next.text, error);
        }
      }
    }
  } finally {
    isProcessing = false;
  }
}
