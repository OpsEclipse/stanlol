// Shared domain entities for app, service, and API boundaries.

export type ISODateTimeString = string;

export type UserId = string;
export type ThreadId = string;
export type MessageId = string;
export type DraftId = string;
export type DraftRevisionId = string;
export type VoiceId = string;
export type VoiceImportId = string;
export type VoiceSampleId = string;
export type AssetId = string;

export interface DomainRecord {
  id: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface UserProfile extends DomainRecord {
  id: UserId;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export type MessageRole = "user" | "assistant" | "system";

export interface ChatThread extends DomainRecord {
  id: ThreadId;
  userId: UserId;
  title: string;
  activeDraftId: DraftId | null;
  activeVoiceId: VoiceId | null;
  lastMessageAt: ISODateTimeString | null;
}

export interface ChatMessage extends DomainRecord {
  id: MessageId;
  userId: UserId;
  threadId: ThreadId;
  role: MessageRole;
  content: string;
  sequenceNumber: number;
}

export interface VoiceProfile extends DomainRecord {
  id: VoiceId;
  userId: UserId;
  name: string;
  description: string | null;
  instructions: string;
  sampleCount: number;
}

export type VoiceImportSource = "linkedin" | "manual_text" | "manual_file";

export type VoiceImportStatus = "pending" | "completed" | "failed";

export interface VoiceImport extends DomainRecord {
  id: VoiceImportId;
  userId: UserId;
  voiceId: VoiceId;
  source: VoiceImportSource;
  status: VoiceImportStatus;
  sampleCount: number;
  sourceUrl: string | null;
  filename: string | null;
  mimeType: string | null;
  errorMessage: string | null;
}

export interface VoiceSample extends DomainRecord {
  id: VoiceSampleId;
  userId: UserId;
  voiceId: VoiceId;
  importId: VoiceImportId | null;
  sourceLabel: string | null;
  content: string;
}

export interface Draft extends DomainRecord {
  id: DraftId;
  userId: UserId;
  threadId: ThreadId;
  voiceId: VoiceId | null;
  currentRevisionId: DraftRevisionId | null;
  assetId: AssetId | null;
  content: string;
  lastGeneratedAt: ISODateTimeString | null;
}

export type DraftRevisionSource =
  | "initial_generation"
  | "refinement"
  | "manual_edit";

export interface DraftRevision extends DomainRecord {
  id: DraftRevisionId;
  userId: UserId;
  draftId: DraftId;
  threadId: ThreadId;
  revisionNumber: number;
  source: DraftRevisionSource;
  content: string;
}

export type UploadedAssetType = "image";

export interface UploadedAsset extends DomainRecord {
  id: AssetId;
  userId: UserId;
  draftId: DraftId | null;
  type: UploadedAssetType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  publicUrl: string | null;
  altText: string | null;
}

export interface ThreadDetail {
  thread: ChatThread;
  messages: ChatMessage[];
  activeDraft: Draft | null;
  activeVoice: VoiceProfile | null;
}

export interface DraftDetail {
  draft: Draft;
  revisions: DraftRevision[];
  asset: UploadedAsset | null;
}

export interface VoiceDetail {
  voice: VoiceProfile;
  imports: VoiceImport[];
  samples: VoiceSample[];
}
