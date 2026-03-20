import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  currentDirectory,
  "../../supabase/migrations/202603190003_create_chat_threads.sql",
);

test("chat threads migration defines the expected table contract", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /create table public\.chat_threads/i);
  assert.match(sql, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(sql, /user_id uuid not null references auth\.users \(id\) on delete cascade/i);
  assert.match(sql, /title text/i);
  assert.match(sql, /created_at timestamptz not null default timezone\('utc', now\(\)\)/i);
  assert.match(sql, /updated_at timestamptz not null default timezone\('utc', now\(\)\)/i);
  assert.match(sql, /chat_threads_title_not_blank/i);
  assert.match(sql, /chat_threads_user_id_updated_at_idx/i);
  assert.match(sql, /create function public\.set_chat_threads_updated_at\(\)/i);
  assert.match(sql, /create trigger set_chat_threads_updated_at/i);
  assert.match(sql, /create policy "Users can view own chat threads"/i);
  assert.match(sql, /create policy "Users can insert own chat threads"/i);
  assert.match(sql, /create policy "Users can update own chat threads"/i);
});
