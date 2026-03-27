const DEFAULT_SCHEMA = "public";
const SUPABASE_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const SUPABASE_SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY";

export type DbScalar = boolean | number | string | null;
export type DbJson =
  | DbScalar
  | DbJson[]
  | {
      [key: string]: DbJson | undefined;
    };

export type DbRow = Record<string, DbJson>;
export type DbMutationPayload = Record<string, DbJson | undefined>;
export type DbRpcArgs = Record<string, DbJson | undefined>;
export type DbFilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "in"
  | "is";
export type DbReturningMode = "minimal" | "representation";

export interface DbFilter {
  column: string;
  operator: DbFilterOperator;
  value: DbScalar | readonly DbScalar[];
}

export interface DbOrder {
  column: string;
  ascending?: boolean;
  nulls?: "first" | "last";
}

export interface DbQueryOptions {
  columns?: readonly string[] | string;
  filters?: readonly DbFilter[];
  limit?: number;
  offset?: number;
  orderBy?: DbOrder | readonly DbOrder[];
  schema?: string;
}

export interface DbMutationOptions extends DbQueryOptions {
  returning?: DbReturningMode;
}

export interface DbUpsertOptions extends DbMutationOptions {
  ignoreDuplicates?: boolean;
  onConflict?: readonly string[] | string;
}

export interface SupabaseDbClientConfig {
  apiKey: string;
  authToken?: string;
  fetch?: typeof fetch;
  schema?: string;
  url: string;
}

export interface SupabaseDbErrorDetails {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
}

export class SupabaseDbError extends Error {
  readonly details: SupabaseDbErrorDetails | string | null;
  readonly status: number;
  readonly statusText: string;

  constructor(
    message: string,
    options: {
      details: SupabaseDbErrorDetails | string | null;
      status: number;
      statusText: string;
    },
  ) {
    super(message);
    this.name = "SupabaseDbError";
    this.details = options.details;
    this.status = options.status;
    this.statusText = options.statusText;
  }
}

export interface SupabaseDbClient {
  insert<T extends DbRow = DbRow>(
    table: string,
    values: DbMutationPayload | readonly DbMutationPayload[],
    options?: DbMutationOptions,
  ): Promise<T[]>;
  remove<T extends DbRow = DbRow>(
    table: string,
    options?: DbMutationOptions,
  ): Promise<T[]>;
  rpc<T = unknown>(fn: string, args?: DbRpcArgs, options?: Pick<DbQueryOptions, "schema">): Promise<T>;
  select<T extends DbRow = DbRow>(
    table: string,
    options?: DbQueryOptions,
  ): Promise<T[]>;
  selectOne<T extends DbRow = DbRow>(
    table: string,
    options?: DbQueryOptions,
  ): Promise<T | null>;
  update<T extends DbRow = DbRow>(
    table: string,
    values: DbMutationPayload,
    options?: DbMutationOptions,
  ): Promise<T[]>;
  upsert<T extends DbRow = DbRow>(
    table: string,
    values: DbMutationPayload | readonly DbMutationPayload[],
    options?: DbUpsertOptions,
  ): Promise<T[]>;
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("Supabase database access is only available on the server.");
  }
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeBaseUrl(url: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new Error("Supabase URL must be a valid absolute URL.");
  }
}

function normalizeSchema(schema?: string): string {
  const normalizedSchema = schema?.trim() ?? DEFAULT_SCHEMA;

  if (!normalizedSchema) {
    throw new Error("Supabase schema must be a non-empty string.");
  }

  return normalizedSchema;
}

function normalizeColumns(columns?: readonly string[] | string): string {
  if (!columns) {
    return "*";
  }

  if (typeof columns === "string") {
    const normalizedColumns = columns.trim();

    if (!normalizedColumns) {
      throw new Error("Query columns must be a non-empty string.");
    }

    return normalizedColumns;
  }

  if (columns.length === 0) {
    throw new Error("Query columns must contain at least one column.");
  }

  return columns.join(",");
}

function normalizeTableName(table: string): string {
  const normalizedTable = table.trim();

  if (!normalizedTable) {
    throw new Error("Table name must be a non-empty string.");
  }

  return normalizedTable;
}

function normalizeRpcName(fn: string): string {
  const normalizedFunctionName = fn.trim();

  if (!normalizedFunctionName) {
    throw new Error("RPC function name must be a non-empty string.");
  }

  return normalizedFunctionName;
}

function serializeScalar(value: DbScalar): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  const serializedValue = String(value);
  const shouldQuote = /[",()]/.test(serializedValue);

  if (!shouldQuote) {
    return serializedValue;
  }

  return `"${serializedValue.replaceAll('"', '\\"')}"`;
}

function isScalarArray(value: DbFilter["value"]): value is readonly DbScalar[] {
  return Array.isArray(value);
}

