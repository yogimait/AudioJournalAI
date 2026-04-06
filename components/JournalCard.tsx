"use client";

/**
 * JournalCard — displays a single journal entry as a handwritten note on aged paper.
 */

import { useEffect, useState } from "react";
import type { JournalEntry } from "@/utils/storage";
import { getEmotionEmoji } from "@/utils/emotionMapper";

interface JournalCardProps {
  readonly entry: JournalEntry;
  readonly onDelete?: (id: string) => void;
  readonly onEdit?: (id: string, text: string) => Promise<JournalEntry>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === "string" && error.trim().length > 0) return error;
  return "Could not update this entry.";
}

export default function JournalCard({ entry, onDelete, onEdit }: JournalCardProps) {
  const date = new Date(entry.timestamp);
  const formattedDate = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(entry.text);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftText(entry.text);
      setEditError(null);
    }
  }, [entry.text, isEditing]);

  const startEditing = () => {
    if (!onEdit) return;
    setDraftText(entry.text);
    setEditError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraftText(entry.text);
    setEditError(null);
    setIsEditing(false);
  };

  const saveEditing = async () => {
    if (!onEdit || isSaving) return;

    const normalizedText = draftText.replace(/\s+/g, " ").trim();
    if (!normalizedText) {
      setEditError("Entry text cannot be empty.");
      return;
    }

    if (normalizedText === entry.text) {
      setIsEditing(false);
      setEditError(null);
      return;
    }

    setIsSaving(true);
    setEditError(null);
    try {
      await onEdit(entry.id, normalizedText);
      setIsEditing(false);
    } catch (error) {
      setEditError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="glass-shard-card" id={`entry-${entry.id}`}>
      <div className="glass-shard-header">
        <div className="glass-shard-date">
          <span className="glass-shard-day">{formattedDate}</span>
          <span className="glass-shard-time">{formattedTime}</span>
        </div>
        <div className="glass-shard-badges">
          <span className="glass-prism-tag glass-prism-emotion" title={entry.emotion}>
            <span className="jewel-emoji">{getEmotionEmoji(entry.emotion)}</span>
            {(entry.emotion || "neutral").toUpperCase()}
          </span>
          {onEdit && (
            <button
              className="fractal-action-btn"
              onClick={isEditing ? cancelEditing : startEditing}
              aria-label={isEditing ? "Cancel editing" : "Edit entry"}
              disabled={isSaving}
            >
              {isEditing ? "Cancel" : "Edit"}
            </button>
          )}
          {isEditing && onEdit && (
            <button
              className="fractal-action-btn fractal-action-btn-save"
              onClick={saveEditing}
              aria-label="Save entry"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          )}
          {onDelete && (
            <button
              className="fractal-delete-btn"
              onClick={() => onDelete(entry.id)}
              aria-label="Delete entry"
              disabled={isSaving}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 6l12 12" />
                <path d="M18 6l-12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="swirling-light-text-container">
        {isEditing ? (
          <textarea
            className="journal-edit-input"
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            rows={5}
            aria-label="Edit journal entry text"
          />
        ) : (
          <p className="swirling-light-text">{entry.text}</p>
        )}
      </div>

      {editError && <p className="journal-edit-error">{editError}</p>}

      {/* {entry.keywords.length > 0 && (
        <div className="crystallized-tags">
          {entry.keywords.map((kw) => (
            <span key={kw} className="crystallized-tag">
              {kw}
            </span>
          ))}
        </div>
      )} */}

      {/* {entry.topics.length > 0 && (
        <div className="crystallized-tags topics">
          {entry.topics.map((t) => (
            <span key={t} className="crystallized-tag topic-tag">
              📌 {t}
            </span>
          ))}
        </div>
      )} */}
    </article>
  );
}
