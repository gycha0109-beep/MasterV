import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenAI } from "@google/genai";
import { createSupabaseContext } from "@supabase/server";
import {
  buildBackgroundBatchPrompt,
  isBackgroundBatchTerminalState,
  normalizeBackgroundBatchTargets
} from "@masterv/background-batch";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
const DEFAULT_BATCH_MODEL = "gemini-3.6-flash";
const MAX_URL_LENGTH = 500;
const MAX_LIST_RESULTS = 25;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBMIT_KEYS = new Set(["operation", "request_id", "url"]);
const CHECK_KEYS = new Set(["operation", "request_id"]);
const LIST_KEYS = new Set(["operation"]);
const TERMINAL_LEDGER_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"]);

type AdminClient = Awaited<ReturnType<typeof createSupabaseContext>>["data"]["supabaseAdmin"];
type BatchConfig = {
  provider_precondition_confirmed: boolean;
  live_batch_verified_at: string | null;
  desktop_submit_enabled: boolean;
};
type BatchJob = {
  workspace_id: string;
  request_id: string;
  source_platform: "youtube";
  source_id: string;
  canonical_url: string;
  model: string;
  status: string;
  provider_job_name: string | null;
  provider_state: string | null;
  result_text: string | null;
  error: unknown;
  create_attempted_at: string | null;
  last_checked_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function authorizationSubject(req: Request) {
  const authorization = req.headers.get("authorization")?.trim() ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const payloadPart = token.split(".")[1];
  if (!payloadPart) throw new Error("Authenticated JWT payload is missing");
  const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const payload = JSON.parse(atob(padded)) as { sub?: unknown };
  if (typeof payload.sub !== "string" || !payload.sub.trim()) throw new Error("Authenticated JWT subject is missing");
  return payload.sub.trim();
}

async function authContext(req: Request) {
  const { data: context, error } = await createSupabaseContext(req, { auth: "user" });
  if (error || !context) throw new Error(error?.message || "Authenticated Supabase context is unavailable");
  const userId = authorizationSubject(req);
  return { admin: context.supabaseAdmin, userId, workspaceId: `user:${userId}` };
}

function rejectUnknownKeys(body: Record<string, unknown>, allowed: Set<string>) {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new Error(`unsupported request field: ${key}`);
  }
}

function normalizeRequestId(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) throw new Error("request_id must be a UUID");
  return value.trim().toLowerCase();
}

function normalizeSubmit(body: Record<string, unknown>) {
  rejectUnknownKeys(body, SUBMIT_KEYS);
  const requestId = normalizeRequestId(body.request_id);
  if (typeof body.url !== "string") throw new Error("url must be a string");
  const url = body.url.trim();
  if (!url) throw new Error("url must not be empty");
  if (url.length > MAX_URL_LENGTH) throw new Error(`url must be at most ${MAX_URL_LENGTH} characters`);
  const [target] = normalizeBackgroundBatchTargets([url]);
  return { requestId, target };
}

function normalizeCheck(body: Record<string, unknown>) {
  rejectUnknownKeys(body, CHECK_KEYS);
  return normalizeRequestId(body.request_id);
}

function normalizeList(body: Record<string, unknown>) {
  rejectUnknownKeys(body, LIST_KEYS);
}

function modelAuthority() {
  return Deno.env.get("GEMINI_BATCH_MODEL")?.trim()
    || Deno.env.get("GEMINI_MODEL")?.trim()
    || DEFAULT_BATCH_MODEL;
}

function providerKey() {
  return Deno.env.get("GEMINI_API_KEY")?.trim() ?? "";
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { message: message.slice(0, 2000) };
}

function providerState(job: { state?: unknown }) {
  return typeof job.state === "string" ? job.state : null;
}

function ledgerStatusFromProviderState(state: string | null) {
  if (!state || !isBackgroundBatchTerminalState(state)) return "PENDING";
  if (state.endsWith("SUCCEEDED")) return "SUCCEEDED";
  if (state.endsWith("CANCELLED")) return "CANCELLED";
  if (state.endsWith("EXPIRED")) return "EXPIRED";
  return "FAILED";
}

