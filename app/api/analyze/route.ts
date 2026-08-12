import { NextResponse } from "next/server";
import { analyzeYouTubeVideo } from "@/lib/gemini";
import { deriveVideoMetrics } from "@/lib/derived-metrics";

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
    const message = error instanceof Error ? error.message : "영상 분석에 실패했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
