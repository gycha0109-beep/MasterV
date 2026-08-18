function normalizedUrl(raw, name) {
  const value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (parsed.protocol !== "https:") throw new Error(`${name} must use https`);
  return parsed.toString().replace(/\/$/, "");
}

export function readLegacyDesktopRuntimeConfig(env = process.env) {
  const supabaseUrl = normalizedUrl(env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  const apiBaseUrl = normalizedUrl(env.NEXT_PUBLIC_MASTERV_API_BASE_URL, "NEXT_PUBLIC_MASTERV_API_BASE_URL");
  const publishableKey = String(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim();
  const requireConfig = env.MASTERV_DESKTOP_REQUIRE_CONFIG === "1";
  const configured = Boolean(supabaseUrl && apiBaseUrl && publishableKey);

  if (requireConfig && !configured) {
    throw new Error("legacy desktop runtime config requires Supabase URL, publishable key, and hosted API base URL");
  }

  return Object.freeze({
    configured,
    adapterConfig: Object.freeze({
      supabase_url: supabaseUrl,
      supabase_publishable_key: publishableKey,
      api_base_url: apiBaseUrl,
      api_contract_version: "mv-hosted-api-v1"
    }),
    nativeInterop: Object.freeze({
      clientKey: publishableKey
    })
  });
}

export function renderLegacyDesktopRuntimeConfig(adapterConfig) {
  return `window.MASTERV_LEGACY_RUNTIME_CONFIG = Object.freeze(${JSON.stringify(adapterConfig)});\n`;
}
