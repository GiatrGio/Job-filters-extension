import { useLayoutEffect, useRef, useState } from "react";

// Minimum distance between the bubble and the side panel's edges.
const EDGE_GAP = 8;
// The arrow is a 12px (h-3 w-3) rotated square, kept clear of the corners.
const ARROW_SIZE = 12;
const ARROW_INSET = 12;

export interface CoachBubblePlacement {
  // Bubble's left edge relative to the anchor's (the anchor is the bubble's
  // `relative` containing block).
  left: number;
  // Arrow's left edge relative to the bubble.
  arrowLeft: number;
}

// Keeps the bubble inside the side panel however narrow the user has made it.
// It prefers hanging right-aligned with its control, slides sideways when that
// would spill past an edge, and moves the arrow so it still points at the
// control's center.
export function placeCoachBubble({
  anchorLeft,
  anchorWidth,
  bubbleWidth,
  viewportWidth,
}: {
  anchorLeft: number;
  anchorWidth: number;
  bubbleWidth: number;
  viewportWidth: number;
}): CoachBubblePlacement {
  const preferred = anchorLeft + anchorWidth - bubbleWidth;
  const maxLeft = viewportWidth - EDGE_GAP - bubbleWidth;
  // If it can't fit at all, pin the left edge so the text start stays visible.
  const bubbleLeft = Math.max(EDGE_GAP, Math.min(preferred, maxLeft));
  const anchorCenter = anchorLeft + anchorWidth / 2;
  const arrowLeft = Math.min(
    Math.max(anchorCenter - bubbleLeft - ARROW_SIZE / 2, ARROW_INSET),
    bubbleWidth - ARROW_INSET - ARROW_SIZE,
  );
  return { left: bubbleLeft - anchorLeft, arrowLeft };
}

// One step of the first-run tour, rendered next to the control it describes
// (the caller supplies a `relative` wrapper, which the bubble measures to place
// itself). Only one is on screen at a time: "Got it" advances to the next,
// "Skip tutorial" ends the rest — and the counter tells the user how much is
// left before they commit to either.
export function CoachBubble({
  title,
  body,
  step,
  total,
  onNext,
  onSkip,
  placement = "below",
}: {
  title: string;
  body: string;
  step: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
  placement?: "above" | "below";
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<CoachBubblePlacement | null>(null);

  // Re-measure when the panel is resized, or when any control in the anchor's
  // row changes size (e.g. "Track this job" becoming "Tracked") — either can
  // move the anchor.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    const anchor = bubble?.parentElement;
    if (!bubble || !anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      setLayout(
        placeCoachBubble({
          anchorLeft: rect.left,
          anchorWidth: rect.width,
          bubbleWidth: bubble.offsetWidth,
          viewportWidth: document.documentElement.clientWidth,
        }),
      );
    };
    place();
    window.addEventListener("resize", place);
    // Not available in jsdom.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    for (const el of Array.from(anchor.parentElement?.children ?? [anchor])) {
      observer?.observe(el);
    }
    return () => {
      window.removeEventListener("resize", place);
      observer?.disconnect();
    };
  }, []);

  const verticalClass = placement === "above" ? "bottom-full mb-2" : "top-full mt-2";
  const arrowClass =
    placement === "above" ? "-bottom-1.5 border-b border-r" : "-top-1.5 border-l border-t";

  return (
    <div
      ref={bubbleRef}
      // Right-aligned until measured; the layout effect corrects it before paint.
      style={layout ? { left: layout.left } : { right: 0 }}
      className={`absolute z-20 w-64 max-w-[calc(100vw_-_1rem)] rounded-lg border border-primary/30 bg-card p-3 text-card-foreground shadow-lg ${verticalClass}`}
    >
      <div
        style={layout ? { left: layout.arrowLeft } : { right: ARROW_INSET }}
        className={`absolute h-3 w-3 rotate-45 border-primary/30 bg-card ${arrowClass}`}
      />
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</div>
      <div className="mt-2.5 flex items-center gap-2">
        {step < total && (
          <button
            onClick={onSkip}
            className="text-[11px] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Skip tutorial
          </button>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {step}/{total}
        </span>
        <button
          onClick={onNext}
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
