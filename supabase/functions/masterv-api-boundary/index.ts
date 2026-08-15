import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { compareVideoAnalyses } from "@masterv/reference-compare";
import { compileEvidenceRules } from "@masterv/evidence-rules";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const MAX_REFERENCE_SELECTION = 8;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function authenticatedUserId(req: Request) {
  const authorization = req.headers.get("authorization")?.trim() ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const payloadPart = token.split(".")[1];
  if (!payloadPart) throw new Error("Authenticated JWT payload is missing");
  const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const payload = JSON.parse(atob(padded)) as { sub?: unknown };
  if (typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new Error("Authenticated JWT subject is missing");
  }
  return payload.sub.trim();
}

function normalizedSourceIds(value: unknown) {
  if (!Array.isArray(value)) throw new Error("source_ids must be an array");
  const sourceIds = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (sourceIds.some((item) => !item)) throw new Error("source_ids must contain non-empty strings");
  if (sourceIds.length < 2) throw new Error("reference workflow requires at least 2 source_ids");
  if (sourceIds.length > MAX_REFERENCE_SELECTION) throw new Error(`reference workflow supports at most ${MAX_REFERENCE_SELECTION} source_ids`);
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("source_ids must be unique");
  return sourceIds;
}

async function loadReference(req: Request, workspaceId: string, sourceId: string) {
  const authorization = req.headers.get("authorization")?.trim();
  const apikey = req.headers.get("apikey")?.trim();
  if (!authorization || !apikey) throw new Error("Authenticated Supabase headers are required");

  const params = new URLSearchParams();
  params.set("select", "source_id,canonical_url,label,analysis");
  params.set("workspace_id", `eq.${workspaceId}`);
  params.set("source_id", `eq.${sourceId}`);
  params.set("limit", "1");

  const projectOrigin = new URL(req.url).origin;
  const response = await fetch(`${projectOrigin}/rest/v1/reference_library_entries?${params.toString()}`, {
    method: "GET",
    headers: { authorization, apikey, Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Reference Library read failed (${response.status})`);
  }
  const rows = await response.json() as Array<{
    source_id?: string;
    canonical_url?: string;
    label?: string;
    analysis?: unknown;
  }>;
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.analysis) {
    throw new Error(`Reference not found or missing analysis: ${sourceId}`);
  }
  return rows[0];
}

async function compileReferenceWorkflow(req: Request) {
  const body = await req.json() as { operation?: unknown; source_ids?: unknown };
  if (body.operation !== "reference_workflow") {
    return json({ error: "Unsupported operation" }, 400);
  }

  let userId: string;
  let sourceIds: string[];
  try {
    userId = authenticatedUserId(req);
    sourceIds = normalizedSourceIds(body.source_ids);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }

  const workspaceId = `user:${userId}`;
  try {
    const rows = await Promise.all(sourceIds.map((sourceId) => loadReference(req, workspaceId, sourceId)));
    const comparison = compareVideoAnalyses(rows.map((row) => ({
      id: row.source_id!,
      label: row.label,
      url: row.canonical_url,
      analysis: row.analysis as never
    })));
    const evidenceRules = compileEvidenceRules(comparison);

    return json({
      service: "masterv-hosted-api",
      contract_version: "mv-hosted-api-v1",
      authenticated: true,
      operation: "reference_workflow",
      source_ids: sourceIds,
      compiler: {
        comparison: "canonical",
        evidence: "canonical",
        generated_at: "deterministic"
      },
      authority: {
        workspace: "jwt-derived",
        persistence: "user-jwt-rls"
      },
      comparison,
      evidence_rules: evidenceRules
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 422);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (req.method === "GET") {
    return json({
      service: "masterv-hosted-api",
      contract_version: "mv-hosted-api-v1",
      authenticated: true,
      capabilities: {
        boundary_probe: true,
        reference_compiler: true,
        analyze: false,
        youtube_discovery: false,
        product_truth: false
      }
    });
  }

  if (req.method === "POST") return await compileReferenceWorkflow(req);
  return json({ error: "Method not allowed" }, 405);
});
