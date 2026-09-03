import type { AnswerRecord, Category, Question } from "../data/types";
import { loadFallbackPool, pickFallbackQuestions, sanitizeGenerated } from "./questions";

export interface GenerateRequest {
  layer: 1 | 2;
  n: number;
  todayAnswers: { text: string; value: number | null; category: Category }[];
  weeklyAverage: Record<string, number>;
  recentQuestions: string[];
  targetCategories?: Category[];
  layer1Questions?: string[];
}

export interface GenerateResult {
  questions: Question[];
  usedFallback: boolean;
  latencyMs: number;
}

/** §7.6 API呼び出しが3秒以内に完了しない、または失敗した場合はフォールバック */
const TIMEOUT_MS = 3000;

export async function generateQuestions(req: GenerateRequest): Promise<GenerateResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`generate failed: ${res.status}`);
    const data = (await res.json()) as { questions?: unknown };
    // §7.7 クライアント側でも検証。禁止語を含めばフォールバックに切り替える
    const questions = sanitizeGenerated(data.questions);
    if (!questions) throw new Error("generated questions rejected by client validation");
    return { questions: questions.slice(0, req.n), usedFallback: false, latencyMs: performance.now() - started };
  } catch {
    const pool = await loadFallbackPool();
    // フォールバックは2問（§7.6）
    const questions = pickFallbackQuestions(pool, Math.min(2, req.n), new Set(req.recentQuestions));
    return { questions, usedFallback: true, latencyMs: performance.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/** 生成の入力コンテキスト（§7.3 入力コンテキスト） */
export function buildTodayAnswers(answers: AnswerRecord[]): GenerateRequest["todayAnswers"] {
  return answers.map((a) => ({ text: a.questionText, value: a.value, category: a.category }));
}

export function buildWeeklyAverage(fixedAnswers: AnswerRecord[]): Record<string, number> {
  const sums = new Map<string, { total: number; n: number }>();
  for (const a of fixedAnswers) {
    if (a.value === null) continue;
    const cur = sums.get(a.category) ?? { total: 0, n: 0 };
    cur.total += a.value;
    cur.n += 1;
    sums.set(a.category, cur);
  }
  const out: Record<string, number> = {};
  for (const [k, v] of sums) out[k] = Number((v.total / v.n).toFixed(2));
  return out;
}
