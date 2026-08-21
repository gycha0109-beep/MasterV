import fs from 'node:fs';
import path from 'node:path';
import { validateHumanPilotEvidence } from './desktop-pilot-1-human-evidence-validate.mjs';

const ROOT = process.cwd();
const DOC = 'docs/architecture/MV-PILOT-1-EXTERNAL-HUMAN-PILOT-EXECUTION-CONTRACT.md';
const TEMPLATE = 'docs/architecture/MV-PILOT-1-EXTERNAL-HUMAN-PILOT-EVIDENCE-TEMPLATE.json';
const VALIDATOR = 'scripts/desktop-pilot-1-human-evidence-validate.mjs';
const PARENT_CONTRACT = 'scripts/desktop-pilot-1-contract.mjs';
const ACTUAL_EVIDENCE = 'docs/architecture/MV-PILOT-1-EXTERNAL-HUMAN-PILOT-EVIDENCE.json';
const SUCCESS = 'MASTERV_PILOT_1_HUMAN_EVIDENCE_CONTRACT_PASS';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function requireMarker(content, marker, file) {
  if (!content.includes(marker)) {
    throw new Error(`${file} is missing required marker: ${marker}`);
  }
}

function forbid(content, marker, file) {
  if (content.includes(marker)) {
    throw new Error(`${file} contains forbidden marker: ${marker}`);
  }
}

const doc = read(DOC);
const templateText = read(TEMPLATE);
const validator = read(VALIDATOR);
const parentContract = read(PARENT_CONTRACT);
const template = JSON.parse(templateText);

for (const marker of [
  'PRODUCTION_FIRST_RUN_ACCEPTANCE = PASS',
  'EXTERNAL_HUMAN_PILOT = NOT_EXECUTED',
  'PRODUCTION_ACTIVATION = EXPLICIT_HUMAN_EXECUTION_ONLY',
  'MV_PILOT_1 = READY_FOR_EXTERNAL_PILOT',
  'HUMAN_PILOT_EVIDENCE_REQUIRED_FOR_CLOSURE',
  'Product Key activation',
  'device resume after restart',
  'one entitled remote operation',
  'Local SQLite',
  'raw Product Key',
  'CI must not execute the human pilot'
]) {
  requireMarker(doc, marker, DOC);
}

const expectedTemplate = {
  schema_version: '1',
  stage: 'MV-PILOT-1',
  evidence_type: 'external-human-pilot',
  execution_status: 'NOT_EXECUTED',
  external_human_pilot_executed: false,
  production_activation_authorized: false,
  production_version: '0.1.4',
  pilot_id: 'UNASSIGNED',
  installation_source: 'published-v0.1.4'
};
for (const [key, expected] of Object.entries(expectedTemplate)) {
  if (template[key] !== expected) {
    throw new Error(`${TEMPLATE} ${key} must equal ${JSON.stringify(expected)}`);
  }
}
for (const key of [
  'executed_at',
  'fresh_install_completed',
  'first_launch_completed',
  'first_launch_auth_state',
  'product_key_activation_completed',
  'device_resume_after_restart',
  'local_reference_library_usable_before_activation',
  'local_reference_library_usable_after_activation',
  'entitled_remote_operation_completed',
  'entitled_remote_operation_kind',
  'updater_visible',
  'updater_state',
  'updater_subscription_independent',
  'user_data_authority',
  'remote_work_data_fallback',
  'product_key_persisted',
  'session_credential_persisted',
  'device_credential_persisted_in_os_secure_storage'
]) {
  if (template[key] !== null) {
    throw new Error(`${TEMPLATE} ${key} must remain null until a real human pilot executes`);
  }
}
if (!Array.isArray(template.observations) || template.observations.length !== 0) {
  throw new Error(`${TEMPLATE} observations must start empty`);
}

let templateRejected = false;
try {
  validateHumanPilotEvidence(template);
} catch {
  templateRejected = true;
}
if (!templateRejected) {
  throw new Error('Human evidence validator must reject the NOT_EXECUTED template');
}

const syntheticPassingContractFixture = {
  ...template,
  execution_status: 'COMPLETED',
  external_human_pilot_executed: true,
  production_activation_authorized: true,
  pilot_id: 'pilot-contract-001',
  executed_at: '2026-08-21T00:00:00+09:00',
  fresh_install_completed: true,
  first_launch_completed: true,
  first_launch_auth_state: 'LOCAL_ONLY',
  product_key_activation_completed: true,
  device_resume_after_restart: true,
  local_reference_library_usable_before_activation: true,
  local_reference_library_usable_after_activation: true,
  entitled_remote_operation_completed: true,
  entitled_remote_operation_kind: 'analysis',
  updater_visible: true,
  updater_state: 'LATEST',
  updater_subscription_independent: true,
  user_data_authority: 'LOCAL_SQLITE',
  remote_work_data_fallback: false,
  product_key_persisted: false,
  session_credential_persisted: false,
  device_credential_persisted_in_os_secure_storage: true,
  unrecoverable_blocker: null,
  observations: [{ category: 'contract', severity: 'info', summary: 'Synthetic validator contract fixture only; not pilot evidence.' }]
};
const syntheticResult = validateHumanPilotEvidence(syntheticPassingContractFixture);
if (syntheticResult.status !== 'MASTERV_PILOT_1_EXTERNAL_HUMAN_EVIDENCE_PASS') {
  throw new Error('Human evidence validator did not accept the deterministic schema contract fixture');
}

for (const marker of [
  'fetch(',
  'http://',
  'https://',
  'node:http',
  'node:https',
  'child_process',
  'process.env',
  'desktop_gateway_activate(',
  '/v1/license/activate'
]) {
  forbid(validator, marker, VALIDATOR);
}

requireMarker(parentContract, 'runNode("scripts/desktop-pilot-1-human-contract.mjs")', PARENT_CONTRACT);
forbid(parentContract, 'desktop-pilot-1-human-evidence-validate.mjs docs/architecture/MV-PILOT-1-EXTERNAL-HUMAN-PILOT-EVIDENCE', PARENT_CONTRACT);

if (fs.existsSync(path.join(ROOT, ACTUAL_EVIDENCE))) {
  throw new Error(`${ACTUAL_EVIDENCE} must not exist before separately attributable human execution evidence is captured`);
}

process.stdout.write(`${JSON.stringify({
  status: SUCCESS,
  production_first_run_acceptance: 'PASS',
  external_human_pilot: 'NOT_EXECUTED',
  production_activation: 'EXPLICIT_HUMAN_EXECUTION_ONLY',
  evidence_template_fail_closed: true,
  validator_network_capability: false,
  ci_human_execution_capability: false,
  mv_pilot_1: 'READY_FOR_EXTERNAL_PILOT'
}, null, 2)}\n${SUCCESS}\n`);
