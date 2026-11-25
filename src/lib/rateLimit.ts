import { createHash } from "node:crypto";
import { kv, kv1 } from "@/lib/kv";

/**
 * 마구 시도하면 안 되는 요청의 횟수 제한 (서버 전용). 첫 시도부터 정해진 시간(기본 5분)이 지나면 풀리고, 다시 눌러도 늘어나지 않음.
 * 로그인처럼 맞고 틀림이 있는 요청은 성공하면 그 시도를 횟수에서 빼서, 실패한 것만 남김.
 */

export class TooManyRequests extends Error {}

export const clientIp = (request: Request) =>
  (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "local").trim().slice(0, 64);

// IP 와 아이디는 해시로만 저장
const keyOf = (scope: string, who: string) => `zelkova:rl:${scope}:${createHash("sha256").update(who).digest("base64url").slice(0, 22)}`;

/** 한 번 세고, 제한을 넘었으면 TooManyRequests */
async function count(key: string, limit: number, seconds: number) {
  // NX: 만료 시각은 처음 셀 때만 정함
  const [n] = (await kv(["INCR", key], ["EXPIRE", key, seconds, "NX"])) as [number];
  if (Number(n) > limit) throw new TooManyRequests("너무 여러 번 시도했어요. 5분 뒤에 다시 해 주세요.");
}

/** IP 마다 횟수 제한 (성공 · 실패를 모두 셈) */
export const rateLimit = (request: Request, scope: string, limit = 10, seconds = 300) => count(keyOf(scope, clientIp(request)), limit, seconds);

/**
 * 비밀번호를 확인하기 전에 부름: 같은 IP + 아이디는 5분에 10번, IP 전체는 50번까지 틀릴 수 있음.
 * 같은 인터넷(학교)을 쓰는 다른 사람은 막히지 않게 아이디별로 셈. 돌려주는 함수는 비밀번호가 맞았을 때 부름
 */
export async function limitAttempts(request: Request, id: string): Promise<() => Promise<void>> {
  const ip = clientIp(request);
  const own = keyOf("password", `${ip}|${id.trim().normalize("NFC").toLowerCase()}`);
  const all = keyOf("password-ip", ip);
  await count(own, 10, 300);
  await count(all, 50, 300);
  return async () => {
    try {
      await kv(["DEL", own]);
      // 방금 센 것 하나만 뺌
      if (Number(await kv1("DECR", all)) <= 0) await kv1("DEL", all);
    } catch (e) {
      console.error(e);
    }
  };
}
