/**
 * Lazy NLP analysis engine.
 *
 * Models are loaded only when text analysis is requested.
 * This module is resilient: if local model loading fails, it falls back
 * to deterministic rule-based analysis so journaling keeps working offline.
 */

import { getEmotionScores } from "@/utils/emotionMapper";

export type Sentiment = "positive" | "neutral" | "negative";
export type Emotion =
  | "joy"
  | "gratitude"
  | "calm"
  | "stress"
  | "anxiety"
  | "sadness"
  | "anger"
  | "fear"
  | "surprise"
  | "neutral";

export interface AnalysisResult {
  sentiment: Sentiment;
  sentimentScore: number; // -1 to 1
  emotion: Emotion;
  emotionConfidence: number; // 0 to 1
  keywords: string[];
  topics: string[];
}

const SENTIMENT_MODEL_ID = "Xenova/bert-base-multilingual-uncased-sentiment";
const EMOTION_MODEL_ID = "Xenova/xlm-roberta-base";

const CANDIDATE_EMOTIONS: Emotion[] = [
  "joy",
  "gratitude",
  "calm",
  "stress",
  "anxiety",
  "sadness",
  "anger",
  "fear",
  "surprise",
  "neutral",
];

const TOPIC_MAP: Record<string, string[]> = {
  work: ["work", "job", "office", "meeting", "boss", "colleague", "project", "deadline", "career", "promotion"],
  health: ["health", "exercise", "gym", "doctor", "sick", "pain", "medication", "sleep", "diet", "wellness"],
  relationships: ["family", "friend", "partner", "relationship", "love", "argument", "together", "alone", "social"],
  studies: ["study", "exam", "school", "university", "class", "homework", "grade", "learn", "course", "assignment"],
  finance: ["money", "budget", "salary", "expense", "debt", "savings", "investment", "bill", "financial"],
  hobbies: ["music", "reading", "game", "travel", "cooking", "art", "movie", "sport", "hobby", "creative"],
  selfcare: ["meditation", "therapy", "journal", "reflect", "growth", "self-care", "boundaries", "rest"],
};

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "it", "this", "that", "and", "or",
  "but", "not", "so", "if", "my", "me", "i", "we", "you", "he", "she",
  "they", "them", "its", "our", "your", "just", "about", "very", "really",
  "much", "also", "than", "then", "when", "what", "how", "all", "some",
  "there", "here", "up", "out", "no", "yes", "like", "get", "got", "go",
  "went", "going", "thing", "things", "way", "day", "today", "feel",
  "felt", "feeling", "think", "thought", "know", "knew", "make", "made",
]);

// Lazy-loaded pipelines
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let classifier: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let emotionClassifier: any = null;

let sentimentLoadTried = false;
let emotionLoadTried = false;
let emotionEmbeddingsInitialized = false;
let emotionEmbeddingsInitPromise: Promise<void> | null = null;

const EMBEDDING_EMOTION_LABELS: Emotion[] = [
  "joy",
  "sadness",
  "anger",
  "fear",
  "anxiety",
  "calm",
  "stress",
];

const emotionEmbeddings: Partial<Record<Emotion, number[]>> = {};
const POSITIVE_EMOTIONS = new Set<Emotion>(["joy", "gratitude", "calm"]);
const NEGATIVE_EMOTIONS = new Set<Emotion>(["stress", "anxiety", "sadness", "anger", "fear"]);

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

/**
 * Optional prewarm API; does not run unless explicitly called.
 */
export async function initNLPModels(): Promise<void> {
  await Promise.all([getSentimentClassifier(), getEmotionClassifier()]);
}

async function configureTransformersEnv(): Promise<
  null | {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pipeline: any;
  }
> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    // Lazy import keeps heavy runtime out of app startup.
    const mod = await import("@xenova/transformers");
    mod.env.allowLocalModels = true;
    mod.env.allowRemoteModels = false;
    mod.env.localModelPath = "/models";
    return { pipeline: mod.pipeline };
  } catch (err) {
    console.debug("[RunAnywhere:NLP] transformers import failed; using fallback.", err);
    return null;
  }
}

