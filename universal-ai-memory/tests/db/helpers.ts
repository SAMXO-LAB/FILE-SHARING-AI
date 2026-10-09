import crypto from "node:crypto";
import pg from "pg";
import { ADMIN_URL, TEMPLATE_DB } from "./global-setup";

function withDb(url: string, db: string) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

export interface TestDb {
  /** superuser pool: bypasses RLS, used for arranging data. */
  admin: pg.Pool;
  createUser(username?: string, meta?: Record<string, unknown>): Promise<string>;
  /** Run `fn` as the `authenticated` role with auth.uid() = userId (inside a rolled-back txn unless commit). */
  asUser<T>(userId: string, fn: (q: Q) => Promise<T>, opts?: { commit?: boolean }): Promise<T>;
  /** Run as the `service_role` (server-side). */
  asService<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  asAnon<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export type Q = <R extends pg.QueryResultRow = any>(sql: string, params?: unknown[]) => Promise<pg.QueryResult<R>>;

export async function createTestDb(): Promise<TestDb> {
  const name = `aimem_t_${crypto.randomBytes(5).toString("hex")}`;
  const root = new pg.Client({ connectionString: ADMIN_URL });
  await root.connect();
  await root.query(`create database ${name} template ${TEMPLATE_DB}`);
  await root.end();

  const admin = new pg.Pool({ connectionString: withDb(ADMIN_URL, name), max: 6 });
  admin.on("error", () => {});

  async function inRole<T>(role: string, claims: string | null, fn: (q: Q) => Promise<T>, commit = false) {
    const c = await admin.connect();
    try {
      await c.query("begin");
      await c.query(`set local role ${role}`);
      if (claims) await c.query("select set_config('request.jwt.claim.sub', $1, true)", [claims]);
      const q: Q = (sql, params) => c.query(sql, params as any[]);
      const out = await fn(q);
      await c.query(commit ? "commit" : "rollback");
      return out;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  return {
    admin,
    async createUser(username, meta = {}) {
      const id = crypto.randomUUID();
      const m = { ...(username ? { username } : {}), ...meta };
      await admin.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
        id,
        `${id}@example.test`,
        JSON.stringify(m),
      ]);
      return id;
    },
    asUser: (userId, fn, opts) => inRole("authenticated", userId, fn, opts?.commit),
    asService: (fn) => inRole("service_role", null, fn, true),
    asAnon: (fn) => inRole("anon", null, fn),
    async close() {
      await admin.end();
      const r = new pg.Client({ connectionString: ADMIN_URL });
      await r.connect();
      await r.query(`drop database if exists ${name} with (force)`);
      await r.end();
    },
  };
}

/** A unit vector with `weight` on axis `i` and the rest zero, padded to 1536 dims. */
export function axisVector(i: number, mix: Record<number, number> = {}): string {
  const v = new Array<number>(1536).fill(0);
  v[i] = 1;
  for (const [k, w] of Object.entries(mix)) v[Number(k)] = w;
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  return `[${v.map((x) => x / norm).join(",")}]`;
}

/** Insert a ready file + file-level record + chunk records directly (arrange step). */
export async function seedFile(
  db: TestDb,
  owner: string,
  opts: {
    name: string;
    chunks?: { text: string; page?: number; embedding?: string }[];
    category?: string;
    mime?: string;
    size?: number;
    source?: string;
    sender?: string;
    occurred?: string;
    deleted?: boolean;
  },
) {
  const id = crypto.randomUUID();
  await db.admin.query(
    `insert into public.files (id, owner_id, display_name, storage_key, mime_type, category, size_bytes, status,
        indexing_level, source_id, sender_label, deleted_at)
     values ($1,$2,$3,$4,$5,$6,$7,'ready','text',$8,$9,$10)`,
    [id, owner, opts.name, `${owner}/${id}`, opts.mime ?? "application/pdf", opts.category ?? "document",
     opts.size ?? 1000, opts.source ?? "upload", opts.sender ?? null, opts.deleted ? new Date() : null],
  );
  const senders = opts.sender ? [opts.sender] : [];
  const occurred = opts.occurred ?? new Date().toISOString();
  await db.admin.query(
    `insert into public.memory_records (owner_id, kind, source_id, file_id, title, body, file_category, senders, occurred_at, date_kind)
     values ($1,'file',$2,$3,$4,'',$5,$6,$7,'uploaded')`,
    [owner, opts.source ?? "upload", id, opts.name, opts.category ?? "document", senders, occurred],
  );
  let idx = 0;
  for (const c of opts.chunks ?? []) {
    await db.admin.query(
      `insert into public.memory_records (owner_id, kind, source_id, file_id, title, body, file_category, chunk_index, page_start, page_end, senders, occurred_at, date_kind, embedding)
       values ($1,'chunk',$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,'uploaded',$11)`,
      [owner, opts.source ?? "upload", id, opts.name, c.text, opts.category ?? "document", idx++, c.page ?? null, senders, occurred, c.embedding ?? null],
    );
  }
  return id;
}
