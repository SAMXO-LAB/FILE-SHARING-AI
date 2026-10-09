import { z } from "zod";

export const usernameSchema = z.string().trim().regex(/^[a-zA-Z0-9_]{3,30}$/, "3–30 letters, numbers or underscores").transform((s) => s);
export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "Password is too long")
  .refine((p) => /[a-z]/i.test(p) && /[0-9]/.test(p), "Include at least one letter and one number");

export const uuidSchema = z.uuid();
export const idParams = z.object({ id: z.uuid() });

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const prefsPatch = z
  .object({
    theme: z.enum(["liquid-glass", "midnight", "amoled", "minimal-light", "aurora", "custom"]),
    color_mode: z.enum(["system", "light", "dark"]),
    accent_color: hex,
    background_style: z.enum(["gradient", "solid", "mesh", "none"]),
    sidebar_style: z.enum(["glass", "solid", "minimal"]),
    border_radius: z.enum(["sm", "md", "lg", "xl"]),
    chat_bubble_style: z.enum(["soft", "outline", "flat"]),
    animation_level: z.enum(["none", "subtle", "normal", "rich"]),
    high_contrast: z.boolean(),
    sidebar_collapsed: z.boolean(),
    processing_mode: z.enum(["metadata_only", "extraction", "local", "cloud_ai"]),
    semantic_indexing: z.boolean(),
    auto_categorize: z.boolean(),
    response_style: z.enum(["concise", "balanced", "detailed"]),
    search_recency_boost: z.boolean(),
    save_search_history: z.boolean(),
    privacy_acknowledged: z.boolean(),
    notify_upload_complete: z.boolean(),
    notify_processing_complete: z.boolean(),
    notify_import_failures: z.boolean(),
    notify_security_alerts: z.boolean(),
  })
  .partial()
  .strict();


/** Filters a user can apply to Ask AI / search. */
export const filtersSchema = z
  .object({
    sourceIds: z.array(z.enum(["upload", "whatsapp", "telegram", "link", "note", "ai_chat"])).max(6).optional(),
    categories: z.array(z.enum(["document", "image", "audio", "video", "archive", "code", "data", "other"])).max(8).optional(),
    from: z.string().datetime().nullable().optional(),
    to: z.string().datetime().nullable().optional(),
    collectionId: z.uuid().nullable().optional(),
    dropped: z.array(z.enum(["sender", "date", "type", "source"])).max(4).optional(),
  })
  .strict();

