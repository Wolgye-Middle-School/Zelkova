/** 학생 정보 관리 로그인 (브라우저 쪽). 아이디 · 비밀번호 확인은 서버(/api/auth)에서만 함 */
import type { AccountRole } from "./tools";

export async function checkAuth(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth", { cache: "no-store" });
    return res.ok && ((await res.json()) as { authed?: boolean }).authed === true;
  } catch {
    return false;
  }
}

/** 지금 로그인한 계정의 종류 (로그인하지 않았으면 null) */
export async function checkRole(): Promise<AccountRole | null> {
  try {
    const res = await fetch("/api/auth", { cache: "no-store" });
    const body = res.ok ? ((await res.json()) as { role?: AccountRole | null }) : null;
    return body?.role ?? null;
  } catch {
    return null;
  }
}

/** 관리자(업무 안내 편집 등)로 로그인되어 있는지 */
export async function checkAdmin(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth", { cache: "no-store" });
    return res.ok && ((await res.json()) as { admin?: boolean }).admin === true;
  } catch {
    return false;
  }
}

/**
 * 테스트 계정(test · test)으로 로그인한 브라우저인지. 테스트 계정이면 서버는 연습용 저장소를 쓰고,
 * 브라우저 저장(localStorage)도 layout 의 스크립트가 이 탭에만 남는 sessionStorage 로 바꿔 진짜 저장 내용과 섞이지 않게 함
 */
export const isTestBrowser = () => typeof document !== "undefined" && /(?:^|;\s*)zelkova_test=1(?:;|$)/.test(document.cookie);

/** 로그인 · 로그아웃 · 프로필 변경을 화면의 다른 곳(머리글의 프로필)에 알리는 이벤트 */
export const AUTH_EVENT = "zelkova:auth";
export const notifyAuth = () => window.dispatchEvent(new Event(AUTH_EVENT));

/**
 * 로그인. 실패하면 화면에 보여 줄 문구.
 * reload: 테스트 계정으로 들어가거나 테스트 계정에서 다른 계정으로 바뀌었으면 브라우저 저장소를 바꿔야 하므로 화면을 다시 불러와야 함
 */
export async function login(id: string, password: string): Promise<{ ok: true; reload: boolean } | { ok: false; error: string }> {
  try {
    const wasTest = isTestBrowser();
    const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, password }) });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { test?: boolean } | null;
      notifyAuth();
      return { ok: true, reload: !!body?.test || wasTest };
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: body?.error ?? "로그인하지 못했어요. 잠시 뒤 다시 해 주세요." };
  } catch {
    return { ok: false, error: "서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요." };
  }
}

export async function logout() {
  const wasTest = isTestBrowser();
  await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
  notifyAuth();
  if (wasTest) {
    // 테스트 계정에서 쓴 브라우저 저장 내용을 지우고, 진짜 저장소로 다시 불러옴
    sessionStorage.clear();
    window.location.reload();
  }
}