async function readConfig(admin: AdminClient): Promise<BatchConfig> {
  const { data, error } = await admin
    .from("masterv_background_batch_config")
    .select("provider_precondition_confirmed,live_batch_verified_at,desktop_submit_enabled")
    .eq("id", "global")
    .single();
  if (error || !data) throw new Error(error?.message || "Background Batch config is missing");
  return data as BatchConfig;
}

async function loadJob(admin: AdminClient, workspaceId: string, requestId: string): Promise<BatchJob | null> {
  const { data, error } = await admin
    .from("background_batch_jobs")
    .select("workspace_id,request_id,source_platform,source_id,canonical_url,model,status,provider_job_name,provider_state,result_text,error,create_attempted_at,last_checked_at,completed_at,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as BatchJob | null;
}

async function loadActiveSourceJob(admin: AdminClient, workspaceId: string, sourceId: string): Promise<BatchJob | null> {
  const { data, error } = await admin
    .from("background_batch_jobs")
    .select("workspace_id,request_id,source_platform,source_id,canonical_url,model,status,provider_job_name,provider_state,result_text,error,create_attempted_at,last_checked_at,completed_at,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .eq("source_id", sourceId)
    .in("status", ["RESERVED", "SUBMITTING", "PENDING"])
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as BatchJob | null;
}

async function updateJob(admin: AdminClient, workspaceId: string, requestId: string, patch: Record<string, unknown>) {
  const { data, error } = await admin
    .from("background_batch_jobs")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("request_id", requestId)
    .select("workspace_id,request_id,source_platform,source_id,canonical_url,model,status,provider_job_name,provider_state,result_text,error,create_attempted_at,last_checked_at,completed_at,created_at,updated_at")
    .single();
  if (error || !data) throw new Error(error?.message || "Background Batch ledger update failed");
  return data as BatchJob;
}

async function reserveSubmission(admin: AdminClient, workspaceId: string, requestId: string, target: { source_id: string; canonical_url: string }, model: string) {
  const existing = await loadJob(admin, workspaceId, requestId);
  if (existing) return { row: existing, replay: true };

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("background_batch_jobs")
    .insert({
      workspace_id: workspaceId,
      request_id: requestId,
      source_platform: "youtube",
      source_id: target.source_id,
      canonical_url: target.canonical_url,
      model,
      status: "SUBMITTING",
      create_attempted_at: now
    })
    .select("workspace_id,request_id,source_platform,source_id,canonical_url,model,status,provider_job_name,provider_state,result_text,error,create_attempted_at,last_checked_at,completed_at,created_at,updated_at")
    .single();

  if (!error && data) return { row: data as BatchJob, replay: false };
  if (error?.code === "23505") {
    const raced = await loadJob(admin, workspaceId, requestId);
    if (raced) return { row: raced, replay: true };
    const active = await loadActiveSourceJob(admin, workspaceId, target.source_id);
    if (active) throw new Error(`active Background Batch already exists for ${target.source_id}`);
  }
  throw new Error(error?.message || "Background Batch reservation failed");
}

function submitEnabled(config: BatchConfig) {
  return Boolean(
    providerKey()
    && config.provider_precondition_confirmed
    && config.live_batch_verified_at
    && config.desktop_submit_enabled
  );
}

function capabilityPayload(config: BatchConfig) {
  const secretConfigured = Boolean(providerKey());
  const liveVerified = Boolean(config.live_batch_verified_at);
  return {
    service: "masterv-background-batch",
    contract_version: "background-batch-hosted-v1",
    authenticated: true,
    capabilities: {
      boundary_probe: true,
      durable_ledger: true,
      list_route: true,
      check_route: true,
      submit_route: true,
      provider_secret_configured: secretConfigured,
      provider_precondition_confirmed: config.provider_precondition_confirmed,
      live_batch_verified: liveVerified,
      desktop_submit_enabled: config.desktop_submit_enabled,
      submit: submitEnabled(config)
    },
    authority: {
      workspace: "jwt-derived-personal",
      provider: "hosted-secret",
      model: "hosted-config",
      ledger_write: "hosted-admin-only",
      auto_retry: false,
      reference_library_write: false
    }
  };
}

async function listJobs(req: Request, body: Record<string, unknown>) {
  normalizeList(body);
  const { admin, workspaceId } = await authContext(req);
  const { data, error } = await admin
    .from("background_batch_jobs")
    .select("request_id,source_id,canonical_url,model,status,provider_job_name,provider_state,result_text,error,create_attempted_at,last_checked_at,completed_at,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST_RESULTS);
  if (error) return json({ error: error.message, code: "BACKGROUND_BATCH_LIST_FAILED" }, 500);
  return json({
    service: "masterv-background-batch",
    contract_version: "background-batch-hosted-v1",
    authenticated: true,
    operation: "background_batch_list",
    workspace_authority: "jwt-derived-personal",
    jobs: data ?? [],
    diagnostics: { batch_create_attempts: 0, batch_get_requests: 0, reference_library_writes: 0 }
  });
}

async function submitJob(req: Request, body: Record<string, unknown>) {
  const { admin, workspaceId } = await authContext(req);
  let input: ReturnType<typeof normalizeSubmit>;
  try {
    input = normalizeSubmit(body);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error), code: "BACKGROUND_BATCH_INVALID_REQUEST" }, 400);
  }

  const config = await readConfig(admin);
  if (!submitEnabled(config)) {
    return json({
      error: "Background Batch submission is disabled until provider preconditions, live verification, and Desktop activation are all recorded.",
      code: "BACKGROUND_BATCH_SUBMIT_DISABLED",
      capability: capabilityPayload(config).capabilities,
      diagnostics: { batch_create_attempts: 0, interactive_generate_requests: 0 }
    }, 409);
  }

  const model = modelAuthority();
  let reservation: Awaited<ReturnType<typeof reserveSubmission>>;
  try {
    reservation = await reserveSubmission(admin, workspaceId, input.requestId, input.target, model);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error), code: "BACKGROUND_BATCH_RESERVATION_CONFLICT" }, 409);
  }

  if (reservation.replay) {
    return json({
      service: "masterv-background-batch",
      contract_version: "background-batch-hosted-v1",
      authenticated: true,
      operation: "background_batch_submit",
      replay: true,
      job: reservation.row,
      diagnostics: { batch_create_attempts: 0, interactive_generate_requests: 0, auto_retry: false }
    });
  }

  const apiKey = providerKey();
  const ai = new GoogleGenAI({ apiKey });
  try {
    const created = await ai.batches.create({
      model,
      src: [
        {
          contents: [
            {
              role: "user",
              parts: [
                { fileData: { fileUri: input.target.canonical_url } },
                {
                  text: [
                    buildBackgroundBatchPrompt(input.target.source_id),
                    "Return plain text containing the exact SOURCE_ID and a short observable-only summary."
                  ].join("\n")
                }
              ]
            }
          ]
        }
      ],
      config: { displayName: `masterv-3j-${input.requestId}` }
    });
    if (!created.name) throw new Error("Batch create returned no provider job name");
    const state = providerState(created);
    const row = await updateJob(admin, workspaceId, input.requestId, {
      status: ledgerStatusFromProviderState(state),
      provider_job_name: created.name,
      provider_state: state,
      error: null
    });
    return json({
      service: "masterv-background-batch",
      contract_version: "background-batch-hosted-v1",
      authenticated: true,
      operation: "background_batch_submit",
      replay: false,
      provider_authority: "hosted-secret",
      model_authority: "hosted-config",
      job: row,
      diagnostics: { batch_create_attempts: 1, interactive_generate_requests: 0, auto_retry: false }
    }, 202);
  } catch (error) {
    const failure = safeError(error);
    let row = reservation.row;
    try {
      row = await updateJob(admin, workspaceId, input.requestId, {
        status: "SUBMISSION_UNCERTAIN",
        error: failure
      });
    } catch {
      // Never retry provider creation when ledger persistence after create is uncertain.
    }
    return json({
      error: failure.message,
      code: "BACKGROUND_BATCH_SUBMISSION_UNCERTAIN",
      job: row,
      diagnostics: { batch_create_attempts: 1, interactive_generate_requests: 0, auto_retry: false }
    }, 502);
  }
}

