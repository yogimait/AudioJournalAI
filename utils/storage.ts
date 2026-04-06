/**
 * IndexedDB storage utility for journal entries.
 * Uses the `idb` library for clean async operations.
 * All data stays local — no backend.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { Sentiment, Emotion } from "@/lib/analysis";

export interface JournalEntry {
  id: string;
  text: string;
  timestamp: number;
  sentiment: Sentiment;
  sentimentScore: number;
  emotion: Emotion;
  emotionConfidence: number;
  keywords: string[];
  topics: string[];
}

const DB_NAME = "mindmirror-journal";
const DB_VERSION = 1;
const STORE_NAME = "entries";

const SENTIMENT_VALUES: readonly Sentiment[] = ["positive", "neutral", "negative"];
const EMOTION_VALUES: readonly Emotion[] = [
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

let dbPromise: Promise<IDBPDatabase> | null = null;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function sanitizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = normalizeText(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function isSentiment(value: unknown): value is Sentiment {
  return typeof value === "string" && SENTIMENT_VALUES.includes(value as Sentiment);
}

function isEmotion(value: unknown): value is Emotion {
  return typeof value === "string" && EMOTION_VALUES.includes(value as Emotion);
}

function normalizeEntryRecord(value: unknown): JournalEntry | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Partial<JournalEntry>;
  if (typeof raw.id !== "string" || raw.id.trim().length === 0) return null;

  const text = normalizeText(typeof raw.text === "string" ? raw.text : "");
  if (text.length === 0) return null;

  const timestamp =
    typeof raw.timestamp === "number" && Number.isFinite(raw.timestamp)
      ? raw.timestamp
      : Date.now();

  return {
    id: raw.id,
    text,
    timestamp,
    sentiment: isSentiment(raw.sentiment) ? raw.sentiment : "neutral",
    sentimentScore:
      typeof raw.sentimentScore === "number" && Number.isFinite(raw.sentimentScore)
        ? raw.sentimentScore
        : 0,
    emotion: isEmotion(raw.emotion) ? raw.emotion : "neutral",
    emotionConfidence:
      typeof raw.emotionConfidence === "number" && Number.isFinite(raw.emotionConfidence)
        ? raw.emotionConfidence
        : 0,
    keywords: sanitizeStringList(raw.keywords),
    topics: sanitizeStringList(raw.topics),
  };
}

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("timestamp", "timestamp");
          store.createIndex("sentiment", "sentiment");
          store.createIndex("emotion", "emotion");
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Generate a unique ID for a journal entry.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Save a new journal entry.
 */
export async function saveEntry(
  entry: Omit<JournalEntry, "id">
): Promise<JournalEntry> {
  const db = await getDB();
  const fullEntry = normalizeEntryRecord({ id: generateId(), ...entry });

  if (!fullEntry) {
    throw new Error("Cannot save an empty journal entry");
  }

  await db.put(STORE_NAME, fullEntry);
  return fullEntry;
}

/**
 * Update an existing journal entry.
 */
export async function updateEntry(
  id: string,
  updates: Partial<Omit<JournalEntry, "id" | "timestamp">>
): Promise<JournalEntry> {
  const db = await getDB();
  const existing = await db.get(STORE_NAME, id);
  if (!existing) throw new Error("Entry not found");

  const updated = normalizeEntryRecord({ ...existing, ...updates, id });
  if (!updated) {
    throw new Error("Cannot update an entry with empty text");
  }

  await db.put(STORE_NAME, updated);
  return updated;
}

/**
 * Get all journal entries, sorted by timestamp (newest first).
 */
export async function getAllEntries(): Promise<JournalEntry[]> {
  const db = await getDB();
  const entries = await db.getAll(STORE_NAME);

  const validEntries: JournalEntry[] = [];
  const invalidIds: string[] = [];

  for (const rawEntry of entries) {
    const normalized = normalizeEntryRecord(rawEntry);
    if (normalized) {
      validEntries.push(normalized);
      continue;
    }

    if (
      rawEntry &&
      typeof rawEntry === "object" &&
      "id" in rawEntry &&
      typeof (rawEntry as { id?: unknown }).id === "string"
    ) {
      invalidIds.push((rawEntry as { id: string }).id);
    }
  }

  if (invalidIds.length > 0) {
    await Promise.all(invalidIds.map((id) => db.delete(STORE_NAME, id)));
  }

  return validEntries.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get entries within a date range.
 */
export async function getEntriesByDateRange(
  start: number,
  end: number
): Promise<JournalEntry[]> {
  const entries = await getAllEntries();
  return entries
    .filter((e) => e.timestamp >= start && e.timestamp <= end)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Delete a journal entry by ID.
 */
export async function deleteEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

/**
 * Get total entry count.
 */
export async function getEntryCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_NAME);
}
