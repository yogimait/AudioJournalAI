/**
 * Emotion keyword mapper with weighted scoring.
 * Maps text content to emotion categories.
 */

import type { Emotion } from "@/lib/analysis";

export interface EmotionScore {
  emotion: Emotion;
  score: number;
  matchedWords: string[];
}

// Weighted keyword → emotion associations
const EMOTION_KEYWORDS: Record<string, { emotion: Emotion; weight: number }[]> = {
  // Joy
  happy: [{ emotion: "joy", weight: 1.0 }],
  joyful: [{ emotion: "joy", weight: 1.0 }],
  excited: [{ emotion: "joy", weight: 0.9 }],
  thrilled: [{ emotion: "joy", weight: 0.9 }],
  ecstatic: [{ emotion: "joy", weight: 1.0 }],
  wonderful: [{ emotion: "joy", weight: 0.8 }],
  fantastic: [{ emotion: "joy", weight: 0.8 }],
  celebrate: [{ emotion: "joy", weight: 0.7 }],
  laugh: [{ emotion: "joy", weight: 0.7 }],
  smile: [{ emotion: "joy", weight: 0.6 }],
  fun: [{ emotion: "joy", weight: 0.6 }],
  enjoy: [{ emotion: "joy", weight: 0.6 }],
  delight: [{ emotion: "joy", weight: 0.8 }],
  love: [{ emotion: "joy", weight: 0.95 }, { emotion: "gratitude", weight: 0.7 }],
  bright: [{ emotion: "joy", weight: 0.55 }, { emotion: "calm", weight: 0.45 }],
  brightly: [{ emotion: "joy", weight: 0.55 }, { emotion: "calm", weight: 0.45 }],
  shining: [{ emotion: "joy", weight: 0.5 }, { emotion: "calm", weight: 0.5 }],

  // Gratitude
  grateful: [{ emotion: "gratitude", weight: 1.0 }],
  thankful: [{ emotion: "gratitude", weight: 1.0 }],
  blessed: [{ emotion: "gratitude", weight: 0.9 }],
  appreciate: [{ emotion: "gratitude", weight: 0.8 }],
  thanks: [{ emotion: "gratitude", weight: 0.7 }],
  fortunate: [{ emotion: "gratitude", weight: 0.7 }],
  lucky: [{ emotion: "gratitude", weight: 0.5 }],

  // Calm
  calm: [{ emotion: "calm", weight: 1.0 }],
  peaceful: [{ emotion: "calm", weight: 1.0 }],
  relaxed: [{ emotion: "calm", weight: 0.9 }],
  serene: [{ emotion: "calm", weight: 0.9 }],
  tranquil: [{ emotion: "calm", weight: 0.9 }],
  meditate: [{ emotion: "calm", weight: 0.8 }],
  mindful: [{ emotion: "calm", weight: 0.7 }],
  content: [{ emotion: "calm", weight: 0.6 }],

  // Stress
  stressed: [{ emotion: "stress", weight: 1.0 }],
  overwhelmed: [{ emotion: "stress", weight: 0.9 }],
  pressure: [{ emotion: "stress", weight: 0.8 }],
  deadline: [{ emotion: "stress", weight: 0.7 }],
  overwork: [{ emotion: "stress", weight: 0.8 }],
  burnout: [{ emotion: "stress", weight: 0.9 }],
  hectic: [{ emotion: "stress", weight: 0.7 }],
  exhausted: [{ emotion: "stress", weight: 0.7 }],

  // Anxiety
  anxious: [{ emotion: "anxiety", weight: 1.0 }],
  worried: [{ emotion: "anxiety", weight: 0.9 }],
  nervous: [{ emotion: "anxiety", weight: 0.8 }],
  panic: [{ emotion: "anxiety", weight: 1.0 }],
  uneasy: [{ emotion: "anxiety", weight: 0.7 }],
  restless: [{ emotion: "anxiety", weight: 0.7 }],
  tense: [{ emotion: "anxiety", weight: 0.6 }],

  // Sadness
  sad: [{ emotion: "sadness", weight: 1.0 }],
  depressed: [{ emotion: "sadness", weight: 1.0 }],
  lonely: [{ emotion: "sadness", weight: 0.8 }],
  cry: [{ emotion: "sadness", weight: 0.8 }],
  grief: [{ emotion: "sadness", weight: 0.9 }],
  heartbreak: [{ emotion: "sadness", weight: 0.9 }],
  miss: [{ emotion: "sadness", weight: 0.5 }],
  gloomy: [{ emotion: "sadness", weight: 0.7 }],
  miserable: [{ emotion: "sadness", weight: 0.9 }],
  hopeless: [{ emotion: "sadness", weight: 0.9 }],

  // Anger
  angry: [{ emotion: "anger", weight: 1.0 }],
  furious: [{ emotion: "anger", weight: 1.0 }],
  mad: [{ emotion: "anger", weight: 0.8 }],
  rage: [{ emotion: "anger", weight: 1.0 }],
  irritated: [{ emotion: "anger", weight: 0.7 }],
  annoyed: [{ emotion: "anger", weight: 0.6 }],
  frustrated: [{ emotion: "anger", weight: 0.7 }],
  hate: [{ emotion: "anger", weight: 0.9 }],

  // Fear
  scared: [{ emotion: "fear", weight: 1.0 }],
  afraid: [{ emotion: "fear", weight: 0.9 }],
  terrified: [{ emotion: "fear", weight: 1.0 }],
  frightened: [{ emotion: "fear", weight: 0.9 }],
  fearful: [{ emotion: "fear", weight: 0.8 }],

  // Surprise
  surprised: [{ emotion: "surprise", weight: 1.0 }],
  shocked: [{ emotion: "surprise", weight: 0.9 }],
  amazed: [{ emotion: "surprise", weight: 0.8 }],
  unexpected: [{ emotion: "surprise", weight: 0.7 }],
  astonished: [{ emotion: "surprise", weight: 0.9 }],
};

