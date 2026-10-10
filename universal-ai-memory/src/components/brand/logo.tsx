import { cn } from "@/lib/utils";

/** Brand palette (kept here so the mark stays on-brand whatever theme accent the user picks). */
export const BRAND = { blue: "#1E4FD8", spark: "#2F8CFF", navy: "#0B1E4D", white: "#FFFFFF", mist: "#9CC3FF" } as const;

const SPARKLE = "M52 3c.8 4.5 2.5 6.2 7 7-4.5.8-6.2 2.5-7 7-.8-4.5-2.5-6.2-7-7 4.5-.8 6.2-2.5 7-7Z";
const BACK_DOC = "M14 8h16l9 9v25a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3Z";
const BACK_FOLD = "M30 8v6a3 3 0 0 0 3 3h6";
const FRONT_DOC = "M26 20h16l10 10v24a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V24a4 4 0 0 1 4-4Z";
const FRONT_FOLD = "M42 20v6a4 4 0 0 0 4 4h6Z";

/**
 * The Share Files mark: an outlined document behind a solid one carrying an up-right "send" arrow,
 * with a spark. `tile` is the app-icon version (white documents on a blue rounded square).
 */
export function LogoMark({ size = 32, variant = "mark", className, title }: { size?: number; variant?: "mark" | "tile" | "mono"; className?: string; title?: string }) {
  const label = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  if (variant === "tile") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" className={cn("shrink-0", className)} {...label}>
        <defs>
          <linearGradient id="sf-tile" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={BRAND.spark} />
            <stop offset="1" stopColor={BRAND.blue} />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="15" fill="url(#sf-tile)" />
        <g transform="translate(2.2 5.3) scale(0.86)">
          <path d={BACK_DOC} fill="none" stroke={BRAND.white} strokeOpacity="0.55" strokeWidth="3" strokeLinejoin="round" />
          <path d={BACK_FOLD} fill="none" stroke={BRAND.white} strokeOpacity="0.55" strokeWidth="3" strokeLinejoin="round" />
          <path d={FRONT_DOC} fill={BRAND.white} />
          <path d={FRONT_FOLD} fill={BRAND.mist} />
          <path d="M31 49 43 37m-8 0h8v8" fill="none" stroke={BRAND.blue} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d={SPARKLE} fill={BRAND.white} fillOpacity="0.9" />
        </g>
      </svg>
    );
  }
  const mono = variant === "mono";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn("shrink-0", className)} {...label}>
      <path d={BACK_DOC} fill="none" stroke={mono ? "currentColor" : BRAND.mist} strokeOpacity={mono ? 0.5 : 1} strokeWidth="3" strokeLinejoin="round" />
      <path d={BACK_FOLD} fill="none" stroke={mono ? "currentColor" : BRAND.mist} strokeOpacity={mono ? 0.5 : 1} strokeWidth="3" strokeLinejoin="round" />
      <path d={FRONT_DOC} fill={mono ? "currentColor" : BRAND.blue} />
      <path d={FRONT_FOLD} fill={mono ? "currentColor" : BRAND.spark} fillOpacity={mono ? 0.6 : 1} />
      <path d="M31 49 43 37m-8 0h8v8" fill="none" stroke={BRAND.white} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={SPARKLE} fill={mono ? "currentColor" : BRAND.spark} />
    </svg>
  );
}

const SIZES = {
  sm: { mark: 26, text: "text-[16px]", badge: "text-[10px] px-1.5 py-[1px] rounded-[5px]", gap: "gap-2" },
  md: { mark: 32, text: "text-[19px]", badge: "text-[11px] px-[7px] py-[2px] rounded-[6px]", gap: "gap-2.5" },
  lg: { mark: 44, text: "text-[26px]", badge: "text-[14px] px-2 py-[3px] rounded-[7px]", gap: "gap-3" },
} as const;

/** Full lockup: mark + "Share Files" wordmark + "AI" badge, with the optional tagline beneath. */
export function Logo({ size = "md", tagline = false, className, markVariant = "mark" }: { size?: keyof typeof SIZES; tagline?: boolean; className?: string; markVariant?: "mark" | "tile" }) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex items-center", s.gap, className)}>
      <LogoMark size={s.mark} variant={markVariant} />
      <span className="flex flex-col leading-none">
        <span className={cn("brand-wordmark inline-flex items-center gap-1.5 whitespace-nowrap", s.text)}>
          Share Files
          <span className={cn("brand-badge font-semibold leading-none", s.badge)}>AI</span>
        </span>
        {tagline && <span className="brand-tagline mt-1.5">Send smarter. Share securely.</span>}
      </span>
    </span>
  );
}
