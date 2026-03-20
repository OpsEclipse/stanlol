import { withAuthenticatedApi } from "../../../lib/authenticated-api";
import { jsonError, jsonSuccess } from "../../../lib/json-response";
import { validateQuery, object } from "../../../lib/validation";
import { listVoiceProfiles } from "../../../lib/voice-list";

const VOICE_LIST_QUERY_VALIDATOR = object({});

export const GET = withAuthenticatedApi(async ({ db, user }, request) => {
  try {
    const validation = validateQuery(new URL(request.url), VOICE_LIST_QUERY_VALIDATOR);

    if (validation.success === false) {
      return jsonError(validation.error, { status: 400 });
    }

    const voices = await listVoiceProfiles(db, {
      userId: user.id,
    });

    return jsonSuccess({ voices });
  } catch (error) {
    return jsonError(error);
  }
});
