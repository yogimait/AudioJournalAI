"use client";

/**
 * EntriesPage — Displays all journal entries as JournalCard components.
 */

import JournalCard from "@/components/JournalCard";
import type { JournalEntry } from "@/utils/storage";

interface EntriesPageProps {
  readonly entries: JournalEntry[];
  readonly entriesSorted: JournalEntry[];
  readonly isLoadingEntries: boolean;
  readonly onDeleteEntry: (id: string) => void;
  readonly onEditEntry: (id: string, text: string) => Promise<JournalEntry>;
}

export default function EntriesPage({
  entries,
  entriesSorted,
  isLoadingEntries,
  onDeleteEntry,
  onEditEntry,
}: EntriesPageProps) {
  return (
    <div className="page-entries-nebula">
      <div className="glass-board-nebula">
        <div className="entries-header-nebula">
          <div className="entries-header-text">
            <h2 className="solidified-light-title">Journal Entries</h2>
            <p className="glowing-numbers-text">
              {isLoadingEntries
                ? "Loading your entries…"
                : entries.length === 0
                  ? "Your journal is empty. Start by recording your first entry."
                  : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} recorded`}
            </p>
          </div>
          <div className="sprout-hologram">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 22v-9" />
              <path d="M12 13C8 13 5 10 5 6c0 0 4 0 7 7Z" />
              <path d="M12 13c4 0 7-3 7-7 0 0-4 0-7 7Z" />
            </svg>
          </div>
        </div>
        
        <div className="entries-list-shard-container">
          {entriesSorted.map((entry) => (
            <JournalCard
              key={entry.id}
              entry={entry}
              onDelete={onDeleteEntry}
              onEdit={onEditEntry}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
