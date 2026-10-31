import { useEffect, useRef } from "react";

/** Keep a native <dialog> in sync with an open flag. */
export function useDialog(open, onClose) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    function handleClose() {
      onCloseRef.current?.();
    }

    dialog.addEventListener("close", handleClose);

    try {
      if (open && !dialog.open) dialog.showModal();
      else if (!open && dialog.open) dialog.close();
    } catch {
      /* ignore InvalidStateError from overlapping open/close */
    }

    return () => dialog.removeEventListener("close", handleClose);
  }, [open]);

  return ref;
}
