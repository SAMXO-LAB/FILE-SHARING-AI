"use client";

/**
 * Friend notifications, kept per device (this browser): in-app pop-ups, system notifications from
 * the browser (shown while Share Files AI is open in a tab, even in the background) and a soft sound.
 */
export interface NotifySettings { popups: boolean; desktop: boolean; sound: boolean }
const KEY = "sf:notify";
const DEFAULTS: NotifySettings = { popups: true, desktop: true, sound: true };
export const NOTIFY_CHANGED = "memory:notify-settings";

export function getNotifySettings(): NotifySettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<NotifySettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function setNotifySettings(patch: Partial<NotifySettings>): NotifySettings {
  const next = { ...getNotifySettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: keep for this page only */ }
  window.dispatchEvent(new Event(NOTIFY_CHANGED));
  return next;
}

export type DesktopState = "unsupported" | "default" | "granted" | "denied";
export function desktopState(): DesktopState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Must be called from a click (browsers only show the permission prompt for a user gesture). */
export async function enableDesktopNotifications(): Promise<DesktopState> {
  if (desktopState() === "unsupported") return "unsupported";
  const result = await Notification.requestPermission();
  if (result === "granted") setNotifySettings({ desktop: true });
  window.dispatchEvent(new Event(NOTIFY_CHANGED));
  return result;
}

/** Shows a system notification when allowed and this tab isn't the one being looked at. */
export function showDesktop(title: string, body: string, opts: { tag?: string; onClick?: () => void; force?: boolean } = {}) {
  const s = getNotifySettings();
  if (!s.desktop || desktopState() !== "granted") return false;
  if (!opts.force && document.visibilityState === "visible" && document.hasFocus()) return false;
  try {
    const n = new Notification(title, { body, tag: opts.tag, icon: "/icon.svg", badge: "/icon.svg" });
    n.onclick = () => { window.focus(); opts.onClick?.(); n.close(); };
    return true;
  } catch {
    return false; // some mobile browsers only allow notifications from a service worker
  }
}

let ctx: AudioContext | null = null;
/** A short, soft two-note chime (no audio files needed). */
export function playPing(kind: "receive" | "send" = "receive") {
  if (!getNotifySettings().sound) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    const notes = kind === "receive" ? [880, 1320] : [660, 990];
    notes.forEach((freq, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      const t = ctx!.currentTime + i * 0.11;
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(ctx!.destination);
      o.start(t);
      o.stop(t + 0.3);
    });
  } catch { /* audio blocked until the user interacts with the page */ }
}
