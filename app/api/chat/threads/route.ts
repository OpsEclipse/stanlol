import { withAuthenticatedApi } from "../../../../lib/authenticated-api";
import { jsonError, jsonSuccess } from "../../../../lib/json-response";
import { createThread } from "../../../../lib/thread-create";
import {
  DEFAULT_THREAD_LIST_LIMIT,
  listRecentThreads,
} from "../../../../lib/thread-list";
import {
  number,
  object,
  optional,
  validatePayload,
  validateQuery,
} from "../../../../lib/validation";

const THREAD_LIST_QUERY_VALIDATOR = object({
  limit: optional(number({ coerce: true, integer: true, min: 1 }), {
    defaultValue: DEFAULT_THREAD_LIST_LIMIT,
  }),
});
const THREAD_CREATE_PAYLOAD_VALIDATOR = object({});

async function parseRequestPayload(request: Request): Promise<unknown> {
  const bodyText = await request.text();

  if (!bodyText.trim()) {
    return {};
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    throw new Error("Invalid request payload.");
  }
}

export const GET = withAuthenticatedApi(async ({ db, user }, request) => {
  try {
    const validation = validateQuery(new URL(request.url), THREAD_LIST_QUERY_VALIDATOR);

    if (validation.success === false) {
      return jsonError(validation.error, { status: 400 });
    }

    const threads = await listRecentThreads(db, {
      limit: validation.data.limit,
      userId: user.id,
    });

    return jsonSuccess({ threads });
  } catch (error) {
    return jsonError(error);
  }
});

export const POST = withAuthenticatedApi(async ({ db, user }, request) => {
  try {
    const payload = await parseRequestPayload(request);
    const validation = validatePayload(payload, THREAD_CREATE_PAYLOAD_VALIDATOR);

    if (validation.success === false) {
      return jsonError(validation.error, { status: 400 });
    }

    const thread = await createThread(db, {
      userId: user.id,
    });

    return jsonSuccess({ thread }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request payload.") {
      return jsonError(error.message, { status: 400 });
    }

    return jsonError(error);
  }
});
