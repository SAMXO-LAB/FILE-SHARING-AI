import { z } from "zod";
import { route, usernameMessage } from "@/lib/api";
import { adminOrThrow } from "@/lib/server/context";

export const POST = route(
  { auth: false, body: z.object({ username: z.string().max(60) }), rateLimit: { name: "username-check", max: 30, windowSeconds: 60 } },
  async ({ body }) => {
    const { data, error } = await adminOrThrow().rpc("username_check", { p: body.username });
    if (error) throw error;
    const code = data as string;
    return { available: code === "ok", code, message: code === "ok" ? "Available" : usernameMessage(code) };
  },
);
