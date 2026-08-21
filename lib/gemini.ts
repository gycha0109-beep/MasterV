import type { VideoAnalysis } from "@/lib/analysis-schema";
import {
  analyzeYouTubeVideoWithKey,
  DEFAULT_DEEP_GEMINI_MODEL
} from "@/lib/gemini-deep-core";

export async function analyzeYouTubeVideo(url: string): Promise<VideoAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (!apiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");

  return analyzeYouTubeVideoWithKey(url, {
    api_key: apiKey,
    model: process.env.GEMINI_MODEL || DEFAULT_DEEP_GEMINI_MODEL
  });
}
