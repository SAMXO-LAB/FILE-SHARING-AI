import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { axisVector, createTestDb, seedFile, type TestDb } from "./helpers";

let db: TestDb;
let me: string;
let other: string;

const search = (user: string, args: Record<string, unknown> = {}) => {
  const p = {
    p_terms: null, p_embedding: null, p_kinds: null, p_source_ids: null, p_prefer_sources: null,
    p_file_categories: null, p_mime_types: null, p_sender: null, p_from: null, p_to: null,
    p_collection_id: null, p_file_ids: null, p_conversation_id: null, p_recency_boost: true,
    p_min_similarity: 0.3, p_limit: 40, ...args,
  };
  const names = Object.keys(p);
  const sql = `select * from public.search_memory(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")})`;
  return db.asUser(user, (q) => q(sql, Object.values(p)));
};

beforeAll(async () => {
  db = await createTestDb();
  me = await db.createUser("searcher");
  other = await db.createUser("intruder");
});
afterAll(async () => db.close());

describe("search_memory: keyword + metadata", () => {
  let nnFile: string;
  beforeAll(async () => {
    nnFile = await seedFile(db, me, {
      name: "Chapter_4_Final.pdf",
      chunks: [
        { text: "Neural networks learn by adjusting weights using backpropagation and gradient descent.", page: 12 },
        { text: "The appendix lists references and acknowledgements.", page: 40 },
      ],
    });
    await seedFile(db, me, { name: "Invoice_March.pdf", chunks: [{ text: "Invoice total 4500 rupees for laptop purchase", page: 1 }] });
    await seedFile(db, me, { name: "ML_Notes.txt", category: "document", mime: "text/plain", chunks: [{ text: "machine learning notes on regression" }] });
    await seedFile(db, other, { name: "Neural_secret.pdf", chunks: [{ text: "neural networks secret recipe" }] });
  });

  it("finds content by meaning of words in the body, not just the file name", async () => {
    const r = await search(me, { p_terms: ["neural", "networks", "learn"] });
    expect(r.rows[0].file_id).toBe(nnFile);
    expect(r.rows[0].kind).toBe("chunk");
    expect(r.rows[0].page_start).toBe(12);
    expect(r.rows[0].matched_by).toContain("keyword");
  });

  it("never returns another user's records", async () => {
    const r = await search(me, { p_terms: ["neural"] });
    expect(r.rows.every((x) => x.title !== "Neural_secret.pdf")).toBe(true);
    const theirs = await search(other, { p_terms: ["neural"] });
    expect(new Set(theirs.rows.map((x) => x.title))).toEqual(new Set(["Neural_secret.pdf"]));
  });

  it("matches file names (metadata) even when the body is empty", async () => {
    const r = await search(me, { p_terms: ["invoice"] });
    expect(r.rows.some((x) => x.title === "Invoice_March.pdf" && x.kind === "file")).toBe(true);
  });

  it("returns nothing for terms that match nothing (no invented results)", async () => {
    const r = await search(me, { p_terms: ["zzxqvunknownword"] });
    expect(r.rowCount).toBe(0);
  });

  it("is safe against tsquery / SQL syntax in terms", async () => {
    for (const t of ["'; drop table public.files; --", "a & | ! ( ) :*", "\\", "%_%", "<->"]) {
      await expect(search(me, { p_terms: [t, "neural"] })).resolves.toBeTruthy();
    }
    const still = await db.admin.query("select count(*)::int as n from public.files where owner_id = $1", [me]);
    expect(still.rows[0].n).toBeGreaterThan(0);
  });

  it("excludes files in the trash and restores them on un-delete", async () => {
    const f = await seedFile(db, me, { name: "trashed_quantum.pdf", chunks: [{ text: "quantum entanglement overview" }] });
    expect((await search(me, { p_terms: ["quantum"] })).rowCount).toBeGreaterThan(0);
    await db.admin.query("update public.files set deleted_at = now() where id = $1", [f]);
    expect((await search(me, { p_terms: ["quantum"] })).rowCount).toBe(0);
    await db.admin.query("update public.files set deleted_at = null where id = $1", [f]);
    expect((await search(me, { p_terms: ["quantum"] })).rowCount).toBeGreaterThan(0);
  });

  it("filters by file category, mime type, kind and specific file ids", async () => {
    const txt = await search(me, { p_terms: ["machine", "learning"], p_mime_types: ["text/plain"] });
    expect(txt.rows.every((x) => x.title === "ML_Notes.txt")).toBe(true);
    const onlyFiles = await search(me, { p_terms: ["neural"], p_kinds: ["file"] });
    expect(onlyFiles.rows.every((x) => x.kind === "file")).toBe(true);
    const scoped = await search(me, { p_terms: ["invoice", "neural"], p_file_ids: [nnFile] });
    expect(new Set(scoped.rows.map((x) => x.file_id))).toEqual(new Set([nnFile]));
  });
});

