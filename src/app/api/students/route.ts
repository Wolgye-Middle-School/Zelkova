import { connection } from "next/server";
import { isTestSession, requestSession } from "@/lib/auth";
import { readStudents, writeStudents } from "@/lib/studentStore";

const NO_STORE = { "Cache-Control": "no-store" };
/** 학생 정보는 특수학급 교사만 보고 고칠 수 있음 (테스트 계정은 연습용 저장소를 씀) */
const allowed = (request: Request) => {
  const s = requestSession(request);
  return !!s && (s.role === "teacher" || isTestSession(s));
};
const unauthorized = () => Response.json({ error: "특수학급 교사 계정으로 로그인해야 해요." }, { status: 401, headers: NO_STORE });

export async function GET(request: Request) {
  await connection();
  if (!allowed(request)) return unauthorized();
  return Response.json({ students: await readStudents() }, { headers: NO_STORE });
}

export async function PUT(request: Request) {
  if (!allowed(request)) return unauthorized();
  const body = (await request.json().catch(() => null)) as { students?: unknown } | null;
  if (!body || !Array.isArray(body.students)) {
    return Response.json({ error: "students 목록이 필요해요." }, { status: 400 });
  }
  try {
    return Response.json({ students: await writeStudents(body.students) }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "학생 정보를 서버에 저장하지 못했어요." }, { status: 500 });
  }
}
