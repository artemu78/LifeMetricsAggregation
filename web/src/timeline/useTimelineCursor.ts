import { useRef, useState, type RefObject } from "react";
import { MILLISECONDS_PER_MINUTE } from "../shared/timeConstants";
import {
  CURSOR_LABEL,
  LEFT,
  RIGHT,
  WIDTH,
  PLOT_WIDTH as plotWidth,
} from "./timelineConfig";

export function useTimelineCursor(
  chartRef: RefObject<SVGSVGElement | null>,
  start: number,
  end: number,
  x: (time: number) => number,
) {
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const cursorClientXRef = useRef<number | null>(null);
  const updateCursor = (clientX: number) => {
    cursorClientXRef.current = clientX;
    const bounds = chartRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    const pointerX = ((clientX - bounds.left) / bounds.width) * WIDTH;
    const fraction = Math.max(0, Math.min(1, (pointerX - LEFT) / plotWidth));
    const minute = Math.round(
      (fraction * (end - start)) / MILLISECONDS_PER_MINUTE,
    );
    setCursorTime(start + minute * MILLISECONDS_PER_MINUTE);
  };
  const cursorX = cursorTime === null ? null : x(cursorTime);
  const cursorLabelX =
    cursorX === null
      ? null
      : Math.max(
          LEFT,
          Math.min(
            WIDTH - RIGHT - CURSOR_LABEL.width,
            cursorX - CURSOR_LABEL.width / 2,
          ),
        );
  function clearCursor() {
    cursorClientXRef.current = null;
    setCursorTime(null);
  }
  function updateAfterScroll() {
    if (cursorClientXRef.current !== null)
      updateCursor(cursorClientXRef.current);
  }
  return {
    cursorTime,
    cursorX,
    cursorLabelX,
    updateCursor,
    clearCursor,
    updateAfterScroll,
  };
}
