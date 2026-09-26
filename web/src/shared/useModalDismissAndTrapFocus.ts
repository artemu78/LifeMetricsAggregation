import { useEffect, useRef } from "react";

export function useModalDismissAndTrapFocus(
  modalRef: React.RefObject<HTMLDialogElement | null>,
  onClose: () => void,
  onKeyDown?: (event: KeyboardEvent) => void,
) {
  const handlersRef = useRef({ onClose, onKeyDown });
  useEffect(() => {
    handlersRef.current = { onClose, onKeyDown };
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handlersRef.current.onClose();
        return;
      }
      handlersRef.current.onKeyDown?.(event);
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !focusable.includes(active)) {
        event.preventDefault();
        const target = event.shiftKey ? last : first;
        target.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        handlersRef.current.onClose();
      }
    };

    window.addEventListener("keydown", handleKey);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [modalRef]);
}
