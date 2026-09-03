import type { CheckInSession } from "../data/types";

/**
 * §8 データ消失リスクへの対策として、週1回のCSVエクスポートをユーザーに促す。
 * 1行 = 1回答。セッション属性は各行に展開する（表計算でそのまま集計できる形）。
 */
const HEADER = [
  "sessionId", "date", "slot", "startedAt", "completedAt", "endedBy",
  "brushDurationMs", "inputMethod", "screenOffMode", "inferredCategory",
  "generationLatencyMs", "usedFallback",
  "order", "questionId", "questionText", "category", "isGenerated", "layer",
  "inputGesture", "value", "latencyMs", "corrected",
  "posAngleDeg", "posRadiusRatio", "posSector",
];

const esc = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const iso = (ms: number | null) => (ms === null ? "" : new Date(ms).toISOString());

export function sessionsToCsv(sessions: CheckInSession[]): string {
  const rows: string[] = [HEADER.join(",")];
  for (const s of sessions) {
    if (s.answers.length === 0) {
      rows.push([
        s.id, s.date, s.slot, iso(s.startedAt), iso(s.completedAt), s.endedBy,
        s.brushDurationMs, s.inputMethod, s.screenOffMode, s.inferredCategory ?? "",
        s.generationLatencyMs ?? "", s.usedFallback,
        "", "", "", "", "", "", "", "", "", "", "", "", "",
      ].map(esc).join(","));
      continue;
    }
    for (const a of s.answers) {
      rows.push([
        s.id, s.date, s.slot, iso(s.startedAt), iso(s.completedAt), s.endedBy,
        s.brushDurationMs, s.inputMethod, s.screenOffMode, s.inferredCategory ?? "",
        s.generationLatencyMs ?? "", s.usedFallback,
        a.order, a.questionId, a.questionText, a.category, a.isGenerated, a.layer,
        a.inputGesture, a.value ?? "", Math.round(a.latencyMs), a.corrected,
        a.slotPosition ? a.slotPosition.angleDeg.toFixed(1) : "",
        a.slotPosition ? a.slotPosition.radiusRatio.toFixed(3) : "",
        a.slotPosition ? a.slotPosition.sector : "",
      ].map(esc).join(","));
    }
  }
  return rows.join("\n");
}

export function downloadCsv(sessions: CheckInSession[]): void {
  // Excel が UTF-8 と判別できるよう BOM を付ける
  const blob = new Blob(["﻿" + sessionsToCsv(sessions)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `migaki-dono-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
