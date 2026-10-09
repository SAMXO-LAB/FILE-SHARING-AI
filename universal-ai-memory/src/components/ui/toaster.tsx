"use client";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{ classNames: { toast: "glass glass-strong !text-fg !border-line", description: "!text-muted", actionButton: "!bg-accent !text-accent-fg" } }}
    />
  );
}
