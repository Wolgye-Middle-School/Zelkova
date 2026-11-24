import { checkCredentials, createSession, isTestSession, requestSession, SESSION_SECONDS, sessionCookie, sessionStillValid, testCookie } from "@/lib/auth";
import { rateLimit, TooManyRequests } from "@/lib/rateLimit";

const NO_STORE = { "Cache-Control": "no-store" };

/** 지금 로그인되어 있는지, 어떤 계정인지 (계정이 지워졌거나 대기 상태가 되었으면 로그아웃) */
export async function GET(request: Request) {
  const session = requestSession(request);
  if (!session || !(await sessionStillValid(session))) return Response.json({ authed: false, admin: false, role: null }, { headers: NO_STORE });
  return Response.json({ authed: true, admin: session.role === "admin", role: session.role, test: isTestSession(session) }, { headers: NO_STORE });
}

/** 로그인: { id, password } 가 맞으면 세션 쿠키를 줌 (IP 당 5분에 10번까지) */
export async function POST(request: Request) {
  try {
    await rateLimit(request, "login");
  } catch (e) {
    if (e instanceof TooManyRequests) return Response.json({ error: e.message }, { status: 429, headers: NO_STORE });
    console.error(e); // 횟수 제한 저장소에 닿지 못해도 로그인은 막지 않음
  }
  const body = (await request.json().catch(() => null)) as { id?: unknown; password?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const result = id && password ? await checkCredentials(id, password) : { ok: false as const, reason: "invalid" as const };
  if (!result.ok) {
    // 비밀번호를 빠르게 여러 번 맞혀 보지 못하도록 틀리면 잠깐 기다림
    await new Promise((r) => setTimeout(r, 800));
    const error = result.reason === "waiting" ? "아직 승인 대기 중인 계정이에요. 관리자에게 문의해 주세요." : "아이디 또는 비밀번호가 맞지 않아요.";
    return Response.json({ error }, { status: 401, headers: NO_STORE });
  }
  const test = isTestSession(result.session);
  const headers = new Headers(NO_STORE);
  headers.append("Set-Cookie", sessionCookie(createSession(result.session), SESSION_SECONDS));
  headers.append("Set-Cookie", testCookie(test));
  return Response.json({ authed: true, admin: result.session.role === "admin", role: result.session.role, test }, { headers });
}

/** 로그아웃 */
export async function DELETE() {
  const headers = new Headers(NO_STORE);
  headers.append("Set-Cookie", sessionCookie("", 0));
  headers.append("Set-Cookie", testCookie(false));
  return Response.json({ authed: false }, { headers });
}
