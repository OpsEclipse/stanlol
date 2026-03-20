import type { DbRow, SupabaseDbClient } from "./db.ts";

export const CHAT_MESSAGE_TABLE = "chat_messages";
export const ASSISTANT_MESSAGE_ROLE = "assistant";
export const USER_MESSAGE_ROLE = "user";

export type ChatMessageRole = typeof ASSISTANT_MESSAGE_ROLE | typeof USER_MESSAGE_ROLE;

export type ChatMessageRow = DbRow & {
  content: string;
  created_at: string;
  id: string;
  position: number;
  role: ChatMessageRole;
  thread_id: string;
};

export interface CreateAssistantMessageOptions {
  content: string;
  threadId: string;
}

export interface CreateUserMessageOptions {
  content: string;
  threadId: string;
}

const chatMessageColumns = ["id", "thread_id", "role", "content", "position", "created_at"] as const;
const latestMessagePositionColumns = ["position"] as const;

function readRequiredText(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new Error(`${fieldName} cannot be empty.`);
  }

  return normalizedValue;
}

function readExistingMessagePosition(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Latest chat message position must be a positive integer.");
  }

  return value;
}

async function getNextMessagePosition(db: SupabaseDbClient, threadId: string): Promise<number> {
  const latestMessage = await db.selectOne<Pick<ChatMessageRow, "position"> & DbRow>(CHAT_MESSAGE_TABLE, {
    columns: latestMessagePositionColumns,
    filters: [
      {
        column: "thread_id",
        operator: "eq",
        value: threadId,
      },
    ],
    orderBy: {
      column: "position",
      ascending: false,
    },
  });

  return readExistingMessagePosition(latestMessage?.position) + 1;
}

async function createMessage(
  db: SupabaseDbClient,
  options: CreateAssistantMessageOptions | CreateUserMessageOptions,
  config: {
    emptyContentFieldName: string;
    emptyThreadIdFieldName: string;
    insertEmptyMessage: string;
    persistenceFailurePrefix: string;
    role: ChatMessageRole;
  },
): Promise<ChatMessageRow> {
  try {
    const threadId = readRequiredText(options.threadId, config.emptyThreadIdFieldName);
    const content = readRequiredText(options.content, config.emptyContentFieldName);
    const position = await getNextMessagePosition(db, threadId);
    const [row] = await db.insert<ChatMessageRow>(
      CHAT_MESSAGE_TABLE,
      {
        content,
        position,
        role: config.role,
        thread_id: threadId,
      },
      {
        columns: chatMessageColumns,
      },
    );

    if (!row) {
      throw new Error(config.insertEmptyMessage);
    }

    return row;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Unknown ${config.role} message persistence error.`;
    throw new Error(`${config.persistenceFailurePrefix}: ${message}`);
  }
}

export async function createAssistantMessage(
  db: SupabaseDbClient,
  options: CreateAssistantMessageOptions,
): Promise<ChatMessageRow> {
  return createMessage(db, options, {
    emptyContentFieldName: "Assistant message content",
    emptyThreadIdFieldName: "Assistant message threadId",
    insertEmptyMessage: "Assistant message insert returned no row.",
    persistenceFailurePrefix: "Failed to persist assistant message",
    role: ASSISTANT_MESSAGE_ROLE,
  });
}

export async function createUserMessage(
  db: SupabaseDbClient,
  options: CreateUserMessageOptions,
): Promise<ChatMessageRow> {
  return createMessage(db, options, {
    emptyContentFieldName: "User message content",
    emptyThreadIdFieldName: "User message threadId",
    insertEmptyMessage: "User message insert returned no row.",
    persistenceFailurePrefix: "Failed to persist user message",
    role: USER_MESSAGE_ROLE,
  });
}
