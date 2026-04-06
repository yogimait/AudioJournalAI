/**
 * Insight analytics engine.
 * Aggregates journal entries over time and generates actionable insights.
 */

import type { JournalEntry } from "./storage";
import type { Sentiment, Emotion } from "@/lib/analysis";

export interface WeeklyInsight {
  period: string;
  entryCount: number;
  sentimentBreakdown: Record<Sentiment, number>;
  emotionCounts: Record<Emotion, number>;
  topTopics: { topic: string; count: number }[];
  topKeywords: { keyword: string; count: number }[];
  averageSentiment: number;
  insightText: string;
  moodTrend: { date: string; score: number; emotion: Emotion }[];
}

/**
 * Generate weekly insights from journal entries.
 */
export function generateWeeklyInsight(entries: JournalEntry[]): WeeklyInsight {
  if (entries.length === 0) {
    return {
      period: "This Week",
      entryCount: 0,
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
      emotionCounts: {} as Record<Emotion, number>,
      topTopics: [],
      topKeywords: [],
      averageSentiment: 0,
      insightText: "Start journaling to see insights about your emotional patterns.",
      moodTrend: [],
    };
  }

  // Sentiment breakdown
  const sentimentBreakdown: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0 };
  for (const entry of entries) {
    sentimentBreakdown[entry.sentiment]++;
  }

  // Emotion counts
  const emotionCounts: Partial<Record<Emotion, number>> = {};
  for (const entry of entries) {
    emotionCounts[entry.emotion] = (emotionCounts[entry.emotion] || 0) + 1;
  }

  // Topic aggregation
  const topicCounts: Record<string, number> = {};
  for (const entry of entries) {
    for (const topic of entry.topics) {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }
  }
  const topTopics = Object.entries(topicCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([topic, count]) => ({ topic, count }));

  // Keyword aggregation
  const keywordCounts: Record<string, number> = {};
  for (const entry of entries) {
    for (const keyword of entry.keywords) {
      keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
    }
  }
  const topKeywords = Object.entries(keywordCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([keyword, count]) => ({ keyword, count }));

  // Average sentiment
  const averageSentiment =
    entries.reduce((sum, e) => sum + e.sentimentScore, 0) / entries.length;

  // Mood trend (daily)
  const moodTrend = [...entries]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((entry) => ({
      date: new Date(entry.timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      score: entry.sentimentScore,
      emotion: entry.emotion,
    }));

  // Generate insight text
  const insightText = generateInsightText(
    entries.length,
    sentimentBreakdown,
    emotionCounts as Record<Emotion, number>,
    topTopics,
    averageSentiment
  );

  // Period label
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const period = `${weekAgo.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return {
    period,
    entryCount: entries.length,
    sentimentBreakdown,
    emotionCounts: emotionCounts as Record<Emotion, number>,
    topTopics,
    topKeywords,
    averageSentiment,
    insightText,
    moodTrend,
  };
}

/**
 * Generate human-readable insight text from analysis data.
 */
function generateInsightText(
  count: number,
  sentiments: Record<Sentiment, number>,
  emotions: Record<Emotion, number>,
  topics: { topic: string; count: number }[],
  avgSentiment: number
): string {
  const parts: string[] = [];

  // Entry count
  parts.push(`You journaled ${count} time${count !== 1 ? "s" : ""} this week.`);

  // Overall mood
  if (avgSentiment > 0.3) {
    parts.push("Overall, your mood has been quite positive! 🌟");
  } else if (avgSentiment > 0) {
    parts.push("Your mood has been generally positive with some ups and downs.");
  } else if (avgSentiment > -0.3) {
    parts.push("Your mood has been mixed this week.");
  } else {
    parts.push("It seems like this week has been challenging. Remember to be kind to yourself. 💙");
  }

  // Dominant emotion
  const sortedEmotions = Object.entries(emotions).sort(([, a], [, b]) => b - a);
  if (sortedEmotions.length > 0) {
    const [topEmotion, topCount] = sortedEmotions[0];
    parts.push(
      `You felt ${topEmotion} ${topCount} time${topCount !== 1 ? "s" : ""}, making it your most frequent emotion.`
    );
  }

  // Negative sentiment warning
  if (sentiments.negative >= 3) {
    parts.push(
      `You had ${sentiments.negative} negative entries. Consider what might be causing this pattern.`
    );
  }

  // Topics
  if (topics.length > 0) {
    const topicNames = topics.map((t) => t.topic).join(", ");
    parts.push(`Your main topics were: ${topicNames}.`);
  }

  return parts.join(" ");
}

/**
 * Get mood data formatted for Recharts visualization.
 */
export function getMoodChartData(entries: JournalEntry[]): {
  pointKey: string;
  timelineLabel: string;
  displayDate: string;
  displayTime: string;
  mood: number;
  emotion: string;
}[] {
  const emotionMoodFallback: Partial<Record<Emotion, number>> = {
    joy: 0.65,
    gratitude: 0.55,
    calm: 0.35,
    surprise: 0.15,
    neutral: 0,
    stress: -0.45,
    anxiety: -0.55,
    sadness: -0.7,
    anger: -0.65,
    fear: -0.7,
  };

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  return [...entries]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((entry, index) => {
      const timestamp = new Date(entry.timestamp);
      const displayDate = timestamp.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const displayTime = timestamp.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });

      let score = Number.isFinite(entry.sentimentScore) ? entry.sentimentScore : 0;
      if (Math.abs(score) < 0.08 && entry.emotion !== "neutral") {
        const emotionFallback = emotionMoodFallback[entry.emotion] ?? 0;
        const confidence = Number.isFinite(entry.emotionConfidence)
          ? clamp(entry.emotionConfidence, 0, 1)
          : 0.5;
        const blend = 0.35 + confidence * 0.45;
        score = score * (1 - blend) + emotionFallback * blend;
      }

      score = clamp(score, -1, 1);

      return {
        pointKey: `${entry.timestamp}-${index}`,
        timelineLabel: displayTime,
        displayDate,
        displayTime,
        mood: Math.round((score + 1) * 50),
        emotion: entry.emotion,
      };
    });
}

/**
 * Get emotion distribution data for bar chart.
 */
export function getEmotionChartData(
  entries: JournalEntry[]
): { emotion: string; count: number; fill: string }[] {
  const emotionColors: Record<string, string> = {
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

  const counts: Record<string, number> = {};
  for (const entry of entries) {
    counts[entry.emotion] = (counts[entry.emotion] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([emotion, count]) => ({
      emotion: emotion.charAt(0).toUpperCase() + emotion.slice(1),
      count,
      fill: emotionColors[emotion] || "#6B7280",
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get radar chart data for emotion distribution.
 */
export function getEmotionRadarData(
  entries: JournalEntry[]
): { emotion: string; value: number }[] {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    counts[entry.emotion] = (counts[entry.emotion] || 0) + 1;
  }

  const total = Object.values(counts).reduce((sum, v) => sum + v, 0) || 1;

  return Object.entries(counts)
    .map(([emotion, count]) => ({
      emotion: emotion.charAt(0).toUpperCase() + emotion.slice(1),
      value: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Get heatmap data for recent journal activity.
 */
export function getActivityHeatmapData(
  entries: JournalEntry[],
  days = 28
): { date: string; label: string; count: number; level: number }[] {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));

  const countsByDay: Record<string, number> = {};
  for (const entry of entries) {
    const key = new Date(entry.timestamp).toISOString().slice(0, 10);
    countsByDay[key] = (countsByDay[key] || 0) + 1;
  }

  const dates: { date: string; label: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    dates.push({ date: key, label, count: countsByDay[key] || 0 });
  }

  const maxCount = Math.max(1, ...dates.map((d) => d.count));
  return dates.map((d) => ({
    ...d,
    level: Math.min(4, Math.floor((d.count / maxCount) * 4)),
  }));
}
