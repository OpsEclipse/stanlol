import type { DbRow, SupabaseDbClient } from "./db.ts";

export const CHAT_THREAD_TABLE = "chat_threads";

export type ChatThreadRow = DbRow & {
  created_at: string;
  id: string;
  title: string | null;
  updated_at: string;
  user_id: string;
};

export interface CreateThreadOptions {
  userId: string;
}

const chatThreadColumns = ["id", "user_id", "title", "created_at", "updated_at"] as const;

function readRequiredText(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new Error(`${fieldName} cannot be empty.`);
  }

  return normalizedValue;
}

function createThreadInsertPayload(options: CreateThreadOptions) {
  return {
    title: null,
    user_id: readRequiredText(options.userId, "Chat thread userId"),
  };
}

export async function createThread(
  db: SupabaseDbClient,
  options: CreateThreadOptions,
): Promise<ChatThreadRow> {
  try {
    const [row] = await db.insert<ChatThreadRow>(CHAT_THREAD_TABLE, createThreadInsertPayload(options), {
      columns: chatThreadColumns,
    });

    if (!row) {
      throw new Error("Chat thread insert returned no row.");
    }

    return row;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chat thread creation error.";
    throw new Error(`Failed to create chat thread: ${message}`);
  }
}
