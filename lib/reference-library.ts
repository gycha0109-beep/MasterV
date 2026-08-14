import type { VideoAnalysis } from "@/lib/analysis-schema";
import type { ReferenceComparisonInput } from "@/lib/reference-compare";
import {
  canonicalizeYouTubeSource,
  type CanonicalSourceIdentity
} from "@/lib/source-identity";

export const REFERENCE_LIBRARY_SCHEMA_VERSION = "reference-library-v1" as const;
export const REFERENCE_LIBRARY_MAX_LABEL_LENGTH = 120;

export type ReferenceAnalysisProvenance = "cache" | "replay" | "live";

export type ReferenceLibraryRecord = {
  schema_version: typeof REFERENCE_LIBRARY_SCHEMA_VERSION;
  workspace_id: string;
  source: CanonicalSourceIdentity;
  label: string;
  analysis: VideoAnalysis;
  analysis_cache_key: string;
  analysis_provenance: ReferenceAnalysisProvenance;
  first_saved_at: string;
  updated_at: string;
  revision: number;
};

export type ReferenceLibrarySaveInput = {
  workspace_id: string;
  url: string;
  label?: string;
  analysis: VideoAnalysis;
  analysis_cache_key: string;
  analysis_provenance: ReferenceAnalysisProvenance;
  now?: Date;
};

export interface ReferenceLibraryStore {
  list(workspaceId: string): Promise<ReferenceLibraryRecord[]>;
  get(workspaceId: string, sourceId: string): Promise<ReferenceLibraryRecord | null>;
  upsert(input: ReferenceLibrarySaveInput): Promise<ReferenceLibraryRecord>;
  delete(workspaceId: string, sourceId: string): Promise<boolean>;
}

function cloneRecord(record: ReferenceLibraryRecord): ReferenceLibraryRecord {
  return structuredClone(record);
}

export function normalizeReferenceWorkspaceId(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error("reference library workspace_id가 비어 있습니다.");
  if (value.length > 128) throw new Error("reference library workspace_id가 너무 깁니다.");
  if (!/^[A-Za-z0-9:_-]+$/.test(value)) {
    throw new Error("reference library workspace_id 형식이 올바르지 않습니다.");
  }
  return value;
}

function normalizeLabel(raw: string | undefined, source: CanonicalSourceIdentity) {
  const value = raw?.trim() || source.native_id;
  if (value.length > REFERENCE_LIBRARY_MAX_LABEL_LENGTH) {
    throw new Error(`reference library label은 ${REFERENCE_LIBRARY_MAX_LABEL_LENGTH}자를 넘을 수 없습니다.`);
  }
  return value;
}

export type ParsedDeepAnalysisCacheKey = {
  provider: string;
  source_id: string;
  analyzer_tier: string;
  schema_version: string;
  prompt_version: string;
  model: string;
  media_resolution: string;
};

export function parseDeepAnalysisCacheKey(raw: string): ParsedDeepAnalysisCacheKey {
  const value = raw.trim();
  const parts = value.split("/");
  if (parts.length !== 7 || parts.some((part) => !part)) {
    throw new Error("reference library analysis_cache_key 형식이 올바르지 않습니다.");
  }

  let decoded: string[];
  try {
    decoded = parts.map((part) => decodeURIComponent(part));
  } catch {
    throw new Error("reference library analysis_cache_key를 decode할 수 없습니다.");
  }

  const [provider, source_id, analyzer_tier, schema_version, prompt_version, model, media_resolution] = decoded;
  if (provider !== "youtube") {
    throw new Error(`reference library는 현재 youtube provider만 지원합니다: ${provider}`);
  }
  if (analyzer_tier !== "deep") {
    throw new Error(`reference library에는 deep analysis snapshot만 저장할 수 있습니다: ${analyzer_tier}`);
  }

  return {
    provider,
    source_id,
    analyzer_tier,
    schema_version,
    prompt_version,
    model,
    media_resolution
  };
}

function normalizedTimestamp(now: Date | undefined) {
  const value = now ?? new Date();
  if (Number.isNaN(value.getTime())) throw new Error("reference library 저장 시간이 올바르지 않습니다.");
  return value.toISOString();
}

export function createReferenceLibraryRecord(
  input: ReferenceLibrarySaveInput,
  existing: ReferenceLibraryRecord | null = null
): ReferenceLibraryRecord {
  const workspaceId = normalizeReferenceWorkspaceId(input.workspace_id);
  const source = canonicalizeYouTubeSource(input.url);
  const parsedCacheKey = parseDeepAnalysisCacheKey(input.analysis_cache_key);
  if (parsedCacheKey.source_id !== source.source_id) {
    throw new Error(
      `reference library source identity가 analysis cache key와 일치하지 않습니다: ${source.source_id} != ${parsedCacheKey.source_id}`
    );
  }

  if (existing) {
    if (existing.workspace_id !== workspaceId || existing.source.source_id !== source.source_id) {
      throw new Error("reference library 기존 record의 natural key가 save input과 일치하지 않습니다.");
    }
  }

  const timestamp = normalizedTimestamp(input.now);
  return {
    schema_version: REFERENCE_LIBRARY_SCHEMA_VERSION,
    workspace_id: workspaceId,
    source,
    label: normalizeLabel(input.label, source),
    analysis: structuredClone(input.analysis),
    analysis_cache_key: input.analysis_cache_key.trim(),
    analysis_provenance: input.analysis_provenance,
    first_saved_at: existing?.first_saved_at ?? timestamp,
    updated_at: timestamp,
    revision: existing ? existing.revision + 1 : 1
  };
}

export function referenceLibraryRecordToComparisonInput(
  record: ReferenceLibraryRecord
): ReferenceComparisonInput {
  return {
    id: record.source.source_id,
    label: record.label,
    url: record.source.canonical_url,
    analysis: structuredClone(record.analysis)
  };
}

export class InMemoryReferenceLibraryStore implements ReferenceLibraryStore {
  private readonly workspaces = new Map<string, Map<string, ReferenceLibraryRecord>>();

  private workspace(workspaceId: string, create = false) {
    const normalized = normalizeReferenceWorkspaceId(workspaceId);
    const current = this.workspaces.get(normalized);
    if (current || !create) return { id: normalized, records: current ?? null };
    const records = new Map<string, ReferenceLibraryRecord>();
    this.workspaces.set(normalized, records);
    return { id: normalized, records };
  }

  async list(workspaceId: string) {
    const { records } = this.workspace(workspaceId);
    if (!records) return [];
    return [...records.values()]
      .map(cloneRecord)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.source.source_id.localeCompare(b.source.source_id));
  }

  async get(workspaceId: string, sourceId: string) {
    const source = sourceId.trim();
    if (!source) throw new Error("reference library source_id가 비어 있습니다.");
    const { records } = this.workspace(workspaceId);
    const record = records?.get(source);
    return record ? cloneRecord(record) : null;
  }

  async upsert(input: ReferenceLibrarySaveInput) {
    const workspaceId = normalizeReferenceWorkspaceId(input.workspace_id);
    const source = canonicalizeYouTubeSource(input.url);
    const { records } = this.workspace(workspaceId, true);
    const existing = records?.get(source.source_id) ?? null;
    const record = createReferenceLibraryRecord(input, existing);
    records?.set(source.source_id, cloneRecord(record));
    return cloneRecord(record);
  }

  async delete(workspaceId: string, sourceId: string) {
    const source = sourceId.trim();
    if (!source) throw new Error("reference library source_id가 비어 있습니다.");
    const { records } = this.workspace(workspaceId);
    return records?.delete(source) ?? false;
  }
}
