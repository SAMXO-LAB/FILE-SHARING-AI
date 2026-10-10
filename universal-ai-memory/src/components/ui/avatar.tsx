"use client";
import { useId } from "react";
import { resolveAvatar, type AvatarDef } from "@/lib/avatars";
import { cn } from "@/lib/utils";

const INK = "#1F2937";

function Eyes({ y = 37, dx = 6, r = 2.3 }: { y?: number; dx?: number; r?: number }) {
  return (
    <g>
      <ellipse cx={32 - dx} cy={y} rx={r} ry={r * 1.15} fill={INK} />
      <ellipse cx={32 + dx} cy={y} rx={r} ry={r * 1.15} fill={INK} />
      <circle cx={32 - dx + 0.8} cy={y - 0.9} r={0.75} fill="#fff" />
      <circle cx={32 + dx + 0.8} cy={y - 0.9} r={0.75} fill="#fff" />
    </g>
  );
}
const Cheeks = ({ y = 42, color = "#FB7185" }: { y?: number; color?: string }) => (
  <g fill={color} opacity="0.45"><circle cx="22.5" cy={y} r="2.6" /><circle cx="41.5" cy={y} r="2.6" /></g>
);
const Smile = ({ y = 43, w = 3.5 }: { y?: number; w?: number }) => (
  <path d={`M${32 - w} ${y}q${w} ${w * 0.85} ${w * 2} 0`} fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
);

