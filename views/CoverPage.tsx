"use client";

/**
 * CoverPage — Hero landing page with waveform animation,
 * floating glassmorphism cards, and CTA buttons.
 */

import type { JournalEntry } from "@/utils/storage";

/**
 * Deterministic pseudo-random height based on index.
 * Values are rounded for inline styles so SSR and the browser serialize identical strings
 * (avoids hydration mismatch from float precision differences).
 */
function seededHeightPx(index: number, offset: number = 0): string {
  const x = Math.sin((index + offset) * 9.1 + 7.3) * 10000;
  const h = (x - Math.floor(x)) * 12 + 4;
  return `${h.toFixed(2)}px`;
}

interface CoverPageProps {
  readonly entriesSorted: JournalEntry[];
  readonly onStartRecording: () => void;
  readonly onViewInsights: () => void;
}

export default function CoverPage({ entriesSorted, onStartRecording, onViewInsights }: CoverPageProps) {
  return (
    <div className="page-cover ">
      {/* Glassmorphism Floating Cards */}
      <div className="floating-card card-left">
        <h3 className="floating-card-title">Today&apos;s Reflection</h3>
        <p className="floating-card-text" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {entriesSorted.length > 0 ? entriesSorted[0].text : "No reflections recorded today. Tap the microphone to start."}
        </p>
      </div>
      
      <div className="floating-card card-right">
        <h3 className="floating-card-title">AI Insight</h3>
        <p className="floating-card-text">
          {entriesSorted.length > 0 
            ? `Your mood today appears to be ${entriesSorted[0].emotion}.` 
            : "Start journaling to see your mood."}
        </p>
      </div>

      {/* Central Hero Content */}
      <div className="cover-hero">
        <h1 className="cover-title-script">MindMirror</h1>
        <p className="cover-subtitle-clean">A Personal Reflection Journal</p>
      </div>

      {/* Glowing Mic & Waveform */}
      <div className="cover-interactive">
         <div className="cover-waveform-glow">
          {[...Array(12)].map((_, i) => (
            <div
              key={`L-${i}`}
              className="glowing-wave-bar"
              style={{ animationDelay: `${(i * 0.1).toFixed(1)}s`, height: seededHeightPx(i) }}
            />
          ))}
        </div>
        
        <div className="glowing-mic-container" onClick={onStartRecording}>
          <div className="mic-glow-orb" />
          <svg viewBox="0 0 24 24" fill="currentColor" className="glowing-mic-icon">
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/>
          </svg>
        </div>

        <div className="cover-waveform-glow">
          {[...Array(12)].map((_, i) => (
            <div
              key={`R-${i}`}
              className="glowing-wave-bar"
              style={{ animationDelay: `${((11 - i) * 0.1).toFixed(1)}s`, height: seededHeightPx(i, 12) }}
            />
          ))}
        </div>
      </div>

      {/* CTA Buttons */}
      <div className="cover-cta-row">
        <button className="gold-btn gold-btn-filled" onClick={onStartRecording}>
          Start Recording
        </button>
        <button className="gold-btn gold-btn-outline" onClick={onViewInsights}>
          View Insights
        </button>
      </div>

      {/* Constellation Lines & Accents */}
      <div className="constellation-layer">
        <svg className="constellation-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M 0,60 Q 20,40 40,70 T 100,20" className="constellation-path" />
          
        </svg>
        <svg className="constellation-svg constellation-svg-bottom" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M 10,80 Q 30,95 60,80 T 100,50" className="constellation-path" />
        </svg>
      </div>

      {/* Floating Icons */}
      <div className="floating-icon icon-book">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </svg>
      </div>
      <div className="floating-icon icon-gear">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </div>
    </div>
  );
}