describe("search_memory: senders, dates, sources", () => {
  beforeAll(async () => {
    await seedFile(db, me, {
      name: "ml_intro_from_rahul.pdf", source: "whatsapp", sender: "Rahul Sharma",
      occurred: new Date(Date.now() - 20 * 86400_000).toISOString(),
      chunks: [{ text: "introduction to supervised machine learning" }],
    });
    await seedFile(db, me, {
      name: "ml_old_from_priya.pdf", source: "whatsapp", sender: "Priya",
      occurred: new Date(Date.now() - 400 * 86400_000).toISOString(),
      chunks: [{ text: "machine learning course outline" }],
    });
  });

  it("filters by sender label (case-insensitive substring)", async () => {
    const r = await search(me, { p_terms: ["machine", "learning"], p_sender: "rahul" });
    expect(r.rowCount).toBeGreaterThan(0);
    expect(r.rows.every((x) => x.senders.includes("Rahul Sharma"))).toBe(true);
  });

  it("returns nothing when no record is attributed to that sender", async () => {
    const r = await search(me, { p_terms: ["machine", "learning"], p_sender: "Nobody" });
    expect(r.rowCount).toBe(0);
  });

  it("filters by date range", async () => {
    const r = await search(me, {
      p_terms: ["machine", "learning"],
      p_from: new Date(Date.now() - 60 * 86400_000).toISOString(),
    });
    expect(r.rows.some((x) => x.title === "ml_old_from_priya.pdf")).toBe(false);
    expect(r.rows.some((x) => x.title === "ml_intro_from_rahul.pdf")).toBe(true);
  });

  it("filters by source", async () => {
    const r = await search(me, { p_terms: ["machine", "learning"], p_source_ids: ["whatsapp"] });
    expect(r.rowCount).toBeGreaterThan(0);
    expect(r.rows.every((x) => x.source_id === "whatsapp")).toBe(true);
  });

  it("recency boost ranks the recent match above an equally relevant old one", async () => {
    const r = await search(me, { p_terms: ["machine", "learning"], p_source_ids: ["whatsapp"], p_kinds: ["chunk"] });
    expect(r.rows[0].title).toBe("ml_intro_from_rahul.pdf");
  });

  it("with no terms or embedding, returns recent items (browse mode) newest first", async () => {
    const r = await search(me, { p_kinds: ["file"], p_limit: 5 });
    expect(r.rowCount).toBeGreaterThan(0);
    const dates = r.rows.map((x) => +new Date(x.occurred_at));
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });
});

describe("search_memory: semantic", () => {
  let learnFile: string;
  beforeAll(async () => {
    // Axis 0 = "how neural nets learn"; axis 1 = "cooking"; axis 2 = "finance".
    learnFile = await seedFile(db, me, {
      name: "Chapter_9_Draft.pdf",
      chunks: [{ text: "Lecture notes without the query words at all", embedding: axisVector(0, { 1: 0.1 }) }],
    });
    await seedFile(db, me, { name: "Recipes.pdf", chunks: [{ text: "pasta carbonara", embedding: axisVector(1) }] });
    await seedFile(db, me, { name: "Budget.xlsx", chunks: [{ text: "monthly budget sheet", embedding: axisVector(2) }] });
    await seedFile(db, other, { name: "OtherUser.pdf", chunks: [{ text: "other user's semantic note", embedding: axisVector(0) }] });
  });

  it("retrieves a document by vector similarity even without keyword overlap", async () => {
    const r = await search(me, { p_embedding: axisVector(0), p_terms: ["gibberishnomatch"] });
    expect(r.rows[0].file_id).toBe(learnFile);
    expect(r.rows[0].matched_by).toContain("semantic");
    expect(r.rows[0].semantic_score).toBeGreaterThan(0.5);
  });

  it("drops weakly-similar vectors instead of padding results with junk", async () => {
    const r = await search(me, { p_embedding: axisVector(7) }); // orthogonal to everything
    expect(r.rows.filter((x) => x.kind === "chunk")).toHaveLength(0);
  });

  it("semantic search is also isolated per user", async () => {
    const r = await search(me, { p_embedding: axisVector(0) });
    expect(r.rows.some((x) => x.title === "OtherUser.pdf")).toBe(false);
  });

  it("combines keyword and semantic evidence in one ranking", async () => {
    const both = await seedFile(db, me, {
      name: "Neural_Training.pdf",
      chunks: [{ text: "neural network training explained", embedding: axisVector(0) }],
    });
    const r = await search(me, { p_embedding: axisVector(0), p_terms: ["neural", "training"], p_kinds: ["chunk"] });
    expect(r.rows[0].file_id).toBe(both);
    expect(r.rows[0].matched_by).toEqual(expect.arrayContaining(["keyword", "semantic"]));
  });
});
