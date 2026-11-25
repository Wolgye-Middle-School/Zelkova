import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { kv1 } from "./kv";
import { currentSandbox, saveSandbox } from "./sandbox";

/**
 * 계정 저장소 (서버 전용). 관리자가 사용자 관리 화면에서 만드는 계정들을 kv(Upstash Redis 또는 data/board.json)에 저장함.
 * 비밀번호는 원래 글자 대신 scrypt 해시로만 보관. 관리자 계정(admin)과 테스트 계정(test)은 저장소가 아니라 코드에 고정 (auth.ts).
 * 테스트 계정으로 로그인한 요청은 연습용 저장소의 계정 목록을 씀 (sandbox.ts).
 */

/** 사용자 계정의 종류: 특수학급 교사 · 특수교육실무사 · 사회복무요원 (관리자는 따로 고정) */
export type UserRole = "teacher" | "assistant" | "worker";
export const USER_ROLES: { id: UserRole; label: string }[] = [
  { id: "teacher", label: "특수학급 교사" },
  { id: "assistant", label: "특수학급 실무사" },
  { id: "worker", label: "사회복무요원" },
];
export const isUserRole = (v: unknown): v is UserRole => USER_ROLES.some((r) => r.id === v);

/** approved: 로그인 가능 · waiting: 승인 대기 */
export type UserStatus = "approved" | "waiting";
export const isUserStatus = (v: unknown): v is UserStatus => v === "approved" || v === "waiting";

export type StoredUser = {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  salt: string;
  hash: string;
  createdAt: number;
};
/** 화면에 보내는 계정 (비밀번호 해시 없음) */
export type PublicUser = Omit<StoredUser, "salt" | "hash">;

const KEY = "zelkova:users";
const MAX_USERS = 200;
const SCRYPT = { N: 16384, r: 8, p: 1 };

const hashPassword = (password: string, salt: string) => scryptSync(password.normalize("NFC"), salt, 32, SCRYPT).toString("base64url");
export const publicUser = (u: StoredUser): PublicUser => ({ id: u.id, email: u.email, username: u.username, role: u.role, status: u.status, createdAt: u.createdAt });

async function read(): Promise<StoredUser[]> {
  try {
    const sb = await currentSandbox();
    const list = JSON.parse((sb ? sb.blobs.users : ((await kv1("GET", KEY)) as string | null)) ?? "[]");
    return Array.isArray(list) ? (list as StoredUser[]) : [];
  } catch {
    return [];
  }
}
async function write(list: StoredUser[]) {
  const sb = await currentSandbox();
  if (!sb) return kv1("SET", KEY, JSON.stringify(list));
  sb.blobs.users = JSON.stringify(list);
  await saveSandbox(sb);
}

export const listUsers = async () => (await read()).map(publicUser);

const norm = (s: string) => s.trim().normalize("NFC").toLowerCase();

/** 이메일 또는 사용자 이름이 같은 계정 (로그인에 씀) */
export async function findUser(idText: string): Promise<StoredUser | null> {
  const want = norm(idText);
  if (!want) return null;
  return (await read()).find((u) => norm(u.email) === want || norm(u.username) === want) ?? null;
}

/** 비밀번호가 맞는지 (맞지 않아도 해시는 계산해 걸리는 시간이 비슷하게) */
export function passwordMatches(user: StoredUser | null, password: string): boolean {
  const salt = user?.salt ?? "x";
  const got = hashPassword(password, salt);
  return !!user && got.length === user.hash.length && timingSafeEqual(Buffer.from(got), Buffer.from(user.hash));
}

export type UserInput = { email: string; username: string; role: UserRole; password: string; status?: UserStatus };

export async function createUser(input: UserInput): Promise<{ ok: true; user: PublicUser } | { ok: false; error: string }> {
  const email = input.email.trim();
  const username = input.username.trim();
  if (!email || !username) return { ok: false, error: "이메일과 사용자 이름을 적어 주세요." };
  if (input.password.length < 4) return { ok: false, error: "비밀번호는 4글자 이상이어야 해요." };
  for (const fixed of ["admin", "test"]) {
    if (norm(email) === fixed || norm(username) === fixed) return { ok: false, error: `${fixed} 는 ${fixed === "admin" ? "관리자" : "테스트"} 계정이 쓰는 이름이에요.` };
  }
  const list = await read();
  if (list.length >= MAX_USERS) return { ok: false, error: "만들 수 있는 계정 수를 넘었어요." };
  if (list.some((u) => norm(u.email) === norm(email) || norm(u.username) === norm(username) || norm(u.email) === norm(username) || norm(u.username) === norm(email))) {
    return { ok: false, error: "이미 있는 이메일 또는 사용자 이름이에요." };
  }
  const salt = randomBytes(16).toString("base64url");
  const user: StoredUser = {
    id: randomUUID(),
    email: email.slice(0, 120),
    username: username.slice(0, 60),
    role: input.role,
    status: input.status ?? "approved",
    salt,
    hash: hashPassword(input.password, salt),
    createdAt: Date.now(),
  };
  await write([...list, user]);
  return { ok: true, user: publicUser(user) };
}

export async function updateUser(id: string, change: { role?: UserRole; status?: UserStatus }): Promise<PublicUser | null> {
  const list = await read();
  const i = list.findIndex((u) => u.id === id);
  if (i < 0) return null;
  const u = { ...list[i] };
  if (change.role) u.role = change.role;
  if (change.status) u.status = change.status;
  list[i] = u;
  await write(list);
  return publicUser(u);
}

/** 본인이 프로필에서 이름 · 비밀번호를 바꿈 (비밀번호 확인은 부르는 쪽에서) */
export async function updateProfile(id: string, change: { username?: string; password?: string }): Promise<{ ok: true; user: PublicUser } | { ok: false; error: string }> {
  const list = await read();
  const i = list.findIndex((u) => u.id === id);
  if (i < 0) return { ok: false, error: "계정을 찾을 수 없어요." };
  const u = { ...list[i] };
  if (change.username !== undefined) {
    const username = change.username.trim().slice(0, 60);
    if (!username) return { ok: false, error: "이름을 적어 주세요." };
    // 이름으로도 로그인하므로 고정 계정이나 다른 계정의 이름 · 이메일과 겹치면 안 됨
    if (["admin", "test"].includes(norm(username)) || list.some((o) => o.id !== id && (norm(o.username) === norm(username) || norm(o.email) === norm(username)))) {
      return { ok: false, error: "이미 쓰고 있는 이름이에요." };
    }
    u.username = username;
  }
  if (change.password !== undefined) {
    if (change.password.length < 4) return { ok: false, error: "새 비밀번호는 4글자 이상이어야 해요." };
    u.salt = randomBytes(16).toString("base64url");
    u.hash = hashPassword(change.password, u.salt);
  }
  list[i] = u;
  await write(list);
  return { ok: true, user: publicUser(u) };
}

export async function deleteUser(id: string): Promise<boolean> {
  const list = await read();
  const next = list.filter((u) => u.id !== id);
  if (next.length === list.length) return false;
  await write(next);
  return true;
}

export async function getUser(id: string): Promise<StoredUser | null> {
  return (await read()).find((u) => u.id === id) ?? null;
}
