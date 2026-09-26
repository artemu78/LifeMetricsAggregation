import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { SELECTION_TOOLTIP } from "./timelineConfig";
import type { RecordItem } from "./timelineTypes";

function positionSelection(
  element: HTMLDivElement | null,
  clientX: number,
  clientY: number,
): void {
  if (!element) return;
  const leftHalf = clientX < window.innerWidth / 2;
  const upperHalf = clientY < window.innerHeight / 2;
  const maxWidth = Math.min(
    SELECTION_TOOLTIP.maxWidth,
    leftHalf
      ? window.innerWidth - clientX - SELECTION_TOOLTIP.edgePadding
      : clientX - SELECTION_TOOLTIP.edgePadding,
  );
  const maxHeight = Math.min(
    SELECTION_TOOLTIP.maxHeight,
    upperHalf
      ? window.innerHeight - clientY - SELECTION_TOOLTIP.edgePadding
      : clientY - SELECTION_TOOLTIP.edgePadding,
  );
  element.style.left = leftHalf
    ? `${clientX + SELECTION_TOOLTIP.pointerOffset}px`
    : "auto";
  element.style.right = leftHalf
    ? "auto"
    : `${window.innerWidth - clientX + SELECTION_TOOLTIP.pointerOffset}px`;
  element.style.top = upperHalf
    ? `${clientY + SELECTION_TOOLTIP.pointerOffset}px`
    : "auto";
  element.style.bottom = upperHalf
    ? "auto"
    : `${window.innerHeight - clientY + SELECTION_TOOLTIP.pointerOffset}px`;
  element.style.maxWidth = `${maxWidth}px`;
  element.style.maxHeight = `${maxHeight}px`;
}

export function useTimelineSelection() {
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const selectionRef = useRef<HTMLDivElement>(null);
  const selectionPointerRef = useRef<{ x: number; y: number } | null>(null);
  const selectAtCursor = useCallback(
    (item: RecordItem, event: MouseEvent<Element>) => {
      selectionPointerRef.current = { x: event.clientX, y: event.clientY };
      positionSelection(selectionRef.current, event.clientX, event.clientY);
      setSelected((current) =>
        current?.kind === item.kind &&
        current.start === item.start &&
        current.detail === item.detail
          ? current
          : item,
      );
    },
    [],
  );
  useLayoutEffect(() => {
    if (selected && selectionPointerRef.current) {
      positionSelection(
        selectionRef.current,
        selectionPointerRef.current.x,
        selectionPointerRef.current.y,
      );
    }
  }, [selected]);
  const clearSelection = () => {
    selectionPointerRef.current = null;
    setSelected(null);
  };
  return { selected, selectionRef, selectAtCursor, clearSelection };
}
