export type ValidationIssueCode =
  | "invalid_enum"
  | "invalid_type"
  | "required"
  | "too_big"
  | "too_small"
  | "unexpected_key";

export interface ValidationIssue {
  code: ValidationIssueCode;
  message: string;
  path: string;
}

export interface ValidationSuccess<T> {
  success: true;
  data: T;
}

export interface ValidationFailure {
  success: false;
  error: string;
  issues: ValidationIssue[];
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

interface ParseSuccess<T> {
  ok: true;
  value: T;
}

interface ParseFailure {
  ok: false;
}

type ParseResult<T> = ParseSuccess<T> | ParseFailure;

interface ParseContext {
  issues: ValidationIssue[];
}

export interface Validator<T> {
  parse: (value: unknown, path: string, context: ParseContext) => ParseResult<T>;
}

export type InferValidator<TValidator extends Validator<unknown>> =
  TValidator extends Validator<infer TValue> ? TValue : never;

export interface StringValidationOptions {
  allowEmpty?: boolean;
  maxLength?: number;
  minLength?: number;
  trim?: boolean;
}

export interface NumberValidationOptions {
  coerce?: boolean;
  integer?: boolean;
  max?: number;
  min?: number;
}

export interface BooleanValidationOptions {
  coerce?: boolean;
}

export interface ArrayValidationOptions {
  maxLength?: number;
  minLength?: number;
}

export interface ObjectValidationOptions {
  allowUnknown?: boolean;
}

export interface OptionalValidationOptions<T> {
  defaultValue?: T | (() => T);
}

export interface ValidationOptions {
  errorMessage?: string;
  rootPath?: string;
}

export type QueryParamPrimitive = string | number | boolean | null;

export type QueryInput =
  | string
  | URL
  | URLSearchParams
  | Record<string, QueryParamPrimitive | QueryParamPrimitive[] | undefined>;

const INVALID: ParseFailure = { ok: false };
const TRUE_QUERY_VALUES = new Set(["1", "on", "true", "yes"]);
const FALSE_QUERY_VALUES = new Set(["0", "false", "no", "off"]);

export class ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

function isValidationFailure<T>(result: ValidationResult<T>): result is ValidationFailure {
  return result.success === false;
}

function createValidator<T>(
  parse: (value: unknown, path: string, context: ParseContext) => ParseResult<T>,
): Validator<T> {
  return { parse };
}

function success<T>(value: T): ParseSuccess<T> {
  return { ok: true, value };
}

function addIssue(
  context: ParseContext,
  path: string,
  code: ValidationIssueCode,
  message: string,
): ParseFailure {
  context.issues.push({
    code,
    message,
    path,
  });

  return INVALID;
}

function joinPath(basePath: string, segment: string): string {
  if (!basePath) {
    return segment;
  }

  if (segment.startsWith("[")) {
    return `${basePath}${segment}`;
  }

  return `${basePath}.${segment}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function resolveDefaultValue<T>(defaultValue: T | (() => T)): T {
  return typeof defaultValue === "function" ? (defaultValue as () => T)() : defaultValue;
}

function normalizeRecordQueryInput(
  input: Record<string, QueryParamPrimitive | QueryParamPrimitive[] | undefined>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      output[key] = value.map((item) => (item === null ? "" : String(item)));
      continue;
    }

    output[key] = value === null ? "" : String(value);
  }

  return output;
}

export function normalizeQueryParams(input: QueryInput): Record<string, unknown> {
  if (typeof input === "string") {
    return normalizeQueryParams(new URLSearchParams(input));
  }

  if (input instanceof URL) {
    return normalizeQueryParams(input.searchParams);
  }

  if (input instanceof URLSearchParams) {
    const output: Record<string, unknown> = {};
    const visitedKeys = new Set<string>();

    for (const key of input.keys()) {
      if (visitedKeys.has(key)) {
        continue;
      }

      visitedKeys.add(key);

      const values = input.getAll(key);
      output[key] = values.length > 1 ? values : (values[0] ?? "");
    }

    return output;
  }

  return normalizeRecordQueryInput(input);
}

export function string(options: StringValidationOptions = {}): Validator<string> {
  return createValidator((value, path, context) => {
    if (value === undefined) {
      return addIssue(context, path, "required", "Required.");
    }

    if (typeof value !== "string") {
      return addIssue(context, path, "invalid_type", "Expected a string.");
    }

    const nextValue = options.trim ? value.trim() : value;
    const allowEmpty = options.allowEmpty ?? false;

    if (!allowEmpty && nextValue.length === 0) {
      return addIssue(context, path, "too_small", "Expected at least 1 character.");
    }

    if (options.minLength !== undefined && nextValue.length < options.minLength) {
      return addIssue(
        context,
        path,
        "too_small",
        `Expected at least ${options.minLength} characters.`,
      );
    }

    if (options.maxLength !== undefined && nextValue.length > options.maxLength) {
      return addIssue(
        context,
        path,
        "too_big",
        `Expected at most ${options.maxLength} characters.`,
      );
    }

    return success(nextValue);
  });
}

export function number(options: NumberValidationOptions = {}): Validator<number> {
  return createValidator((value, path, context) => {
    if (value === undefined) {
      return addIssue(context, path, "required", "Required.");
    }

    let nextValue: number | undefined;

    if (typeof value === "number") {
      nextValue = value;
    } else if (options.coerce && typeof value === "string" && value.trim() !== "") {
      nextValue = Number(value);
    }

    if (nextValue === undefined || !Number.isFinite(nextValue)) {
      return addIssue(context, path, "invalid_type", "Expected a number.");
    }

    if (options.integer && !Number.isInteger(nextValue)) {
      return addIssue(context, path, "invalid_type", "Expected an integer.");
    }

    if (options.min !== undefined && nextValue < options.min) {
      return addIssue(context, path, "too_small", `Expected a number greater than or equal to ${options.min}.`);
    }

    if (options.max !== undefined && nextValue > options.max) {
      return addIssue(context, path, "too_big", `Expected a number less than or equal to ${options.max}.`);
    }

    return success(nextValue);
  });
}

export function boolean(options: BooleanValidationOptions = {}): Validator<boolean> {
  return createValidator((value, path, context) => {
    if (value === undefined) {
      return addIssue(context, path, "required", "Required.");
    }

    if (typeof value === "boolean") {
      return success(value);
    }

    if (options.coerce && typeof value === "string") {
      const normalizedValue = value.trim().toLowerCase();

      if (TRUE_QUERY_VALUES.has(normalizedValue)) {
        return success(true);
      }

      if (FALSE_QUERY_VALUES.has(normalizedValue)) {
        return success(false);
      }
    }

    return addIssue(context, path, "invalid_type", "Expected a boolean.");
  });
}

export function enumValue<const TValue extends string | number>(
  values: readonly TValue[],
): Validator<TValue> {
  return createValidator((value, path, context) => {
    if (value === undefined) {
      return addIssue(context, path, "required", "Required.");
    }

    if (!values.includes(value as TValue)) {
      return addIssue(
        context,
        path,
        "invalid_enum",
        `Expected one of: ${values.map((item) => String(item)).join(", ")}.`,
      );
    }

    return success(value as TValue);
  });
}

export function optional<T>(
  validator: Validator<T>,
  options: OptionalValidationOptions<T> = {},
): Validator<T | undefined> {
  return createValidator((value, path, context) => {
    if (value === undefined) {
      if (isDefined(options.defaultValue)) {
        return success(resolveDefaultValue(options.defaultValue));
      }

      return success(undefined);
    }

    return validator.parse(value, path, context);
  });
}

export function array<T>(
  validator: Validator<T>,
  options: ArrayValidationOptions = {},
): Validator<T[]> {
  return createValidator((value, path, context) => {
    const startingIssueCount = context.issues.length;

    if (value === undefined) {
      return addIssue(context, path, "required", "Required.");
    }

    if (!Array.isArray(value)) {
      return addIssue(context, path, "invalid_type", "Expected an array.");
    }

    if (options.minLength !== undefined && value.length < options.minLength) {
      addIssue(context, path, "too_small", `Expected at least ${options.minLength} items.`);
    }

    if (options.maxLength !== undefined && value.length > options.maxLength) {
      addIssue(context, path, "too_big", `Expected at most ${options.maxLength} items.`);
    }

    const items: T[] = [];
    let isValid = true;

    value.forEach((item, index) => {
      const result = validator.parse(item, joinPath(path, `[${index}]`), context);

      if (!result.ok) {
        isValid = false;
        return;
      }

      items.push(result.value);
    });

    return isValid && context.issues.length === startingIssueCount ? success(items) : INVALID;
  });
}

export function object<TShape extends Record<string, Validator<unknown>>>(
  shape: TShape,
  options: ObjectValidationOptions = {},
): Validator<{ [TKey in keyof TShape]: InferValidator<TShape[TKey]> }> {
  return createValidator((value, path, context) => {
    if (value === undefined) {
      return addIssue(context, path, "required", "Required.");
    }

    if (!isPlainObject(value)) {
      return addIssue(context, path, "invalid_type", "Expected an object.");
    }

    const output = {} as { [TKey in keyof TShape]: InferValidator<TShape[TKey]> };
    const allowedKeys = new Set(Object.keys(shape));
    let isValid = true;

    if (!options.allowUnknown) {
      for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
          addIssue(context, joinPath(path, key), "unexpected_key", "Unexpected field.");
          isValid = false;
        }
      }
    }

    for (const key of Object.keys(shape) as Array<keyof TShape>) {
      const result = shape[key].parse(value[key as string], joinPath(path, key as string), context);

      if (!result.ok) {
        isValid = false;
        continue;
      }

      output[key] = result.value as InferValidator<TShape[typeof key]>;
    }

    return isValid ? success(output) : INVALID;
  });
}

export function validate<T>(
  input: unknown,
  validator: Validator<T>,
  options: ValidationOptions = {},
): ValidationResult<T> {
  const context: ParseContext = { issues: [] };
  const result = validator.parse(input, options.rootPath ?? "", context);

  if (result.ok && context.issues.length === 0) {
    return {
      success: true,
      data: result.value,
    };
  }

  return {
    success: false,
    error: options.errorMessage ?? "Invalid request input.",
    issues: context.issues,
  };
}

export function parse<T>(
  input: unknown,
  validator: Validator<T>,
  options: ValidationOptions = {},
): T {
  const result = validate(input, validator, options);

  if (isValidationFailure(result)) {
    throw new ValidationError(result.error, result.issues);
  }

  return result.data;
}

export function validatePayload<T>(
  input: unknown,
  validator: Validator<T>,
  options: Omit<ValidationOptions, "errorMessage"> = {},
): ValidationResult<T> {
  return validate(input, validator, {
    ...options,
    errorMessage: "Invalid request payload.",
  });
}

export function parsePayload<T>(
  input: unknown,
  validator: Validator<T>,
  options: Omit<ValidationOptions, "errorMessage"> = {},
): T {
  return parse(input, validator, {
    ...options,
    errorMessage: "Invalid request payload.",
  });
}

export function validateQuery<T>(
  input: QueryInput,
  validator: Validator<T>,
  options: Omit<ValidationOptions, "errorMessage"> = {},
): ValidationResult<T> {
  return validate(normalizeQueryParams(input), validator, {
    ...options,
    errorMessage: "Invalid query parameters.",
  });
}

export function parseQuery<T>(
  input: QueryInput,
  validator: Validator<T>,
  options: Omit<ValidationOptions, "errorMessage"> = {},
): T {
  return parse(normalizeQueryParams(input), validator, {
    ...options,
    errorMessage: "Invalid query parameters.",
  });
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}
