import { NextResponse } from "next/server";
import { analyzeYouTubeVideo } from "@/lib/gemini";
import { deriveVideoMetrics } from "@/lib/derived-metrics";
import { normalizeGeminiError } from "@/lib/gemini-error";

function isYouTubeUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    return host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ error: "영상 URL을 입력해주세요." }, { status: 400 });
    }

    if (!isYouTubeUrl(url)) {
      return NextResponse.json(
        { error: "현재 1차 구현은 공개 YouTube 영상 URL만 지원합니다." },
        { status: 400 }
      );
    }

    const analysis = await analyzeYouTubeVideo(url);
    const derived_metrics = deriveVideoMetrics(analysis);

    return NextResponse.json({
      source: {
        platform: "youtube",
        url
      },
      analysis,
      derived_metrics
    });
  } catch (error) {
    const normalized = normalizeGeminiError(error);

    if (normalized.is_rate_limit) {
      return NextResponse.json(
        {
          error: normalized.message,
          code: "GEMINI_RATE_LIMIT",
          rate_limit: normalized.diagnostic
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: normalized.message },
      { status: 500 }
    );
  }
}
