import crypto from "node:crypto";
import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const SOURCE_COMMIT = "6d79fa1996a1f6ff2b39ad7de414c676dce9a7f7";
const BACKGROUND_BATCH_BLOB = "2361bfc7cf23b1271608cb164bf0786e4a64f42c";

function gitBlobSha(path) {
  const body = fs.readFileSync(path);
  return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest("hex");
}

assert(gitBlobSha("lib/background-batch.ts") === BACKGROUND_BATCH_BLOB, "canonical background-batch core changed without hosted repin");

const migration = fs.readFileSync("supabase/migrations/202608160001_background_batch_ledger.sql", "utf8");
const hardening = fs.readFileSync("supabase/migrations/202608160002_background_batch_ledger_write_hardening.sql", "utf8");
assert(migration.includes("masterv_background_batch_config"), "Background Batch config table missing");
assert(migration.includes("provider_precondition_confirmed boolean not null default false"), "provider precondition gate must default false");
assert(migration.includes("live_batch_verified_at timestamptz"), "live Batch verification gate missing");
assert(migration.includes("desktop_submit_enabled boolean not null default false"), "Desktop Batch activation gate must default false");
assert(migration.includes("not desktop_submit_enabled") && migration.includes("provider_precondition_confirmed and live_batch_verified_at is not null"), "Desktop submit DB constraint missing");
assert(migration.includes("primary key (workspace_id, request_id)"), "Background Batch request reservation primary key missing");
assert(migration.includes("background_batch_jobs_active_source_uidx"), "active-source duplicate guard missing");
assert(migration.includes("where status in ('RESERVED', 'SUBMITTING', 'PENDING')"), "active-source duplicate guard states missing");
assert(migration.includes("SUBMISSION_UNCERTAIN"), "non-idempotent submission uncertainty state missing");
assert(migration.includes("enable row level security"), "Background Batch RLS missing");
assert(hardening.includes('drop policy if exists "workspace members can insert background batch jobs"'), "direct authenticated ledger insert policy must be removed");
assert(hardening.includes('drop policy if exists "workspace members can update background batch jobs"'), "direct authenticated ledger update policy must be removed");
assert(hardening.includes("revoke insert, update on table public.background_batch_jobs from authenticated"), "direct authenticated ledger writes must be revoked");

const deno = JSON.parse(fs.readFileSync("supabase/functions/masterv-background-batch-boundary/deno.json", "utf8"));
assert(deno.imports?.["@google/genai"] === "npm:@google/genai@2.17.1", "Background Batch Gemini SDK must remain pinned exactly");
assert(deno.imports?.["@supabase/server"] === "npm:@supabase/server@1.4.1", "Supabase server context must remain pinned exactly");
assert(deno.imports?.["@masterv/background-batch"] === `https://raw.githubusercontent.com/gycha0109-beep/MasterV/${SOURCE_COMMIT}/lib/background-batch.ts`, "canonical Background Batch source pin missing");
assert(deno.imports?.["@/lib/source-identity"]?.includes(`/${SOURCE_COMMIT}/lib/source-identity.ts`), "canonical source identity pin missing");

