export const EXTERNAL_LINK_TARGET = "_blank";
export const EXTERNAL_LINK_REL = "noopener noreferrer";

const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

export type ExternalLinkInput = string | URL;

export type ExternalLinkProps = {
  href: string;
  rel: typeof EXTERNAL_LINK_REL;
  target: typeof EXTERNAL_LINK_TARGET;
};

function parseExternalUrl(input: ExternalLinkInput): URL | null {
  try {
    const url = input instanceof URL ? input : new URL(input.trim());
    return SAFE_EXTERNAL_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

export function getExternalLinkHref(input: ExternalLinkInput): string | null {
  return parseExternalUrl(input)?.toString() ?? null;
}

export function getExternalLinkProps(
  input: ExternalLinkInput,
): ExternalLinkProps | null {
  const href = getExternalLinkHref(input);

  if (!href) {
    return null;
  }

  return {
    href,
    rel: EXTERNAL_LINK_REL,
    target: EXTERNAL_LINK_TARGET,
  };
}

export function openExternalLink(
  input: ExternalLinkInput,
  opener: Pick<Window, "open"> | null =
    typeof window === "undefined" ? null : window,
): boolean {
  const href = getExternalLinkHref(input);

  if (!href || !opener) {
    return false;
  }

  return opener.open(href, EXTERNAL_LINK_TARGET, "noopener,noreferrer") !== null;
}
