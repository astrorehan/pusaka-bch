// Scroll-reveal and typography motion helpers for the landing page.
// Uses IntersectionObserver for one-time reveals.
import { useEffect, useRef, useState } from 'react';

export function useInView<T extends Element>(threshold = 0.02) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window);
  });

  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: '0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);

  return [ref, seen] as const;
}

/**
 * The words of a heading, each resolving like ink once `seen` (lines split on \n).
 * Purely visual: the heading that holds it carries the text as its aria-label.
 */
export function SplitWords({ text, seen, delayBase = 0, stepMs = 60 }: { text: string; seen: boolean; delayBase?: number; stepMs?: number }) {
  const lines = text.split('\n').map((line) => line.split(' '));
  // each word's place in the whole heading, for its delay
  const firsts = lines.map((_, li) => lines.slice(0, li).reduce((n, words) => n + words.length, 0));
  return (
    <>
      {lines.map((words, li) => (
        <span key={li} className="word-line" aria-hidden="true">
          {words.map((word, wi) => (
            <span key={wi} className="word-clip">
              <span className={`word-up${seen ? ' is-seen' : ''}`} style={{ animationDelay: `${Math.min(300, delayBase + (firsts[li] + wi) * stepMs)}ms` }}>
                {word}
              </span>
              {wi < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}
