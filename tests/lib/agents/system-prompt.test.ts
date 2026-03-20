import * as assert from "node:assert/strict";
import { test } from "node:test";

const {
  GENERATION_SYSTEM_PROMPT_BEHAVIOR,
  GENERATION_SYSTEM_PROMPT_BOUNDARIES,
  GENERATION_SYSTEM_PROMPT_OUTPUT,
  GENERATION_SYSTEM_PROMPT_SUPPORTED_ACTIONS,
  GENERATION_SYSTEM_PROMPT_VERSION,
  buildGenerationSystemPrompt,
} = await import(new URL("../../../lib/agents/system-prompt.ts", import.meta.url).href);

test("buildGenerationSystemPrompt encodes the v1 generation role and workflow", () => {
  const prompt = buildGenerationSystemPrompt();

  assert.match(prompt, new RegExp(`Prompt version: ${GENERATION_SYSTEM_PROMPT_VERSION}`));
  assert.match(prompt, /Stanlol's generation assistant for drafting LinkedIn posts/i);
  assert.match(prompt, /chat-first product/i);
  assert.match(prompt, /selected voice and any relevant imported writing samples/i);
  assert.match(prompt, /still exploratory or ready for draft generation/i);
  assert.match(prompt, /sharpen angle, tone, structure, and clarity/i);
  assert.match(prompt, /generate or revise the active LinkedIn draft/i);
});

test("buildGenerationSystemPrompt locks the product boundaries for v1", () => {
  const prompt = buildGenerationSystemPrompt();

  assert.match(prompt, /Supported product actions only/i);
  assert.match(prompt, /Ask focused follow-up questions that improve the current LinkedIn post draft/i);
  assert.match(prompt, /Generate the first active LinkedIn draft for the current thread/i);
  assert.match(prompt, /Revise the existing active LinkedIn draft for the current thread/i);
  assert.match(prompt, /If a request falls outside these actions, explain the limitation/i);
  assert.match(prompt, /one active draft per thread/i);
  assert.match(prompt, /existing draft instead of creating multiple competing branches/i);
  assert.match(prompt, /attached image as supporting context/i);
  assert.match(prompt, /manual handoff/i);
  assert.match(prompt, /Do not directly publish to LinkedIn/i);
  assert.match(prompt, /Do not schedule posts/i);
  assert.match(prompt, /Do not reference or import public posts from other people/i);
  assert.match(prompt, /unsupported third-party tools/i);
  assert.match(prompt, /arbitrary long-running loops or multi-agent behavior/i);
});

test("buildGenerationSystemPrompt keeps versioned prompt fragments reusable", () => {
  const prompt = buildGenerationSystemPrompt();

  assert.ok(prompt.includes(GENERATION_SYSTEM_PROMPT_BEHAVIOR));
  assert.ok(prompt.includes(GENERATION_SYSTEM_PROMPT_SUPPORTED_ACTIONS));
  assert.ok(prompt.includes(GENERATION_SYSTEM_PROMPT_BOUNDARIES));
  assert.ok(prompt.includes(GENERATION_SYSTEM_PROMPT_OUTPUT));
  assert.match(prompt, /Produce a polished LinkedIn-ready result when enough signal exists/i);
  assert.match(prompt, /single active draft/i);
});
