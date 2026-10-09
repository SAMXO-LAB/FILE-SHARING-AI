import { existsSync } from "node:fs";

/** Loads .env.local / .env like Next.js does, without overriding variables already set in the shell. */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const load = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
    if (!load) throw new Error("Node 20.12+ is required to load env files in scripts.");
    const before = { ...process.env };
    load.call(process, file);
    // loadEnvFile doesn't override existing values, but make that explicit for older behaviour.
    for (const [k, v] of Object.entries(before)) if (v !== undefined) process.env[k] = v;
  }
}
