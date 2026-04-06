"use client";

/**
 * BookLayout — horizontal page navigation like a leather-bound journal.
 * CSS scroll-snap for smooth page transitions.
 * Pages: Cover → Record → Entries → Insights → Journey → About
 */

import { useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import Navbar from "@/components/Navbar";

export interface BookPage {
  id: string;
  label: string;
  content: ReactNode;
  fullBleed?: boolean;
  nebulaPage?: boolean;
  wide?: boolean;
}

export type ScrollToPageFn = (index: number) => void;

interface BookLayoutProps {
  readonly pages: BookPage[];
  readonly onNavigateRef?: (fn: ScrollToPageFn) => void;
}

export default function BookLayout({ pages, onNavigateRef }: BookLayoutProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const targetScrollLeftRef = useRef(0);
  const [currentPage, setCurrentPage] = useState(0);

  const animateScrollTo = useCallback((targetLeft: number, durationMs: number) => {
    const node = scrollRef.current;
    if (!node) return;

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const startLeft = node.scrollLeft;
    const delta = targetLeft - startLeft;
    if (Math.abs(delta) < 1) {
      node.scrollLeft = targetLeft;
      isProgrammaticScrollRef.current = false;
      return;
    }

    const startTime = performance.now();
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = easeInOutCubic(progress);
      node.scrollLeft = startLeft + delta * eased;

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(frame);
      } else {
        node.scrollLeft = targetLeft;
        isProgrammaticScrollRef.current = false;
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(frame);
  }, []);

  const scrollToPage = useCallback(
    (index: number) => {
      if (scrollRef.current) {
        const pageWidth = scrollRef.current.clientWidth;
        const boundedIndex = Math.max(0, Math.min(index, pages.length - 1));
        const targetLeft = pageWidth * boundedIndex;
        const deltaPages = Math.abs(targetLeft - scrollRef.current.scrollLeft) / pageWidth;
        const durationMs = Math.min(780, Math.max(320, 260 + deltaPages * 190));

        isProgrammaticScrollRef.current = true;
        targetScrollLeftRef.current = targetLeft;
        setCurrentPage(boundedIndex);
        animateScrollTo(targetLeft, durationMs);
      }
    },
    [animateScrollTo, pages.length]
  );

  useEffect(() => {
    if (onNavigateRef) onNavigateRef(scrollToPage);
  }, [onNavigateRef, scrollToPage]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const pageWidth = scrollRef.current.clientWidth;
      const scrollLeft = scrollRef.current.scrollLeft;

      if (isProgrammaticScrollRef.current) {
        if (Math.abs(scrollLeft - targetScrollLeftRef.current) <= 2) {
          isProgrammaticScrollRef.current = false;
        }
        return;
      }

      const page = Math.round(scrollLeft / pageWidth);
      if (page !== currentPage) {
        setCurrentPage(page);
      }
    }
  }, [currentPage]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const goNext = useCallback(() => {
    if (currentPage < pages.length - 1) {
      scrollToPage(currentPage + 1);
    }
  }, [currentPage, pages.length, scrollToPage]);

  const goPrev = useCallback(() => {
    if (currentPage > 0) {
      scrollToPage(currentPage - 1);
    }
  }, [currentPage, scrollToPage]);

  return (
    <div className="app-wrapper">
      <Navbar pages={pages} currentPage={currentPage} onNavigate={scrollToPage} />

      {/* Scroll container with pages */}
      <div
        className="book-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {pages.map((page, index) => (
          <section
            key={page.id}
            className={`book-page ${index === currentPage ? "book-page-active" : ""}`}
            id={`page-${page.id}`}
          >
            <div
              className={
                page.nebulaPage
                  ? "book-nebula-inner"
                  : page.fullBleed
                    ? "book-cover-inner"
                    : page.wide
                      ? "book-page-inner book-page-wide"
                      : "book-page-inner"
              }
            >
              {page.content}
            </div>
            {/* Page texture overlay */}
            {!page.nebulaPage && <div className="book-page-texture" />}
          </section>
        ))}
      </div>

      {/* Page navigation arrows */}
      <div className="book-arrows">
        <button
          className="book-arrow book-arrow-left"
          onClick={goPrev}
          disabled={currentPage === 0}
          aria-label="Previous page"
        >
          ‹
        </button>
        <span className="book-page-indicator">
          {currentPage + 1} / {pages.length}
        </span>
        <button
          className="book-arrow book-arrow-right"
          onClick={goNext}
          disabled={currentPage === pages.length - 1}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
}
