import { useEffect, useRef } from 'react';

// Mounted modals, oldest first. Escape only closes the top-most one so a
// confirmation stacked over a form doesn't dismiss both at once.
const stack: Array<{ close: () => void }> = [];

let listening = false;
const onKeyDown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape' || stack.length === 0) return;
  e.preventDefault();
  stack[stack.length - 1].close();
};

/**
 * Standard modal dismissal: Escape closes the top-most modal, and clicking the
 * backdrop closes that modal.
 *
 * Returns a ref for the modal's backdrop element. A click counts as a backdrop
 * click only when it both starts and ends on the backdrop, so a drag that
 * begins inside the dialog (selecting text, dragging a slider) never closes it.
 *
 *   const backdrop = useModalDismiss(onClose);
 *   <div ref={backdrop} className="fixed inset-0 …">…</div>
 */
export const useModalDismiss = <T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  enabled: boolean = true,
) => {
  const ref = useRef<T>(null);
  const pressedBackdrop = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const entry = { close: () => closeRef.current() };
    stack.push(entry);
    if (!listening) { document.addEventListener('keydown', onKeyDown); listening = true; }

    const el = ref.current;
    const handlePointerDown = (e: PointerEvent) => { pressedBackdrop.current = e.target === el; };
    const handleClick = (e: MouseEvent) => {
      if (e.target === el && pressedBackdrop.current) closeRef.current();
      pressedBackdrop.current = false;
    };
    el?.addEventListener('pointerdown', handlePointerDown);
    el?.addEventListener('click', handleClick);

    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0 && listening) { document.removeEventListener('keydown', onKeyDown); listening = false; }
      el?.removeEventListener('pointerdown', handlePointerDown);
      el?.removeEventListener('click', handleClick);
    };
  }, [enabled]);

  return ref;
};

export default useModalDismiss;
