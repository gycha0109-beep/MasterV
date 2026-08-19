import fs from "node:fs";
import vm from "node:vm";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync("desktop/backend/legacy/supabase-work-data-provider.js", "utf8");
const window = {};
window.window = window;
const context = vm.createContext({
  window,
  Object,
  Error,
  String,
  Boolean,
  Number,
  Array,
  Set,
  JSON,
  URL,
  URLSearchParams,
  Response,
  console
});
vm.runInContext(source, context, { filename: "supabase-work-data-provider.js" });

const factory = window.MASTERV_LEGACY_SUPABASE_WORK_DATA_PROVIDER;
assert(factory && typeof factory.create === "function", "legacy migration provider factory missing");
assert(factory.MIGRATION_PAGE_SIZE === 250, `unexpected migration page size: ${factory.MIGRATION_PAGE_SIZE}`);

const rows = Array.from({ length: 623 }, (_, index) => ({
  source_platform: "youtube",
  source_id: `yt:${String(index).padStart(4, "0")}`,
  native_id: String(index).padStart(4, "0"),
  canonical_url: `https://www.youtube.com/watch?v=${String(index).padStart(4, "0")}`,
  label: `legacy-${index}`,
  analysis: { summary: `legacy-${index}` },
  analysis_cache_key: `cache:${index}`,
  analysis_provenance: "legacy-live",
  schema_version: "reference-library-v1",
  first_saved_at: "2026-08-14T00:00:00.000Z",
  updated_at: "2026-08-18T00:00:00.000Z"
}));
const calls = [];
const serverCap = 73;
const fakeFetch = async (input, init = {}) => {
  const url = new URL(String(input));
  calls.push({ url: url.toString(), init });
  assert((init.method || "GET") === "GET", "pagination contract should only issue GET requests");
  assert(url.pathname.endsWith("/rest/v1/reference_library_entries"), `unexpected migration endpoint: ${url.pathname}`);
  assert(url.searchParams.get("workspace_id") === "eq.user:legacy-user", "migration workspace scope drifted");
  assert(url.searchParams.get("order") === "updated_at.desc,source_id.asc,source_platform.asc", "migration ordering must be deterministic");
  assert(Number(url.searchParams.get("limit")) === 250, "migration request must use bounded page size");
  const offset = Number(url.searchParams.get("offset") || "0");
  const requested = Number(url.searchParams.get("limit") || "250");
  const body = rows.slice(offset, offset + Math.min(requested, serverCap));
  return Response.json(body, { status: 200 });
};

const provider = factory.create({
  supabase_url: "https://migration-fixture.supabase.co",
  supabase_publishable_key: "sb_publishable_fixture"
}, fakeFetch);
const session = Object.freeze({
  provider: "legacy-supabase",
  credential: "legacy-user-token",
  subject_id: "legacy-user"
});

const exported = await provider.exportReferenceLibraryForMigration(session, "user:legacy-user");
assert(exported.length === rows.length, `pagination truncated legacy export: expected=${rows.length} actual=${exported.length}`);
assert(new Set(exported.map((row) => `${row.source_platform}\u0000${row.source_id}`)).size === rows.length, "pagination duplicated legacy records");
assert(exported.at(0)?.source_id === rows.at(0)?.source_id, "first migration record drifted");
assert(exported.at(-1)?.source_id === rows.at(-1)?.source_id, "last migration record drifted");
assert(calls.length === Math.ceil(rows.length / serverCap) + 1, `migration must continue until an empty page, calls=${calls.length}`);
const offsets = calls.map((call) => Number(new URL(call.url).searchParams.get("offset") || "0"));
for (let index = 1; index < offsets.length; index += 1) {
  const expected = Math.min((index) * serverCap, rows.length);
  assert(offsets[index] === expected, `migration offset did not advance by received rows at page=${index}: expected=${expected} actual=${offsets[index]}`);
}

let duplicateGuard = false;
let duplicateCalls = 0;
const duplicateProvider = factory.create({
  supabase_url: "https://migration-fixture.supabase.co",
  supabase_publishable_key: "sb_publishable_fixture"
}, async () => {
  duplicateCalls += 1;
  return Response.json(duplicateCalls <= 2 ? rows.slice(0, 2) : [], { status: 200 });
});
try {
  await duplicateProvider.exportReferenceLibraryForMigration(session, "user:legacy-user");
} catch (error) {
  duplicateGuard = /did not advance deterministically/.test(error instanceof Error ? error.message : String(error));
}
assert(duplicateGuard, "migration pagination must fail closed when a page repeats previously seen primary keys");

console.log(JSON.stringify({
  status: "MASTERV_EXIT_2C_LEGACY_MIGRATION_PAGINATION_PASS",
  exported_rows: exported.length,
  simulated_server_cap: serverCap,
  page_requests: calls.length,
  duplicate_page_guard: true,
  migration_scope: provider.authority.scope
}));
