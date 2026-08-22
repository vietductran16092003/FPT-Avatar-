// Workaround for a Node 22+ / jsdom conflict in this environment: Node ships its own
// (disabled-by-default) global `localStorage`, which shadows jsdom's working
// implementation and leaves `localStorage` as `undefined` inside jsdom test files.
// This installs a minimal, spec-compatible localStorage polyfill so tests that rely on
// `localStorage` (e.g. tests/lib/admin-i18n.test.tsx) work regardless of that conflict.
if (typeof globalThis.localStorage === "undefined" || typeof globalThis.localStorage?.clear !== "function") {
  const store = new Map<string, string>();

  const polyfill: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: polyfill,
    writable: true,
    configurable: true,
  });
}
