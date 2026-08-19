import crypto from "node:crypto";
import fs from "node:fs";

function assert(condition, message) { if (!condition) throw new Error(message); }

const SOURCE_COMMIT = "6d79fa1996a1f6ff2b39ad7de414c676dce9a7f7";
const BACKGROUND_BATCH_BLOB = "2361bfc7cf23b1271608cb164bf0786e4a64f42c";
function gitBlobSha(path) {
  const body = fs.readFileSync(path);
  return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest("hex");
}
assert(gitBlobSha("lib/background-batch.ts") === BACKGROUND_BATCH_BLOB, "canonical legacy background-batch core changed without hosted repin");

const migration = fs.readFileSync("supabase/migrations/202608160001_background_batch_ledger.sql", "utf8");
const hardening = fs.readFileSync("supabase/migrations/202608160002_background_batch_ledger_write_hardening.sql", "utf8");
for (const required of ["masterv_background_batch_config", "provider_precondition_confirmed boolean not null default false", "live_batch_verified_at timestamptz", "desktop_submit_enabled boolean not null default false", "primary key (workspace_id, request_id)", "background_batch_jobs_active_source_uidx", "SUBMISSION_UNCERTAIN", "enable row level security"]) assert(migration.includes(required), `legacy Background Batch ledger regression: ${required}`);
assert(hardening.includes("revoke insert, update on table public.background_batch_jobs from authenticated"), "legacy direct authenticated ledger writes must remain revoked");

const deno = JSON.parse(fs.readFileSync("supabase/functions/masterv-background-batch-boundary/deno.json", "utf8"));
assert(deno.imports?.["@google/genai"] === "npm:@google/genai@2.17.1", "legacy Background Batch Gemini SDK pin drifted");
assert(deno.imports?.["@supabase/server"] === "npm:@supabase/server@1.4.1", "legacy Supabase server context pin drifted");
assert(deno.imports?.["@masterv/background-batch"] === `https://raw.githubusercontent.com/gycha0109-beep/MasterV/${SOURCE_COMMIT}/lib/background-batch.ts`, "legacy Background Batch source pin missing");

const functionText = fs.readFileSync("supabase/functions/masterv-background-batch-boundary/index.ts", "utf8");
for (const required of ['createSupabaseContext(req, { auth: "user" })', "context.supabaseAdmin", 'workspaceId: `user:${userId}`', 'body.operation === "background_batch_list"', 'body.operation === "background_batch_submit"', 'body.operation === "background_batch_check"', "config.provider_precondition_confirmed", "ai.batches.create(", "ai.batches.get(", 'status: "SUBMISSION_UNCERTAIN"', "Automatic resubmission is prohibited", "auto_retry: false", "interactive_generate_requests: 0"]) assert(functionText.includes(required), `legacy hosted Background Batch implementation regression: ${required}`);
assert(!functionText.includes("generateContent(") && !functionText.includes("reference_library_entries") && !functionText.includes("body.workspace_id") && !functionText.includes("body.model") && !functionText.includes("body.api_key"), "legacy Background Batch authority boundary regressed");

const desktopText = fs.readFileSync("desktop/background-batch.js", "utf8");
const transitionText = fs.readFileSync("desktop/backend/bridge/transition-provider.js", "utf8");
const htmlText = fs.readFileSync("desktop/index.html", "utf8");
assert(desktopText.includes('providerAuthority = "masterv-gateway"'), "EXIT-2C Background provider authority marker missing");
assert(desktopText.includes('persistenceAuthority = "local-sqlite-analysis-results"'), "EXIT-2C Background result persistence marker missing");
assert(desktopText.includes('jobLedgerAuthority = "desktop-session-memory"'), "EXIT-2C Background session-local queue marker missing");
assert(desktopText.includes('restartDurability = "false"'), "EXIT-2C must not overclaim queue restart durability");
assert(desktopText.includes('background-batch-local-gateway-v1'), "EXIT-2C Background local Gateway contract missing");
assert(desktopText.includes("crypto.randomUUID()"), "Background request id generation missing");
assert(!desktopText.includes("durable_ledger") && !desktopText.includes("hosted-admin-only"), "visible Desktop still advertises legacy durable hosted ledger");
assert(!desktopText.includes("GEMINI_API_KEY") && !desktopText.includes("generativelanguage.googleapis.com") && !desktopText.includes("/api/") && !desktopText.includes("localStorage") && !desktopText.includes("setInterval"), "Desktop Background secret/transport/polling boundary regressed");
assert(transitionText.includes('background_operations: "local-session-orchestrated+gateway-executed"'), "Background orchestration authority missing");
assert(transitionText.includes('background_result_persistence: "local-sqlite"'), "Background result authority missing");
assert(transitionText.includes("gatewayRemote.analyzeYouTube(requireGatewaySession(activeSession), current.canonical_url)"), "Background execution must use existing Gateway analyze route");
assert(transitionText.includes("localWorkData.saveAnalysisResult"), "Background analysis result must persist locally");
assert(!transitionText.includes("legacyRemote.submitBackgroundBatchJob"), "visible Background submit must not use legacy Supabase batch");
for (const id of ["cap-background-batch", "background-batch-panel", "background-batch-form", "background-batch-url", "background-batch-submit", "background-batch-refresh", "background-batch-status", "background-batch-provider-precondition", "background-batch-live-verified", "background-batch-activation", "background-batch-count", "background-batch-list"]) assert(htmlText.includes(`id="${id}"`), `Desktop Background UI missing #${id}`);
assert(htmlText.includes("LOCAL ORCHESTRATION · GATEWAY EXECUTION"), "EXIT-2C Background visible authority disclosure missing");
assert(htmlText.includes("재시작 내구성을 주장하지 않습니다"), "Background queue durability limitation disclosure missing");

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert(packageJson.scripts?.["test:hosted-background-batch"] === "node scripts/hosted-background-batch-contract.mjs", "legacy hosted Background regression command missing");

console.log(JSON.stringify({
  status: "MASTERV_HOSTED_BACKGROUND_BATCH_CONTRACT_PASS",
  canonical_source_commit: SOURCE_COMMIT,
  legacy_hosted_implementation_preserved: true,
  visible_orchestration_authority: "desktop-session-memory",
  visible_execution_authority: "masterv-gateway",
  visible_result_authority: "local-sqlite",
  restart_durability_claimed: false,
  supabase_background_primary: false
}));
