import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  currentDirectory,
  "../../supabase/migrations/202603190008_create_voice_samples.sql",
);

test("voice samples migration defines the expected table contract", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /create table public\.voice_samples/i);
  assert.match(sql, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(
    sql,
    /voice_profile_id uuid not null references public\.voice_profiles \(id\) on delete cascade/i,
  );
  assert.match(sql, /source text not null/i);
  assert.match(sql, /content text not null/i);
  assert.match(sql, /created_at timestamptz not null default timezone\('utc', now\(\)\)/i);
  assert.match(sql, /voice_samples_source_valid/i);
  assert.match(sql, /voice_samples_content_not_blank/i);
  assert.match(sql, /voice_samples_voice_profile_id_created_at_idx/i);
  assert.match(sql, /create policy "Users can view own voice samples"/i);
  assert.match(sql, /create policy "Users can insert own voice samples"/i);
});
