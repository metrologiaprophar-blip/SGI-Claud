"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/** Botón que abre un modal con un formulario; se cierra cuando el ActionForm interno termina bien. */
export function ModalButton({
  label,
  title,
  children,
  variant = "primary",
  size = "md",
  testId,
}: {
  label: string;
  title: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md";
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = container.current;
    if (!el || !open) return;
    const close = () => setOpen(false);
    el.addEventListener("action-form:success", close);
    return () => el.removeEventListener("action-form:success", close);
  }, [open]);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        data-testid={testId}
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} size="lg">
        <div ref={container} key={key}>
          {children}
        </div>
      </Modal>
    </>
  );
}
