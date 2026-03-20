import { withAuthenticatedApi } from "../../../../lib/authenticated-api";
import { jsonError, jsonSuccess } from "../../../../lib/json-response";
import {
  DEFAULT_THREAD_LIST_LIMIT,
  listRecentThreads,
} from "../../../../lib/thread-list";
import {
  number,
  object,
  optional,
  validateQuery,
} from "../../../../lib/validation";

const THREAD_LIST_QUERY_VALIDATOR = object({
  limit: optional(number({ coerce: true, integer: true, min: 1 }), {
    defaultValue: DEFAULT_THREAD_LIST_LIMIT,
  }),
});

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
