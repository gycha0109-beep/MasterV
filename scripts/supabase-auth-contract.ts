import {
  getSupabaseAuthUser,
  personalWorkspaceId,
  refreshSupabaseSession,
  shouldRefreshSupabaseSession,
  signInWithPassword,
  signUpWithPassword,
  type SupabaseAuthSession,
  type SupabasePublicConfig
} from "../lib/supabase-auth";
import { bootstrapPersonalReferenceWorkspace } from "../lib/reference-library-session";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const config: SupabasePublicConfig = {
  project_url: "https://exampleproject.supabase.co",
  publishable_key: "sb_publishable_test"
};

const userId = "11111111-2222-3333-4444-555555555555";
const session: SupabaseAuthSession = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: { id: userId, email: "owner@example.com" }
};

async function run() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });

    if (url.endsWith("/auth/v1/token?grant_type=password")) {
      return new Response(JSON.stringify(session), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.endsWith("/auth/v1/signup")) {
      return new Response(JSON.stringify({ user: session.user }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.endsWith("/auth/v1/token?grant_type=refresh_token")) {
      return new Response(JSON.stringify({ ...session, access_token: "refreshed-access" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify(session.user), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/rest/v1/masterv_workspace_members?")) {
      return new Response(null, { status: 201 });
    }
    return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500, headers: { "Content-Type": "application/json" } });
  };

  const signedIn = await signInWithPassword(config, "Owner@Example.com", "secret1", fakeFetch);
  assert(signedIn.user.id === userId, "password login should preserve authenticated user id");
  const signInBody = JSON.parse(String(calls[0].init?.body)) as { email: string; password: string };
  assert(signInBody.email === "owner@example.com", "login email should normalize to lowercase");
  assert(signInBody.password === "secret1", "login password should be forwarded unchanged");
  assert((calls[0].init?.headers as Record<string, string>).apikey === config.publishable_key, "auth should use publishable API key");

  const signedUp = await signUpWithPassword(config, "new@example.com", "secret2", fakeFetch);
  assert(signedUp.user?.id === userId, "signup response should preserve user identity even without a session");

  const refreshed = await refreshSupabaseSession(config, session.refresh_token, fakeFetch);
  assert(refreshed.access_token === "refreshed-access", "refresh should replace access token");

  const user = await getSupabaseAuthUser(config, session.access_token, fakeFetch);
  assert(user.email === "owner@example.com", "user endpoint should return current auth user");

  assert(personalWorkspaceId(userId) === `user:${userId}`, "personal workspace id should be derived only from auth user id");
  assert(!shouldRefreshSupabaseSession(session), "healthy session should not refresh early");
  assert(shouldRefreshSupabaseSession({ ...session, expires_at: Math.floor(Date.now() / 1000) + 30 }), "session within one minute of expiry should refresh");

  const workspace = await bootstrapPersonalReferenceWorkspace(config, session, fakeFetch);
  assert(workspace === `user:${userId}`, "workspace bootstrap should return deterministic personal workspace id");
  const bootstrapCall = calls.find((call) => call.url.includes("/rest/v1/masterv_workspace_members?"));
  assert(bootstrapCall, "workspace bootstrap should call the membership table");
  const bootstrapBody = JSON.parse(String(bootstrapCall.init?.body)) as { workspace_id: string; user_id: string; role: string };
  assert(bootstrapBody.workspace_id === `user:${userId}`, "workspace bootstrap must not accept arbitrary workspace ids");
  assert(bootstrapBody.user_id === userId, "workspace bootstrap must use authenticated user id");
  assert(bootstrapBody.role === "owner", "personal bootstrap should create owner membership");
  const bootstrapHeaders = bootstrapCall.init?.headers as Record<string, string>;
  assert(bootstrapHeaders.Authorization === `Bearer ${session.access_token}`, "workspace bootstrap must carry user bearer token");
  assert(bootstrapHeaders.apikey === config.publishable_key, "workspace bootstrap must use publishable API key");

  let rejected = false;
  try {
    personalWorkspaceId("not-a-uuid");
  } catch {
    rejected = true;
  }
  assert(rejected, "invalid auth user id must be rejected");

  console.log("SUPABASE_AUTH_CONTRACT_PASS");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
