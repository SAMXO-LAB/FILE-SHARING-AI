"use client";
import { Toaster as Sonner } from "sonner";

/** Toasts sit top-right so they never cover the upload tray or the chat composer at the bottom. */
export function Toaster() {
  return (
    <Sonner
      position="top-right"
      offset={20}
      closeButton
      toastOptions={{
        unstyled: false,
        classNames: {
          toast: "!rounded-[calc(var(--radius)*0.85)] !border !border-[rgb(var(--line)/0.1)] !bg-card !text-fg !shadow-[var(--shadow-lg)] !font-sans",
          title: "!text-[13.5px] !font-medium",
          description: "!text-[13px] !text-muted",
          actionButton: "!bg-accent !text-accent-fg",
          closeButton: "!bg-card !text-muted !border-[rgb(var(--line)/0.12)]",
          success: "[&_[data-icon]]:!text-ok",
          error: "[&_[data-icon]]:!text-danger",
        },
      }}
    />
  );
}
