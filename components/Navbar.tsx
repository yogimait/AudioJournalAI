"use client";

/**
 * Navbar — Top navigation bar for MindMirror.
 * Displays logo, page links, and quick-action mic icon.
 */

export interface NavPage {
  id: string;
  label: string;
}

interface NavbarProps {
  readonly pages: NavPage[];
  readonly currentPage: number;
  readonly onNavigate: (index: number) => void;
}

export default function Navbar({ pages, currentPage, onNavigate }: NavbarProps) {
  return (
    <nav className="top-nav" aria-label="Main navigation">
      <div className="nav-logo">
        <svg className="nav-logo-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
        </svg>
        <span className="nav-logo-text">MINDMIRROR</span>
      </div>
      <div className="nav-links">
        {pages.map((page, i) => (
          <button
            key={page.id}
            className={`nav-link ${i === currentPage ? "nav-link-active" : ""}`}
            onClick={() => onNavigate(i)}
            aria-current={i === currentPage ? "page" : undefined}
          >
            {page.label}
          </button>
        ))}
      </div>
      <div className="nav-actions">
        <svg className="nav-mic-icon" viewBox="0 0 24 24" fill="currentColor" onClick={() => onNavigate(1)}>
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/>
        </svg>
      </div>
    </nav>
  );
}
