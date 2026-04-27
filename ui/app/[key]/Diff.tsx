"use client";

import { diffLines } from "diff";

/**
 * Minimal unified line diff. Green for additions, red for deletions, dim for
 * context. No external diff-viewer component — keeps the visual register
 * matching the rest of the panel theme (monospace, CSS vars from globals).
 */
export function Diff({ from, to }: { from: string; to: string }) {
  const parts = diffLines(from, to);

  if (parts.length === 1 && !parts[0].added && !parts[0].removed) {
    return <span className="dim">no change</span>;
  }

  return (
    <pre style={{ margin: 0 }}>
      {parts.map((part, i) => {
        const lines = part.value.replace(/\n$/, "").split("\n");
        const prefix = part.added ? "+ " : part.removed ? "- " : "  ";
        const color = part.added
          ? "var(--good)"
          : part.removed
            ? "var(--bad)"
            : "var(--fg-dim)";
        const bg = part.added
          ? "rgba(63, 185, 80, 0.08)"
          : part.removed
            ? "rgba(248, 81, 73, 0.08)"
            : "transparent";
        return (
          <span key={i} style={{ display: "block", color, background: bg }}>
            {lines.map((line, j) => (
              <span key={j} style={{ display: "block" }}>
                {prefix}
                {line}
              </span>
            ))}
          </span>
        );
      })}
    </pre>
  );
}
