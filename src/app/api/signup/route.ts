import { rateLimit, TooManyRequests } from "@/lib/rateLimit";
import { createUser, isUserRole } from "@/lib/userStore";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: NO_STORE });
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** 회원가입: { email, username, role, password }. 늘 승인 대기로 만들고, 관리자가 사용자 관리에서 승인해야 로그인할 수 있음 */
export async function POST(request: Request) {
  try {
    await rateLimit(request, "signup", 5);
  } catch (e) {
    if (e instanceof TooManyRequests) return fail(e.message, 429);
    console.error(e);
  }
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !isUserRole(b.role)) return fail("계정 종류를 골라 주세요.");
  const r = await createUser({ email: str(b.email), username: str(b.username), role: b.role, password: str(b.password), status: "waiting" });
  return r.ok ? Response.json({ ok: true }, { headers: NO_STORE }) : fail(r.error);
}
