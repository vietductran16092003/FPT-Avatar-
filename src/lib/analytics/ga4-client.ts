// Thin wrapper around gtag.js so call sites never touch `window.gtag`
// directly. No-ops safely when the script hasn't loaded yet (gtag not
// configured, ad blocker, or still hydrating) — event tracking must never
// throw and break the actual user-facing feature it's attached to.
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const gtag = (window as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== "function") return;
  gtag("event", name, params);
}
