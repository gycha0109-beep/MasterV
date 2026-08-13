export type AnalysisCacheEntry<T> = {
  key: string;
  value: T;
  stored_at: string;
};

export interface AnalysisCacheStore {
  get<T>(key: string): Promise<AnalysisCacheEntry<T> | null>;
  set<T>(key: string, value: T, storedAt?: string): Promise<AnalysisCacheEntry<T>>;
}

export interface AnalysisReplayStore {
  get<T>(key: string): Promise<T | null>;
}

export class InMemoryAnalysisCacheStore implements AnalysisCacheStore {
  private readonly entries = new Map<string, AnalysisCacheEntry<unknown>>();

  async get<T>(key: string) {
    return (this.entries.get(key) as AnalysisCacheEntry<T> | undefined) ?? null;
  }

  async set<T>(key: string, value: T, storedAt = new Date().toISOString()) {
    const entry: AnalysisCacheEntry<T> = { key, value, stored_at: storedAt };
    this.entries.set(key, entry as AnalysisCacheEntry<unknown>);
    return entry;
  }

  clear() {
    this.entries.clear();
  }
}

export class InMemoryAnalysisReplayStore implements AnalysisReplayStore {
  private readonly values = new Map<string, unknown>();

  constructor(entries: Array<{ key: string; value: unknown }> = []) {
    for (const entry of entries) this.values.set(entry.key, entry.value);
  }

  async get<T>(key: string) {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  set<T>(key: string, value: T) {
    this.values.set(key, value);
  }
}
