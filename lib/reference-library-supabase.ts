import type { VideoAnalysis } from "@/lib/analysis-schema";
import { platformFetch } from "@/lib/platform-fetch";
import {
  REFERENCE_LIBRARY_MAX_LABEL_LENGTH,
  createReferenceLibraryRecord,
  normalizeReferenceWorkspaceId,
  parseDeepAnalysisCacheKey,
  type ReferenceAnalysisProvenance,
  type ReferenceLibraryRecord,
  type ReferenceLibrarySaveInput,
  type ReferenceLibraryStore
} from "@/lib/reference-library";
import { canonicalizeYouTubeSource } from "@/lib/source-identity";

export type SupabaseReferenceLibraryConfig = {
  project_url: string;
  api_key: string;
  access_token: string;
  fetch_impl?: typeof fetch;
};

type ReferenceLibraryRow = {
  workspace_id: string;
  source_platform: string;
  source_id: string;
  native_id: string;
  canonical_url: string;
  label: string;
  analysis: VideoAnalysis;
  analysis_cache_key: string;
  analysis_provenance: ReferenceAnalysisProvenance;
  schema_version: ReferenceLibraryRecord["schema_version"];
  revision: number;
  first_saved_at: string;
  updated_at: string;
};

function normalizeProjectUrl(raw: string) {
  const value = raw.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[A-Za-z0-9-]+\.supabase\.co$/.test(value)) {
    throw new Error("Supabase project URL 형식이 올바르지 않습니다.");
  }
  return value;
}

function normalizeSecret(raw: string, name: string) {
  const value = raw.trim();
  if (!value) throw new Error(`${name}가 비어 있습니다.`);
  return value;
}

function validTimestamp(raw: string, name: string) {
  if (!raw || Number.isNaN(Date.parse(raw))) {
    throw new Error(`reference library ${name}가 올바르지 않습니다.`);
  }
  return raw;
}

function rowToRecord(row: ReferenceLibraryRow): ReferenceLibraryRecord {
  const workspaceId = normalizeReferenceWorkspaceId(row.workspace_id);
  if (row.source_platform !== "youtube") {
    throw new Error(`지원하지 않는 reference source platform: ${row.source_platform}`);
  }
  if (row.schema_version !== "reference-library-v1") {
    throw new Error(`지원하지 않는 reference library schema: ${row.schema_version}`);
  }
  if (!Number.isInteger(row.revision) || row.revision < 1) {
    throw new Error("reference library revision이 올바르지 않습니다.");
  }
  if (!row.label?.trim() || row.label.length > REFERENCE_LIBRARY_MAX_LABEL_LENGTH) {
    throw new Error("reference library label이 올바르지 않습니다.");
  }
  if (!["cache", "replay", "live"].includes(row.analysis_provenance)) {
    throw new Error(`reference library provenance가 올바르지 않습니다: ${row.analysis_provenance}`);
  }

  const canonical = canonicalizeYouTubeSource(row.canonical_url);
  if (canonical.source_id !== row.source_id || canonical.native_id !== row.native_id) {
    throw new Error("reference library DB source identity가 canonical URL과 일치하지 않습니다.");
  }
  const parsedCacheKey = parseDeepAnalysisCacheKey(row.analysis_cache_key);
  if (parsedCacheKey.source_id !== row.source_id) {
    throw new Error("reference library DB source identity가 analysis cache key와 일치하지 않습니다.");
  }

  return {
    schema_version: row.schema_version,
    workspace_id: workspaceId,
    source: canonical,
    label: row.label,
    analysis: structuredClone(row.analysis),
    analysis_cache_key: row.analysis_cache_key,
    analysis_provenance: row.analysis_provenance,
    first_saved_at: validTimestamp(row.first_saved_at, "first_saved_at"),
    updated_at: validTimestamp(row.updated_at, "updated_at"),
    revision: row.revision
  };
}

function filter(value: string) {
  return `eq.${value}`;
}

export class SupabaseReferenceLibraryStore implements ReferenceLibraryStore {
  private readonly projectUrl: string;
  private readonly apiKey: string;
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: SupabaseReferenceLibraryConfig) {
    this.projectUrl = normalizeProjectUrl(config.project_url);
    this.apiKey = normalizeSecret(config.api_key, "Supabase api_key");
    this.accessToken = normalizeSecret(config.access_token, "Supabase access_token");
    this.fetchImpl = config.fetch_impl ?? platformFetch;
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await this.fetchImpl(`${this.projectUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.apiKey,
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        ...init.headers
      }
    });

    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`.trim();
      try {
        const body = await response.json() as { message?: string; details?: string; hint?: string; code?: string };
        detail = [body.code, body.message, body.details, body.hint].filter(Boolean).join(" · ") || detail;
      } catch {
        // Keep HTTP fallback without exposing credentials or request headers.
      }
      throw new Error(`Supabase reference library 요청 실패: ${detail}`);
    }

    if (response.status === 204) return [];
    return await response.json() as ReferenceLibraryRow[];
  }

  async list(workspaceId: string) {
    const workspace = normalizeReferenceWorkspaceId(workspaceId);
    const params = new URLSearchParams({
      select: "*",
      workspace_id: filter(workspace),
      order: "updated_at.desc,source_id.asc"
    });
    const rows = await this.request(`reference_library_entries?${params.toString()}`);
    return rows.map(rowToRecord);
  }

  async get(workspaceId: string, sourceId: string) {
    const workspace = normalizeReferenceWorkspaceId(workspaceId);
    const source = sourceId.trim();
    if (!source) throw new Error("reference library source_id가 비어 있습니다.");
    const params = new URLSearchParams({
      select: "*",
      workspace_id: filter(workspace),
      source_id: filter(source),
      limit: "1"
    });
    const rows = await this.request(`reference_library_entries?${params.toString()}`);
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  async upsert(input: ReferenceLibrarySaveInput) {
    const validated = createReferenceLibraryRecord(input);
    const params = new URLSearchParams({ on_conflict: "workspace_id,source_id" });
    const rows = await this.request(`reference_library_entries?${params.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({
        workspace_id: validated.workspace_id,
        source_platform: validated.source.platform,
        source_id: validated.source.source_id,
        native_id: validated.source.native_id,
        canonical_url: validated.source.canonical_url,
        label: validated.label,
        analysis: validated.analysis,
        analysis_cache_key: validated.analysis_cache_key,
        analysis_provenance: validated.analysis_provenance,
        schema_version: validated.schema_version
      })
    });

    if (rows.length !== 1) {
      throw new Error(`Supabase reference library upsert가 단일 row를 반환하지 않았습니다: ${rows.length}`);
    }
    return rowToRecord(rows[0]);
  }

  async delete(workspaceId: string, sourceId: string) {
    const workspace = normalizeReferenceWorkspaceId(workspaceId);
    const source = sourceId.trim();
    if (!source) throw new Error("reference library source_id가 비어 있습니다.");
    const params = new URLSearchParams({
      workspace_id: filter(workspace),
      source_id: filter(source)
    });
    const rows = await this.request(`reference_library_entries?${params.toString()}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" }
    });
    return rows.length > 0;
  }
}
