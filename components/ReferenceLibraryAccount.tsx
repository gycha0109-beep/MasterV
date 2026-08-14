"use client";

import { FormEvent, useState } from "react";
import type { ReferenceLibraryPersistenceStatus } from "@/lib/use-persistent-reference-library";
import styles from "./ReferenceLibraryAccount.module.css";

type Props = {
  configured: boolean;
  status: ReferenceLibraryPersistenceStatus;
  email?: string | null;
  error?: string;
  notice?: string;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
};

export function ReferenceLibraryAccount({
  configured,
  status,
  email,
  error,
  notice,
  onSignIn,
  onSignUp,
  onSignOut
}: Props) {
  const [inputEmail, setInputEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"signin" | "signup" | "signout" | null>(null);

  async function runCredentials(action: "signin" | "signup") {
    if (!inputEmail.trim() || password.length < 6 || pending) return;
    setPending(action);
    try {
      if (action === "signin") await onSignIn(inputEmail, password);
      else await onSignUp(inputEmail, password);
      setPassword("");
    } finally {
      setPending(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void runCredentials("signin");
  }

  async function logout() {
    if (pending) return;
    setPending("signout");
    try {
      await onSignOut();
    } finally {
      setPending(null);
    }
  }

  if (!configured) {
    return (
      <section className={styles.account} aria-label="Reference Library account">
        <div className={styles.summary}>
          <div className={styles.copy}>
            <strong>영속 보관함은 아직 이 실행 환경에 연결되지 않았습니다.</strong>
            <span>기존 세션 비교함은 그대로 사용할 수 있습니다.</span>
          </div>
          <span className={styles.badge}>세션 모드</span>
        </div>
      </section>
    );
  }

  if (status === "loading") {
    return (
      <section className={styles.account} aria-label="Reference Library account">
        <div className={styles.summary}>
          <div className={styles.copy}>
            <strong>보관함 계정을 확인하고 있습니다.</strong>
            <span>저장된 로그인 세션과 workspace 권한을 검증합니다.</span>
          </div>
          <span className={styles.badge}>연결 중</span>
        </div>
      </section>
    );
  }

  if (status === "ready") {
    return (
      <section className={styles.account} aria-label="Reference Library account">
        <div className={styles.summary}>
          <div className={styles.copy}>
            <strong>Supabase 보관함 연결됨</strong>
            <span>{email || "로그인 사용자"} · 새로고침 후에도 비교함이 유지됩니다.</span>
          </div>
          <button className={styles.logout} onClick={logout} disabled={Boolean(pending)}>
            {pending === "signout" ? "로그아웃 중..." : "로그아웃"}
          </button>
        </div>
        {notice && <p className={styles.message}>{notice}</p>}
        {error && <p className={`${styles.message} ${styles.error}`}>{error}</p>}
      </section>
    );
  }

  return (
    <section className={styles.account} aria-label="Reference Library account">
      <div className={styles.summary}>
        <div className={styles.copy}>
          <strong>로그인하면 비교함이 Supabase에 저장됩니다.</strong>
          <span>로그인하지 않아도 기존 세션 비교함은 계속 사용할 수 있습니다.</span>
        </div>
        <span className={styles.badge}>로그인 필요</span>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <input
          aria-label="보관함 이메일"
          type="email"
          autoComplete="email"
          value={inputEmail}
          onChange={(event) => setInputEmail(event.target.value)}
          placeholder="email@example.com"
        />
        <input
          aria-label="보관함 비밀번호"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="비밀번호 6자 이상"
        />
        <button className={styles.primary} type="submit" disabled={Boolean(pending)}>
          {pending === "signin" ? "로그인 중..." : "로그인"}
        </button>
        <button
          className={styles.secondary}
          type="button"
          disabled={Boolean(pending)}
          onClick={() => void runCredentials("signup")}
        >
          {pending === "signup" ? "가입 중..." : "계정 만들기"}
        </button>
      </form>

      {notice && <p className={styles.message}>{notice}</p>}
      {error && <p className={`${styles.message} ${styles.error}`}>{error}</p>}
    </section>
  );
}
