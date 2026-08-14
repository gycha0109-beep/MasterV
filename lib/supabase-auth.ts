export type SupabasePublicConfig = {
  project_url: string;
  publishable_key: string;
};

export type SupabaseAuthUser = {
  id: string;
  email?: string | null;
};

export type SupabaseAuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: SupabaseAuthUser;
};

export const SUPABASE_SESSION_STORAGE_KEY = "masterv.supabase.session.v1";

function normalizeProjectUrl(raw: string) {
  const value = raw.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[A-Za-z0-9-]+\.supabase\.co$/.test(value)) {
    throw new Error("Supabase project URL 형식이 올바르지 않습니다.");
  }
  return value;
}

function normalizeKey(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error("Supabase publishable key가 비어 있습니다.");
  return value;
}

export function readSupabasePublicConfig(): SupabasePublicConfig | null {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!projectUrl || !publishableKey) return null;
  return {
    project_url: normalizeProjectUrl(projectUrl),
    publishable_key: normalizeKey(publishableKey)
  };
}

function normalizeEmail(raw: string) {
  const value = raw.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(value)) throw new Error("이메일 형식이 올바르지 않습니다.");
  return value;
}

function normalizePassword(raw: string) {
  if (raw.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다.");
  return raw;
}

async function parseError(response: Response) {
  let message = `${response.status} ${response.statusText}`.trim();
  try {
    const body = await response.json() as {
      msg?: string;
      message?: string;
      error_description?: string;
      error?: string;
      code?: string;
    };
    message = body.msg || body.message || body.error_description || body.error || body.code || message;
  } catch {
    // Keep the HTTP fallback.
  }
  return message;
}

async function authRequest<T>(
  config: SupabasePublicConfig,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  const response = await fetchImpl(`${normalizeProjectUrl(config.project_url)}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: normalizeKey(config.publishable_key),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  if (!response.ok) throw new Error(`Supabase Auth 요청 실패: ${await parseError(response)}`);
  return await response.json() as T;
}

function normalizeSession(raw: SupabaseAuthSession): SupabaseAuthSession {
  if (!raw.access_token?.trim() || !raw.refresh_token?.trim() || !raw.user?.id?.trim()) {
    throw new Error("Supabase Auth session 응답이 완전하지 않습니다.");
  }
  const expiresIn = Number(raw.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("Supabase Auth expires_in 값이 올바르지 않습니다.");
  }
  return {
    ...raw,
    access_token: raw.access_token.trim(),
    refresh_token: raw.refresh_token.trim(),
    expires_in: expiresIn,
    expires_at: raw.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn,
    token_type: raw.token_type || "bearer",
    user: { id: raw.user.id.trim(), email: raw.user.email ?? null }
  };
}

export async function signInWithPassword(
  config: SupabasePublicConfig,
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch
) {
  const session = await authRequest<SupabaseAuthSession>(config, "token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: normalizeEmail(email), password: normalizePassword(password) })
  }, fetchImpl);
  return normalizeSession(session);
}

export async function signUpWithPassword(
  config: SupabasePublicConfig,
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch
) {
  return await authRequest<Partial<SupabaseAuthSession> & { user?: SupabaseAuthUser | null }>(config, "signup", {
    method: "POST",
    body: JSON.stringify({ email: normalizeEmail(email), password: normalizePassword(password) })
  }, fetchImpl);
}

export async function refreshSupabaseSession(
  config: SupabasePublicConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
) {
  const token = refreshToken.trim();
  if (!token) throw new Error("Supabase refresh token이 비어 있습니다.");
  const session = await authRequest<SupabaseAuthSession>(config, "token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: token })
  }, fetchImpl);
  return normalizeSession(session);
}

export async function getSupabaseAuthUser(
  config: SupabasePublicConfig,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
) {
  const token = accessToken.trim();
  if (!token) throw new Error("Supabase access token이 비어 있습니다.");
  return await authRequest<SupabaseAuthUser>(config, "user", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  }, fetchImpl);
}

export async function signOutSupabaseSession(
  config: SupabasePublicConfig,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
) {
  const token = accessToken.trim();
  if (!token) return;
  const response = await fetchImpl(`${normalizeProjectUrl(config.project_url)}/auth/v1/logout`, {
    method: "POST",
    headers: {
      apikey: normalizeKey(config.publishable_key),
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok && response.status !== 401) {
    throw new Error(`Supabase Auth 로그아웃 실패: ${await parseError(response)}`);
  }
}

export function shouldRefreshSupabaseSession(session: SupabaseAuthSession, nowMs = Date.now()) {
  const expiresAt = session.expires_at ?? 0;
  return expiresAt * 1000 <= nowMs + 60_000;
}

export function personalWorkspaceId(userId: string) {
  const value = userId.trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(value)) throw new Error("Supabase user ID 형식이 올바르지 않습니다.");
  return `user:${value.toLowerCase()}`;
}
