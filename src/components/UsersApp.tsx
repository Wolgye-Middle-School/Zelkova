"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { PlusIcon, Spinner, TrashIcon } from "./icons";
import { ROLE_LABEL, type AccountRole } from "./tools";

type UserRole = Exclude<AccountRole, "admin">;
type UserStatus = "approved" | "waiting";
type User = { id: string; email: string; username: string; role: UserRole; status: UserStatus; createdAt: number };

const ROLES: UserRole[] = ["teacher", "assistant", "worker"];
const STATUS_LABEL: Record<UserStatus, string> = { approved: "승인", waiting: "대기" };

const field =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";
const select = "h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500";

async function api<T>(method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/users", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !data) return { ok: false, error: data?.error ?? "처리하지 못했어요. 잠시 뒤 다시 해 주세요." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "서버에 연결하지 못했어요." };
  }
}

/** 관리자 전용: 계정(특수학급 교사 · 실무사 · 사회복무요원)을 만들고 종류 · 상태를 관리 */
export default function UsersApp() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | UserStatus>("all");
  const [removing, setRemoving] = useState<User | null>(null);
  const [form, setForm] = useState({ email: "", username: "", role: "assistant" as UserRole, password: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ users: User[] }>("GET");
    if (r.ok) setUsers(r.data.users);
    else setError(r.error);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 처음 열 때 서버에서 목록을 불러옴
    void load();
  }, [load]);

  const patch = async (id: string, change: Partial<Pick<User, "role" | "status">>) => {
    setError(null);
    const r = await api<{ user: User }>("PATCH", { id, ...change });
    if (r.ok) setUsers((list) => list?.map((u) => (u.id === id ? r.data.user : u)) ?? list);
    else setError(r.error);
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<{ user: User }>("POST", form);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setUsers((list) => [...(list ?? []), r.data.user]);
    setForm({ email: "", username: "", role: form.role, password: "" });
  };

  const remove = async () => {
    if (!removing) return;
    const id = removing.id;
    setRemoving(null);
    const r = await api<{ ok: true }>("DELETE", { id });
    if (r.ok) setUsers((list) => list?.filter((u) => u.id !== id) ?? list);
    else setError(r.error);
  };

  const shown = (users ?? []).filter((u) => filter === "all" || u.status === filter);

  return (
    <div className="fade-up mx-auto max-w-5xl space-y-5">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">사용자 관리</h1>
        <p className="mt-2 text-[15px] text-slate-500">특수학급 교사 · 특수학급 실무사 · 사회복무요원 계정을 만들고 관리해요.</p>
      </div>

      <form onSubmit={add} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_1fr_auto_1fr_auto]">
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="이메일 (로그인 아이디)" aria-label="이메일" className={field} />
        <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="사용자 이름" aria-label="사용자 이름" className={field} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} aria-label="계정 종류" className={`${select} h-10`}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="비밀번호" aria-label="비밀번호" className={field} />
        <button type="submit" disabled={busy} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">
          {busy ? <Spinner className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
          계정 만들기
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">전체 사용자</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            상태로 걸러 보기
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className={select}>
              <option value="all">모든 상태</option>
              <option value="approved">승인</option>
              <option value="waiting">대기</option>
            </select>
          </label>
        </div>
        {users === null ? (
          <div className="grid place-items-center py-10">{error ? null : <Spinner className="h-6 w-6 text-indigo-600" />}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-2 pr-3">이메일</th>
                  <th className="py-2 pr-3">사용자 이름</th>
                  <th className="py-2 pr-3">상태</th>
                  <th className="py-2 pr-3">종류</th>
                  <th className="py-2 text-right">삭제</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-3 text-slate-800">{u.email}</td>
                    <td className="py-2.5 pr-3 text-slate-800">{u.username}</td>
                    <td className="py-2.5 pr-3">
                      <select value={u.status} onChange={(e) => void patch(u.id, { status: e.target.value as UserStatus })} aria-label={`${u.username} 상태`} className={select}>
                        {(Object.keys(STATUS_LABEL) as UserStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 pr-3">
                      <select value={u.role} onChange={(e) => void patch(u.id, { role: e.target.value as UserRole })} aria-label={`${u.username} 종류`} className={select}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 text-right">
                      <button type="button" onClick={() => setRemoving(u)} aria-label={`${u.username} 계정 지우기`} className="inline-grid h-8 w-8 place-items-center rounded-lg text-red-700 transition hover:bg-red-50">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      {users.length ? "이 상태의 사용자가 없어요." : "아직 만든 계정이 없어요. 위에서 계정을 만들어 주세요."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">비밀번호는 암호화되어 저장되므로 볼 수 없어요. 비밀번호를 잊었다면 계정을 지우고 다시 만들어 주세요. 사회복무요원 지시는 「사회복무요원 업무 지시」에서 고쳐요.</p>
      </div>

      {removing && (
        <ConfirmDialog title="계정을 지울까요?" confirmLabel="지우기" onConfirm={() => void remove()} onCancel={() => setRemoving(null)}>
          {removing.username} ({removing.email}) 계정을 지워요. 이 계정은 더 이상 로그인할 수 없어요.
        </ConfirmDialog>
      )}
    </div>
  );
}
