"use client";

import { useEffect, useState } from "react";

type Choice = "light" | "dark" | "system";
const ORDER: Choice[] = ["system", "light", "dark"];

/**
 * Cycles system → light → dark. The choice is written to a cookie so the next
 * server render already carries data-theme, and applied to <html> at once so
 * nothing flashes.
 */
export function ThemeToggle({ initial, labels }: { initial: Choice; labels: Record<Choice, string> }) {
  const [choice, setChoice] = useState<Choice>(initial);

  useEffect(() => {
    const root = document.documentElement;
    if (choice === "system") delete root.dataset.theme;
    else root.dataset.theme = choice;
    document.cookie = `nouba_theme=${choice}; path=/; max-age=31536000; samesite=lax`;
  }, [choice]);

  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setChoice(next)}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] border border-rule-2 text-ink-2 hover:border-ink hover:text-ink"
      title={`${labels[choice]} → ${labels[next]}`}
      aria-label={labels[choice]}
    >
      {choice === "light" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" strokeLinecap="round" />
        </svg>
      ) : choice === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
        </svg>
      )}
    </button>
  );
}
