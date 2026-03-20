export class ClipboardError extends Error {
  readonly code: "clipboard-unavailable" | "copy-failed";

  constructor(message: string, code: ClipboardError["code"]) {
    super(message);
    this.name = "ClipboardError";
    this.code = code;
  }
}

export function isClipboardSupported(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
    return true;
  }

  return typeof document.queryCommandSupported === "function" && document.queryCommandSupported("copy");
}

function fallbackCopyText(text: string): boolean {
  if (typeof document === "undefined" || !document.body) {
    return false;
  }

  const textarea = document.createElement("textarea");
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
    activeElement?.focus();
  }
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new ClipboardError("Clipboard access is only available in the browser.", "clipboard-unavailable");
  }

  if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      if (fallbackCopyText(text)) {
        return;
      }
    }
  } else if (fallbackCopyText(text)) {
    return;
  }

  throw new ClipboardError("Failed to copy text to the clipboard.", "copy-failed");
}

export async function copyDraftToClipboard(draftText: string): Promise<void> {
  await copyTextToClipboard(draftText);
}
