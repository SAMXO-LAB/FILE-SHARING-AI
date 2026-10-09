"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { useApp } from "./app-context";

interface Batch { id: string; status: "pending" | "processing" | "completed" | "completed_with_warnings" | "failed"; display_name: string | null; error: string | null; warnings: string[] }

/**
 * Follows chat imports in the background so a failure is reported wherever the user is in the app.
 * It only polls while an import is running (started by the wizard, or found on load).
 */
export function ImportWatcher() {
  const { prefs } = useApp();
  const notifyFailures = useRef(prefs.notify_import_failures);
  useEffect(() => { notifyFailures.current = prefs.notify_import_failures; }, [prefs.notify_import_failures]);
  const seen = useRef(new Map<string, Batch["status"]>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    async function tick(first = false) {
      if (stopped.current) return;
      let again = false;
      try {
        const { batches } = await api<{ batches: Batch[] }>("/api/imports");
        for (const b of batches) {
          const before = seen.current.get(b.id);
          seen.current.set(b.id, b.status);
          if (b.status === "pending" || b.status === "processing") again = true;
          const settledNow = before !== undefined && (before === "pending" || before === "processing") && b.status !== before;
          if (!settledNow || !notifyFailures.current) continue;
          const name = b.display_name ?? "Your import";
          if (b.status === "failed") toast.error(`${name} failed`, { description: b.error ?? undefined });
          else if (b.status === "completed_with_warnings") toast.message(`${name} finished with notes`, { description: b.warnings[0] });
        }
      } catch { /* transient */ }
      if (again && !stopped.current) timer.current = setTimeout(() => void tick(), 3000);
      else if (first) seen.current = new Map(seen.current);
    }
    const start = () => { if (timer.current) clearTimeout(timer.current); void tick(); };
    void tick(true);
    window.addEventListener("memory:imports-changed", start);
    return () => { stopped.current = true; if (timer.current) clearTimeout(timer.current); window.removeEventListener("memory:imports-changed", start); };
  }, []);
  return null;
}
