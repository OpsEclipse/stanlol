import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  currentDirectory,
  "../../supabase/migrations/202603190002_create_generation_audit_events.sql",
);

test("generation audit events migration defines the expected table contract", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /create table public\.generation_audit_events/i);
  assert.match(sql, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(sql, /user_id uuid not null references auth\.users \(id\) on delete cascade/i);
  assert.match(sql, /outcome text not null check \(outcome in \('success', 'failure'\)\)/i);
  assert.match(sql, /generation_latency_ms integer check \(generation_latency_ms is null or generation_latency_ms >= 0\)/i);
  assert.match(sql, /metadata jsonb not null default '\{\}'::jsonb/i);
  assert.match(sql, /generation_audit_events_user_id_created_at_idx/i);
  assert.match(sql, /generation_audit_events_thread_id_created_at_idx/i);
  assert.match(sql, /generation_audit_events_outcome_created_at_idx/i);
  assert.match(sql, /create policy "Users can view own generation audit events"/i);
  assert.match(sql, /create policy "Users can insert own generation audit events"/i);
});
