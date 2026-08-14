"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReferenceLibraryRecord, ReferenceLibrarySaveInput } from "@/lib/reference-library";
import {
  getSupabaseAuthUser,
  readSupabasePublicConfig,
  refreshSupabaseSession,
  shouldRefreshSupabaseSession,
  signInWithPassword,
  signOutSupabaseSession,
  signUpWithPassword,
  SUPABASE_SESSION_STORAGE_KEY,
  type SupabaseAuthSession
} from "@/lib/supabase-auth";
import {
  bootstrapPersonalReferenceWorkspace,
  createSessionReferenceLibraryStore
} from "@/lib/reference-library-session";

export type ReferenceLibraryPersistenceStatus =
  | "unconfigured"
  | "signed_out"
  | "loading"
  | "ready"
  | "error";

type SaveInput = Omit<ReferenceLibrarySaveInput, "workspace_id">;

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(SUPABASE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SupabaseAuthSession;
    if (!parsed?.access_token || !parsed?.refresh_token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(session: SupabaseAuthSession | null) {
  if (session) window.localStorage.setItem(SUPABASE_SESSION_STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SUPABASE_SESSION_STORAGE_KEY);
}

export function usePersistentReferenceLibrary() {
  const config = useMemo(() => readSupabasePublicConfig(), []);
  const [status, setStatus] = useState<ReferenceLibraryPersistenceStatus>(config ? "loading" : "unconfigured");
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [records, setRecords] = useState<ReferenceLibraryRecord[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const establishSession = useCallback(async (candidate: SupabaseAuthSession) => {
    if (!config) throw new Error("Supabase public config가 없습니다.");
    let active = candidate;
    if (shouldRefreshSupabaseSession(active)) {
      active = await refreshSupabaseSession(config, active.refresh_token);
    }

    try {
      const user = await getSupabaseAuthUser(config, active.access_token);
      active = { ...active, user: { id: user.id, email: user.email ?? active.user.email ?? null } };
    } catch {
      active = await refreshSupabaseSession(config, active.refresh_token);
      const user = await getSupabaseAuthUser(config, active.access_token);
      active = { ...active, user: { id: user.id, email: user.email ?? active.user.email ?? null } };
    }

    const workspace = await bootstrapPersonalReferenceWorkspace(config, active);
    const store = createSessionReferenceLibraryStore(config, active);
    const loaded = await store.list(workspace);

    writeStoredSession(active);
    setSession(active);
    setWorkspaceId(workspace);
    setRecords(loaded);
    setError("");
    setStatus("ready");
    return { active, workspace, store };
  }, [config]);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    const restore = async () => {
      const stored = readStoredSession();
      if (!stored) {
        if (!cancelled) setStatus("signed_out");
        return;
      }
      try {
        await establishSession(stored);
      } catch (caught) {
        if (cancelled) return;
        writeStoredSession(null);
        setSession(null);
        setWorkspaceId(null);
        setRecords([]);
        setError(caught instanceof Error ? caught.message : "보관함 세션 복구에 실패했습니다.");
        setStatus("signed_out");
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, [config, establishSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!config) throw new Error("Supabase persistence가 설정되지 않았습니다.");
    setStatus("loading");
    setError("");
    setNotice("");
    try {
      const signedIn = await signInWithPassword(config, email, password);
      await establishSession(signedIn);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "로그인에 실패했습니다.";
      setError(message);
      setStatus("signed_out");
      throw caught;
    }
  }, [config, establishSession]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!config) throw new Error("Supabase persistence가 설정되지 않았습니다.");
    setStatus("loading");
    setError("");
    setNotice("");
    try {
      const result = await signUpWithPassword(config, email, password);
      if (result.access_token && result.refresh_token && result.user && result.expires_in) {
        await establishSession(result as SupabaseAuthSession);
        setNotice("계정 생성과 로그인이 완료되었습니다.");
        return;
      }
      setStatus("signed_out");
      setNotice("계정이 생성되었습니다. 이메일 확인이 필요하면 확인 후 로그인해주세요.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "계정 생성에 실패했습니다.";
      setError(message);
      setStatus("signed_out");
      throw caught;
    }
  }, [config, establishSession]);

  const signOut = useCallback(async () => {
    if (config && session) {
      try {
        await signOutSupabaseSession(config, session.access_token);
      } catch {
        // Local session removal remains authoritative for this browser even if upstream logout fails.
      }
    }
    writeStoredSession(null);
    setSession(null);
    setWorkspaceId(null);
    setRecords([]);
    setError("");
    setNotice("");
    setStatus(config ? "signed_out" : "unconfigured");
  }, [config, session]);

  const reload = useCallback(async () => {
    if (!config || !session || !workspaceId) return;
    const store = createSessionReferenceLibraryStore(config, session);
    setRecords(await store.list(workspaceId));
  }, [config, session, workspaceId]);

  const save = useCallback(async (input: SaveInput) => {
    if (!config || !session || !workspaceId || status !== "ready") {
      throw new Error("로그인된 persistent reference library가 준비되지 않았습니다.");
    }
    const store = createSessionReferenceLibraryStore(config, session);
    const saved = await store.upsert({ ...input, workspace_id: workspaceId });
    setRecords((current) => [saved, ...current.filter((record) => record.source.source_id !== saved.source.source_id)]);
    return saved;
  }, [config, session, workspaceId, status]);

  const remove = useCallback(async (sourceId: string) => {
    if (!config || !session || !workspaceId || status !== "ready") {
      throw new Error("로그인된 persistent reference library가 준비되지 않았습니다.");
    }
    const store = createSessionReferenceLibraryStore(config, session);
    const removed = await store.delete(workspaceId, sourceId);
    if (removed) setRecords((current) => current.filter((record) => record.source.source_id !== sourceId));
    return removed;
  }, [config, session, workspaceId, status]);

  return {
    configured: Boolean(config),
    status,
    session,
    workspaceId,
    records,
    error,
    notice,
    signIn,
    signUp,
    signOut,
    reload,
    save,
    remove
  };
}