async function getSentimentClassifier() {
  // Do NOT load on app start. Load only when needed.
  if (classifier || sentimentLoadTried) return classifier;
  sentimentLoadTried = true;

  const tf = await configureTransformersEnv();
  if (!tf) return null;

  try {
    classifier = await tf.pipeline("text-classification", SENTIMENT_MODEL_ID, {
      quantized: true,
      local_files_only: true,
    });
    console.info(`[RunAnywhere:NLP] Sentiment model loaded: ${SENTIMENT_MODEL_ID}`);
    return classifier;
  } catch (err) {
    console.debug("[RunAnywhere:NLP] sentiment model unavailable; using fallback.", err);
    classifier = null;
    return null;
  }
}

async function getEmotionClassifier() {
  if (emotionClassifier || emotionLoadTried) return emotionClassifier;
  emotionLoadTried = true;

  const tf = await configureTransformersEnv();
  if (!tf) return null;

  try {
    // Uses local folder Xenova/xlm-roberta-base with onnx/model_quantized.onnx
    emotionClassifier = await tf.pipeline("feature-extraction", EMOTION_MODEL_ID, {
      quantized: true,
      local_files_only: true,
    });
    console.info(`[RunAnywhere:NLP] Emotion model loaded: ${EMOTION_MODEL_ID}`);

    if (!emotionEmbeddingsInitialized && !emotionEmbeddingsInitPromise) {
      emotionEmbeddingsInitPromise = initEmotionEmbeddings();
    }

    return emotionClassifier;
  } catch (err) {
    console.debug("[RunAnywhere:NLP] emotion model unavailable; using fallback.", err);
    emotionClassifier = null;
    return null;
  }
}

async function getEmbedding(text: string): Promise<number[] | null> {
  const model = await getEmotionClassifier();
  if (!model) return null;

  try {
    const output = await model(text, {
      pooling: "mean",
      normalize: true,
    });

    if (!output || !output.data) return null;
    return Array.from(output.data as ArrayLike<number>);
  } catch (err) {
    console.debug("[RunAnywhere:NLP] Embedding failed", err);
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return -1;

  let dot = 0;
  let magASq = 0;
  let magBSq = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magASq += a[i] * a[i];
    magBSq += b[i] * b[i];
  }

  const magA = Math.sqrt(magASq);
  const magB = Math.sqrt(magBSq);
  if (magA === 0 || magB === 0) return -1;

  return dot / (magA * magB);
}

async function initEmotionEmbeddings(): Promise<void> {
  for (const emotion of EMBEDDING_EMOTION_LABELS) {
    const emb = await getEmbedding(emotion);
    if (emb) {
      emotionEmbeddings[emotion] = emb;
    }
  }

  emotionEmbeddingsInitialized = true;
}

async function getEmotionFromEmbedding(text: string): Promise<{ emotion: Emotion; confidence: number }> {
  const emb = await getEmbedding(text);
  if (!emb) return { emotion: "neutral", confidence: 0 };

  if (!emotionEmbeddingsInitialized && emotionEmbeddingsInitPromise) {
    await emotionEmbeddingsInitPromise;
  }
  if (!emotionEmbeddingsInitialized && !emotionEmbeddingsInitPromise) {
    emotionEmbeddingsInitPromise = initEmotionEmbeddings();
    await emotionEmbeddingsInitPromise;
  }

  let bestEmotion: Emotion = "neutral";
  let bestScore = -1;

  for (const [emotion, refEmb] of Object.entries(emotionEmbeddings) as Array<[Emotion, number[] | undefined]>) {
    if (!refEmb) continue;
    const score = cosineSimilarity(emb, refEmb);
    if (score > bestScore) {
      bestScore = score;
      bestEmotion = emotion;
    }
  }

  if (bestScore < 0) return { emotion: "neutral", confidence: 0 };

  return {
    emotion: bestEmotion,
    confidence: Math.min(bestScore, 0.95),
  };
}

function getLexiconEmotion(text: string): { emotion: Emotion; confidence: number } | null {
  const scores = getEmotionScores(text);
  if (scores.length === 0) return null;

  const top = scores.find((s) => CANDIDATE_EMOTIONS.includes(s.emotion)) ?? scores[0];
  return {
    emotion: top.emotion,
    confidence: clamp(top.score, 0, 0.9),
  };
}

