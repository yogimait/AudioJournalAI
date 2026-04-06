"use client";

/**
 * JourneyPage — Timeline of entries as trees on the glass board (below header, same nebula shell as Insights).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { JournalEntry } from "@/utils/storage";

const TREE_FILES = [
  "breakthrough.png",
  "climbing tendril.png",
  "filigree shrub.png",
  "gnarled root.png",
  "morning calm.png",
  "spear stem.png",
  "wanderings crown bush.png",
  "wanderings plume fern.png",
] as const;

/** Per-asset scale on top of word-based height (intrinsic art sizes differ). */
const TREE_HEIGHT_SCALE: Record<(typeof TREE_FILES)[number], number> = {
  "breakthrough.png": 1.5,
  "climbing tendril.png": 1.12,
  "filigree shrub.png": 0.82,
  "gnarled root.png": 1.22,
  "morning calm.png": 0.5,
  "spear stem.png": 1.08,
  "wanderings crown bush.png": 0.92,
  "wanderings plume fern.png": 0.76,
};

function treeVariantForEntry(id: string): { readonly src: string; readonly scale: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const file = TREE_FILES[h % TREE_FILES.length];
  const scale = TREE_HEIGHT_SCALE[file] ?? 1;
  return {
    src: `/treeimages/${encodeURIComponent(file)}`,
    scale,
  };
}

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function entryTitle(text: string): string {
  const t = text.trim();
  if (!t) return "Untitled";
  const line = t.split(/\n/)[0].trim();
  if (line.length <= 56) return line;
  return `${line.slice(0, 53)}…`;
}

function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

function formatTimeShort(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function plantHeightPx(words: number): number {
  const w = Math.min(800, Math.max(20, words));
  return Math.round(240 + (w / 800) * 280);
}

interface JourneyPageProps {
  readonly entriesSorted: JournalEntry[];
}

export default function JourneyPage({ entriesSorted }: JourneyPageProps) {
  const chronological = useMemo(
    () => [...entriesSorted].sort((a, b) => a.timestamp - b.timestamp),
    [entriesSorted]
  );

  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const entryDialogRef = useRef<HTMLDialogElement>(null);

  const openEntry = useMemo(
    () => (openEntryId ? chronological.find((e) => e.id === openEntryId) ?? null : null),
    [chronological, openEntryId]
  );

  useEffect(() => {
    const el = entryDialogRef.current;
    if (!el) return;
    if (openEntry) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [openEntry]);

  const minRailWidth = Math.max(100, chronological.length * 200 + 200);
  const subtitle =
    chronological.length === 0
      ? "Your path starts with a single reflection"
      : `${chronological.length} ${chronological.length === 1 ? "moment" : "moments"} from first entry to now`;

  return (
    <div className="page-insights-nebula journey-page-root">
      <div className="glass-board-nebula">
        <div className="insights-header-glass">
          <div className="insights-header-text">
            <h2 className="solidified-light-title">Journey</h2>
            <p className="glowing-numbers-text">{subtitle}</p>
          </div>
          <div className="light-vine-structure" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="m4.93 19.07 1.41-1.41" />
              <path d="M12 20v2" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M20 12h2" />
              <path d="m17.66 6.34 1.41-1.41" />
              <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" />
            </svg>
          </div>
        </div>

        <div className="journey-strip">
          {chronological.length === 0 ? (
            <p className="journey-empty">Record a journal entry to grow your path.</p>
          ) : (
            <div className="journey-scroll">
              <div className="journey-rail" style={{ minWidth: `${minRailWidth}px` }}>
                <div
                  className={
                    chronological.length === 1
                      ? "journey-stops-row journey-stops-row--single"
                      : "journey-stops-row"
                  }
                >
                  {chronological.map((entry) => {
                    const words = wordCount(entry.text);
                    const { src, scale } = treeVariantForEntry(entry.id);
                    const h = Math.round(plantHeightPx(words) * scale);
                    const label = `Open entry from ${formatDateShort(entry.timestamp)}`;
                    return (
                      <article
                        key={entry.id}
                        className="journey-stop"
                        tabIndex={0}
                        role="button"
                        aria-label={label}
                        onClick={() => setOpenEntryId(entry.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setOpenEntryId(entry.id);
                          }
                        }}
                      >
                        <div className="journey-stop-stack">
                          <div className="journey-word-pill" aria-hidden>
                            {words} {words === 1 ? "Word" : "Words"}
                          </div>
                          <div className="journey-plant-shell">
                            <div className="journey-plant-glow" aria-hidden />
                            <div className="journey-plant-blend">
                              <img
                                className="journey-plant-img"
                                src={src}
                                alt=""
                                style={{
                                  height: `${h}px`,
                                  width: "auto",
                                  maxWidth: `min(${Math.round(400 * scale)}px, 60vw)`,
                                }}
                                draggable={false}
                              />
                            </div>
                          </div>
                          <div className="journey-parchment">
                            <time dateTime={new Date(entry.timestamp).toISOString()}>
                              {formatDateShort(entry.timestamp)}
                            </time>
                            <span className="journey-parchment-time">{formatTimeShort(entry.timestamp)}</span>
                          </div>
                          <div className="journey-tooltip" role="tooltip">
                            <div className="journey-tooltip-headline">{entryTitle(entry.text)}</div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <dialog
          ref={entryDialogRef}
          className="journey-entry-dialog"
          aria-labelledby="journey-entry-dialog-title"
          onClose={() => setOpenEntryId(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenEntryId(null);
          }}
        >
          {openEntry ? (
            <div
              className="journey-entry-dialog-panel"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="journey-entry-dialog-header">
                <h2 id="journey-entry-dialog-title" className="journey-entry-dialog-title">
                  {formatDateShort(openEntry.timestamp)} · {formatTimeShort(openEntry.timestamp)}
                </h2>
                <button
                  type="button"
                  className="journey-entry-dialog-close"
                  aria-label="Close"
                  onClick={() => setOpenEntryId(null)}
                >
                  ×
                </button>
              </div>
              <div className="journey-entry-dialog-body">{openEntry.text}</div>
            </div>
          ) : null}
        </dialog>
      </div>
    </div>
  );
}