const functionText = fs.readFileSync("supabase/functions/masterv-background-batch-boundary/index.ts", "utf8");
assert(functionText.includes('createSupabaseContext(req, { auth: "user" })'), "Background Batch boundary must verify user context");
assert(functionText.includes("context.supabaseAdmin"), "Background Batch ledger writes must remain hosted admin-only");
assert(functionText.includes('workspaceId: `user:${userId}`'), "Background Batch workspace must be JWT-derived personal workspace");
assert(functionText.includes('body.operation === "background_batch_list"'), "Background Batch list operation missing");
assert(functionText.includes('body.operation === "background_batch_submit"'), "Background Batch submit operation missing");
assert(functionText.includes('body.operation === "background_batch_check"'), "Background Batch check operation missing");
assert(functionText.includes("config.provider_precondition_confirmed") && functionText.includes("config.live_batch_verified_at") && functionText.includes("config.desktop_submit_enabled"), "submit capability must require all three gates");
assert((functionText.match(/ai\.batches\.create\(/g) || []).length === 1, "Background Batch boundary must contain exactly one provider create site");
assert((functionText.match(/ai\.batches\.get\(/g) || []).length === 1, "Background Batch boundary must contain exactly one provider check site");
assert(functionText.includes('status: "SUBMISSION_UNCERTAIN"'), "provider create uncertainty must freeze the ledger row");
assert(functionText.includes("Automatic resubmission is prohibited"), "check path must prohibit resubmission without provider job identity");
assert(functionText.includes("auto_retry: false"), "Background Batch diagnostics must state auto retry is false");
assert(functionText.includes("batch_create_attempts: 0") && functionText.includes("batch_create_attempts: 1"), "Batch create attempt diagnostics missing");
assert(functionText.includes("interactive_generate_requests: 0"), "interactive Gemini fallback must remain zero");
assert(!functionText.includes("generateContent("), "Background Batch boundary must not fall back to interactive Gemini");
assert(!functionText.includes("reference_library_entries"), "Background Batch boundary must not auto-write Reference Library");
assert(!functionText.includes("body.workspace_id"), "Desktop caller must not supply workspace authority");
assert(!functionText.includes("body.model"), "Desktop caller must not supply model authority");
assert(!functionText.includes("body.api_key"), "Desktop caller must not supply provider credential");

const desktopText = fs.readFileSync("desktop/background-batch.js", "utf8");
assert(desktopText.includes('providerAuthority = "hosted-secret"'), "Desktop Background Batch provider authority marker missing");
assert(desktopText.includes('persistenceAuthority = "durable-ledger"'), "Desktop durable ledger marker missing");
assert(desktopText.includes('ledgerWriteAuthority = "hosted-admin-only"'), "Desktop hosted ledger write authority marker missing");
assert(desktopText.includes('createIdempotency = "request-id-reservation"'), "Desktop request reservation marker missing");
assert(desktopText.includes('autoRetry = "false"'), "Desktop auto retry must remain false");
assert(desktopText.includes('referenceLibraryWrites = "0"'), "Desktop Background Batch must not imply Reference Library writes");
assert(desktopText.includes('directGeminiRequests = "0"'), "Desktop direct Gemini request marker missing");
assert(desktopText.includes('operation: "background_batch_submit", request_id: requestId, url: urlInput.value.trim()'), "Desktop submit request must contain only request id and URL authority");
assert(desktopText.includes('operation: "background_batch_check", request_id: requestId'), "Desktop explicit check request missing");
assert(desktopText.includes("crypto.randomUUID()"), "Desktop must create an explicit request reservation ID");
assert(desktopText.includes('logout.addEventListener("click", clearState)'), "logout must clear Background Batch process state");
assert(!desktopText.includes("GEMINI_API_KEY"), "Desktop Background Batch must not contain Gemini credential name");
assert(!desktopText.includes("generativelanguage.googleapis.com"), "Desktop Background Batch must not contact Gemini directly");
assert(!desktopText.includes("/api/"), "Desktop Background Batch must not use local Next API");
assert(!desktopText.includes("workspace_id"), "Desktop Background Batch must not carry workspace authority");
assert(!desktopText.includes("localStorage"), "Desktop Background Batch state must remain process-memory only");
assert(!desktopText.includes("setInterval"), "Desktop Background Batch must not auto-poll");

const htmlText = fs.readFileSync("desktop/index.html", "utf8");
for (const id of ["cap-background-batch", "background-batch-panel", "background-batch-form", "background-batch-url", "background-batch-submit", "background-batch-refresh", "background-batch-status", "background-batch-provider-precondition", "background-batch-live-verified", "background-batch-activation", "background-batch-count", "background-batch-list"]) {
  assert(htmlText.includes(`id="${id}"`), `Desktop Background Batch UI missing #${id}`);
}
assert(htmlText.includes('src="./background-batch.js"'), "Desktop Background Batch script wiring missing");
assert(htmlText.includes("Background Batch</span><strong>current / blocked"), "3J roadmap blocked marker missing");

const buildText = fs.readFileSync("scripts/build-desktop-static.mjs", "utf8");
assert(buildText.includes('"background-batch.js"'), "Desktop static build must copy Background Batch script");

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert(packageJson.scripts?.["test:hosted-background-batch"] === "node scripts/hosted-background-batch-contract.mjs", "hosted Background Batch contract script missing");

const ciText = fs.readFileSync(".github/workflows/ci.yml", "utf8");
assert((ciText.match(/npm run test:hosted-background-batch/g) || []).length >= 2, "Background Batch static contract must run in validate and desktop-shell");

console.log(JSON.stringify({
  status: "MASTERV_HOSTED_BACKGROUND_BATCH_CONTRACT_PASS",
  canonical_source_commit: SOURCE_COMMIT,
  provider_authority: "hosted-secret",
  model_authority: "hosted-config",
  ledger_write_authority: "hosted-admin-only",
  workspace_authority: "jwt-derived-personal",
  submit_gate: "provider-precondition+live-verified+activation",
  auto_retry: false,
  interactive_fallback: false,
  reference_library_write: false,
  desktop_provider_credentials: false
}));
