"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { applyThemeToDom, themeFromPrefs } from "@/lib/theme-state";
import type { Capabilities } from "@/lib/env";
import type { Preferences, Profile } from "@/lib/types";

interface AppValue {
  profile: Profile;
  email: string | null;
  prefs: Preferences;
  caps: Capabilities;
  customTokens: unknown;
  setCustomTokens: (t: unknown) => void;
  /** Saves preferences and applies appearance changes immediately. */
  updatePrefs: (patch: Partial<Preferences> & { privacy_acknowledged?: boolean }) => Promise<void>;
  /** Live preview without saving. */
  previewPrefs: (patch: Partial<Preferences>) => void;
  setProfile: (p: Profile) => void;
}

const Ctx = createContext<AppValue | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}

export function AppProvider({ profile: p0, email, prefs: pr0, caps, customTokens: c0, children }: { profile: Profile; email: string | null; prefs: Preferences; caps: Capabilities; customTokens: unknown; children: React.ReactNode }) {
  const [profile, setProfile] = useState(p0);
  const [prefs, setPrefs] = useState(pr0);
  const [customTokens, setCustomTokens] = useState<unknown>(c0);

  const previewPrefs = useCallback((patch: Partial<Preferences>) => {
    applyThemeToDom(themeFromPrefs({ ...prefs, ...patch }, { tokens: customTokens }));
  }, [prefs, customTokens]);

  const updatePrefs = useCallback(async (patch: Partial<Preferences> & { privacy_acknowledged?: boolean }) => {
    const before = prefs;
    const next = { ...prefs, ...patch } as Preferences;
    setPrefs(next); // optimistic
    applyThemeToDom(themeFromPrefs(next, { tokens: customTokens }));
    try {
      const r = await api<{ preferences: Preferences }>("/api/preferences", { method: "PATCH", body: patch });
      setPrefs(r.preferences);
    } catch (e) {
      setPrefs(before);
      applyThemeToDom(themeFromPrefs(before, { tokens: customTokens }));
      throw e;
    }
  }, [prefs, customTokens]);

  const value = useMemo<AppValue>(() => ({ profile, email, prefs, caps, customTokens, setCustomTokens, updatePrefs, previewPrefs, setProfile }), [profile, email, prefs, caps, customTokens, updatePrefs, previewPrefs]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
