import { cookies } from "next/headers";
import { isTestSession, parseSession, SESSION_COOKIE, SESSION_SECONDS } from "./auth";
import type { FileData as IepData } from "./iepStore";

/**
 * 테스트 계정(test · test)이 쓰는 연습용 저장소 (서버 전용).
 * 테스트 계정으로 로그인한 요청은 모든 저장소(학생 · 개별화교육계획 · 활동일지 · 업무 안내 · 사용자 · 칭찬통장 배경)가
 * 진짜 데이터 대신 이 연습용 저장소를 읽고 씀. 그래서 처음에는 비어 있고, 무엇을 고쳐도 진짜 데이터는 바뀌지 않음.
 * 로그인할 때마다 새 연습용 저장소가 생기고, 로그인 시간(12시간)이 지나면 사라짐.
 * Redis 가 있으면 서버가 여러 대여도 같은 내용을 보도록 zelkova:sandbox:<id> 에 잠깐(만료 시간을 걸고) 넣어 두고,
 * 없으면 서버 메모리에만 둠 (디스크에는 쓰지 않음).
 */

export type Sandbox = {
  id: string;
  /** 저장소 이름 → JSON 글자 (students · guide · dutylog · users) */
  blobs: Record<string, string>;
  /** 개별화교육계획 문서 (iepStore 의 파일 저장과 같은 모양) */
  iep: IepData;
};

/** 칭찬통장 배경 사진 (크기가 커서 Redis 에 넣지 않고 서버 메모리에만 둠) */
export type SandboxImageSet = { id: string; label: string; paper: string; createdAt: number; front: string; back: string };

const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const redisKey = (id: string) => `zelkova:sandbox:${id}`;
/** 연습용 저장소 하나의 최대 크기 */
const MAX_CHARS = 4 * 1024 * 1024;

type Entry = { sb: Sandbox; images: SandboxImageSet[]; at: number };
const memory: Map<string, Entry> = ((globalThis as { __zelkovaSandbox?: Map<string, Entry> }).__zelkovaSandbox ??= new Map());

async function redis(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command.map(String)),
    cache: "no-store",
  });
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `Redis ${res.status}`);
  return data.result;
}

const empty = (id: string): Sandbox => ({ id, blobs: {}, iep: { index: {}, docs: {} } });

/** 오래된 연습용 저장소를 메모리에서 지움 */
function prune(now: number) {
  for (const [id, e] of memory) if (e.at < now - SESSION_SECONDS * 1000) memory.delete(id);
}

function entry(id: string): Entry {
  const now = Date.now();
  prune(now);
  let e = memory.get(id);
  if (!e) memory.set(id, (e = { sb: empty(id), images: [], at: now }));
  e.at = now;
  return e;
}

/** 지금 요청이 테스트 계정이면 그 계정의 연습용 저장소 id, 아니면 null */
async function sandboxId(): Promise<string | null> {
  let token: string | undefined;
  try {
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    return null; // 요청 밖(스크립트 등)에서 부른 경우
  }
  if (!token) return null;
  let decoded = token;
  try {
    decoded = decodeURIComponent(token);
  } catch {
    // 이미 풀린 값
  }
  const session = parseSession(decoded);
  return session && isTestSession(session) ? session.userId : null;
}

/** 지금 요청이 테스트 계정이면 연습용 저장소, 아니면 null (진짜 저장소를 씀) */
export async function currentSandbox(): Promise<Sandbox | null> {
  const id = await sandboxId();
  if (!id) return null;
  const e = entry(id);
  if (REDIS_URL && REDIS_TOKEN) {
    const raw = await redis(["GET", redisKey(id)]);
    if (typeof raw === "string") {
      try {
        const sb = JSON.parse(raw) as Sandbox;
        e.sb = { id, blobs: sb.blobs ?? {}, iep: { index: sb.iep?.index ?? {}, docs: sb.iep?.docs ?? {} } };
      } catch {
        // 깨졌으면 메모리의 것을 씀
      }
    }
  }
  return e.sb;
}

/** 연습용 저장소에 바꾼 내용을 남김 (로그인 시간이 지나면 사라짐) */
export async function saveSandbox(sb: Sandbox) {
  const body = JSON.stringify(sb);
  if (body.length > MAX_CHARS) throw new Error("테스트 계정에 저장할 수 있는 양을 넘었어요.");
  entry(sb.id).sb = sb;
  if (REDIS_URL && REDIS_TOKEN) await redis(["SET", redisKey(sb.id), body, "EX", SESSION_SECONDS]);
}

/** 테스트 계정의 칭찬통장 배경 목록 (테스트 계정이 아니면 null). 배열을 고치면 그대로 남음 */
export async function sandboxImages(): Promise<SandboxImageSet[] | null> {
  const id = await sandboxId();
  return id ? entry(id).images : null;
}
