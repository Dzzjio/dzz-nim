const PARAM = 'room';
const CODE_RE = /^[A-Za-z]{4}$/;

/** Room code from an invite link's query string, or null if absent or malformed. */
export function parseInviteCode(search: string): string | null {
  const v = new URLSearchParams(search).get(PARAM);
  return v !== null && CODE_RE.test(v) ? v.toUpperCase() : null;
}

export function buildInviteLink(
  code: string,
  loc: { origin: string; pathname: string } = window.location,
): string {
  return `${loc.origin}${loc.pathname}?${PARAM}=${encodeURIComponent(code)}`;
}

/** Drops the invite param from the address bar so a refresh doesn't re-enter the room. */
export function stripInviteFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PARAM)) return;
    url.searchParams.delete(PARAM);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch { /* ignore */ }
}
