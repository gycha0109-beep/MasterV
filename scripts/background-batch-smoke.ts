import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import {
  buildBackgroundBatchPrompt,
  isBackgroundBatchTerminalState,
  normalizeBackgroundBatchTargets
} from "../lib/background-batch";

const DEFAULT_MODEL = "gemini-3.6-flash";
const DEFAULT_SOURCE_URL = "https://www.youtube.com/watch?v=dr7rrnD_4jI";
const POLL_INTERVAL_MS = 15_000;
const MAX_SUBMIT_POLLS = 6;
const MAX_CHECK_POLLS = 4;

type SmokeMode = "submit" | "check";

type SmokeArtifact = {
  version: "background-batch-smoke-v1";
  generated_at: string;
  mode: SmokeMode;
  model: string;
  source_id: string;
  canonical_url: string;
  job_name: string | null;
  state: string | null;
  status: "SUCCEEDED" | "PENDING" | "FAILED";
  response_text: string | null;
  error: string | null;
  batch_create_attempts: number;
  interactive_generate_requests: 0;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function modeFromEnv(): SmokeMode {
  const raw = process.env.BACKGROUND_BATCH_MODE?.trim() || "submit";
  if (raw !== "submit" && raw !== "check") throw new Error(`unsupported BACKGROUND_BATCH_MODE: ${raw}`);
  return raw;
}

function stateOf(job: { state?: unknown }) {
  return typeof job.state === "string" ? job.state : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function jobErrorMessage(job: { error?: unknown }) {
  if (job.error === undefined || job.error === null) return null;
  if (typeof job.error === "string") return job.error;
  try {
    return JSON.stringify(job.error);
  } catch {
    return String(job.error);
  }
}

async function writeArtifact(artifact: SmokeArtifact) {
  const artifactDir = path.resolve("artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, "background-batch-smoke.json");
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");
  return artifactPath;
}

async function pollExistingJob(
  ai: GoogleGenAI,
  jobName: string,
  initialJob: Awaited<ReturnType<GoogleGenAI["batches"]["get"]>> | null,
  maxPolls: number
) {
  let job = initialJob ?? await ai.batches.get({ name: jobName });
  for (let poll = 0; poll < maxPolls; poll += 1) {
    const state = stateOf(job);
    if (state && isBackgroundBatchTerminalState(state)) return job;
    if (poll === maxPolls - 1) return job;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    job = await ai.batches.get({ name: jobName });
  }
  return job;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  assert(apiKey, "GEMINI_API_KEY is required");

  const mode = modeFromEnv();
  const model = process.env.BACKGROUND_BATCH_MODEL?.trim() || DEFAULT_MODEL;
  const sourceUrl = process.env.BACKGROUND_BATCH_SOURCE_URL?.trim() || DEFAULT_SOURCE_URL;
  const [target] = normalizeBackgroundBatchTargets([sourceUrl]);
  const ai = new GoogleGenAI({ apiKey });

  let batchCreateAttempts = 0;
  let jobName = process.env.BACKGROUND_BATCH_JOB_NAME?.trim() || null;
  let job: Awaited<ReturnType<GoogleGenAI["batches"]["get"]>> | null = null;

  try {
    if (mode === "submit") {
      assert(!jobName, "submit mode must not receive BACKGROUND_BATCH_JOB_NAME");
      batchCreateAttempts = 1;
      const created = await ai.batches.create({
        model,
        src: [
          {
            contents: [
              {
                role: "user",
                parts: [
                  { fileData: { fileUri: target.canonical_url } },
                  {
                    text: [
                      buildBackgroundBatchPrompt(target.source_id),
                      "Return plain text containing the exact SOURCE_ID and a short observable-only summary."
                    ].join("\n")
                  }
                ]
              }
            ]
          }
        ],
        config: {
          displayName: `masterv-1h-b-${Date.now()}`
        }
      });
      assert(created.name, "Batch create returned no job name");
      jobName = created.name;
      job = await pollExistingJob(ai, jobName, created, MAX_SUBMIT_POLLS);
    } else {
      assert(jobName, "BACKGROUND_BATCH_JOB_NAME is required in check mode");
      job = await pollExistingJob(ai, jobName, null, MAX_CHECK_POLLS);
    }

    assert(jobName, "batch job name missing after execution");
    assert(job, "batch job missing after execution");
    const state = stateOf(job);

    if (!state || !isBackgroundBatchTerminalState(state)) {
      const artifactPath = await writeArtifact({
        version: "background-batch-smoke-v1",
        generated_at: new Date().toISOString(),
        mode,
        model,
        source_id: target.source_id,
        canonical_url: target.canonical_url,
        job_name: jobName,
        state,
        status: "PENDING",
        response_text: null,
        error: null,
        batch_create_attempts: batchCreateAttempts,
        interactive_generate_requests: 0
      });
      console.log(JSON.stringify({
        status: "BACKGROUND_BATCH_SMOKE_PENDING",
        mode,
        job_name: jobName,
        state,
        batch_create_attempts: batchCreateAttempts,
        interactive_generate_requests: 0,
        artifact: artifactPath
      }));
      return;
    }

    if (state !== "JOB_STATE_SUCCEEDED" && state !== "BATCH_STATE_SUCCEEDED") {
      const jobError = jobErrorMessage(job);
      const artifactPath = await writeArtifact({
        version: "background-batch-smoke-v1",
        generated_at: new Date().toISOString(),
        mode,
        model,
        source_id: target.source_id,
        canonical_url: target.canonical_url,
        job_name: jobName,
        state,
        status: "FAILED",
        response_text: null,
        error: jobError ?? `Batch terminal state: ${state}`,
        batch_create_attempts: batchCreateAttempts,
        interactive_generate_requests: 0
      });
      console.error(JSON.stringify({
        status: "BACKGROUND_BATCH_SMOKE_FAILED",
        mode,
        job_name: jobName,
        state,
        error: jobError,
        batch_create_attempts: batchCreateAttempts,
        interactive_generate_requests: 0,
        artifact: artifactPath
      }));
      process.exitCode = 1;
      return;
    }

    const responses = job.dest?.inlinedResponses;
    assert(responses?.length === 1, `expected exactly one inline response, got ${responses?.length ?? 0}`);
    const inlineResponse = responses[0];
    assert(!inlineResponse.error, `batch item failed: ${String(inlineResponse.error)}`);
    const responseText = inlineResponse.response?.text ?? "";
    assert(responseText.includes(target.source_id), "batch response did not echo canonical source_id");

    const artifactPath = await writeArtifact({
      version: "background-batch-smoke-v1",
      generated_at: new Date().toISOString(),
      mode,
      model,
      source_id: target.source_id,
      canonical_url: target.canonical_url,
      job_name: jobName,
      state,
      status: "SUCCEEDED",
      response_text: responseText,
      error: null,
      batch_create_attempts: batchCreateAttempts,
      interactive_generate_requests: 0
    });

    console.log(JSON.stringify({
      status: "BACKGROUND_BATCH_SMOKE_PASS",
      mode,
      job_name: jobName,
      state,
      source_id: target.source_id,
      batch_create_attempts: batchCreateAttempts,
      interactive_generate_requests: 0,
      artifact: artifactPath
    }));
  } catch (error) {
    const message = errorMessage(error);
    const artifactPath = await writeArtifact({
      version: "background-batch-smoke-v1",
      generated_at: new Date().toISOString(),
      mode,
      model,
      source_id: target.source_id,
      canonical_url: target.canonical_url,
      job_name: jobName,
      state: stateOf(job ?? {}),
      status: "FAILED",
      response_text: null,
      error: message,
      batch_create_attempts: batchCreateAttempts,
      interactive_generate_requests: 0
    });
    console.error(JSON.stringify({
      status: "BACKGROUND_BATCH_SMOKE_ERROR",
      mode,
      job_name: jobName,
      error: message,
      batch_create_attempts: batchCreateAttempts,
      interactive_generate_requests: 0,
      artifact: artifactPath
    }));
    process.exitCode = 1;
  }
}

void main();
