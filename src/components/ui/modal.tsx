"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
};

export function Modal({ open, title, description, onClose, footer, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="modal-title"
      className="border-linha bg-superficie-alta text-texto shadow-elevado m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border backdrop:bg-transparent"
    >
      <header className="border-linha flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="flex flex-col gap-1">
          <h2 id="modal-title" className="font-display text-lg">
            {title}
          </h2>
          {description && <p className="text-texto-fraco text-sm">{description}</p>}
        </div>
        <Button variant="ghost" size="sm" aria-label="Fechar" onClick={onClose} className="-mr-2">
          ✕
        </Button>
      </header>
      <div className="text-md px-5 py-4">{children}</div>
      {footer && (
        <footer className="border-linha flex justify-end gap-2 border-t px-5 py-3">{footer}</footer>
      )}
    </dialog>
  );
}
