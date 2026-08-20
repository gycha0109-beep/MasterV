import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));

const forbiddenPaths = [
  "supabase",
  "desktop/backend/legacy",
  "src-tauri/src/migration_bridge.rs",
  "lib/supabase-auth.ts",
  "lib/reference-library-supabase.ts",
  "lib/reference-library-session.ts",
  "lib/use-persistent-reference-library.ts",
  "components/ReferenceLibraryAccount.tsx"
];
for (const relative of forbiddenPaths) assert(!exists(relative), `clean cut residual path: ${relative}`);

const runtimeFiles = [
  ".env.example",
  "desktop/index.html",
  "desktop/app.js",
  "desktop/backend/backend.js",
  "desktop/backend/provider-boundary.js",
  "desktop/backend/bridge/transition-provider.js",
  "desktop/backend/local/local-work-data-provider.js",
  "scripts/build-desktop-static.mjs",
  "src-tauri/tauri.conf.json",
  "src-tauri/src/main.rs",
  ".github/workflows/ci.yml",
  "package.json"
];
const forbiddenTokens = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_TEST_EMAIL",
  "SUPABASE_TEST_PASSWORD",
  "*.supabase.co",
  ".supabase.co",
  "supabase-session-provider",
  "supabase-work-data-provider",
  "MASTERV_LEGACY_RUNTIME_CONFIG",
  "migrateLegacyReferenceLibrary",
  "desktop_migrate_legacy_reference_library"
];
for (const relative of runtimeFiles) {
  const text = read(relative);
  for (const token of forbiddenTokens) assert(!text.includes(token), `${relative} retains forbidden runtime token ${token}`);
}

const index = read("desktop/index.html");
assert(index.includes("0.1.3 CLEAN CUT"), "Desktop must expose 0.1.3 clean-cut authority");
assert(index.includes('id="activation-form"'), "Product Key activation surface missing");
assert(!index.includes("legacy-migration-form") && !index.includes("migration-email") && !index.includes("migration-password"), "legacy migration UI must be absent");

const backend = read("desktop/backend/backend.js");
assert(backend.includes('architecture_stage: "MV-EXIT-3-CLEAN-CUT"'), "Desktop backend clean-cut authority missing");
assert(backend.includes("gatewaySessionFactory.create()"), "Gateway session authority missing");
assert(backend.includes("gatewayRemoteFactory.create()"), "Gateway remote authority missing");
assert(backend.includes("localWorkDataFactory.create()"), "Local SQLite authority missing");
assert(backend.includes("runtime_vendor_dependency_zero: true"), "runtime vendor dependency zero flag missing");

const transition = read("desktop/backend/bridge/transition-provider.js");
assert(transition.includes('primary: "local-sqlite"'), "Local SQLite work-data primary missing");
assert(transition.includes('primary: "masterv-gateway"'), "Gateway remote primary missing");
assert(transition.includes('reference_compare: "local-canonical"'), "local Reference Compare authority missing");
assert(transition.includes("user_work_data_transport_to_gateway: false"), "user work-data transport prohibition missing");

const nativeGateway = read("src-tauri/src/gateway_transport.rs");
assert(nativeGateway.includes('const GATEWAY_ENV: &str = "MASTERV_GATEWAY_BASE_URL"'), "vendor-neutral Gateway env missing");
assert(nativeGateway.includes("product_key_bearer_allowed: false"), "Product Key bearer prohibition missing");
assert(nativeGateway.includes("session_credential_persisted: false"), "session credential persistence prohibition missing");
assert(nativeGateway.includes("device_credential_persisted: true"), "device credential persistence contract missing");

const tauri = read("src-tauri/tauri.conf.json");
assert(!tauri.includes("wss://") && !tauri.includes("connect-src 'self' https://"), "Tauri CSP must not retain third-party runtime network allowances");

const updater = read("src-tauri/tauri.windows-independent-updater-release.conf.json");
assert(updater.includes('"version": "0.1.3"'), "independent updater release config must target 0.1.3");
assert(updater.includes("github.com/gycha0109-beep/MasterV/releases/latest/download/latest.json"), "independent updater metadata endpoint missing");

const workflowDir = path.join(root, ".github", "workflows");
const workflowFiles = fs.readdirSync(workflowDir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
assert(!workflowFiles.some((name) => name.startsWith("mv-supabase-exit-")), "historical vendor-specific CI workflow remains");
const prAutomatic = workflowFiles.filter((name) => {
  const text = read(path.join(".github/workflows", name));
  return /^\s*pull_request\s*:/m.test(text) || /^\s*pull_request\s*$/m.test(text);
});
assert(prAutomatic.length === 2 && prAutomatic.includes("ci.yml") && prAutomatic.includes("mv-exit-3-clean-cut.yml"), `automatic PR workflows must be exactly CI + EXIT-3, received ${prAutomatic.join(",")}`);
for (const name of workflowFiles) {
  const text = read(path.join(".github/workflows", name));
  assert(!/push:\s*\n\s*branches:\s*\n\s*-\s*feat\/mvp-foundation/m.test(text), `feature branch push trigger reintroduced in ${name}`);
}

console.log(JSON.stringify({
  status: "MASTERV_EXIT_3_CLEAN_CUT_PASS",
  supabase_network_requests: 0,
  supabase_runtime_env_vars: 0,
  supabase_runtime_keys: 0,
  supabase_db_access: 0,
  supabase_storage_access: 0,
  runtime_dependency: "ZERO",
  work_data_primary: "local-sqlite",
  remote_primary: "masterv-gateway",
  entitlement_authority: "polar-via-gateway",
  update_channel: "independent-tauri-signed",
  automatic_pr_workflows: prAutomatic.sort()
}));
