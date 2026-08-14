import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "desktop");
const outputDir = path.join(root, "desktop-dist");

function normalizedUrl(raw, name) {
  const value = (raw || "").trim().replace(/\/+$/, "");
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

const supabaseUrl = normalizedUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
const apiBaseUrl = normalizedUrl(process.env.NEXT_PUBLIC_MASTERV_API_BASE_URL, "NEXT_PUBLIC_MASTERV_API_BASE_URL");
const publishableKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim();
const requireConfig = process.env.MASTERV_DESKTOP_REQUIRE_CONFIG === "1";

if (requireConfig && (!supabaseUrl || !apiBaseUrl || !publishableKey)) {
  throw new Error("desktop build requires Supabase URL, publishable key, and hosted API base URL");
}

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

for (const filename of ["index.html", "styles.css", "app.js"]) {
  await fs.copyFile(path.join(sourceDir, filename), path.join(outputDir, filename));
}

const publicConfig = {
  surface: "desktop",
  supabase_url: supabaseUrl,
  supabase_publishable_key: publishableKey,
  api_base_url: apiBaseUrl,
  api_contract_version: "mv-hosted-api-v1"
};

await fs.writeFile(
  path.join(outputDir, "config.js"),
  `window.MASTERV_DESKTOP_CONFIG = ${JSON.stringify(publicConfig)};\n`,
  "utf8"
);

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_STATIC_BUILD_PASS",
  output: "desktop-dist",
  configured: Boolean(supabaseUrl && publishableKey && apiBaseUrl),
  surface: publicConfig.surface,
  api_contract_version: publicConfig.api_contract_version
}));