function extractSucceededResult(job: { dest?: { inlinedResponses?: Array<{ error?: unknown; response?: { text?: string } }> } }, sourceId: string) {
  const responses = job.dest?.inlinedResponses;
  if (!responses || responses.length !== 1) throw new Error(`expected exactly one inline Batch response, got ${responses?.length ?? 0}`);
  const item = responses[0];
  if (item.error) throw new Error(`Batch item failed: ${JSON.stringify(item.error)}`);
  const text = item.response?.text ?? "";
  if (!text.includes(sourceId)) throw new Error("Batch response did not preserve canonical source_id binding");
  return text;
}

async function checkJob(req: Request, body: Record<string, unknown>) {
  const { admin, workspaceId } = await authContext(req);
  let requestId: string;
  try {
    requestId = normalizeCheck(body);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error), code: "BACKGROUND_BATCH_INVALID_REQUEST" }, 400);
  }

  const current = await loadJob(admin, workspaceId, requestId);
  if (!current) return json({ error: "Background Batch job not found", code: "BACKGROUND_BATCH_NOT_FOUND" }, 404);
  if (TERMINAL_LEDGER_STATES.has(current.status)) {
    return json({
      service: "masterv-background-batch",
      contract_version: "background-batch-hosted-v1",
      authenticated: true,
      operation: "background_batch_check",
      job: current,
      diagnostics: { batch_create_attempts: 0, batch_get_requests: 0, interactive_generate_requests: 0, auto_retry: false }
    });
  }
  if (!current.provider_job_name) {
    return json({
      service: "masterv-background-batch",
      contract_version: "background-batch-hosted-v1",
      authenticated: true,
      operation: "background_batch_check",
      job: current,
      warning: "Provider job identity is unavailable. Automatic resubmission is prohibited.",
      diagnostics: { batch_create_attempts: 0, batch_get_requests: 0, interactive_generate_requests: 0, auto_retry: false }
    }, 409);
  }

  const apiKey = providerKey();
  if (!apiKey) return json({ error: "Gemini provider is not configured in hosted runtime", code: "BACKGROUND_BATCH_NOT_CONFIGURED" }, 503);
  const ai = new GoogleGenAI({ apiKey });
  try {
    const providerJob = await ai.batches.get({ name: current.provider_job_name });
    const state = providerState(providerJob);
    let status = ledgerStatusFromProviderState(state);
    let resultText: string | null = current.result_text;
    let error: unknown = null;
    if (status === "SUCCEEDED") {
      try {
        resultText = extractSucceededResult(providerJob, current.source_id);
      } catch (resultError) {
        status = "FAILED";
        error = safeError(resultError);
      }
    } else if (status === "FAILED" || status === "CANCELLED" || status === "EXPIRED") {
      error = providerJob.error ?? { message: `Batch terminal state: ${state}` };
    }
    const terminal = TERMINAL_LEDGER_STATES.has(status);
    const row = await updateJob(admin, workspaceId, requestId, {
      status,
      provider_state: state,
      result_text: resultText,
      error,
      last_checked_at: new Date().toISOString(),
      completed_at: terminal ? new Date().toISOString() : null
    });
    return json({
      service: "masterv-background-batch",
      contract_version: "background-batch-hosted-v1",
      authenticated: true,
      operation: "background_batch_check",
      provider_authority: "hosted-secret",
      job: row,
      diagnostics: { batch_create_attempts: 0, batch_get_requests: 1, interactive_generate_requests: 0, auto_retry: false, reference_library_writes: 0 }
    });
  } catch (error) {
    return json({ error: safeError(error).message, code: "BACKGROUND_BATCH_CHECK_UPSTREAM" }, 502);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    const { admin } = await authContext(req);
    if (req.method === "GET") return json(capabilityPayload(await readConfig(admin)));
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Request body must be an object");
      body = parsed as Record<string, unknown>;
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error), code: "BACKGROUND_BATCH_INVALID_JSON" }, 400);
    }

    if (body.operation === "background_batch_list") return await listJobs(req, body);
    if (body.operation === "background_batch_submit") return await submitJob(req, body);
    if (body.operation === "background_batch_check") return await checkJob(req, body);
    return json({ error: "Unsupported operation" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error), code: "BACKGROUND_BATCH_UNAUTHENTICATED" }, 401);
  }
});
