import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(import.meta.dirname, "../..");
export const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
export const TEMPLATE_DB = "aimem_template";

function withDb(url: string, db: string) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

/** Build a template database once: Supabase stubs + every migration, in order. */
export default async function setup() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `Cannot reach the test Postgres at ${ADMIN_URL}.\n` +
        `Start it with \`npm run db:test:up\` (needs PostgreSQL 15+ and pgvector), ` +
        `or set TEST_DATABASE_URL. Original error: ${(err as Error).message}`,
    );
  }
  await admin.query(`drop database if exists ${TEMPLATE_DB}`);
  await admin.query(`create database ${TEMPLATE_DB}`);
  await admin.end();

  const tpl = new pg.Client({ connectionString: withDb(ADMIN_URL, TEMPLATE_DB) });
  await tpl.connect();
  await tpl.query("set client_min_messages = warning");
  await tpl.query(fs.readFileSync(path.join(ROOT, "tests/db/setup/00_supabase_stub.sql"), "utf8"));
  const dir = path.join(ROOT, "supabase/migrations");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    try {
      await tpl.query(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
    }
  }
  await tpl.end();

  return async () => {
    const a = new pg.Client({ connectionString: ADMIN_URL });
    await a.connect();
    await a.query(`drop database if exists ${TEMPLATE_DB}`);
    await a.end();
  };
}
