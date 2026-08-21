export function getBaseUrl(): string {
  // Server Components run with no `window` — a relative fetch URL fails
  // there because there is no browser origin to resolve it against, so
  // an absolute one is built from an env var (falling back to localhost
  // for local dev). In the browser, `window` exists and a relative URL
  // is kept so it still works behind any reverse-proxy path/port.
  if (typeof window !== "undefined") return "";
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}