function serializeFilterValue(filter: DbFilter): string {
  const value = filter.value;

  if (filter.operator === "in") {
    if (!isScalarArray(value) || value.length === 0) {
      throw new Error(`Filter "${filter.column}" must provide a non-empty array for the "in" operator.`);
    }

    return `in.(${value.map((entry) => serializeScalar(entry)).join(",")})`;
  }

  if (isScalarArray(value)) {
    throw new Error(`Filter "${filter.column}" only supports array values with the "in" operator.`);
  }

  if (filter.operator === "is") {
    return `is.${serializeScalar(value)}`;
  }

  return `${filter.operator}.${serializeScalar(value)}`;
}

function appendFilters(searchParams: URLSearchParams, filters?: readonly DbFilter[]): void {
  for (const filter of filters ?? []) {
    const column = filter.column.trim();

    if (!column) {
      throw new Error("Filter column must be a non-empty string.");
    }

    searchParams.append(column, serializeFilterValue(filter));
  }
}

function appendOrder(searchParams: URLSearchParams, orderBy?: DbOrder | readonly DbOrder[]): void {
  if (!orderBy) {
    return;
  }

  const normalizedOrder = Array.isArray(orderBy) ? orderBy : [orderBy];
  const orderValue = normalizedOrder
    .map((order) => {
      const column = order.column.trim();

      if (!column) {
        throw new Error("Order column must be a non-empty string.");
      }

      const direction = order.ascending === false ? "desc" : "asc";
      const nulls = order.nulls ? `.nulls${order.nulls}` : "";

      return `${column}.${direction}${nulls}`;
    })
    .join(",");

  searchParams.set("order", orderValue);
}

function appendPagination(searchParams: URLSearchParams, options?: Pick<DbQueryOptions, "limit" | "offset">): void {
  if (options?.limit !== undefined) {
    if (!Number.isInteger(options.limit) || options.limit < 0) {
      throw new Error("Query limit must be a non-negative integer.");
    }

    searchParams.set("limit", String(options.limit));
  }

  if (options?.offset !== undefined) {
    if (!Number.isInteger(options.offset) || options.offset < 0) {
      throw new Error("Query offset must be a non-negative integer.");
    }

    searchParams.set("offset", String(options.offset));
  }
}

function buildTableUrl(baseUrl: URL, table: string, options?: DbQueryOptions): URL {
  const url = new URL(`rest/v1/${encodeURIComponent(normalizeTableName(table))}`, ensureTrailingSlash(baseUrl));

  url.searchParams.set("select", normalizeColumns(options?.columns));
  appendFilters(url.searchParams, options?.filters);
  appendOrder(url.searchParams, options?.orderBy);
  appendPagination(url.searchParams, options);

  return url;
}

function buildRpcUrl(baseUrl: URL, fn: string): URL {
  return new URL(`rest/v1/rpc/${encodeURIComponent(normalizeRpcName(fn))}`, ensureTrailingSlash(baseUrl));
}

function ensureTrailingSlash(url: URL): string {
  return url.toString().endsWith("/") ? url.toString() : `${url.toString()}/`;
}

function buildHeaders(config: {
  apiKey: string;
  authToken: string;
  extraHeaders?: HeadersInit;
  hasBody?: boolean;
  schema: string;
}): Headers {
  const headers = new Headers(config.extraHeaders);

  headers.set("apikey", config.apiKey);
  headers.set("authorization", `Bearer ${config.authToken}`);
  headers.set("accept-profile", config.schema);

  if (config.hasBody) {
    headers.set("content-profile", config.schema);
    headers.set("content-type", "application/json");
  }

  return headers;
}

function buildMutationPreferHeader(returning: DbReturningMode, extra: string[] = []): string {
  return [...extra, `return=${returning}`].join(",");
}

function isSupabaseErrorDetails(value: unknown): value is SupabaseDbErrorDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.code === undefined ||
    typeof candidate.code === "string" ||
    candidate.details === undefined ||
    typeof candidate.details === "string" ||
    candidate.hint === undefined ||
    typeof candidate.hint === "string" ||
    candidate.message === undefined ||
    typeof candidate.message === "string"
  );
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const bodyText = await response.text();

  if (!bodyText) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return JSON.parse(bodyText) as unknown;
  }

  return bodyText;
}

function buildErrorMessage(payload: unknown, statusText: string): string {
  if (isSupabaseErrorDetails(payload) && payload.message) {
    return payload.message;
  }

  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  return statusText || "Supabase request failed.";
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await readResponseBody(response);

  if (!response.ok) {
    throw new SupabaseDbError(buildErrorMessage(payload, response.statusText), {
      details: isSupabaseErrorDetails(payload) || typeof payload === "string" ? payload : null,
      status: response.status,
      statusText: response.statusText,
    });
  }

  return payload as T;
}

function normalizeRows<T extends DbRow>(payload: T[] | null): T[] {
  return payload ?? [];
}

