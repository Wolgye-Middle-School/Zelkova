import { checkCredentials, createSession, isTestSession, requestSession, SESSION_SECONDS, sessionCookie, sessionStillValid, testCookie } from "@/lib/auth";
import { limitAttempts, TooManyRequests } from "@/lib/rateLimit";

const NO_STORE = { "Cache-Control": "no-store" };

/** 지금 로그인되어 있는지, 어떤 계정인지 (계정이 지워졌거나 대기 상태가 되었으면 로그아웃) */
export async function GET(request: Request) {
  const session = requestSession(request);
  if (!session || !(await sessionStillValid(session))) return Response.json({ authed: false, admin: false, role: null }, { headers: NO_STORE });
  const test = isTestSession(session);
  // admin: 관리자 전용 관리 기능(사용자 관리 · 업무 안내 편집)을 쓸 수 있는지 — 테스트 계정은 아님
  return Response.json({ authed: true, admin: session.role === "admin" && !test, role: session.role, test }, { headers: NO_STORE });
}

/** 로그인: { id, password } 가 맞으면 세션 쿠키를 줌 (틀린 횟수 제한은 rateLimit.ts 의 limitAttempts) */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: unknown; password?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const password = typeof body?.password === "string" ? body.password : "";
  let succeeded: (() => Promise<void>) | undefined;
  try {
    succeeded = await limitAttempts(request, id);
  } catch (e) {
    if (e instanceof TooManyRequests) return Response.json({ error: e.message }, { status: 429, headers: NO_STORE });
    console.error(e); // 횟수 제한 저장소에 닿지 못해도 로그인은 막지 않음
  }
  const result = id && password ? await checkCredentials(id, password) : { ok: false as const, reason: "invalid" as const };
  if (!result.ok) {
    if (result.reason === "waiting") await succeeded?.(); // 비밀번호는 맞았음
    // 비밀번호를 빠르게 여러 번 맞혀 보지 못하도록 틀리면 잠깐 기다림
    await new Promise((r) => setTimeout(r, 800));
    const error = result.reason === "waiting" ? "아직 승인 대기 중인 계정이에요. 관리자에게 문의해 주세요." : "아이디 또는 비밀번호가 맞지 않아요.";
    return Response.json({ error }, { status: 401, headers: NO_STORE });
  }
  await succeeded?.();
  const test = isTestSession(result.session);
  const headers = new Headers(NO_STORE);
  headers.append("Set-Cookie", sessionCookie(createSession(result.session), SESSION_SECONDS));
  headers.append("Set-Cookie", testCookie(test));
  return Response.json({ authed: true, admin: result.session.role === "admin" && !test, role: result.session.role, test }, { headers });
}

/** 로그아웃 */
export async function DELETE() {
  const headers = new Headers(NO_STORE);
  headers.append("Set-Cookie", sessionCookie("", 0));
  headers.append("Set-Cookie", testCookie(false));
  return Response.json({ authed: false }, { headers });
}
