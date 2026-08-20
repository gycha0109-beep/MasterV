export type MasterVRuntimeSurface = "web" | "desktop";

export type MasterVRuntimeConfig = {
  surface: MasterVRuntimeSurface;
  api_base_url: null;
};

export function readMasterVRuntimeConfig(env: Record<string, string | undefined> = process.env): MasterVRuntimeConfig {
  const requestedSurface = env.NEXT_PUBLIC_MASTERV_SURFACE?.trim().toLowerCase();
  const surface: MasterVRuntimeSurface = requestedSurface === "desktop" ? "desktop" : "web";
  return { surface, api_base_url: null };
}

export function resolveMasterVRuntimeUrl(path: string, _config: MasterVRuntimeConfig) {
  return path.startsWith("/") ? path : `/${path}`;
}

export function runtimeApiHeaders(input: {
  access_token?: string | null;
  content_type?: string | null;
} = {}) {
  const headers: Record<string, string> = {};
  if (input.content_type) headers["Content-Type"] = input.content_type;
  if (input.access_token?.trim()) headers.Authorization = `Bearer ${input.access_token.trim()}`;
  return headers;
}
