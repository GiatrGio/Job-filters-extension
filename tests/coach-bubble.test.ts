/**
 * The tour bubble is 16rem wide but the side panel can be dragged much
 * narrower, so it has to place itself inside the panel instead of hanging
 * off its control and getting clipped.
 */
import { describe, expect, it } from "vitest";
import { placeCoachBubble } from "@/sidepanel/components/CoachBubble";

const BUBBLE = 256;

// Where the bubble lands in panel coordinates, plus where its arrow points.
function place(anchorLeft: number, anchorWidth: number, viewportWidth: number) {
  const { left, arrowLeft } = placeCoachBubble({
    anchorLeft,
    anchorWidth,
    bubbleWidth: BUBBLE,
    viewportWidth,
  });
  const bubbleLeft = anchorLeft + left;
  return { bubbleLeft, bubbleRight: bubbleLeft + BUBBLE, arrowCenter: bubbleLeft + arrowLeft + 6 };
}

describe("placeCoachBubble", () => {
  it("hangs right-aligned under its control when the panel is wide enough", () => {
    const p = place(480, 100, 600);
    expect(p.bubbleRight).toBe(580);
    expect(p.arrowCenter).toBe(530);
  });

  it("slides right to stay inside a narrow panel", () => {
    // The reported case: "Cover letter" sits mid-row, so a right-aligned
    // bubble would start left of the panel.
    const p = place(120, 110, 370);
    expect(p.bubbleLeft).toBe(8);
    expect(p.bubbleRight).toBeLessThanOrEqual(362);
    expect(p.arrowCenter).toBe(175);
  });

  it("slides left when its control touches the right edge", () => {
    const p = place(300, 86, 390);
    expect(p.bubbleRight).toBe(382);
    expect(p.arrowCenter).toBe(343);
  });

  it("keeps the arrow off the rounded corners", () => {
    const p = place(0, 20, 400);
    expect(p.bubbleLeft).toBe(8);
    expect(p.arrowCenter - p.bubbleLeft).toBe(18);
  });
});
