import { readFile } from "node:fs/promises";
import type { AnalyzerTier } from "@/lib/tiered-analysis";

export type AnalysisCacheEntry<T> = {
  key: string;
  value: T;
  stored_at: string;
};

export interface AnalysisCacheStore {
  get<T>(key: string): Promise<AnalysisCacheEntry<T> | null>;
  set<T>(key: string, value: T, storedAt?: string): Promise<AnalysisCacheEntry<T>>;
}

export interface InvalidatableAnalysisCacheStore extends AnalysisCacheStore {
  delete(key: string): Promise<boolean>;
}

export interface AnalysisReplayStore {
  get<T>(key: string): Promise<T | null>;
}

export type AnalysisReplayFixtureEntry = {
  cache_key: string;
  source_id: string;
  analyzer_tier: Exclude<AnalyzerTier, "metadata">;
  schema_version: string;
  prompt_version: string;
  model: string;
  media_resolution: string;
  value: unknown;
};

export type AnalysisReplayFixtureEnvelope = {
  version: "analysis-replay-v1";
  generated_at: string;
  entries: AnalysisReplayFixtureEntry[];
};

export function validateReplayEnvelope(value: unknown): AnalysisReplayFixtureEnvelope {
  if (!value || typeof value !== "object") throw new Error("replay fixture envelope이 객체가 아닙니다.");
  const envelope = value as Partial<AnalysisReplayFixtureEnvelope>;
  if (envelope.version !== "analysis-replay-v1") throw new Error("지원하지 않는 replay fixture version입니다.");
  if (!Array.isArray(envelope.entries)) throw new Error("replay fixture entries가 배열이 아닙니다.");
  const keys = envelope.entries.map((entry) => entry?.cache_key);
  if (keys.some((key) => typeof key !== "string" || !key.trim())) throw new Error("replay fixture cache_key가 비어 있습니다.");
  if (new Set(keys).size !== keys.length) throw new Error("replay fixture cache_key가 중복되었습니다.");
  return envelope as AnalysisReplayFixtureEnvelope;
}

export class InMemoryAnalysisCacheStore implements InvalidatableAnalysisCacheStore {
  private readonly entries = new Map<string, AnalysisCacheEntry<unknown>>();

  async get<T>(key: string) {
    return (this.entries.get(key) as AnalysisCacheEntry<T> | undefined) ?? null;
  }

  async set<T>(key: string, value: T, storedAt = new Date().toISOString()) {
    const entry: AnalysisCacheEntry<T> = { key, value, stored_at: storedAt };
    this.entries.set(key, entry as AnalysisCacheEntry<unknown>);
    return entry;
  }

  async delete(key: string) {
    return this.entries.delete(key);
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

export class FileAnalysisReplayStore implements AnalysisReplayStore {
  private values: Map<string, unknown> | null = null;

  constructor(public readonly filePath: string) {}

  private async load() {
    if (this.values) return this.values;
    const envelope = validateReplayEnvelope(JSON.parse(await readFile(this.filePath, "utf8")) as unknown);
    this.values = new Map(envelope.entries.map((entry) => [entry.cache_key, entry.value]));
    return this.values;
  }

  async get<T>(key: string) {
    const values = await this.load();
    return (values.get(key) as T | undefined) ?? null;
  }
}
