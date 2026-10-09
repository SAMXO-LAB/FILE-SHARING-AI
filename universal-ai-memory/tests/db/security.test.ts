import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, seedFile, type TestDb } from "./helpers";

let db: TestDb;
let alice: string;
let bob: string;
let aliceFile: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await db.createUser("alice");
  bob = await db.createUser("bob");
  aliceFile = await seedFile(db, alice, { name: "alice-secret.pdf", chunks: [{ text: "private plans for alice" }] });
  await seedFile(db, bob, { name: "bob-notes.pdf", chunks: [{ text: "bob private notes" }] });
});
afterAll(async () => db.close());

describe("profiles & usernames", () => {
  it("creates a profile and default preferences for every new auth user", async () => {
    const r = await db.admin.query("select username from public.profiles where id = $1", [alice]);
    expect(r.rows[0].username).toBe("alice");
    const p = await db.admin.query("select processing_mode, theme from public.user_preferences where user_id = $1", [alice]);
    expect(p.rows[0]).toMatchObject({ processing_mode: "extraction", theme: "liquid-glass" });
  });

  it("enforces case-insensitive uniqueness at the database level", async () => {
    const id = await db.createUser("ALICE"); // trigger falls back to a random name rather than failing signup
    const r = await db.admin.query("select username from public.profiles where id = $1", [id]);
    expect(r.rows[0].username).not.toMatch(/^alice$/i);
    await expect(
      db.admin.query("insert into public.profiles (id, username, username_skeleton) values ($1, 'Alice', 'x')", [crypto.randomUUID()]),
    ).rejects.toThrow();
  });

  it("rejects reserved names, look-alikes of reserved names, and bad formats", async () => {
    const check = async (n: string) => (await db.admin.query("select public.username_check($1) as r", [n])).rows[0].r;
    expect(await check("admin")).toBe("reserved");
    expect(await check("Adm1n")).toBe("reserved");
    expect(await check("ad_min")).toBe("reserved");
    expect(await check("a")).toBe("invalid_format");
    expect(await check("has space")).toBe("invalid_format");
    expect(await check("__x__")).toBe("invalid_format");
    expect(await check("a".repeat(31))).toBe("invalid_format");
    expect(await check("alice")).toBe("taken");
    expect(await check("a1ice")).toBe("taken"); // look-alike of alice
    expect(await check("zoya")).toBe("ok");
  });

  it("limits username changes to once per 14 days and keeps usernames unique", async () => {
    const id = await db.createUser("changer");
    await db.asUser(id, (q) => q("select public.change_username('changer2')"), { commit: true });
    await expect(db.asUser(id, (q) => q("select public.change_username('changer3')"))).rejects.toThrow(/cooldown/);
    const id2 = await db.createUser("other");
    await db.admin.query("update public.profiles set username_changed_at = null where id = $1", [id2]);
    await expect(db.asUser(id2, (q) => q("select public.change_username('changer2')"))).rejects.toThrow(/taken/);
  });

  it("does not let users edit their own quota or username directly", async () => {
    await expect(
      db.asUser(alice, (q) => q("update public.profiles set storage_quota_bytes = 999999999999 where id = $1", [alice])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(alice, (q) => q("update public.profiles set username = 'hacked' where id = $1", [alice])),
    ).rejects.toThrow(/permission denied/);
    // But safe columns work.
    const r = await db.asUser(alice, (q) => q("update public.profiles set bio = 'hi' where id = $1 returning bio", [alice]));
    expect(r.rows[0].bio).toBe("hi");
  });
});

describe("cross-user isolation (row level security)", () => {
  it("a user only ever sees their own rows", async () => {
    const files = await db.asUser(alice, (q) => q("select display_name from public.files"));
    expect(files.rows.map((r) => r.display_name)).toEqual(["alice-secret.pdf"]);
    const recs = await db.asUser(bob, (q) => q("select title from public.memory_records"));
    expect(recs.rows.every((r) => r.title === "bob-notes.pdf")).toBe(true);
    const profiles = await db.asUser(alice, (q) => q("select username from public.profiles"));
    expect(profiles.rows).toEqual([{ username: "alice" }]);
  });

  it("cannot read, update or delete another user's file by guessing its id", async () => {
    const read = await db.asUser(bob, (q) => q("select * from public.files where id = $1", [aliceFile]));
    expect(read.rowCount).toBe(0);
    const upd = await db.asUser(bob, (q) => q("update public.files set display_name = 'pwned' where id = $1", [aliceFile]));
    expect(upd.rowCount).toBe(0);
    await expect(db.asUser(bob, (q) => q("delete from public.files where id = $1", [aliceFile]))).rejects.toThrow(/permission denied/);
  });

  it("cannot create rows owned by someone else", async () => {
    await expect(
      db.asUser(bob, (q) => q("insert into public.notes (owner_id, title, body) values ($1, 'x', 'y')", [alice])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.asUser(bob, (q) => q("insert into public.collections (owner_id, name) values ($1, 'x')", [alice])),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot reference another user's file from a collection (composite foreign key)", async () => {
    const col = await db.asUser(bob, (q) => q("insert into public.collections (owner_id, name) values ($1, 'mine') returning id", [bob]), { commit: true });
    await expect(
      db.asUser(bob, (q) => q("insert into public.collection_items (collection_id, owner_id, file_id) values ($1, $2, $3)", [col.rows[0].id, bob, aliceFile])),
    ).rejects.toThrow(/foreign key/);
  });

  it("the anon role cannot read or write anything", async () => {
    for (const t of ["files", "memory_records", "profiles", "messages", "notes", "sources"]) {
      await expect(db.asAnon((q) => q(`select * from public.${t}`))).rejects.toThrow(/permission denied/);
    }
  });

  it("server-only tables are invisible to signed-in users", async () => {
    for (const t of ["rate_limits", "telegram_link_codes", "reserved_usernames"]) {
      await expect(db.asUser(alice, (q) => q(`select * from public.${t}`))).rejects.toThrow(/permission denied/);
    }
  });

  it("users cannot insert files, jobs or audit events directly", async () => {
    await expect(
      db.asUser(alice, (q) => q(`insert into public.files (owner_id, display_name, storage_key) values ($1,'x',$2)`, [alice, `${alice}/x`])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(alice, (q) => q(`insert into public.processing_jobs (owner_id, kind) values ($1,'process_file')`, [alice])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(alice, (q) => q(`insert into public.audit_events (user_id, event) values ($1,'fake')`, [alice])),
    ).rejects.toThrow(/permission denied/);
  });

  it("audit log is readable by its subject only", async () => {
    await db.asService((q) => q("select public.write_audit($1, 'test.event')", [alice]));
    const mine = await db.asUser(alice, (q) => q("select event from public.audit_events"));
    expect(mine.rows).toEqual([{ event: "test.event" }]);
    const theirs = await db.asUser(bob, (q) => q("select event from public.audit_events"));
    expect(theirs.rowCount).toBe(0);
  });

  it("an unauthenticated session (no uid) gets nothing from search_memory", async () => {
    const r = await db.asService((q) => q("select * from public.search_memory(array['private'])"));
    expect(r.rowCount).toBe(0);
  });
});

describe("storage quota & reservation", () => {
  it("reserve_file enforces per-file and total quota atomically", async () => {
    const u = await db.createUser("quotauser");
    await db.admin.query("update public.profiles set storage_quota_bytes = 1000, max_upload_bytes = 600 where id = $1", [u]);
    const reserve = (size: number) =>
      db.asService((q) =>
        q("select * from public.reserve_file($1, $2, 'a.txt', $3, 'text/plain', 'document', null)", [u, crypto.randomUUID(), size]),
      );
    await expect(reserve(700)).rejects.toThrow(/file_too_large/);
    await reserve(500);
    await expect(reserve(600)).rejects.toThrow(/quota_exceeded/);
    await reserve(400);
    const used = await db.asUser(u, (q) => q("select public.storage_used() as used"));
    expect(Number(used.rows[0].used)).toBe(900);
  });

  it("concurrent reservations cannot overshoot the quota", async () => {
    const u = await db.createUser("racer");
    await db.admin.query("update public.profiles set storage_quota_bytes = 1000 where id = $1", [u]);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        db.asService((q) => q("select * from public.reserve_file($1, $2, 'r.txt', 400, 'text/plain', 'document', null)", [u, crypto.randomUUID()])),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  });

  it("storage policy only allows uploads to keys the server has reserved", async () => {
    const u = await db.createUser("uploader");
    const fileId = crypto.randomUUID();
    await db.asService((q) => q("select * from public.reserve_file($1,$2,'doc.pdf',100,'application/pdf','document',null)", [u, fileId]));
    const key = `${u}/${fileId}`;
    // reserved key: ok
    await db.asUser(u, (q) => q("insert into storage.objects (bucket_id, name, owner) values ('memory-files', $1, $2)", [key, u]));
    // un-reserved key under own prefix: denied
    await expect(
      db.asUser(u, (q) => q("insert into storage.objects (bucket_id, name, owner) values ('memory-files', $1, $2)", [`${u}/${crypto.randomUUID()}`, u])),
    ).rejects.toThrow(/row-level security/);
    // someone else's prefix: denied
    await expect(
      db.asUser(u, (q) => q("insert into storage.objects (bucket_id, name, owner) values ('memory-files', $1, $2)", [`${alice}/${crypto.randomUUID()}`, u])),
    ).rejects.toThrow(/row-level security/);
  });

  it("file rows cannot use a storage key outside the owner's prefix", async () => {
    await expect(
      db.admin.query(`insert into public.files (owner_id, display_name, storage_key) values ($1,'x',$2)`, [alice, `${bob}/stolen`]),
    ).rejects.toThrow(/files_storage_key_owner/);
  });
});

describe("sharing", () => {
  it("recipients see a file only while a live accepted share exists", async () => {
    const owner = await db.createUser("sharer");
    const rcpt = await db.createUser("recipient");
    const outsider = await db.createUser("outsider");
    const file = await seedFile(db, owner, { name: "shared.pdf", chunks: [{ text: "shared content" }] });

    const visible = async (u: string) => (await db.asUser(u, (q) => q("select id from public.files where id = $1", [file]))).rowCount;

    await db.admin.query("insert into public.sharing_permissions (owner_id, file_id, recipient_id) values ($1,$2,$3)", [owner, file, rcpt]);
    expect(await visible(rcpt)).toBe(0); // pending is not access

    await db.admin.query("update public.sharing_permissions set status='accepted', accepted_at=now() where file_id=$1", [file]);
    expect(await visible(rcpt)).toBe(1);
    expect(await visible(outsider)).toBe(0);

    // Recipients never get the owner's search index.
    const recs = await db.asUser(rcpt, (q) => q("select * from public.memory_records"));
    expect(recs.rowCount).toBe(0);

    // expiry
    await db.admin.query("update public.sharing_permissions set expires_at = now() - interval '1 minute' where file_id=$1", [file]).catch(() => {});
    // (the check constraint forbids past expiry at insert time; simulate time passing by moving created_at back)
    await db.admin.query("update public.sharing_permissions set created_at = now() - interval '2 days', expires_at = now() - interval '1 minute' where file_id=$1", [file]);
    expect(await visible(rcpt)).toBe(0);

    // revoke
    await db.admin.query("update public.sharing_permissions set expires_at = null, status='accepted' where file_id=$1", [file]);
    expect(await visible(rcpt)).toBe(1);
    await db.admin.query("update public.sharing_permissions set status='revoked', revoked_at=now() where file_id=$1", [file]);
    expect(await visible(rcpt)).toBe(0);

    // trash hides it from recipients too
    await db.admin.query("update public.sharing_permissions set status='accepted' where file_id=$1", [file]);
    await db.admin.query("update public.files set deleted_at = now() where id=$1", [file]);
    expect(await visible(rcpt)).toBe(0);
  });

  it("recipients cannot modify the shared file", async () => {
    const owner = await db.createUser("sharer2");
    const rcpt = await db.createUser("recipient2");
    const file = await seedFile(db, owner, { name: "ro.pdf" });
    await db.admin.query("insert into public.sharing_permissions (owner_id, file_id, recipient_id, status) values ($1,$2,$3,'accepted')", [owner, file, rcpt]);
    const r = await db.asUser(rcpt, (q) => q("update public.files set display_name='x' where id=$1", [file]));
    expect(r.rowCount).toBe(0);
  });

  it("users cannot create or alter shares directly", async () => {
    await expect(
      db.asUser(alice, (q) => q("insert into public.sharing_permissions (owner_id, file_id, recipient_id) values ($1,$2,$3)", [alice, aliceFile, bob])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("rate limiting", () => {
  it("counts hits per window and reports retry-after", async () => {
    const hit = () => db.asService((q) => q("select * from public.rate_limit_hit('test:key', 60, 3)"));
    expect((await hit()).rows[0].allowed).toBe(true);
    expect((await hit()).rows[0].allowed).toBe(true);
    expect((await hit()).rows[0].allowed).toBe(true);
    const blocked = (await hit()).rows[0];
    expect(blocked.allowed).toBe(false);
    expect(blocked.retry_after_seconds).toBeGreaterThan(0);
    // different key unaffected
    expect((await db.asService((q) => q("select * from public.rate_limit_hit('other', 60, 3)"))).rows[0].allowed).toBe(true);
  });
});

describe("job queue", () => {
  it("claims each job exactly once under concurrency (SKIP LOCKED)", async () => {
    const u = await db.createUser("jobuser");
    for (let i = 0; i < 10; i++) {
      await db.asService((q) => q("select public.enqueue_job($1,'process_file',$2)", [u, JSON.stringify({ i })]));
    }
    const claims = await Promise.all(
      Array.from({ length: 4 }, (_, w) => db.asService((q) => q("select * from public.claim_jobs($1, 5)", [`w${w}`]))),
    );
    const ids = claims.flatMap((c) => c.rows.map((r) => r.id));
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
  });

  it("de-duplicates active jobs by dedupe_key", async () => {
    const u = await db.createUser("dedupe");
    const a = await db.asService((q) => q("select public.enqueue_job($1,'process_file','{}','file:1') as id", [u]));
    const b = await db.asService((q) => q("select public.enqueue_job($1,'process_file','{}','file:1') as id", [u]));
    expect(a.rows[0].id).toBe(b.rows[0].id);
  });

  it("reclaims jobs from dead workers and gives up after max attempts", async () => {
    const u = await db.createUser("stale");
    const id = (await db.asService((q) => q("select public.enqueue_job($1,'process_file','{}',null,now(),1) as id", [u]))).rows[0].id;
    await db.admin.query("update public.processing_jobs set status='cancelled' where status='queued' and id <> $1", [id]);
    await db.asService((q) => q("select * from public.claim_jobs('dead', 1, array['process_file'])"));
    await db.admin.query("update public.processing_jobs set locked_at = now() - interval '1 hour' where id=$1", [id]);
    await db.asService((q) => q("select * from public.claim_jobs('w', 1)"));
    const r = await db.admin.query("select status from public.processing_jobs where id=$1", [id]);
    expect(r.rows[0].status).toBe("failed"); // attempts (1) >= max_attempts (1)
  });

  it("users cannot claim or enqueue jobs", async () => {
    await expect(db.asUser(alice, (q) => q("select * from public.claim_jobs('x', 1)"))).rejects.toThrow(/permission denied/);
    await expect(db.asUser(alice, (q) => q("select public.enqueue_job($1,'process_file')", [alice]))).rejects.toThrow(/permission denied/);
  });
});
