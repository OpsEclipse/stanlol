import type { DbFilter, DbRow, SupabaseDbClient } from "./db.ts";

export const VOICE_PROFILE_TABLE = "voice_profiles";

export type VoiceProfileRow = DbRow & {
  created_at: string;
  description: string | null;
  id: string;
  instructions: string;
  name: string;
  updated_at: string;
  user_id: string;
};

export interface ListVoiceProfilesOptions {
  userId: string;
}

export interface GetVoiceProfileOptions {
  userId: string;
  voiceId: string;
}

type VoiceProfileOwnershipRow = DbRow & {
  id: string;
};

const voiceProfileColumns = [
  "id",
  "user_id",
  "name",
  "description",
  "instructions",
  "created_at",
  "updated_at",
] as const;
const voiceProfileOwnershipColumns = ["id"] as const;

function readRequiredText(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new Error(`${fieldName} cannot be empty.`);
  }

  return normalizedValue;
}

function buildVoiceOwnershipFilters(options: GetVoiceProfileOptions): DbFilter[] {
  return [
    {
      column: "id",
      operator: "eq",
      value: readRequiredText(options.voiceId, "Voice profile voiceId"),
    },
    {
      column: "user_id",
      operator: "eq",
      value: readRequiredText(options.userId, "Voice profile userId"),
    },
  ];
}

export async function listVoiceProfiles(
  db: SupabaseDbClient,
  options: ListVoiceProfilesOptions,
): Promise<VoiceProfileRow[]> {
  try {
    return await db.select<VoiceProfileRow>(VOICE_PROFILE_TABLE, {
      columns: voiceProfileColumns,
      filters: [
        {
          column: "user_id",
          operator: "eq",
          value: readRequiredText(options.userId, "Voice profile userId"),
        },
      ],
      orderBy: {
        column: "updated_at",
        ascending: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown voice profile list error.";
    throw new Error(`Failed to list voice profiles: ${message}`);
  }
}

export async function getVoiceProfile(
  db: SupabaseDbClient,
  options: GetVoiceProfileOptions,
): Promise<VoiceProfileRow | null> {
  try {
    return await db.selectOne<VoiceProfileRow>(VOICE_PROFILE_TABLE, {
      columns: voiceProfileColumns,
      filters: buildVoiceOwnershipFilters(options),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown voice profile fetch error.";
    throw new Error(`Failed to fetch voice profile: ${message}`);
  }
}

export async function assertVoiceProfileOwnership(
  db: SupabaseDbClient,
  options: GetVoiceProfileOptions,
): Promise<void> {
  try {
    const row = await db.selectOne<VoiceProfileOwnershipRow>(VOICE_PROFILE_TABLE, {
      columns: voiceProfileOwnershipColumns,
      filters: buildVoiceOwnershipFilters(options),
    });

    if (!row) {
      throw new Error("Voice profile was not found for the current user.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown voice ownership error.";
    throw new Error(`Failed to verify voice ownership: ${message}`);
  }
}
