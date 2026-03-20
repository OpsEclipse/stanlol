import type { DbRow, SupabaseDbClient } from "./db.ts";

export const CHAT_THREAD_TABLE = "chat_threads";

export type ChatThreadOwnershipRow = DbRow & {
  created_at: string;
  id: string;
  title: string | null;
  updated_at: string;
  user_id: string;
};

export interface GetOwnedThreadOptions {
  threadId: string;
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

export async function getOwnedThread(
  db: SupabaseDbClient,
  options: GetOwnedThreadOptions,
): Promise<ChatThreadOwnershipRow | null> {
  try {
    return await db.selectOne<ChatThreadOwnershipRow>(CHAT_THREAD_TABLE, {
      columns: chatThreadColumns,
      filters: [
        {
          column: "id",
          operator: "eq",
          value: readRequiredText(options.threadId, "Chat thread threadId"),
        },
        {
          column: "user_id",
          operator: "eq",
          value: readRequiredText(options.userId, "Chat thread userId"),
        },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chat thread ownership error.";
    throw new Error(`Failed to enforce chat thread ownership: ${message}`);
  }
}
