export type MasterVRuntimeSurface = "web" | "desktop";

export type MasterVRuntimeConfig = {
  surface: MasterVRuntimeSurface;
  api_base_url: string | null;
};

function normalizeBaseUrl(raw: string) {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return null;
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("MasterV hosted API base URL은 http/https만 지원합니다.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function readMasterVRuntimeConfig(env: Record<string, string | undefined> = process.env) : MasterVRuntimeConfig {
  const requestedSurface = env.NEXT_PUBLIC_MASTERV_SURFACE?.trim().toLowerCase();
  const surface: MasterVRuntimeSurface = requestedSurface === "desktop" ? "desktop" : "web";
  const apiBase = normalizeBaseUrl(env.NEXT_PUBLIC_MASTERV_API_BASE_URL ?? "");
  if (surface === "desktop" && !apiBase) {
    throw new Error("Desktop surface에는 NEXT_PUBLIC_MASTERV_API_BASE_URL이 필요합니다.");
  }
  return { surface, api_base_url: apiBase };
}

export function resolveMasterVRuntimeUrl(path: string, config: MasterVRuntimeConfig) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!config.api_base_url) return normalizedPath;
  return `${config.api_base_url}${normalizedPath}`;
}

export function runtimeApiHeaders(input: {
  access_token?: string | null;
  publishable_key?: string | null;
  content_type?: string | null;
} = {}) {
  const headers: Record<string, string> = {};
  if (input.content_type) headers["Content-Type"] = input.content_type;
  if (input.access_token?.trim()) headers.Authorization = `Bearer ${input.access_token.trim()}`;
  if (input.publishable_key?.trim()) headers.apikey = input.publishable_key.trim();
  return headers;
}
