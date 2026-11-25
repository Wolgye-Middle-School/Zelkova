import { connection } from "next/server";
import { isTestSession, requestSession, sessionStillValid, type Session } from "@/lib/auth";
import { limitAttempts, TooManyRequests } from "@/lib/rateLimit";
import { getUser, passwordMatches, publicUser, updateProfile } from "@/lib/userStore";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: NO_STORE });

/** 관리자 · 테스트 계정은 코드에 고정된 계정이라 이름 · 비밀번호를 바꿀 수 없음 */
async function profileOf(session: Session) {
  if (session.role === "admin") {
    const test = isTestSession(session);
    return { username: test ? "테스트" : "관리자", email: test ? "test" : "admin", role: session.role, fixed: true };
  }
  const user = await getUser(session.userId);
  if (!user) return null;
  const { username, email, role } = publicUser(user);
  return { username, email, role, fixed: false };
}

/** 내 프로필 (로그인하지 않았으면 profile: null) */
export async function GET(request: Request) {
  await connection();
  const session = requestSession(request);
  const profile = session && (await sessionStillValid(session)) ? await profileOf(session) : null;
  return Response.json({ profile }, { headers: NO_STORE });
}

/** 내 이름 · 비밀번호 바꾸기: { username } 또는 { currentPassword, newPassword } */
export async function PATCH(request: Request) {
  const session = requestSession(request);
  if (!session || !(await sessionStillValid(session))) return fail("로그인이 필요해요.", 401);
  if (session.role === "admin") return fail("관리자 · 테스트 계정은 고정된 계정이라 바꿀 수 없어요.", 403);
  const body = (await request.json().catch(() => null)) as { username?: unknown; currentPassword?: unknown; newPassword?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username : undefined;
  const password = typeof body?.newPassword === "string" ? body.newPassword : undefined;
  if (username === undefined && password === undefined) return fail("바꿀 내용이 없어요.");
  if (password !== undefined) {
    let succeeded: (() => Promise<void>) | undefined;
    try {
      succeeded = await limitAttempts(request, session.userId);
    } catch (e) {
      if (e instanceof TooManyRequests) return fail(e.message, 429);
      console.error(e);
    }
    const current = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    if (!passwordMatches(await getUser(session.userId), current)) return fail("지금 비밀번호가 맞지 않아요.");
    await succeeded?.();
  }
  const result = await updateProfile(session.userId, { username, password });
  if (!result.ok) return fail(result.error);
  return Response.json({ profile: await profileOf(session) }, { headers: NO_STORE });
}
