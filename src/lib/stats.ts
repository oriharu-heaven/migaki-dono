import type { AnswerRecord, Category, CheckInSession, Slot } from "../data/types";
import { dateKey } from "./settings";

/** §S-4 スコア = 固定パートの回答値の合計（-6〜+6） */
export function fixedScore(session: CheckInSession): number | null {
  const fixed = session.answers.filter((a) => a.layer === 0 && a.value !== null);
  if (fixed.length === 0) return null;
  return fixed.reduce((sum, a) => sum + (a.value ?? 0), 0);
}

export interface DayPoint {
  date: string;
  label: string;
  morning: number | null;
  night: number | null;
}

/** 直近 days 日の朝夜スコア。折れ線用に古い順で返す */
export function dailyScores(sessions: CheckInSession[], days = 7): DayPoint[] {
  const bySlot = new Map<string, number>();
  for (const s of sessions) {
    const score = fixedScore(s);
    if (score === null) continue;
    bySlot.set(`${s.date}|${s.slot}`, score);
  }
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    out.push({
      date: key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      morning: bySlot.get(`${key}|morning`) ?? null,
      night: bySlot.get(`${key}|night`) ?? null,
    });
  }
  return out;
}

/** §S-4 カテゴリ別の出現割合 */
export function categoryShare(sessions: CheckInSession[]): { category: Category; count: number; ratio: number }[] {
  const counts = new Map<Category, number>();
  let total = 0;
  for (const s of sessions) {
    for (const a of s.answers) {
      if (a.value === null || a.category === "unknown") continue;
      counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
      total++;
    }
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count, ratio: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}

/**
 * §7.7 固定パートの mood スコアが7日連続で -1 以下の場合、
 * S-4の下部に相談窓口の案内を静かに表示する。
 */
export function shouldShowSupportNotice(sessions: CheckInSession[]): boolean {
  const byDate = new Map<string, number[]>();
  for (const s of sessions) {
    for (const a of s.answers) {
      if (a.layer !== 0 || a.category !== "mood" || a.value === null) continue;
      const arr = byDate.get(s.date) ?? [];
      arr.push(a.value);
      byDate.set(s.date, arr);
    }
  }
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const values = byDate.get(dateKey(d));
    if (!values || values.length === 0) return false; // 記録が欠けている日があれば「7日連続」ではない
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    if (avg > -1) return false;
  }
  return true;
}

/** §12 検証指標。設定画面の下部に出し、テスト中に自分で確認できるようにする */
export interface Metrics {
  sessions: number;
  completionRate: Record<Slot, number>;
  avgLatencyMs: number;
  correctionRate: number;
  noAnswerRate: number;
  swipeRate: number;
  avgQuestionsPerSession: number;
  avgBrushDurationMs: number;
}

export function computeMetrics(sessions: CheckInSession[]): Metrics {
  const all: AnswerRecord[] = sessions.flatMap((s) => s.answers);
  const answered = all.filter((a) => a.value !== null);
  const completed = sessions.filter((s) => s.completedAt !== null);

  const slotRate = (slot: Slot) => {
    const total = sessions.filter((s) => s.slot === slot).length;
    if (total === 0) return 0;
    return completed.filter((s) => s.slot === slot).length / total;
  };

  return {
    sessions: sessions.length,
    completionRate: { morning: slotRate("morning"), night: slotRate("night") },
    avgLatencyMs: answered.length ? answered.reduce((s, a) => s + a.latencyMs, 0) / answered.length : 0,
    correctionRate: all.length ? all.filter((a) => a.corrected).length / all.length : 0,
    noAnswerRate: all.length ? all.filter((a) => a.value === null).length / all.length : 0,
    swipeRate: answered.length ? answered.filter((a) => a.inputGesture === "swipe").length / answered.length : 0,
    avgQuestionsPerSession: sessions.length ? all.length / sessions.length : 0,
    avgBrushDurationMs: completed.length
      ? completed.reduce((s, x) => s + x.brushDurationMs, 0) / completed.length
      : 0,
  };
}
