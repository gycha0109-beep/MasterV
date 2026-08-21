import { NextResponse } from "next/server";
import { AnalysisExecutionBlockedError } from "@/lib/analysis-budget";
import { analyzeYouTubeDeepManaged } from "@/lib/analysis-service";
import { legacyWebApiEnabled } from "@/lib/deployment-surface";
import { deriveVideoMetrics } from "@/lib/derived-metrics";
import { normalizeGeminiError } from "@/lib/gemini-error";
import { isSupportedYouTubeUrl } from "@/lib/source-identity";

export async function POST(request: Request) {
  if (!legacyWebApiEnabled()) {
    return NextResponse.json({ error: "Not found", code: "LEGACY_WEB_API_DISABLED" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { url?: string; force_refresh?: boolean };
    const url = body.url?.trim();

    if (!url) return NextResponse.json({ error: "영상 URL을 입력해주세요." }, { status: 400 });
    if (!isSupportedYouTubeUrl(url)) {
      return NextResponse.json({ error: "현재 1차 구현은 공개 YouTube 영상 URL만 지원합니다." }, { status: 400 });
    }

    const managed = await analyzeYouTubeDeepManaged(url, { force_refresh: body.force_refresh === true });
    const derived_metrics = deriveVideoMetrics(managed.analysis);

    return NextResponse.json({
      source: {
        platform: managed.source.platform,
        source_id: managed.source.source_id,
        url: managed.source.canonical_url,
        requested_url: url
      },
      analysis: managed.analysis,
      derived_metrics,
      execution: managed.execution
    });
  } catch (error) {
    if (error instanceof AnalysisExecutionBlockedError) {
      return NextResponse.json({
        error: error.message,
        code: "ANALYSIS_QUEUE_BLOCKED",
        queue_status: error.status,
        model: error.model
      }, { status: 429 });
    }

    const normalized = normalizeGeminiError(error);
    if (normalized.is_rate_limit) {
      return NextResponse.json({
        error: normalized.message,
        code: "GEMINI_RATE_LIMIT",
        rate_limit: normalized.diagnostic
      }, { status: 429 });
    }

    return NextResponse.json({ error: normalized.message }, { status: 500 });
  }
}
