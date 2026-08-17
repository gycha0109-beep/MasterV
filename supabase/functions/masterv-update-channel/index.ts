import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "@supabase/server";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const CHANNEL = "private-test";
const DEFAULT_TARGET = "windows-x86_64";
const BUCKET = "masterv-private-updates";
const SIGNED_URL_TTL_SECONDS = 600;
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

type ReleaseRow = {
  id: string;
  version: string;
  target: string;
  arch: string;
  storage_bucket: string;
  storage_object_path: string;
  signature: string;
  artifact_sha256: string;
  source_sha: string;
  notes: string | null;
  published_at: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function authorizationSubject(req: Request) {
  const authorization = req.headers.get("authorization")?.trim() ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const payloadPart = token.split(".")[1];
  if (!payloadPart) throw new Error("Authenticated JWT payload is missing");
  const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const payload = JSON.parse(atob(padded)) as { sub?: unknown };
  if (typeof payload.sub !== "string" || !payload.sub.trim()) throw new Error("Authenticated JWT subject is missing");
  return payload.sub.trim();
}

function parseVersion(value: string) {
  const match = VERSION_PATTERN.exec(value.trim());
  if (!match) throw new Error(`invalid semantic version: ${value}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null
  };
}

function compareVersions(left: string, right: string) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

async function authContext(req: Request) {
  authorizationSubject(req);
  const { data: context, error } = await createSupabaseContext(req, { auth: "user" });
  if (error || !context) throw new Error(error?.message || "Authenticated Supabase context is unavailable");
  return context;
}

async function latestUpdate(req: Request, currentVersion: string, target: string) {
  const context = await authContext(req);
  parseVersion(currentVersion);
  if (target !== DEFAULT_TARGET) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

  const now = new Date().toISOString();
  const { data, error } = await context.supabaseAdmin
    .from("masterv_desktop_update_releases")
    .select("id,version,target,arch,storage_bucket,storage_object_path,signature,artifact_sha256,source_sha,notes,published_at")
    .eq("channel", CHANNEL)
    .eq("target", target)
    .eq("enabled", true)
    .not("published_at", "is", null)
    .lte("published_at", now)
    .order("published_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(error.message);

  const release = ((data ?? []) as ReleaseRow[]).find((row) => compareVersions(row.version, currentVersion) > 0);
  if (!release) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

  const artifactUrl = new URL(req.url);
  artifactUrl.search = "";
  artifactUrl.searchParams.set("artifact", release.id);

  return json({
    version: release.version,
    pub_date: release.published_at,
    url: artifactUrl.toString(),
    signature: release.signature,
    notes: release.notes ?? "",
    masterv: { channel: CHANNEL, artifact_sha256: release.artifact_sha256, source_sha: release.source_sha }
  });
}

async function downloadArtifact(req: Request, releaseId: string) {
  const context = await authContext(req);
  if (!/^[0-9a-f-]{36}$/i.test(releaseId)) return json({ error: "invalid release id" }, 400);

  const now = new Date().toISOString();
  const { data, error } = await context.supabaseAdmin
    .from("masterv_desktop_update_releases")
    .select("id,storage_bucket,storage_object_path,enabled,published_at")
    .eq("id", releaseId)
    .eq("channel", CHANNEL)
    .eq("enabled", true)
    .not("published_at", "is", null)
    .lte("published_at", now)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "update artifact not found" }, 404);
  if (data.storage_bucket !== BUCKET) return json({ error: "unexpected update storage bucket" }, 409);

  const { data: signed, error: signError } = await context.supabaseAdmin.storage
    .from(data.storage_bucket)
    .createSignedUrl(data.storage_object_path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) return json({ error: signError?.message || "failed to sign update artifact URL" }, 500);

  const redirectUrl = new URL(signed.signedUrl, new URL(req.url).origin).toString();
  return Response.redirect(redirectUrl, 302);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type",
        "Access-Control-Allow-Methods": "GET, OPTIONS"
      }
    });
  }
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const url = new URL(req.url);
    const artifact = url.searchParams.get("artifact")?.trim();
    if (artifact) return await downloadArtifact(req, artifact);

    const currentVersion = url.searchParams.get("current_version")?.trim() ?? "";
    const target = url.searchParams.get("target")?.trim() || DEFAULT_TARGET;
    if (!currentVersion) return json({ error: "current_version is required" }, 400);
    return await latestUpdate(req, currentVersion, target);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /JWT|Authenticated|auth/i.test(message) ? 401 : 500;
    return json({ error: message }, status);
  }
});
