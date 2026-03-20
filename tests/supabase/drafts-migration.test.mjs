import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  currentDirectory,
  "../../supabase/migrations/202603190005_create_drafts.sql",
);

test("drafts migration defines the expected table contract", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /create table public\.drafts/i);
  assert.match(sql, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(sql, /thread_id uuid not null references public\.chat_threads \(id\) on delete cascade/i);
  assert.match(sql, /content text not null/i);
  assert.match(sql, /created_at timestamptz not null default timezone\('utc', now\(\)\)/i);
  assert.match(sql, /updated_at timestamptz not null default timezone\('utc', now\(\)\)/i);
  assert.match(sql, /drafts_content_not_blank/i);
  assert.match(sql, /drafts_thread_id_key/i);
  assert.match(sql, /create function public\.set_drafts_updated_at\(\)/i);
  assert.match(sql, /create trigger set_drafts_updated_at/i);
  assert.match(sql, /create policy "Users can view own drafts"/i);
  assert.match(sql, /create policy "Users can insert own drafts"/i);
  assert.match(sql, /create policy "Users can update own drafts"/i);
});