export function createSupabaseDbClient(config: SupabaseDbClientConfig): SupabaseDbClient {
  const baseUrl = normalizeBaseUrl(config.url);
  const apiKey = config.apiKey.trim();

  if (!apiKey) {
    throw new Error("Supabase API key must be a non-empty string.");
  }

  const authToken = config.authToken?.trim() || apiKey;
  const fetchImplementation = config.fetch ?? fetch;
  const defaultSchema = normalizeSchema(config.schema);

  async function request<T>(url: URL, init: RequestInit, schema?: string): Promise<T> {
    const response = await fetchImplementation(url, {
      ...init,
      headers: buildHeaders({
        apiKey,
        authToken,
        extraHeaders: init.headers,
        hasBody: init.body !== undefined,
        schema: normalizeSchema(schema ?? defaultSchema),
      }),
    });

    return parseResponse<T>(response);
  }

  return {
    async select<T extends DbRow = DbRow>(table: string, options?: DbQueryOptions): Promise<T[]> {
      const url = buildTableUrl(baseUrl, table, options);
      return request<T[]>(url, { method: "GET" }, options?.schema);
    },

    async selectOne<T extends DbRow = DbRow>(table: string, options?: DbQueryOptions): Promise<T | null> {
      const rows = await this.select<T>(table, {
        ...options,
        limit: 1,
      });

      return rows[0] ?? null;
    },

    async insert<T extends DbRow = DbRow>(
      table: string,
      values: DbMutationPayload | readonly DbMutationPayload[],
      options?: DbMutationOptions,
    ): Promise<T[]> {
      const url = buildTableUrl(baseUrl, table, options);
      const payload = await request<T[] | null>(
        url,
        {
          body: JSON.stringify(values),
          headers: {
            Prefer: buildMutationPreferHeader(options?.returning ?? "representation"),
          },
          method: "POST",
        },
        options?.schema,
      );

      return normalizeRows(payload);
    },

    async upsert<T extends DbRow = DbRow>(
      table: string,
      values: DbMutationPayload | readonly DbMutationPayload[],
      options?: DbUpsertOptions,
    ): Promise<T[]> {
      const url = buildTableUrl(baseUrl, table, options);

      if (options?.onConflict) {
        const onConflict =
          typeof options.onConflict === "string" ? options.onConflict : options.onConflict.join(",");
        url.searchParams.set("on_conflict", onConflict);
      }

      const payload = await request<T[] | null>(
        url,
        {
          body: JSON.stringify(values),
          headers: {
            Prefer: buildMutationPreferHeader(options?.returning ?? "representation", [
              options?.ignoreDuplicates ? "resolution=ignore-duplicates" : "resolution=merge-duplicates",
            ]),
          },
          method: "POST",
        },
        options?.schema,
      );

      return normalizeRows(payload);
    },

    async update<T extends DbRow = DbRow>(
      table: string,
      values: DbMutationPayload,
      options?: DbMutationOptions,
    ): Promise<T[]> {
      const url = buildTableUrl(baseUrl, table, options);
      const payload = await request<T[] | null>(
        url,
        {
          body: JSON.stringify(values),
          headers: {
            Prefer: buildMutationPreferHeader(options?.returning ?? "representation"),
          },
          method: "PATCH",
        },
        options?.schema,
      );

      return normalizeRows(payload);
    },

    async remove<T extends DbRow = DbRow>(table: string, options?: DbMutationOptions): Promise<T[]> {
      const url = buildTableUrl(baseUrl, table, options);
      const payload = await request<T[] | null>(
        url,
        {
          headers: {
            Prefer: buildMutationPreferHeader(options?.returning ?? "representation"),
          },
          method: "DELETE",
        },
        options?.schema,
      );

      return normalizeRows(payload);
    },

    async rpc<T = unknown>(fn: string, args: DbRpcArgs = {}, options?: Pick<DbQueryOptions, "schema">): Promise<T> {
      const url = buildRpcUrl(baseUrl, fn);
      return request<T>(
        url,
        {
          body: JSON.stringify(args),
          method: "POST",
        },
        options?.schema,
      );
    },
  };
}

export function getDb(): SupabaseDbClient {
  assertServerOnly();

  return createSupabaseDbClient({
    apiKey: readRequiredEnv(SUPABASE_ANON_KEY),
    url: readRequiredEnv(SUPABASE_URL_KEY),
  });
}

export function getUserDb(accessToken: string): SupabaseDbClient {
  assertServerOnly();

  const normalizedAccessToken = accessToken.trim();

  if (!normalizedAccessToken) {
    throw new Error("Supabase access token must be a non-empty string.");
  }

  return createSupabaseDbClient({
    apiKey: readRequiredEnv(SUPABASE_ANON_KEY),
    authToken: normalizedAccessToken,
    url: readRequiredEnv(SUPABASE_URL_KEY),
  });
}

export function getAdminDb(): SupabaseDbClient {
  assertServerOnly();

  return createSupabaseDbClient({
    apiKey: readRequiredEnv(SUPABASE_SERVICE_ROLE_KEY),
    url: readRequiredEnv(SUPABASE_URL_KEY),
  });
}
