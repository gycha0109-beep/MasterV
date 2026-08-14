import {
  personalWorkspaceId,
  type SupabaseAuthSession,
  type SupabasePublicConfig
} from "@/lib/supabase-auth";
import { SupabaseReferenceLibraryStore } from "@/lib/reference-library-supabase";

function normalizeConfig(config: SupabasePublicConfig) {
  const projectUrl = config.project_url.trim().replace(/\/+$/, "");
  const publishableKey = config.publishable_key.trim();
  if (!projectUrl || !publishableKey) throw new Error("Supabase public config가 비어 있습니다.");
  return { projectUrl, publishableKey };
}

export async function bootstrapPersonalReferenceWorkspace(
  config: SupabasePublicConfig,
  session: SupabaseAuthSession,
  fetchImpl: typeof fetch = fetch
) {
  const { projectUrl, publishableKey } = normalizeConfig(config);
  const workspaceId = personalWorkspaceId(session.user.id);
  const params = new URLSearchParams({ on_conflict: "workspace_id,user_id" });
  const response = await fetchImpl(`${projectUrl}/rest/v1/masterv_workspace_members?${params.toString()}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal"
    },
    body: JSON.stringify({
      workspace_id: workspaceId,
      user_id: session.user.id,
      role: "owner"
    })
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`.trim();
    try {
      const body = await response.json() as { message?: string; details?: string; code?: string };
      detail = [body.code, body.message, body.details].filter(Boolean).join(" · ") || detail;
    } catch {
      // Keep HTTP fallback.
    }
    throw new Error(`개인 reference workspace 초기화 실패: ${detail}`);
  }

  return workspaceId;
}

export function createSessionReferenceLibraryStore(
  config: SupabasePublicConfig,
  session: SupabaseAuthSession,
  fetchImpl: typeof fetch = fetch
) {
  return new SupabaseReferenceLibraryStore({
    project_url: config.project_url,
    api_key: config.publishable_key,
    access_token: session.access_token,
    fetch_impl: fetchImpl
  });
}
