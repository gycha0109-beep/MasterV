import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GeminiRateLimitDiagnostic } from "@/lib/gemini-error";
import {
  createInitialQueueState,
  type AnalysisQueueState
} from "@/lib/tiered-analysis";

export interface AnalysisBudgetStore {
  get(model: string, now?: Date): Promise<AnalysisQueueState>;
  set(model: string, state: AnalysisQueueState): Promise<void>;
}

export class AnalysisExecutionBlockedError extends Error {
  constructor(
    message: string,
    public readonly status: AnalysisQueueState["status"],
    public readonly model: string
  ) {
    super(message);
    this.name = "AnalysisExecutionBlockedError";
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function getPacificBudgetWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function resetBudgetWindowIfNeeded(state: AnalysisQueueState, now = new Date()) {
  const window = getPacificBudgetWindow(now);
  return state.budget.last_reset_window === window
    ? state
    : createInitialQueueState(window);
}

export function prepareAnalysisBudget(state: AnalysisQueueState, model: string, now = new Date()) {
  const current = resetBudgetWindowIfNeeded(state, now);

  if (current.status === "blocked_rpd") {
    throw new AnalysisExecutionBlockedError(
      "Gemini 일일 요청 한도로 이 모델의 분석 queue가 중단되어 있습니다.",
      current.status,
      model
    );
  }

  if (current.status === "blocked_unknown") {
    throw new AnalysisExecutionBlockedError(
      "종류를 확인할 수 없는 Gemini 요청 제한으로 자동 분석이 중단되어 있습니다.",
      current.status,
      model
    );
  }

  if (current.status === "paused_rate_limit") {
    const pausedUntil = current.budget.queue_paused_until;
    if (!pausedUntil || new Date(pausedUntil).getTime() > now.getTime()) {
      throw new AnalysisExecutionBlockedError(
        "Gemini 분당 제한으로 분석 queue가 일시 중단되어 있습니다.",
        current.status,
        model
      );
    }

    return {
      ...current,
      status: "idle" as const,
      budget: {
        ...current.budget,
        queue_paused_until: undefined
      }
    };
  }

  return current;
}

export function markAnalysisRequestStarted(state: AnalysisQueueState, sourceIds: string[]) {
  return {
    ...state,
    status: "running" as const,
    active_source_ids: unique(sourceIds),
    budget: {
      ...state.budget,
      tracked_requests_today: state.budget.tracked_requests_today + 1
    }
  };
}

export function markAnalysisRequestSucceeded(state: AnalysisQueueState, sourceIds: string[]) {
  return {
    ...state,
    status: "completed" as const,
    active_source_ids: [],
    completed_source_ids: unique([...state.completed_source_ids, ...sourceIds]),
    failed_source_ids: state.failed_source_ids.filter((id) => !sourceIds.includes(id))
  };
}

export function markAnalysisRequestFailed(state: AnalysisQueueState, sourceIds: string[]) {
  return {
    ...state,
    status: "idle" as const,
    active_source_ids: [],
    failed_source_ids: unique([...state.failed_source_ids, ...sourceIds])
  };
}

export function applyGeminiRateLimit(
  state: AnalysisQueueState,
  diagnostic: GeminiRateLimitDiagnostic,
  sourceIds: string[],
  now = new Date()
) {
  const pausedUntil = diagnostic.retry_after_seconds === null
    ? undefined
    : new Date(now.getTime() + diagnostic.retry_after_seconds * 1000).toISOString();

  const status = diagnostic.kind === "RPD"
    ? "blocked_rpd"
    : diagnostic.kind === "UNKNOWN"
      ? "blocked_unknown"
      : "paused_rate_limit";

  return {
    ...state,
    status,
    active_source_ids: [],
    failed_source_ids: unique([...state.failed_source_ids, ...sourceIds]),
    budget: {
      ...state.budget,
      last_rate_limit: {
        kind: diagnostic.kind,
        model: diagnostic.model ?? undefined,
        limit: diagnostic.limit ?? undefined
      },
      queue_paused_until: status === "paused_rate_limit" ? pausedUntil : undefined
    }
  } satisfies AnalysisQueueState;
}

export class InMemoryAnalysisBudgetStore implements AnalysisBudgetStore {
  private readonly states = new Map<string, AnalysisQueueState>();

  async get(model: string, now = new Date()) {
    const existing = this.states.get(model) ?? createInitialQueueState(getPacificBudgetWindow(now));
    const current = resetBudgetWindowIfNeeded(existing, now);
    this.states.set(model, current);
    return current;
  }

  async set(model: string, state: AnalysisQueueState) {
    this.states.set(model, state);
  }

  clear() {
    this.states.clear();
  }
}

type BudgetFileEnvelope = {
  version: "analysis-budget-v1";
  states: Record<string, AnalysisQueueState>;
};

const budgetFileQueues = new Map<string, Promise<void>>();

async function readBudgetFile(filePath: string): Promise<BudgetFileEnvelope> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as BudgetFileEnvelope;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: "analysis-budget-v1", states: {} };
    }
    throw error;
  }
}

async function writeBudgetFile(filePath: string, value: BudgetFileEnvelope) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, filePath);
}

function withBudgetFileQueue<T>(filePath: string, operation: () => Promise<T>) {
  const previous = budgetFileQueues.get(filePath) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  budgetFileQueues.set(filePath, next.then(() => undefined, () => undefined));
  return next;
}

export class FileAnalysisBudgetStore implements AnalysisBudgetStore {
  constructor(public readonly filePath: string) {}

  async get(model: string, now = new Date()) {
    await (budgetFileQueues.get(this.filePath) ?? Promise.resolve());
    const envelope = await readBudgetFile(this.filePath);
    const existing = envelope.states[model] ?? createInitialQueueState(getPacificBudgetWindow(now));
    const current = resetBudgetWindowIfNeeded(existing, now);
    if (current !== existing) await this.set(model, current);
    return current;
  }

  async set(model: string, state: AnalysisQueueState) {
    await withBudgetFileQueue(this.filePath, async () => {
      const envelope = await readBudgetFile(this.filePath);
      await writeBudgetFile(this.filePath, {
        version: "analysis-budget-v1",
        states: { ...envelope.states, [model]: state }
      });
    });
  }
}
