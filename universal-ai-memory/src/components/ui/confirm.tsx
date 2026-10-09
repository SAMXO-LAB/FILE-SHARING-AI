"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Button } from "./button";
import { Input, Label } from "./input";
import { Dialog, DialogContent } from "./overlay";

interface ConfirmOpts { title: string; description?: string; confirmLabel?: string; danger?: boolean }
interface PromptOpts { title: string; description?: string; label: string; initial?: string; confirmLabel?: string; placeholder?: string; maxLength?: number }

interface Api {
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  prompt: (o: PromptOpts) => Promise<string | null>;
}
const Ctx = createContext<Api | null>(null);
export const useDialogs = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDialogs must be used inside DialogProvider");
  return v;
};

type State = { kind: "confirm"; opts: ConfirmOpts } | { kind: "prompt"; opts: PromptOpts } | null;

/** Promise-based confirm / prompt dialogs (accessible replacements for window.confirm / window.prompt). */
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(null);
  const [value, setValue] = useState("");
  const resolver = useRef<((v: unknown) => void) | null>(null);

  const open = useCallback(<T,>(s: NonNullable<State>, initial = "") => new Promise<T>((resolve) => {
    resolver.current = resolve as (v: unknown) => void;
    setValue(initial);
    setState(s);
  }), []);
  const close = (result: unknown) => { resolver.current?.(result); resolver.current = null; setState(null); };

  const api = useMemo<Api>(() => ({
    confirm: (opts) => open<boolean>({ kind: "confirm", opts }),
    prompt: (opts) => open<string | null>({ kind: "prompt", opts }, opts.initial ?? ""),
  }), [open]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <Dialog open={state !== null} onOpenChange={(o) => { if (!o) close(state?.kind === "confirm" ? false : null); }}>
        {state && (
          <DialogContent title={state.opts.title} description={state.opts.description} hideClose>
            {state.kind === "prompt" && (
              <form id="prompt-form" onSubmit={(e) => { e.preventDefault(); if (value.trim()) close(value.trim()); }}>
                <Label htmlFor="prompt-input">{state.opts.label}</Label>
                <Input id="prompt-input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} maxLength={state.opts.maxLength ?? 200} placeholder={state.opts.placeholder} />
              </form>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => close(state.kind === "confirm" ? false : null)}>Cancel</Button>
              {state.kind === "confirm" ? (
                <Button variant={state.opts.danger ? "danger" : "primary"} onClick={() => close(true)}>{state.opts.confirmLabel ?? "Confirm"}</Button>
              ) : (
                <Button type="submit" form="prompt-form" disabled={!value.trim()}>{state.opts.confirmLabel ?? "Save"}</Button>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Ctx.Provider>
  );
}
