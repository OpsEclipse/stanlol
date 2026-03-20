import assert from "node:assert/strict";
import test from "node:test";

const {
  analyticsEventNames,
  analyticsEventTaxonomy,
  getAnalyticsEventDefinition,
  isAnalyticsEventName,
} = await import(new URL("../../lib/analytics-events.ts", import.meta.url).href);

const expectedAnalyticsEventNames = [
  "auth.sign_in_started",
  "auth.sign_in_completed",
  "auth.signed_out",
  "workspace.opened",
  "chat.thread_created",
  "chat.message_submitted",
  "chat.response_completed",
  "draft.generated",
  "draft.refined",
  "draft.copied",
  "draft.time_to_first_draft_recorded",
  "voice.created",
  "voice.updated",
  "voice.selected",
  "import.started",
  "import.completed",
  "upload.completed",
];

test("defines the stable analytics event names for key workflow milestones", () => {
  assert.deepStrictEqual(analyticsEventNames, expectedAnalyticsEventNames);
});

test("keeps analytics event names unique and scoped by workflow", () => {
  assert.strictEqual(new Set(analyticsEventNames).size, analyticsEventNames.length);

  for (const analyticsEvent of analyticsEventTaxonomy) {
    assert.match(
      analyticsEvent.name,
      /^[a-z]+(?:_[a-z]+)*\.[a-z]+(?:_[a-z]+)*$/,
    );
    assert.notStrictEqual(analyticsEvent.description.trim(), "");
  }
});

test("supports runtime analytics event validation and lookup", () => {
  assert.strictEqual(isAnalyticsEventName("draft.copied"), true);
  assert.strictEqual(isAnalyticsEventName("draft.copy"), false);
  assert.deepStrictEqual(
    getAnalyticsEventDefinition("voice.selected"),
    {
      name: "voice.selected",
      category: "voice",
      description: "User selects the active voice for a drafting session.",
    },
  );
});
