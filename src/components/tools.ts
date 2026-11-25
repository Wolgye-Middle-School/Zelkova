import type { ComponentType, SVGProps } from "react";
import { isTestBrowser } from "./auth";
import { BookCheckIcon, CalendarIcon, ChatIcon, FileTextIcon, ClipboardCheckIcon, PencilIcon, TagIcon, UsersIcon, UtensilsIcon, WalletIcon } from "./icons";

/**
 * 메인 화면의 도구 목록. 새 도구는 TOOLS 에 한 줄 더하면 그 탭에 카드가 생김
 * (도구 화면을 여는 동작은 TimetableApp 의 openTool 에서 id 로 정함)
 */

/** 메인 화면 위쪽 탭: 누구를 위한 도구인지 */
export type ToolCategory = "general" | "admin";

/** locked: 로그인해야 열 수 있는 탭 */
export const CATEGORIES: { id: ToolCategory; label: string; locked: boolean }[] = [
  { id: "general", label: "일반 업무", locked: false },
  { id: "admin", label: "행정 업무", locked: true },
];

/** 계정 종류: 관리자 · 특수학급 교사 · 특수학급 실무사 · 사회복무요원 */
export type AccountRole = "admin" | "teacher" | "assistant" | "worker";
export const ROLE_LABEL: Record<AccountRole, string> = { admin: "관리자", teacher: "특수학급 교사", assistant: "특수학급 실무사", worker: "사회복무요원" };

export type ToolId = "users" | "timetable" | "promise" | "bankbook" | "nametag" | "meal" | "handwriting" | "students" | "dutylog" | "guide" | "guideedit" | "iep";

export type Tool = {
  id: ToolId;
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  category: ToolCategory;
  /** 아이콘 칸의 색 (Tailwind 클래스) */
  tone: string;
  /** 마우스를 가까이 댔을 때 카드에 번지는 빛의 색 (HSL 색상각) */
  hue: number;
  /** 탭 맨 위에 넓은 대표 카드로 보여 줌 */
  featured?: boolean;
  /** 열 때 로그인해야 함 (잠긴 탭의 도구는 따로 적지 않아도 로그인 필요) */
  login?: boolean;
  /** 이 계정들에게만 보임 (관리자는 noAdmin 이 아니면 모두 봄). 없으면 로그인한 모든 계정 */
  roles?: AccountRole[];
  /** 테스트 계정에게는 숨김 (관리자 권한으로 들어가도) */
  noTest?: boolean;
  /** 관리자에게는 숨김 (테스트 계정은 모든 도구를 써 보는 계정이라 보임) */
  noAdmin?: boolean;
};

export const TOOLS: Tool[] = [
  { id: "timetable", title: "특수학급 시간표 만들기", icon: CalendarIcon, category: "general", tone: "bg-white/15 text-white", hue: 245, featured: true },
  { id: "promise", title: "나와의 약속판 만들기", icon: ClipboardCheckIcon, category: "general", tone: "bg-pink-100 text-pink-600", hue: 330 },
  { id: "bankbook", title: "칭찬통장 만들기", icon: WalletIcon, category: "general", tone: "bg-amber-100 text-amber-600", hue: 38 },
  { id: "nametag", title: "이름표 만들기", icon: TagIcon, category: "general", tone: "bg-emerald-100 text-emerald-700", hue: 155 },
  { id: "meal", title: "급식표 조회하기", icon: UtensilsIcon, category: "general", tone: "bg-sky-100 text-sky-700", hue: 200 },
  { id: "handwriting", title: "긍정 · 감성 필사 교실", icon: PencilIcon, category: "general", tone: "bg-rose-100 text-rose-600", hue: 350 },
  { id: "students", title: "학생 정보 관리하기", icon: UsersIcon, category: "general", tone: "bg-violet-100 text-violet-700", hue: 262, login: true, roles: ["teacher", "assistant"] },
  { id: "dutylog", title: "특수교육실무사 활동일지", icon: BookCheckIcon, category: "admin", tone: "bg-teal-100 text-teal-700", hue: 175, roles: ["assistant"], noAdmin: true },
  { id: "iep", title: "개별화교육계획 작성하기", icon: FileTextIcon, category: "admin", tone: "bg-indigo-100 text-indigo-700", hue: 235, roles: ["teacher"], noAdmin: true },
  { id: "guide", title: "사회복무요원 업무 안내", icon: ChatIcon, category: "admin", tone: "bg-sky-100 text-sky-700", hue: 210, roles: ["worker"], noAdmin: true },
  { id: "guideedit", title: "사회복무요원 업무 지시", icon: ChatIcon, category: "admin", tone: "bg-sky-100 text-sky-700", hue: 210, roles: [], noTest: true },
  { id: "users", title: "사용자 관리", icon: UsersIcon, category: "admin", tone: "bg-amber-100 text-amber-700", hue: 40, roles: [], noTest: true },
];

/** 이 계정에게 보이는 도구인지 (로그인하지 않았으면 role 이 null: 로그인이 필요 없는 도구만) */
export const visibleTo = (t: Tool, role: AccountRole | null) => {
  if (t.noTest && isTestBrowser()) return false;
  if (role === "admin") return !t.noAdmin || isTestBrowser();
  if (!role) return !needsLogin(t);
  return !t.roles || t.roles.includes(role);
};

/** 로그인해야 쓸 수 있는 도구인지 (카드에 자물쇠 표시) */
export const needsLogin = (t: Tool) => !!t.login || !!CATEGORIES.find((c) => c.id === t.category)?.locked;
