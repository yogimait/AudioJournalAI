"use client";

/**
 * MindMirror AI — Main Journal Page
 * Privacy-first, offline voice journaling app.
 * Client component — initializes RunAnywhere SDK in useEffect.
 *
 * This file orchestrates state, model initialization, and connects
 * page components from /pages with the BookLayout navigation.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import BookLayout, { type ScrollToPageFn } from "@/components/BookLayout";
import CoverPage from "@/views/CoverPage";
import RecordPage from "@/views/RecordPage";
import EntriesPage from "@/views/EntriesPage";
import InsightsPage from "@/views/InsightsPage";
import JourneyPage from "@/views/JourneyPage";
import AboutPage from "@/views/AboutPage";
import { getAllEntries, deleteEntry, updateEntry, type JournalEntry } from "@/utils/storage";
import { generateWeeklyInsight } from "@/utils/analytics";
import { analyzeText, initNLPModels } from "@/lib/analysis";
import { initRunAnywhere, initSTTModel, initVADModel, getRunAnywhereState } from "@/lib/runanywhere";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const data = err as Record<string, unknown>;
    if (typeof data.message === "string" && data.message.trim().length > 0) return data.message;
    if (typeof data.reason === "string" && data.reason.trim().length > 0) return data.reason;
    if (typeof data.error === "string" && data.error.trim().length > 0) return data.error;
    try {
      return JSON.stringify(data);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/** Index of the Insights page in `pages` — must match array order below. */
const INSIGHTS_PAGE_INDEX = 3;

export default function Home() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [modelsReady, setModelsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const navigateRef = useRef<ScrollToPageFn>(() => {});
  const scrollToPage = useCallback((index: number) => {
    navigateRef.current(index);
  }, []);

  // Load persisted entries on mount
  useEffect(() => {
    async function loadEntries() {
      try {
        const stored = await getAllEntries();
        setEntries(stored.sort((a, b) => b.timestamp - a.timestamp));
      } catch (err) {
        console.error("Failed to load entries:", err);
      } finally {
        setIsLoadingEntries(false);
      }
    }
    loadEntries();
  }, []);

  // Initialize RunAnywhere SDK (client-side only)
  useEffect(() => {
    async function initModels() {
      try {
        setIsInitializing(true);
        await initRunAnywhere();
        await Promise.all([initSTTModel(), initVADModel()]);

        // Warm NLP models in background at idle time to keep initial UI smooth.
        const prewarm = () => {
          void initNLPModels().catch((err) => {
            console.warn("[NLP] Prewarm failed, fallback rules will be used until models are available:", getErrorMessage(err));
          });
        };

        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
          window.requestIdleCallback(prewarm, { timeout: 2000 });
        } else {
          setTimeout(prewarm, 400);
        }

        setModelsReady(true);
      } catch (err) {
        const state = getRunAnywhereState();
        setInitError(
          state.error || getErrorMessage(err) || "Failed to initialize AI models"
        );
        console.error("Model init failed:", getErrorMessage(err), err);
      } finally {
        setIsInitializing(false);
      }
    }
    initModels();
  }, []);

  const handleNewEntry = useCallback((entry: JournalEntry) => {
    setEntries((prev) => {
      const existingIndex = prev.findIndex((current) => current.id === entry.id);
      if (existingIndex >= 0) {
        return prev.map((current) => (current.id === entry.id ? entry : current));
      }
      return [entry, ...prev];
    });
  }, []);

  const handleUpdateEntry = useCallback((updated: JournalEntry) => {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }, []);

  const handleDeleteEntry = useCallback(async (id: string) => {
    await deleteEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleEditEntry = useCallback(async (id: string, text: string) => {
    const normalizedText = text.replace(/\s+/g, " ").trim();
    if (!normalizedText) {
      throw new Error("Entry text cannot be empty");
    }

    const analysis = await analyzeText(normalizedText);
    const updated = await updateEntry(id, {
      text: normalizedText,
      sentiment: analysis.sentiment,
      sentimentScore: analysis.sentimentScore,
      emotion: analysis.emotion,
      emotionConfidence: analysis.emotionConfidence,
      keywords: analysis.keywords,
      topics: analysis.topics,
    });

    setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    return updated;
  }, []);

  const entriesSorted = useMemo(
    () => [...entries].sort((a, b) => b.timestamp - a.timestamp),
    [entries]
  );

  const insight = generateWeeklyInsight(entriesSorted);

  // Book pages — each section is a separate component
  const pages = [
    {
      id: "cover",
      label: "Cover",
      fullBleed: true,
      content: (
        <CoverPage
          entriesSorted={entriesSorted}
          onStartRecording={() => scrollToPage(1)}
          onViewInsights={() => scrollToPage(INSIGHTS_PAGE_INDEX)}
        />
      ),
    },
    {
      id: "record",
      label: "Write",
      nebulaPage: true,
      content: (
        <RecordPage
          entriesSorted={entriesSorted}
          initError={initError}
          isInitializing={isInitializing}
          modelsReady={modelsReady}
          onNewEntry={handleNewEntry}
          onUpdateEntry={handleUpdateEntry}
        />
      ),
    },
    {
      id: "entries",
      label: "Entries",
      nebulaPage: true,
      content: (
        <EntriesPage
          entries={entries}
          entriesSorted={entriesSorted}
          isLoadingEntries={isLoadingEntries}
          onDeleteEntry={handleDeleteEntry}
          onEditEntry={handleEditEntry}
        />
      ),
    },
    {
      id: "insights",
      label: "Insights",
      wide: true,
      nebulaPage: true,
      content: (
        <InsightsPage
          entriesSorted={entriesSorted}
          insight={insight}
        />
      ),
    },
    {
      id: "journey",
      label: "Journey",
      wide: true,
      nebulaPage: true,
      content: <JourneyPage entriesSorted={entriesSorted} />,
    },
    {
      id: "about",
      label: "About Us",
      nebulaPage: true,
      content: <AboutPage />,
    },
  ];

  return (
    <BookLayout
      pages={pages}
      onNavigateRef={(fn) => {
        navigateRef.current = fn;
      }}
    />
  );
}
