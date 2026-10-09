/**
 * Optional development helper: creates a sign-in for a local test account and three short notes that
 * are clearly labelled as samples, so you can try search and Ask AI without importing anything.
 * It never runs automatically and is not part of the app: the product itself shows no sample data.
 *
 *   npm run seed -- demo@example.test 'a-long-password-1'
 *
 * Requires SUPABASE_SECRET_KEY. Use against a local or throwaway Supabase project only.
 */
import { loadEnv } from "./load-env";

loadEnv();
const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: npm run seed -- <email> <password>");
  process.exit(1);
}
const { adminConfigured } = await import("@/lib/env");
const { createAdminClient } = await import("@/lib/supabase/admin");
const { indexNote } = await import("@/lib/processing/links");
if (!adminConfigured()) {
  console.error("Missing Supabase variables. Check .env.local.");
  process.exit(1);
}
const admin = createAdminClient();

const username = `demo_${Math.random().toString(36).slice(2, 7)}`;
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
let userId = created.data.user?.id;
if (created.error) {
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  userId = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
  if (!userId) { console.error("Could not create or find the user:", created.error.message); process.exit(1); }
  console.log("User already exists; adding sample notes to it.");
}

const notes = [
  { title: "Sample: solar panel quote", body: "Sample note. The installer quoted 9,400 for a 6 kW rooftop system with a 25 year panel warranty. Decision deadline is the end of the month." },
  { title: "Sample: trip checklist", body: "Sample note. Passport, charger, rail tickets for the Lisbon trip, hotel confirmation number saved in the email thread." },
  { title: "Sample: book ideas", body: "Sample note. Read next: a history of cartography, a field guide to lichens, and the essays collection a friend recommended." },
];
for (const n of notes) {
  const { data, error } = await admin.from("notes").insert({ owner_id: userId, title: n.title, body: n.body, origin: "user" }).select("id").single();
  if (error || !data) { console.error("Insert failed:", error?.message); process.exit(1); }
  await indexNote(admin, data.id as string);
}
console.log(`Done. Sign in with ${email}. Try asking: “what was the solar panel quote?”`);
