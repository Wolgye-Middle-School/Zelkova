"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AUTH_EVENT, checkRole, login } from "./auth";
import { EyeIcon, EyeOffIcon, Spinner } from "./icons";
import { ROLE_LABEL, type AccountRole } from "./tools";

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";
const SIGNUP_ROLES: Exclude<AccountRole, "admin">[] = ["teacher", "assistant", "worker"];

/** 로그인해야 안의 화면을 보여 줌. 로그인하지 않았으면 로그인 · 회원가입만 */
export default function AuthGate({ children }: { children: ReactNode }) {
  /** 확인 중이면 null */
  const [authed, setAuthed] = useState<boolean | null>(null);
  const check = useCallback(() => void checkRole().then((role) => setAuthed(role !== null)), []);

  useEffect(() => {
    check();
    window.addEventListener(AUTH_EVENT, check);
    return () => window.removeEventListener(AUTH_EVENT, check);
  }, [check]);

  if (authed) return children;
  return (
    <main className="grid flex-1 place-items-center bg-gradient-to-b from-sky-50 to-emerald-50 px-4 py-10">
      {authed === null ? <Spinner className="h-8 w-8 text-indigo-600" /> : <AuthForm />}
    </main>
  );
}

function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [id, setId] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<(typeof SIGNUP_ROLES)[number]>("teacher");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const signup = mode === "signup";

  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    setPassword("");
    setConfirm("");
    setError(null);
    setDone(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (!id.trim() || !password || (signup && !username.trim())) return setError("빈칸을 모두 적어 주세요.");
    if (signup && password !== confirm) return setError("비밀번호가 서로 달라요.");
    setBusy(true);
    if (!signup) {
      const result = await login(id, password);
      if (result.ok) {
        if (result.reload) window.location.reload();
        return;
      }
      setBusy(false);
      setPassword("");
      return setError(result.error);
    }
    try {
      const res = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: id, username, role, password }) });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) return setError(body?.error ?? "가입하지 못했어요. 잠시 뒤 다시 해 주세요.");
      switchMode("login");
      setDone("가입 신청을 보냈어요. 관리자가 승인하면 로그인할 수 있어요.");
    } catch {
      setError("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-up w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-7">
      <h1 className="text-center text-xl font-bold text-slate-900">느티나무 교실 도우미</h1>
      <div className="mt-5 flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="로그인 또는 회원가입">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            disabled={busy}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${mode === m ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            {m === "login" ? "로그인" : "회원가입"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <fieldset disabled={busy} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">아이디</span>
            <input value={id} type="text" autoComplete="username" onChange={(e) => setId(e.target.value)} className={field} />
          </label>
          {signup && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">이름</span>
                <input value={username} maxLength={60} autoComplete="name" onChange={(e) => setUsername(e.target.value)} className={field} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">계정 종류</span>
                <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={field}>
                  {SIGNUP_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <div>
            <label htmlFor="auth-password" className="mb-1 block text-xs font-semibold text-slate-600">
              비밀번호{signup && " (4글자 이상)"}
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                value={password}
                autoComplete={signup ? "new-password" : "current-password"}
                onChange={(e) => setPassword(e.target.value)}
                className={`${field} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "비밀번호 가리기" : "비밀번호 보기"}
                aria-pressed={showPassword}
                className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                {showPassword ? <EyeIcon className="h-5 w-5" /> : <EyeOffIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>
          {signup && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">비밀번호 한 번 더</span>
              <input type={showPassword ? "text" : "password"} value={confirm} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} className={field} />
            </label>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="text-sm font-medium text-emerald-600">
            {done}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70"
        >
          {busy && <Spinner className="h-5 w-5" />}
          {signup ? "회원가입" : "로그인"}
        </button>
      </form>
    </div>
  );
}
