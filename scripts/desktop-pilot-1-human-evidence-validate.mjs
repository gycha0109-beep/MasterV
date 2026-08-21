import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUCCESS = 'MASTERV_PILOT_1_EXTERNAL_HUMAN_EVIDENCE_PASS';
const REQUIRED_TRUE = [
  'external_human_pilot_executed',
  'production_activation_authorized',
  'fresh_install_completed',
  'first_launch_completed',
  'product_key_activation_completed',
  'device_resume_after_restart',
  'local_reference_library_usable_before_activation',
  'local_reference_library_usable_after_activation',
  'entitled_remote_operation_completed',
  'updater_visible',
  'updater_subscription_independent',
  'device_credential_persisted_in_os_secure_storage'
];
const REQUIRED_FALSE = [
  'remote_work_data_fallback',
  'product_key_persisted',
  'session_credential_persisted'
];
const FORBIDDEN_KEYS = new Set([
  'product_key',
  'raw_product_key',
  'device_credential',
  'device_secret',
  'session_credential',
  'polar_access_token',
  'polar_server_credential',
  'gemini_api_key',
  'youtube_data_api_key',
  'tauri_signing_private_key',
  'tauri_signing_private_key_password',
  'gateway_signing_secret',
  'email',
  'phone',
  'address',
  'full_name'
]);
const REMOTE_OPERATION_KINDS = new Set(['discovery', 'analysis', 'guidance']);
const OBSERVATION_SEVERITIES = new Set(['info', 'minor', 'major']);

function fail(message) {
  throw new Error(`MV-PILOT-1 human evidence rejected: ${message}`);
}

function requireEqual(record, key, expected) {
  if (record[key] !== expected) {
    fail(`${key} must equal ${JSON.stringify(expected)}`);
  }
}

function assertNoForbiddenKeys(value, location = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      fail(`forbidden sensitive/PII field ${location}.${key}`);
    }
    assertNoForbiddenKeys(child, `${location}.${key}`);
  }
}

function assertIsoTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) fail('executed_at must be a non-empty ISO timestamp');
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || !/T/.test(value)) fail('executed_at must be an ISO timestamp');
}

function assertPilotId(value) {
  if (typeof value !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{5,63}$/i.test(value)) {
    fail('pilot_id must be a 6-64 character opaque identifier using letters, digits, _ or -');
  }
  if (/UNASSIGNED|UNKNOWN|EMAIL|@/i.test(value)) {
    fail('pilot_id must be an assigned opaque identifier and must not contain contact information');
  }
}

function assertObservations(value) {
  if (!Array.isArray(value)) fail('observations must be an array');
  if (value.length > 20) fail('observations must contain at most 20 items');
  value.forEach((observation, index) => {
    if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
      fail(`observations[${index}] must be an object`);
    }
    const allowed = new Set(['category', 'severity', 'summary']);
    for (const key of Object.keys(observation)) {
      if (!allowed.has(key)) fail(`observations[${index}] contains unsupported field ${key}`);
    }
    if (typeof observation.category !== 'string' || !/^[a-z0-9_-]{2,40}$/i.test(observation.category)) {
      fail(`observations[${index}].category is invalid`);
    }
    if (!OBSERVATION_SEVERITIES.has(observation.severity)) {
      fail(`observations[${index}].severity must be info, minor, or major`);
    }
    if (typeof observation.summary !== 'string' || !observation.summary.trim() || observation.summary.length > 500) {
      fail(`observations[${index}].summary must be 1-500 characters`);
    }
  });
}

export function validateHumanPilotEvidence(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('root must be an object');
  assertNoForbiddenKeys(record);

  requireEqual(record, 'schema_version', '1');
  requireEqual(record, 'stage', 'MV-PILOT-1');
  requireEqual(record, 'evidence_type', 'external-human-pilot');
  requireEqual(record, 'execution_status', 'COMPLETED');
  requireEqual(record, 'production_version', '0.1.4');
  requireEqual(record, 'installation_source', 'published-v0.1.4');
  requireEqual(record, 'first_launch_auth_state', 'LOCAL_ONLY');
  requireEqual(record, 'updater_state', 'LATEST');
  requireEqual(record, 'user_data_authority', 'LOCAL_SQLITE');

  for (const key of REQUIRED_TRUE) requireEqual(record, key, true);
  for (const key of REQUIRED_FALSE) requireEqual(record, key, false);

  assertPilotId(record.pilot_id);
  assertIsoTimestamp(record.executed_at);

  if (!REMOTE_OPERATION_KINDS.has(record.entitled_remote_operation_kind)) {
    fail('entitled_remote_operation_kind must be discovery, analysis, or guidance');
  }
  if (record.unrecoverable_blocker !== null) {
    fail('unrecoverable_blocker must be null for PASS evidence');
  }
  assertObservations(record.observations);

  return {
    status: SUCCESS,
    stage: record.stage,
    production_version: record.production_version,
    pilot_id: record.pilot_id,
    executed_at: record.executed_at,
    external_human_pilot: 'PASS',
    production_activation_authorized: true,
    product_key_activation: 'PASS',
    device_resume_after_restart: 'PASS',
    local_reference_library: 'PASS',
    entitled_remote_operation: record.entitled_remote_operation_kind,
    updater: 'LATEST',
    user_data_authority: 'LOCAL_SQLITE',
    sensitive_credentials_recorded: false
  };
}

function main(argv) {
  const evidencePath = argv[2];
  if (!evidencePath) {
    fail('usage: node scripts/desktop-pilot-1-human-evidence-validate.mjs <evidence.json>');
  }
  const resolved = path.resolve(evidencePath);
  const record = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const result = validateHumanPilotEvidence(record);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n${SUCCESS}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv);
}
