import { withAuthenticatedApi } from "../../../lib/authenticated-api";
import { jsonError, jsonSuccess } from "../../../lib/json-response";
import { createVoiceProfile } from "../../../lib/voice-create";
import {
  object,
  optional,
  string,
  validatePayload,
  validateQuery,
} from "../../../lib/validation";
import { listVoiceProfiles } from "../../../lib/voice-list";
import { updateVoiceProfile } from "../../../lib/voice-update";

const VOICE_LIST_QUERY_VALIDATOR = object({});
const VOICE_CREATE_PAYLOAD_VALIDATOR = object({
  description: optional(string({ allowEmpty: true, trim: true })),
  instructions: string({ trim: true }),
  name: string({ trim: true }),
});
const VOICE_UPDATE_PAYLOAD_VALIDATOR = object({
  description: optional(string({ allowEmpty: true, trim: true })),
  instructions: string({ trim: true }),
  name: string({ trim: true }),
  voiceId: string({ trim: true }),
});

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

export const POST = withAuthenticatedApi(async ({ db, user }, request) => {
  try {
    const payload = await parseRequestPayload(request);
    const validation = validatePayload(payload, VOICE_CREATE_PAYLOAD_VALIDATOR);

    if (validation.success === false) {
      return jsonError(validation.error, { status: 400 });
    }

    const voice = await createVoiceProfile(db, {
      description: validation.data.description,
      instructions: validation.data.instructions,
      name: validation.data.name,
      userId: user.id,
    });

    return jsonSuccess({ voice }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request payload.") {
      return jsonError(error.message, { status: 400 });
    }

    return jsonError(error);
  }
});

export const PATCH = withAuthenticatedApi(async ({ db, user }, request) => {
  try {
    const payload = await parseRequestPayload(request);
    const validation = validatePayload(payload, VOICE_UPDATE_PAYLOAD_VALIDATOR);

    if (validation.success === false) {
      return jsonError(validation.error, { status: 400 });
    }

    const voice = await updateVoiceProfile(db, {
      description: validation.data.description,
      instructions: validation.data.instructions,
      name: validation.data.name,
      userId: user.id,
      voiceId: validation.data.voiceId,
    });

    return jsonSuccess({ voice });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request payload.") {
      return jsonError(error.message, { status: 400 });
    }

    return jsonError(error);
  }
});