function getFallbackSentiment(text: string): { sentiment: Sentiment; score: number } {
  const normalized = text.toLowerCase();
  const positiveTerms = ["good", "happy", "great", "love", "relieved", "grateful", "calm", "better", "hopeful"];
  const negativeTerms = ["bad", "sad", "angry", "anxious", "stress", "stressed", "afraid", "scared", "upset", "worried"];

  let pos = 0;
  let neg = 0;

  for (const term of positiveTerms) {
    if (normalized.includes(term)) pos += 1;
  }
  for (const term of negativeTerms) {
    if (normalized.includes(term)) neg += 1;
  }

  const raw = pos - neg;
  const score = clamp(raw / 4, -1, 1);

  let sentiment: Sentiment = "neutral";
  if (score > 0.2) sentiment = "positive";
  if (score < -0.2) sentiment = "negative";

  return { sentiment, score };
}

async function getSentiment(text: string): Promise<{ sentiment: Sentiment; score: number }> {
  if (!text.trim()) return { sentiment: "neutral", score: 0 };

  const loaded = await getSentimentClassifier();
  if (!loaded) return getFallbackSentiment(text);

  try {
    const result = await loaded(text);
    if (!Array.isArray(result) || result.length === 0) {
      return getFallbackSentiment(text);
    }

    const label = String(result[0].label || "");
    const confidence = typeof result[0].score === "number" ? result[0].score : 0;
    const starMatch = label.match(/(\d)/);
    const stars = starMatch ? Number(starMatch[1]) : 3;

    let sentiment: Sentiment = "neutral";
    if (stars <= 2) sentiment = "negative";
    else if (stars >= 4) sentiment = "positive";

    const baseScore = (stars - 3) / 2;
    const score = clamp(baseScore * (confidence || 1), -1, 1);

    if (confidence < 0.55) {
      return { sentiment: "neutral", score: 0 };
    }

    return { sentiment, score };
  } catch (err) {
    console.debug("[RunAnywhere:NLP] sentiment inference failed; using fallback.", err);
    return getFallbackSentiment(text);
  }
}

async function getEmotion(
  text: string,
  sentiment: Sentiment
): Promise<{ emotion: Emotion; confidence: number }> {
  if (!text.trim()) return { emotion: "neutral", confidence: 0 };

  const lexiconEmotion = getLexiconEmotion(text);
  if (lexiconEmotion && lexiconEmotion.confidence >= 0.6) {
    return lexiconEmotion;
  }

  const embeddingResult = await getEmotionFromEmbedding(text);
  if (embeddingResult.confidence >= 0.62) {
    if (lexiconEmotion && lexiconEmotion.confidence >= 0.45) {
      const embeddingIsPositive = POSITIVE_EMOTIONS.has(embeddingResult.emotion);
      const lexiconIsPositive = POSITIVE_EMOTIONS.has(lexiconEmotion.emotion);
      const embeddingIsNegative = NEGATIVE_EMOTIONS.has(embeddingResult.emotion);
      const lexiconIsNegative = NEGATIVE_EMOTIONS.has(lexiconEmotion.emotion);

      if ((embeddingIsPositive && lexiconIsNegative) || (embeddingIsNegative && lexiconIsPositive)) {
        return lexiconEmotion;
      }
    }

    return embeddingResult;
  }

  if (lexiconEmotion) {
    return lexiconEmotion;
  }

  if (sentiment === "positive") {
    return { emotion: "joy", confidence: 0.45 };
  }

  if (sentiment === "negative") {
    return { emotion: "stress", confidence: 0.45 };
  }

  return { emotion: "neutral", confidence: 0 };
}

export async function analyzeText(text: string): Promise<AnalysisResult> {
  const normalized = text.toLowerCase();
  const words = normalized.replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
  const wordSet = new Set(words);

  const { sentiment, score: sentimentScore } = await getSentiment(text);
  const { emotion, confidence: emotionConfidence } = await getEmotion(text, sentiment);

  const wordFreq: Record<string, number> = {};
  for (const word of words) {
    if (word.length > 2 && !STOP_WORDS.has(word)) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  }

  const keywords = Object.entries(wordFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word);

  const topicScores: Record<string, number> = {};
  for (const [topic, topicWords] of Object.entries(TOPIC_MAP)) {
    const matches = topicWords.filter((topicWord) => wordSet.has(topicWord));
    if (matches.length > 0) {
      topicScores[topic] = matches.length;
    }
  }

  const topics = Object.entries(topicScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([topic]) => topic);

  return {
    sentiment,
    sentimentScore,
    emotion,
    emotionConfidence,
    keywords,
    topics,
  };
}
