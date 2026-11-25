"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AUTH_EVENT, logout, notifyAuth } from "./auth";
import { Spinner, XIcon } from "./icons";
import LoginOverlay from "./LoginOverlay";
import { ROLE_LABEL, type AccountRole } from "./tools";

type Profile = { username: string; email: string; role: AccountRole; fixed: boolean };

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";
const primary = "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60";
const menuItem = "block w-full px-4 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50";

/** 프로필 사진: 이름 첫 글자 (로그인하지 않았으면 사람 모양) */
function Avatar({ name, className }: { name: string | undefined; className: string }) {
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full font-bold ${name ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-400"} ${className}`} aria-hidden="true">
      {name ? (
        [...name][0]
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full">
          <circle cx="12" cy="9.5" r="4.2" />
          <path d="M3.5 24c0-5 3.8-8.5 8.5-8.5s8.5 3.5 8.5 8.5Z" />
        </svg>
      )}
    </span>
  );
}

/** 머리글 오른쪽 위의 프로필. 누르면 프로필 조회하기 · 로그아웃 (로그인하지 않았으면 로그인 창) */
export default function ProfileMenu() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"profile" | "login" | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      setProfile(res.ok ? ((await res.json()) as { profile: Profile | null }).profile : null);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 로그인 상태는 서버에서 불러옴
    void load();
    const onAuth = () => void load();
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [load]);

  // 바깥을 누르거나 Esc 를 누르면 메뉴를 닫음
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signOut = async () => {
    setOpen(false);
    await logout();
    // 화면에 남은 내용까지 비우고 메인 화면으로 (일부러 전체를 다시 불러옴)
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => (profile ? setOpen((v) => !v) : setDialog("login"))}
        aria-label={profile ? `${profile.username} 프로필 메뉴` : "로그인"}
        aria-haspopup={profile ? "menu" : "dialog"}
        aria-expanded={profile ? open : undefined}
        title={profile ? profile.username : "로그인"}
        className="grid rounded-full ring-2 ring-transparent transition hover:ring-indigo-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        <Avatar name={profile?.username} className="h-9 w-9 text-sm" />
      </button>

      {open && profile && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <p className="truncate text-sm font-bold text-slate-900">{profile.username}</p>
            <p className="truncate text-xs text-slate-500">{ROLE_LABEL[profile.role]}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setDialog("profile");
            }}
            className={menuItem}
          >
            프로필 조회하기
          </button>
          <button type="button" role="menuitem" onClick={() => void signOut()} className={`${menuItem} text-red-600`}>
            로그아웃
          </button>
        </div>
      )}

      {dialog === "login" && <LoginOverlay title="로그인" exitLabel="닫기" onExit={() => setDialog(null)} onSuccess={() => setDialog(null)} />}
      {dialog === "profile" && profile && (
        <ProfileDialog
          profile={profile}
          onClose={() => setDialog(null)}
          onChanged={(p) => {
            setProfile(p);
            notifyAuth();
          }}
        />
      )}
    </div>
  );
}

/** 프로필 조회: 이름 · 이메일 · 계정 종류를 보고, 이름과 비밀번호를 바꿈 */
function ProfileDialog({ profile, onClose, onChanged }: { profile: Profile; onClose: () => void; onChanged: (p: Profile) => void }) {
  const [username, setUsername] = useState(profile.username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"name" | "password" | null>(null);
  const [message, setMessage] = useState<{ for: "name" | "password"; ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (what: "name" | "password", body: object) => {
    setBusy(what);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => null)) as { profile?: Profile; error?: string } | null;
      if (!res.ok || !data?.profile) {
        setMessage({ for: what, ok: false, text: data?.error ?? "바꾸지 못했어요. 잠시 뒤 다시 해 주세요." });
        return;
      }
      onChanged(data.profile);
      setUsername(data.profile.username);
      if (what === "password") {
        setCurrentPassword("");
        setNewPassword("");
        setConfirm("");
      }
      setMessage({ for: what, ok: true, text: what === "name" ? "이름을 바꿨어요." : "비밀번호를 바꿨어요." });
    } catch {
      setMessage({ for: what, ok: false, text: "서버에 연결하지 못했어요." });
    } finally {
      setBusy(null);
    }
  };

  const saveName = (e: FormEvent) => {
    e.preventDefault();
    void save("name", { username });
  };
  const savePassword = (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) return setMessage({ for: "password", ok: false, text: "새 비밀번호가 서로 달라요." });
    void save("password", { currentPassword, newPassword });
  };

  const note = (what: "name" | "password") =>
    message?.for === what && (
      <p role="status" className={`text-sm font-medium ${message.ok ? "text-emerald-600" : "text-red-600"}`}>
        {message.text}
      </p>
    );

  // 머리글 안에 있으면 화면 전체를 덮지 못하므로 body 에 바로 그림
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="profile-title" className="fade-up w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 id="profile-title" className="text-lg font-bold text-slate-900">
            내 프로필
          </h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Avatar name={profile.username} className="h-14 w-14 text-xl" />
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-900">{profile.username}</p>
            <p className="truncate text-sm text-slate-500">{profile.email}</p>
            <p className="text-xs font-semibold text-indigo-700">{ROLE_LABEL[profile.role]}</p>
          </div>
        </div>

        {!profile.fixed && (
          <>
            <form onSubmit={saveName} className="mt-5 space-y-2 border-t border-slate-100 pt-5">
              <label htmlFor="profile-name" className="block text-xs font-semibold text-slate-600">
                이름
              </label>
              <input id="profile-name" value={username} maxLength={60} onChange={(e) => setUsername(e.target.value)} className={field} />
              {note("name")}
              <button type="submit" disabled={busy !== null || !username.trim() || username.trim() === profile.username} className={primary}>
                {busy === "name" && <Spinner className="h-4 w-4" />}
                이름 변경
              </button>
            </form>

            <form onSubmit={savePassword} className="mt-5 space-y-2 border-t border-slate-100 pt-5">
              <p className="text-xs font-semibold text-slate-600">비밀번호</p>
              <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="지금 비밀번호" aria-label="지금 비밀번호" className={field} />
              <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="새 비밀번호 (4글자 이상)" aria-label="새 비밀번호" className={field} />
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="새 비밀번호 한 번 더" aria-label="새 비밀번호 확인" className={field} />
              {note("password")}
              <button type="submit" disabled={busy !== null || !currentPassword || !newPassword || !confirm} className={primary}>
                {busy === "password" && <Spinner className="h-4 w-4" />}
                비밀번호 변경
              </button>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
