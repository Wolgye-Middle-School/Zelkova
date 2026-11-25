"use client";

import { useState } from "react";
import { DownloadIcon, Spinner } from "./icons";

/**
 * '등록된 학생 정보 불러오기' 버튼 (시간표 · 약속판 · 칭찬통장에서 함께 씀).
 * onImport 는 불러온 뒤 보여 줄 문구를 돌려주고, 로그인하지 않아 서버 학생 정보를 받지 못하면 null.
 * null 이면 특수학급 교사만 불러올 수 있다고 알려 줌
 */
export default function ImportStudentsButton({ onImport, className = "" }: { onImport: () => Promise<string | null>; className?: string }) {
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setImporting(true);
    setNote(null);
    const message = await onImport();
    setImporting(false);
    setNote(message ?? "학생 정보를 불러오지 못했어요. 특수학급 교사 계정만 볼 수 있어요.");
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      <button
        type="button"
        onClick={run}
        disabled={importing}
        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-70"
      >
        {importing ? <Spinner className="h-4 w-4" /> : <DownloadIcon className="h-4 w-4" />}
        등록된 학생 정보 불러오기
      </button>
      {note && (
        <span role="status" className="text-xs font-medium text-slate-600">
          {note}
        </span>
      )}
    </div>
  );
}
