/**
 * Built-in profile avatars (original illustrations drawn in code, see components/ui/avatar.tsx).
 * Stored in profiles.avatar_url as "avatar:<id>". Nothing is uploaded, so there's no image to moderate.
 */
export type AvatarKind = "blob" | "cat" | "bear" | "bunny" | "robot" | "ghost" | "alien" | "owl" | "panda" | "frog" | "chick" | "fox";

export interface AvatarDef { id: string; label: string; kind: AvatarKind; bg: [string, string]; body: string; detail: string }

export const AVATARS: AvatarDef[] = [
  { id: "sky-blob", label: "Sky", kind: "blob", bg: ["#BFDBFE", "#2F8CFF"], body: "#F8FAFF", detail: "#1E4FD8" },
  { id: "mint-cat", label: "Mint cat", kind: "cat", bg: ["#BBF7D0", "#10B981"], body: "#FDF6EC", detail: "#F59E0B" },
  { id: "honey-bear", label: "Honey bear", kind: "bear", bg: ["#FDE68A", "#F59E0B"], body: "#B7794B", detail: "#7C4A26" },
  { id: "lilac-bunny", label: "Lilac bunny", kind: "bunny", bg: ["#E9D5FF", "#8B5CF6"], body: "#FFFFFF", detail: "#F9A8D4" },
  { id: "steel-robot", label: "Robot", kind: "robot", bg: ["#C7D2FE", "#4F46E5"], body: "#E2E8F0", detail: "#22D3EE" },
  { id: "night-ghost", label: "Ghost", kind: "ghost", bg: ["#1E293B", "#0B1E4D"], body: "#F1F5F9", detail: "#93C5FD" },
  { id: "lime-alien", label: "Alien", kind: "alien", bg: ["#D9F99D", "#65A30D"], body: "#A3E635", detail: "#365314" },
  { id: "dusk-owl", label: "Owl", kind: "owl", bg: ["#FED7AA", "#EA580C"], body: "#9A6B4F", detail: "#FDE68A" },
  { id: "bamboo-panda", label: "Panda", kind: "panda", bg: ["#A7F3D0", "#059669"], body: "#FFFFFF", detail: "#1F2937" },
  { id: "pond-frog", label: "Frog", kind: "frog", bg: ["#99F6E4", "#0D9488"], body: "#4ADE80", detail: "#14532D" },
  { id: "sunny-chick", label: "Chick", kind: "chick", bg: ["#BAE6FD", "#0EA5E9"], body: "#FDE047", detail: "#F97316" },
  { id: "ember-fox", label: "Fox", kind: "fox", bg: ["#FECACA", "#E11D48"], body: "#F97316", detail: "#FFF7ED" },
];

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

/** Accepted values for profiles.avatar_url from the API. */
export const AVATAR_VALUE = /^avatar:[a-z0-9-]{1,32}$/;

export function isKnownAvatarValue(v: string): boolean {
  return AVATAR_VALUE.test(v) && BY_ID.has(v.slice("avatar:".length));
}

/** Stable default per user (so everyone has a friendly face before picking one). */
export function defaultAvatarFor(seed: string): AvatarDef {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return AVATARS[(h >>> 0) % AVATARS.length]!;
}

export function resolveAvatar(value: string | null | undefined, seed: string): AvatarDef {
  if (value && value.startsWith("avatar:")) {
    const a = BY_ID.get(value.slice("avatar:".length));
    if (a) return a;
  }
  return defaultAvatarFor(seed);
}
