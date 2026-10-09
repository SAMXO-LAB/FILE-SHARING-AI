import "server-only";
import { cache } from "react";
import { supabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_THEME_STATE, themeFromPrefs, type ThemeState } from "@/lib/theme-state";
import type { Preferences } from "@/lib/types";

/** Theme for the current request (signed-in preferences, or the default for public pages). */
export const getThemeState = cache(async (): Promise<ThemeState> => {
  if (!supabaseConfigured()) return DEFAULT_THEME_STATE;
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return DEFAULT_THEME_STATE;
    const [{ data: prefs }, { data: custom }] = await Promise.all([
      supabase.from("user_preferences").select("*").eq("user_id", auth.user.id).maybeSingle(),
      supabase.from("user_themes").select("tokens").eq("user_id", auth.user.id).limit(1).maybeSingle(),
    ]);
    return prefs ? themeFromPrefs(prefs as Preferences, custom) : DEFAULT_THEME_STATE;
  } catch {
    return DEFAULT_THEME_STATE;
  }
});
