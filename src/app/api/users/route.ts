import { connection } from "next/server";
import { isRealAdmin } from "@/lib/auth";
import { createUser, deleteUser, isUserRole, isUserStatus, listUsers, updateUser } from "@/lib/userStore";

const NO_STORE = { "Cache-Control": "no-store" };
const unauthorized = () => Response.json({ error: "관리자만 할 수 있어요." }, { status: 401, headers: NO_STORE });
const bad = (error: string) => Response.json({ error }, { status: 400, headers: NO_STORE });
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** 계정 목록 (관리자 전용, 테스트 계정은 안 됨) */
export async function GET(request: Request) {
  await connection();
  if (!isRealAdmin(request)) return unauthorized();
  return Response.json({ users: await listUsers() }, { headers: NO_STORE });
}

/** 계정 만들기: { email, username, role, password, status? } */
export async function POST(request: Request) {
  if (!isRealAdmin(request)) return unauthorized();
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !isUserRole(b.role)) return bad("계정 종류를 골라 주세요.");
  const status = isUserStatus(b.status) ? b.status : "approved";
  const r = await createUser({ email: str(b.email), username: str(b.username), role: b.role, password: str(b.password), status });
  return r.ok ? Response.json({ user: r.user }, { headers: NO_STORE }) : bad(r.error);
}

/** 계정 고치기: { id, role?, status? } */
export async function PATCH(request: Request) {
  if (!isRealAdmin(request)) return unauthorized();
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !str(b.id)) return bad("계정을 찾을 수 없어요.");
  const user = await updateUser(str(b.id), {
    role: isUserRole(b.role) ? b.role : undefined,
    status: isUserStatus(b.status) ? b.status : undefined,
  });
  return user ? Response.json({ user }, { headers: NO_STORE }) : bad("계정을 찾을 수 없어요.");
}

/** 계정 지우기: { id } */
export async function DELETE(request: Request) {
  if (!isRealAdmin(request)) return unauthorized();
  const b = (await request.json().catch(() => null)) as { id?: unknown } | null;
  return (await deleteUser(str(b?.id))) ? Response.json({ ok: true }, { headers: NO_STORE }) : bad("계정을 찾을 수 없어요.");
}