function Character({ a }: { a: AvatarDef }) {
  const { body, detail } = a;
  switch (a.kind) {
    case "cat":
      return (<g>
        <path d="M17 32 19.5 14 31 24Z M47 32 44.5 14 33 24Z" fill={body} />
        <path d="M20.5 27 21.5 18.5 27 23Z M43.5 27 42.5 18.5 37 23Z" fill={detail} opacity="0.8" />
        <circle cx="32" cy="38" r="16" fill={body} />
        <Eyes /><Cheeks />
        <path d="M30.6 41.2h2.8L32 42.9Z" fill={detail} />
        <path d="M29 44.2q1.5 1.4 3-.4 1.5 1.8 3 .4" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M14 39.5h6M14.5 43l5.5-1.4M50 39.5h-6M49.5 43 44 41.6" stroke="#94A3B8" strokeWidth="1.1" strokeLinecap="round" />
      </g>);
    case "bear":
      return (<g>
        <circle cx="19.5" cy="25" r="6.5" fill={body} /><circle cx="44.5" cy="25" r="6.5" fill={body} />
        <circle cx="19.5" cy="25" r="3.3" fill={detail} /><circle cx="44.5" cy="25" r="3.3" fill={detail} />
        <circle cx="32" cy="38" r="16" fill={body} />
        <ellipse cx="32" cy="43.5" rx="6.8" ry="5" fill="#E9C9A5" />
        <Eyes y={35.5} /><ellipse cx="32" cy="41.6" rx="2.3" ry="1.6" fill={detail} />
        <path d="M30 44.4q2 1.6 4 0" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
      </g>);
    case "bunny":
      return (<g>
        <ellipse cx="25" cy="16" rx="4.6" ry="11.5" transform="rotate(-10 25 16)" fill={body} />
        <ellipse cx="39" cy="16" rx="4.6" ry="11.5" transform="rotate(10 39 16)" fill={body} />
        <ellipse cx="25" cy="16.5" rx="2.1" ry="7.5" transform="rotate(-10 25 16)" fill={detail} />
        <ellipse cx="39" cy="16.5" rx="2.1" ry="7.5" transform="rotate(10 39 16)" fill={detail} />
        <circle cx="32" cy="39" r="15.5" fill={body} />
        <Eyes y={37.5} /><Cheeks y={42.5} color={detail} />
        <ellipse cx="32" cy="41.8" rx="1.7" ry="1.2" fill="#F472B6" />
        <path d="M30 43.8q2 1.5 4 0" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
      </g>);
    case "robot":
      return (<g>
        <path d="M32 14.5v6.5" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
        <circle cx="32" cy="13.2" r="2.8" fill={detail} />
        <rect x="16.5" y="21" width="31" height="28" rx="8.5" fill={body} />
        <rect x="13.5" y="31" width="3.5" height="8" rx="1.7" fill="#94A3B8" /><rect x="47" y="31" width="3.5" height="8" rx="1.7" fill="#94A3B8" />
        <rect x="21.5" y="29" width="21" height="11" rx="5.5" fill="#1E293B" />
        <rect x="24.5" y="32" width="5" height="5" rx="2.5" fill={detail} /><rect x="34.5" y="32" width="5" height="5" rx="2.5" fill={detail} />
        <rect x="26" y="43" width="12" height="2.6" rx="1.3" fill="#94A3B8" />
      </g>);
    case "ghost":
      return (<g>
        <path d="M17.5 53V36a14.5 14.5 0 0 1 29 0v17l-4.8-3.6-4.8 3.6-4.9-3.6-4.8 3.6-4.9-3.6Z" fill={body} />
        <Eyes y={35} r={2.4} /><Cheeks y={40} color={detail} />
        <ellipse cx="32" cy="42.4" rx="1.9" ry="2.3" fill={INK} />
      </g>);
    case "alien":
      return (<g>
        <path d="M25 25 20.5 14.5M39 25l4.5-10.5" stroke={detail} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="20.2" cy="13.8" r="2.6" fill={body} /><circle cx="43.8" cy="13.8" r="2.6" fill={body} />
        <ellipse cx="32" cy="37" rx="17" ry="15" fill={body} />
        <ellipse cx="25" cy="36" rx="4.3" ry="5.8" transform="rotate(-18 25 36)" fill={detail} />
        <ellipse cx="39" cy="36" rx="4.3" ry="5.8" transform="rotate(18 39 36)" fill={detail} />
        <circle cx="26" cy="34" r="1.2" fill="#fff" /><circle cx="40" cy="34" r="1.2" fill="#fff" />
        <path d="M29.5 44.5q2.5 1.8 5 0" fill="none" stroke={detail} strokeWidth="1.7" strokeLinecap="round" />
      </g>);
    case "owl":
      return (<g>
        <path d="M18 27 19 17l7.5 6.5Z M46 27 45 17l-7.5 6.5Z" fill={body} />
        <circle cx="32" cy="38" r="16" fill={body} />
        <circle cx="25.5" cy="36" r="6.4" fill={detail} /><circle cx="38.5" cy="36" r="6.4" fill={detail} />
        <circle cx="25.5" cy="36" r="3" fill={INK} /><circle cx="38.5" cy="36" r="3" fill={INK} />
        <circle cx="26.4" cy="35" r="0.9" fill="#fff" /><circle cx="39.4" cy="35" r="0.9" fill="#fff" />
        <path d="M29.8 41.5h4.4L32 45.5Z" fill="#F59E0B" />
        <path d="M24 48q2-1.6 4 0M36 48q2-1.6 4 0" fill="none" stroke="#7C4A26" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      </g>);
    case "panda":
      return (<g>
        <circle cx="19.5" cy="25" r="6.3" fill={detail} /><circle cx="44.5" cy="25" r="6.3" fill={detail} />
        <circle cx="32" cy="38" r="16" fill={body} />
        <ellipse cx="25.5" cy="37" rx="4.3" ry="5.3" transform="rotate(25 25.5 37)" fill={detail} />
        <ellipse cx="38.5" cy="37" rx="4.3" ry="5.3" transform="rotate(-25 38.5 37)" fill={detail} />
        <circle cx="26" cy="36.5" r="1.5" fill="#fff" /><circle cx="38" cy="36.5" r="1.5" fill="#fff" />
        <ellipse cx="32" cy="42.3" rx="2.2" ry="1.5" fill={detail} />
        <path d="M30 44.6q2 1.5 4 0" fill="none" stroke={detail} strokeWidth="1.5" strokeLinecap="round" />
        <Cheeks y={43} />
      </g>);
    case "frog":
      return (<g>
        <circle cx="23" cy="27" r="7" fill={body} /><circle cx="41" cy="27" r="7" fill={body} />
        <ellipse cx="32" cy="40" rx="17.5" ry="12.5" fill={body} />
        <circle cx="23" cy="26.5" r="4.4" fill="#fff" /><circle cx="41" cy="26.5" r="4.4" fill="#fff" />
        <circle cx="23.6" cy="27" r="2.2" fill={INK} /><circle cx="41.6" cy="27" r="2.2" fill={INK} />
        <path d="M22.5 41.5q9.5 7.5 19 0" fill="none" stroke={detail} strokeWidth="2" strokeLinecap="round" />
        <Cheeks y={39.5} />
      </g>);
    case "chick":
      return (<g>
        <path d="M30 22.5q-1-5 2.5-6.5-.5 3 1.5 5 1-3 4-3-2.5 2-2.5 5Z" fill={body} />
        <circle cx="32" cy="38" r="16" fill={body} />
        <Eyes y={35.5} /><Cheeks y={41} />
        <path d="M28.6 40.4 32 38.6l3.4 1.8L32 43.8Z" fill={detail} />
        <path d="M28.6 40.4h6.8" stroke="#C2410C" strokeWidth="0.8" />
      </g>);
    case "fox":
      return (<g>
        <path d="M16.5 31 18 13.5 30.5 23Z M47.5 31 46 13.5 33.5 23Z" fill={body} />
        <path d="M20 26.5 20.6 18.5 26.5 22.8Z M44 26.5 43.4 18.5 37.5 22.8Z" fill="#7C2D12" opacity="0.75" />
        <circle cx="32" cy="38" r="16" fill={body} />
        <path d="M17.5 40.5q4.5 11 14.5 13.4 10-2.4 14.5-13.4-5.5 3.2-9.5 1.2-2.5 3.6-5 3.6t-5-3.6q-4 2-9.5-1.2Z" fill={detail} />
        <Eyes y={36} />
        <ellipse cx="32" cy="43.3" rx="2.2" ry="1.6" fill={INK} />
      </g>);
    default: // blob
      return (<g>
        <path d="M26.5 24c.8-5.2 6-8.4 10.5-6.4-2 .8-3.1 2.6-3 4.6 2-2 5-2.2 7.2-.4-4.4-.6-8.8.6-14.7 2.2Z" fill={detail} />
        <circle cx="32" cy="38" r="16" fill={body} />
        <Eyes /><Cheeks /><Smile />
      </g>);
  }
}

/** A built-in avatar. `value` is profiles.avatar_url; `seed` (user id / username) picks a default. */
export function Avatar({ value, seed, size = 36, className, def }: { value?: string | null; seed: string; size?: number; className?: string; def?: AvatarDef }) {
  const id = useId().replace(/:/g, "");
  const a = def ?? resolveAvatar(value, seed);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn("shrink-0 rounded-full", className)} role="img" aria-label={`${a.label} avatar`}>
      <defs>
        <linearGradient id={`av-${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a.bg[0]} /><stop offset="1" stopColor={a.bg[1]} /></linearGradient>
        <clipPath id={`avc-${id}`}><circle cx="32" cy="32" r="32" /></clipPath>
      </defs>
      <g clipPath={`url(#avc-${id})`}>
        <rect width="64" height="64" fill={`url(#av-${id})`} />
        <ellipse cx="32" cy="58" rx="20" ry="5" fill="#000" opacity="0.08" />
        <Character a={a} />
      </g>
    </svg>
  );
}
