"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A sheet for sources and dossiers: from the right on a desk, from the bottom on a phone. It is a
 * modal dialog, so focus stays inside, Escape closes it, and focus returns to what opened it.
 */
export function Drawer({ open, onClose, title, eyebrow, children }: { open: boolean; onClose: () => void; title: string; eyebrow?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="drawer-title"
      className="fixed inset-0 m-0 ml-auto h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-ink/25 sm:w-[30rem] sm:p-3"
    >
      {open && (
        <div className="flex h-full animate-sheet flex-col overflow-hidden bg-card shadow-float sm:rounded-panel">
          <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
            <div className="min-w-0">
              {eyebrow && <p className="text-meta font-medium text-ink-3">{eyebrow}</p>}
              <h2 id="drawer-title" className="text-heading [overflow-wrap:anywhere]">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-wash hover:text-ink"
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>
        </div>
      )}
    </dialog>
  );
}
