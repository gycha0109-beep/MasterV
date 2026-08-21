export const platformFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
