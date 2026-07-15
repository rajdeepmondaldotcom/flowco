import { createClient, SupabaseClient } from "@supabase/supabase-js";
import expensesSeed from "@/data/expenses.json";
import policySeed from "@/data/policy.json";
import type { Expense, Policy, TriagedExpense } from "./types";

// Two backends behind one async API:
//  - Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set): persistent, works
//    on Vercel where lambdas are stateless. Auto-seeds on first read.
//  - In-memory: zero-setup local dev. Same seed data.

function seedExpenses(): TriagedExpense[] {
  return (expensesSeed as Expense[]).map((e) => ({ ...e, checks: null, aiVerdict: null, audit: [] }));
}

export function getPolicy(): Policy {
  return policySeed as Policy;
}

export function isSupabaseMode(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ---- memory backend ----

const g = globalThis as unknown as { __flowcoStore?: Map<string, TriagedExpense> };

function memMap(): Map<string, TriagedExpense> {
  if (!g.__flowcoStore) g.__flowcoStore = new Map(seedExpenses().map((e) => [e.id, e]));
  return g.__flowcoStore;
}

// ---- supabase backend ----

let sb: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!sb) {
    sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return sb;
}

function fail(op: string, message: string): never {
  throw new Error(`Supabase ${op} failed: ${message}`);
}

async function upsertRows(list: TriagedExpense[]): Promise<void> {
  const rows = list.map((e) => ({ id: e.id, data: e, updated_at: new Date().toISOString() }));
  const { error } = await supabase().from("expenses").upsert(rows);
  if (error) fail("upsert", error.message);
}

async function ensureSeeded(): Promise<void> {
  const { count, error } = await supabase()
    .from("expenses")
    .select("id", { count: "exact", head: true });
  if (error) fail("count", error.message);
  if ((count ?? 0) === 0) await upsertRows(seedExpenses());
}

// ---- public API ----

export async function listExpenses(): Promise<TriagedExpense[]> {
  if (!isSupabaseMode()) return Array.from(memMap().values());
  await ensureSeeded();
  const { data, error } = await supabase().from("expenses").select("data").order("id");
  if (error) fail("list", error.message);
  return (data ?? []).map((r) => r.data as TriagedExpense);
}

export async function getExpense(id: string): Promise<TriagedExpense | undefined> {
  if (!isSupabaseMode()) return memMap().get(id);
  const { data, error } = await supabase().from("expenses").select("data").eq("id", id).maybeSingle();
  if (error) fail("get", error.message);
  return (data?.data as TriagedExpense) ?? undefined;
}

export async function putExpense(expense: TriagedExpense): Promise<void> {
  if (!isSupabaseMode()) {
    memMap().set(expense.id, expense);
    return;
  }
  await upsertRows([expense]);
}

export async function resetStore(): Promise<void> {
  if (!isSupabaseMode()) {
    g.__flowcoStore = new Map(seedExpenses().map((e) => [e.id, e]));
    return;
  }
  const { error } = await supabase().from("expenses").delete().neq("id", "");
  if (error) fail("reset", error.message);
  await upsertRows(seedExpenses());
  // Best-effort: clear demo uploads from storage too, so reset really resets
  // and abandoned uploads can't accumulate forever. Never block the reset.
  try {
    const { data: files } = await supabase().storage.from("receipts").list("uploads", { limit: 100 });
    if (files && files.length > 0) {
      await supabase()
        .storage.from("receipts")
        .remove(files.map((f) => `uploads/${f.name}`));
    }
  } catch (err) {
    console.error("[store] upload cleanup during reset failed:", err);
  }
}

// Allocate the next EXP-2xxx id for conversational submissions.
export async function nextSubmittedId(): Promise<string> {
  const all = await listExpenses();
  const taken = new Set(all.map((e) => e.id));
  for (let n = 2001; ; n++) {
    const id = `EXP-${n}`;
    if (!taken.has(id)) return id;
  }
}
