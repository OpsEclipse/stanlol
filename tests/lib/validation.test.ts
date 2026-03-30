import test from "node:test";
import assert from "node:assert/strict";

import {
  ValidationError,
  array,
  boolean,
  enumValue,
  number,
  object,
  optional,
  parsePayload,
  string,
  validatePayload,
  validateQuery,
} from "../../lib/validation";

test("validatePayload returns parsed data for valid payload objects", () => {
  const schema = object({
    name: string({ trim: true, minLength: 2 }),
    role: enumValue(["admin", "member"] as const),
    age: optional(number({ integer: true, min: 18 })),
    tags: array(string({ trim: true }), { minLength: 1 }),
  });

  const result = validatePayload(
    {
      name: "  Ada Lovelace  ",
      role: "admin",
      tags: [" math ", " logic "],
    },
    schema,
  );

  assert.equal(result.success, true);

  if (!result.success) {
    return;
  }

  assert.deepEqual(result.data, {
    name: "Ada Lovelace",
    role: "admin",
    age: undefined,
    tags: ["math", "logic"],
  });
});

test("validatePayload reports field and unknown-key issues for invalid payload objects", () => {
  const schema = object({
    name: string({ trim: true, minLength: 2 }),
    count: number({ integer: true, min: 1 }),
  });

  const result = validatePayload(
    {
      name: " ",
      count: 1.5,
      extra: true,
    },
    schema,
  );

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.equal(result.error, "Invalid request payload.");
  assert.deepEqual(result.issues, [
    {
      code: "unexpected_key",
      message: "Unexpected field.",
      path: "extra",
    },
    {
      code: "too_small",
      message: "Expected at least 1 character.",
      path: "name",
    },
    {
      code: "invalid_type",
      message: "Expected an integer.",
      path: "count",
    },
  ]);
});

test("validateQuery normalizes repeated params and coerces scalars", () => {
  const schema = object({
    page: number({ coerce: true, integer: true, min: 1 }),
    includeArchived: optional(boolean({ coerce: true }), { defaultValue: false }),
    tags: array(string({ trim: true }), { minLength: 1 }),
  });

  const result = validateQuery(
    new URLSearchParams("page=2&includeArchived=yes&tags=alpha&tags=%20beta%20"),
    schema,
  );

  assert.equal(result.success, true);

  if (!result.success) {
    return;
  }

  assert.deepEqual(result.data, {
    page: 2,
    includeArchived: true,
    tags: ["alpha", "beta"],
  });
});

test("parsePayload throws ValidationError with collected issues", () => {
  const schema = object({
    userId: string(),
    limit: optional(number({ coerce: true, integer: true, min: 1 }), { defaultValue: 25 }),
  });

  assert.throws(
    () =>
      parsePayload(
        {
          limit: "0",
        },
        schema,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.message, "Invalid request payload.");
      assert.deepEqual(error.issues, [
        {
          code: "required",
          message: "Required.",
          path: "userId",
        },
        {
          code: "too_small",
          message: "Expected a number greater than or equal to 1.",
          path: "limit",
        },
      ]);
      return true;
    },
  );
});
