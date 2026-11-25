import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { findUser, getUser, passwordMatches, type UserRole } from "./userStore";

/**
 * 로그인 (서버 전용). 계정은 4가지:
 *  - admin: 관리자. 아이디 · 비밀번호는 admin · admin 으로 고정 (사용자 관리, 사회복무요원 업무 안내 편집, 모든 도구)
 *  - teacher: 특수학급 교사 (개별화교육계획 작성하기)
 *  - assistant: 특수학급 실무사 (특수교육실무사 활동일지)
 *  - worker: 사회복무요원 (사회복무요원 업무 안내)
 * teacher · assistant · worker 계정은 관리자가 사용자 관리 화면에서 만들고 userStore 에 저장 (비밀번호는 scrypt 해시).
 * 아이디 또는 사용자 이름 + 비밀번호로 로그인하고, 상태가 approved 인 계정만 들어올 수 있음.
 *
 * 테스트 계정(test · test): 관리자처럼 모든 도구를 쓸 수 있지만, 저장소가 진짜 데이터 대신 연습용 저장소(sandbox.ts)를 씀.
 * 계정 id 가 "test-" 로 시작하고, 로그인할 때마다 새 id(= 새 빈 연습용 저장소)를 받음.
 *
 * 세션 값: "만료시각:권한:계정id" 에 AUTH_SECRET 으로 서명. 학생 정보는 세션에 넣지 않음.
 */

export type Role = "admin" | UserRole;
export type Session = { role: Role; userId: string };

export const SESSION_COOKIE = "zelkova_session";
/** 한 번 로그인하면 12시간 동안 유지 */
export const SESSION_SECONDS = 12 * 60 * 60;

/** 테스트 계정인지 브라우저가 알 수 있게 함께 주는 쿠키 (값은 1). 브라우저 저장(localStorage)을 진짜 것과 나누는 데 씀 */
export const TEST_COOKIE = "zelkova_test";

/** 관리자 계정 (고정) */
const ADMIN_LOGIN = { id: "admin", password: "admin" };
/** 테스트 계정 (고정) */
const TEST_LOGIN = { id: "test", password: "test" };
const TEST_PREFIX = "test-";

/** 테스트 계정의 세션인지 (저장소가 연습용 저장소를 씀) */
export const isTestSession = (s: Session) => s.role === "admin" && s.userId.startsWith(TEST_PREFIX);

const secret = () => process.env.AUTH_SECRET ?? "zelkova-session-secret";

const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);
const digest = (s: string) => createHash("sha256").update(s.normalize("NFC")).digest();

export type LoginResult = { ok: true; session: Session } | { ok: false; reason: "invalid" | "waiting" };

/** 아이디 · 비밀번호가 맞는 계정 */
export async function checkCredentials(id: string, password: string): Promise<LoginResult> {
  const adminOk = same(digest(id.trim()), digest(ADMIN_LOGIN.id)) && same(digest(password), digest(ADMIN_LOGIN.password));
  if (adminOk) return { ok: true, session: { role: "admin", userId: "admin" } };
  const testOk = same(digest(id.trim()), digest(TEST_LOGIN.id)) && same(digest(password), digest(TEST_LOGIN.password));
  if (testOk) return { ok: true, session: { role: "admin", userId: `${TEST_PREFIX}${randomBytes(12).toString("hex")}` } };
  const user = await findUser(id);
  if (!passwordMatches(user, password) || !user) return { ok: false, reason: "invalid" };
  if (user.status !== "approved") return { ok: false, reason: "waiting" };
  return { ok: true, session: { role: user.role, userId: user.id } };
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** 만료 시각과 권한을 담고 서명한 세션 값 */
export function createSession({ role, userId }: Session) {
  const payload = `${Date.now() + SESSION_SECONDS * 1000}:${role}:${userId}`;
  return `${payload}.${sign(payload)}`;
}

const ROLES: Role[] = ["admin", "teacher", "assistant", "worker"];

/** 올바른 세션이면 그 권한과 계정 id, 아니면 null */
export function parseSession(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !same(Buffer.from(signature), Buffer.from(sign(payload)))) return null;
  const [exp, role, userId] = payload.split(":");
  if (!(Number(exp) > Date.now()) || !userId || !ROLES.includes(role as Role)) return null;
  return { role: role as Role, userId };
}

/** 요청의 로그인 세션 (로그인하지 않았으면 null) */
export function requestSession(request: Request): Session | null {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return parseSession(token ? decodeURIComponent(token) : undefined);
}

/** 요청의 로그인 권한 (로그인하지 않았으면 null) */
export const requestRole = (request: Request): Role | null => requestSession(request)?.role ?? null;

/** 요청한 사람의 권한이 roles 안에 있는지. 관리자는 언제나 통과 */
export const hasRole = (request: Request, ...roles: UserRole[]) => {
  const role = requestRole(request);
  return role === "admin" || (role !== null && (roles as Role[]).includes(role));
};

/** 관리자로 로그인했는지 (테스트 계정도 관리자 권한이지만, 관리자 전용 관리 기능은 isRealAdmin 으로 막음) */
export const isAdmin = (request: Request) => requestRole(request) === "admin";

/** 진짜 관리자인지 (테스트 계정 제외): 사용자 관리 · 업무 안내 편집 */
export const isRealAdmin = (request: Request) => {
  const s = requestSession(request);
  return !!s && s.role === "admin" && !isTestSession(s);
};

/** 세션의 계정이 아직 있고 승인 상태인지 (관리자는 항상 true). 계정을 지우거나 대기로 바꾸면 곧바로 로그아웃되게 함 */
export async function sessionStillValid(session: Session): Promise<boolean> {
  if (session.role === "admin") return true;
  const user = await getUser(session.userId);
  return !!user && user.status === "approved" && user.role === session.role;
}

const secure = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");
export const sessionCookie = (value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure()}`;
/** 테스트 계정 표시 쿠키 (브라우저 스크립트가 읽을 수 있게 HttpOnly 가 아님). on 이 false 면 지움 */
export const testCookie = (on: boolean) => `${TEST_COOKIE}=${on ? "1" : ""}; Path=/; SameSite=Lax; Max-Age=${on ? SESSION_SECONDS : 0}${secure()}`;
