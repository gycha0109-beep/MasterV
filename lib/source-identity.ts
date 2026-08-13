import type { SourcePlatform } from "@/lib/tiered-analysis";

export type CanonicalSourceIdentity = {
  platform: SourcePlatform;
  source_id: string;
  canonical_url: string;
  native_id: string;
};

function normalizeHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function extractYouTubeVideoId(url: URL) {
  const host = normalizeHost(url.hostname);

  if (host === "youtu.be") {
    return url.pathname.split("/").filter(Boolean)[0] ?? null;
  }

  if (host !== "youtube.com" && host !== "m.youtube.com") return null;

  const pathParts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/watch") return url.searchParams.get("v");
  if (["shorts", "embed", "live"].includes(pathParts[0] ?? "")) return pathParts[1] ?? null;

  return null;
}

function validateYouTubeVideoId(videoId: string | null) {
  const value = videoId?.trim() ?? "";
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("지원되는 공개 YouTube 영상 URL에서 video ID를 찾을 수 없습니다.");
  }
  return value;
}

export function canonicalizeYouTubeSource(rawUrl: string): CanonicalSourceIdentity {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("유효한 YouTube URL이 아닙니다.");
  }

  const nativeId = validateYouTubeVideoId(extractYouTubeVideoId(url));
  return {
    platform: "youtube",
    source_id: `yt:${nativeId}`,
    canonical_url: `https://www.youtube.com/watch?v=${nativeId}`,
    native_id: nativeId
  };
}

export function isSupportedYouTubeUrl(rawUrl: string) {
  try {
    canonicalizeYouTubeSource(rawUrl);
    return true;
  } catch {
    return false;
  }
}