/**
 * Get all emotion scores for a given text.
 */
export function getEmotionScores(text: string): EmotionScore[] {
  const words = text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/);
  const scores: Record<Emotion, { total: number; count: number; matchedWords: string[] }> = {
    joy: { total: 0, count: 0, matchedWords: [] },
    gratitude: { total: 0, count: 0, matchedWords: [] },
    calm: { total: 0, count: 0, matchedWords: [] },
    stress: { total: 0, count: 0, matchedWords: [] },
    anxiety: { total: 0, count: 0, matchedWords: [] },
    sadness: { total: 0, count: 0, matchedWords: [] },
    anger: { total: 0, count: 0, matchedWords: [] },
    fear: { total: 0, count: 0, matchedWords: [] },
    surprise: { total: 0, count: 0, matchedWords: [] },
    neutral: { total: 0, count: 0, matchedWords: [] },
  };

  for (const word of words) {
    const associations = EMOTION_KEYWORDS[word];
    if (associations) {
      for (const { emotion, weight } of associations) {
        scores[emotion].total += weight;
        scores[emotion].count++;
        if (!scores[emotion].matchedWords.includes(word)) {
          scores[emotion].matchedWords.push(word);
        }
      }
    }
  }

  return Object.entries(scores)
    .filter(([, data]) => data.count > 0)
    .map(([emotion, data]) => ({
      emotion: emotion as Emotion,
      score: data.total / data.count,
      matchedWords: data.matchedWords,
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Get emoji for an emotion.
 */
export function getEmotionEmoji(emotion: Emotion): string {
  const emojiMap: Record<Emotion, string> = {
    joy: "😊",
    gratitude: "🙏",
    calm: "😌",
    stress: "😰",
    anxiety: "😟",
    sadness: "😢",
    anger: "😠",
    fear: "😨",
    surprise: "😲",
    neutral: "😐",
  };
  return emojiMap[emotion];
}

/**
 * Get a color hex code for an emotion (for visualization).
 */
export function getEmotionColor(emotion: Emotion): string {
  const colorMap: Record<Emotion, string> = {
    joy: "#F59E0B",
    gratitude: "#8B5CF6",
    calm: "#3B82F6",
    stress: "#EF4444",
    anxiety: "#F97316",
    sadness: "#6366F1",
    anger: "#DC2626",
    fear: "#7C3AED",
    surprise: "#EC4899",
    neutral: "#6B7280",
  };
  return colorMap[emotion];
}
