export type TimestampInput = Date | number | string;

export type TimestampFormat = "date" | "time" | "dateTime" | "relative";

export interface FormatTimestampOptions {
  format?: TimestampFormat;
  locale?: string;
  now?: TimestampInput;
}

const DEFAULT_LOCALE = "en-US";
const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;

function parseTimestamp(value: TimestampInput): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatAbsoluteTimestamp(
  value: Date,
  locale: string,
  format: Exclude<TimestampFormat, "relative">,
): string {
  switch (format) {
    case "date":
      return new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(value);
    case "time":
      return new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
      }).format(value);
    case "dateTime":
      return new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(value);
  }
}

function formatRelativeTimestamp(value: Date, locale: string, now: Date): string {
  const diff = value.getTime() - now.getTime();
  const absDiff = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (absDiff < MINUTE_IN_MS) {
    return "just now";
  }

  if (absDiff < HOUR_IN_MS) {
    return rtf.format(Math.round(diff / MINUTE_IN_MS), "minute");
  }

  if (absDiff < DAY_IN_MS) {
    return rtf.format(Math.round(diff / HOUR_IN_MS), "hour");
  }

  return rtf.format(Math.round(diff / DAY_IN_MS), "day");
}

export function formatTimestamp(
  value: TimestampInput,
  options: FormatTimestampOptions = {},
): string {
  const format = options.format ?? "dateTime";
  const locale = options.locale ?? DEFAULT_LOCALE;
  const parsedValue = parseTimestamp(value);

  if (!parsedValue) {
    return "";
  }

  if (format === "relative") {
    const now = options.now ? parseTimestamp(options.now) : new Date();

    if (!now) {
      return "";
    }

    return formatRelativeTimestamp(parsedValue, locale, now);
  }

  return formatAbsoluteTimestamp(parsedValue, locale, format);
}
