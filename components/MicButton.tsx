"use client";

/**
 * MicButton component — animated recording button.
 * States: loadingModels → idle → listening → processing
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  startListening,
  stopListening,
  pauseListening,
  resumeListening,
  isListeningActive,
  isListeningPaused,
} from "@/lib/vad";
import { analyzeText } from "@/lib/analysis";
import { deleteEntry, saveEntry, updateEntry, type JournalEntry } from "@/utils/storage";

type RecordingState = "loadingModels" | "idle" | "listening" | "paused" | "processing";

interface MicButtonProps {
  readonly onNewEntry: (entry: JournalEntry) => void;
  readonly onUpdateEntry: (entry: JournalEntry) => void;
  readonly modelsReady: boolean;
}

export default function MicButton({ onNewEntry, onUpdateEntry, modelsReady }: MicButtonProps) {
  const [state, setState] = useState<RecordingState>(modelsReady ? "idle" : "loadingModels");
  const [transcribedText, setTranscribedText] = useState("");
  
  const activeEntryIdRef = useRef<string | null>(null);
  const accumulatedTextRef = useRef<string>("");
  const isCreatingRef = useRef(false);
  const sessionIdRef = useRef(0);
  const isTogglingRef = useRef(false);

  useEffect(() => {
    if (modelsReady) {
      setState((prev) => (prev === "loadingModels" ? "idle" : prev));
    }
  }, [modelsReady]);

  const handleStartStop = useCallback(async () => {
    if (state === "loadingModels" || state === "processing") return;
    if (isTogglingRef.current) return;

    isTogglingRef.current = true;

    try {
      if (isListeningActive()) {
        setState("processing");
        await stopListening();
        sessionIdRef.current += 1;
        activeEntryIdRef.current = null;
        accumulatedTextRef.current = "";
        isCreatingRef.current = false;
        setTranscribedText("");
        setState("idle");
        return;
      }

      sessionIdRef.current += 1;
      const activeSessionId = sessionIdRef.current;
      activeEntryIdRef.current = null;
      accumulatedTextRef.current = "";
      setTranscribedText("");
      
      await startListening({
        onTranscription: async (text: string) => {
          try {
            if (activeSessionId !== sessionIdRef.current) return;

            const normalizedText = text.replace(/\s+/g, " ").trim();

            // Ignore very short transcribed noises like "[music]" or "[blank]"
            if (normalizedText.length < 3 || normalizedText.startsWith("[")) return;

            const nextText = `${accumulatedTextRef.current ? `${accumulatedTextRef.current} ` : ""}${normalizedText}`.trim();
            if (!nextText) return;

            accumulatedTextRef.current = nextText;
            setTranscribedText(nextText);

            const analysis = await analyzeText(nextText);

            // Session may have been stopped while analysis was running.
            if (activeSessionId !== sessionIdRef.current) return;

            const targetEntryId = activeEntryIdRef.current;

            if (targetEntryId) {
              try {
                const entry = await updateEntry(targetEntryId, {
                  text: nextText,
                  sentiment: analysis.sentiment,
                  sentimentScore: analysis.sentimentScore,
                  emotion: analysis.emotion,
                  emotionConfidence: analysis.emotionConfidence,
                  keywords: analysis.keywords,
                  topics: analysis.topics,
                });
                if (activeSessionId === sessionIdRef.current) {
                  onUpdateEntry(entry);
                }
              } catch (err) {
                console.error("[MicButton] updateEntry failed:", err);
              }
            } else {
              if (isCreatingRef.current) return;
              isCreatingRef.current = true;
              try {
                const entry = await saveEntry({
                  text: nextText,
                  timestamp: Date.now(),
                  sentiment: analysis.sentiment,
                  sentimentScore: analysis.sentimentScore,
                  emotion: analysis.emotion,
                  emotionConfidence: analysis.emotionConfidence,
                  keywords: analysis.keywords,
                  topics: analysis.topics,
                });
                if (activeSessionId !== sessionIdRef.current) {
                  // If the session ended before save resolved, remove stale record.
                  await deleteEntry(entry.id).catch((cleanupErr) => {
                    console.warn("[MicButton] cleanup stale entry failed:", cleanupErr);
                  });
                  return;
                }

                activeEntryIdRef.current = entry.id;
                onNewEntry(entry);
              } catch (err) {
                console.error("[MicButton] saveEntry failed:", err);
              } finally {
                isCreatingRef.current = false;
              }
            }
          } catch (err) {
            console.error("[MicButton] transcription pipeline failed:", err);
          }
        },
        onStateChange: (vadState) => {
          if (isListeningPaused()) {
            setState("paused");
          } else if (vadState === "listening") {
            setState("listening");
          } else if (vadState === "processing") {
            setState("processing");
          } else if (vadState === "idle") {
             // Let pause state override idle if we manually paused
            if (!isListeningPaused()) setState("idle");
          }
        },
      });
      setState("listening");
    } catch (err) {
      console.error("Failed to start recording:", err);
      setState("idle");
    } finally {
      isTogglingRef.current = false;
    }
  }, [state, onNewEntry, onUpdateEntry]);

  const handlePauseResume = useCallback(() => {
    if (isListeningPaused()) {
      resumeListening();
      setState("listening");
    } else {
      pauseListening();
      setState("paused");
    }
  }, []);

  const getStateLabel = () => {
    switch (state) {
      case "loadingModels": return "Loading AI Models…";
      case "idle": return "Tap to speak";
      case "listening": return "Listening… (Tap to stop)";
      case "paused": return "Paused";
      case "processing": return "Processing…";
    }
  };

  const getMainIcon = () => {
    switch (state) {
      case "loadingModels":
      case "processing":
         // Spinner
        return (
          <svg className="mic-icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
             <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" />
          </svg>
        );
      case "idle":
        // Mic icon
        return (
          <svg className="mic-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        );
      case "listening":
      case "paused":
        // Stop icon (square)
        return (
           <svg className="mic-icon" viewBox="0 0 24 24" fill="currentColor">
             <rect x="6" y="6" width="12" height="12" rx="2" ry="2" />
           </svg>
        );
    }
  };

  const getAuxIcon = () => {
    if (state === "paused") {
      // Play / Resume icon
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <path d="M8 5v14l11-7z" />
        </svg>
      );
    } else {
      // Pause icon
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      );
    }
  };

  const isRecordingActive = state === "listening" || state === "paused";

  return (
    <div className="mic-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Main Start/Stop Button */}
        <button
          id="mic-button"
          className={`mic-button mic-${state}`}
          onClick={handleStartStop}
          disabled={state === "loadingModels" || state === "processing"}
          aria-label={getStateLabel()}
        >
          <span className={`mic-ring ${state === "listening" ? "mic-ring-active" : ""}`} />
          {getMainIcon()}
        </button>

        {/* Auxiliary Pause/Resume Button */}
        {isRecordingActive && (
           <button
             className="mic-button aux-button"
             onClick={handlePauseResume}
             aria-label={state === "paused" ? "Resume recording" : "Pause recording"}
             style={{ width: '48px', height: '48px', opacity: 0.9 }}
           >
             {getAuxIcon()}
           </button>
        )}
      </div>
      
      <p className="mic-label">{getStateLabel()}</p>
      
      {transcribedText && (state === "processing" || isRecordingActive) && (
        <p className="mic-transcription">{transcribedText}</p>
      )}
    </div>
  );
}
