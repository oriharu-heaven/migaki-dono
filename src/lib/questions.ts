import type { AnswerRecord, Category, Question, Slot } from "../data/types";
import { CATEGORIES } from "../data/types";

interface FixedQuestionFile {
  morning: Question[];
  night: Question[];
}
interface FallbackFile {
  pool: Question[];
}

let fixedCache: FixedQuestionFile | null = null;
let fallbackCache: Question[] | null = null;

/** §7.1/7.2 固定質問はJSONで外出しし、コードに直書きしない */
export async function loadFixedQuestions(slot: Slot): Promise<Question[]> {
  if (!fixedCache) {
    const res = await fetch("/data/fixed-questions.json", { cache: "no-cache" });
    fixedCache = (await res.json()) as FixedQuestionFile;
  }
  return fixedCache[slot];
}

/** §7.6 用意済みの固定深掘り質問プール */
export async function loadFallbackPool(): Promise<Question[]> {
  if (!fallbackCache) {
    const res = await fetch("/data/fallback-questions.json", { cache: "no-cache" });
    fallbackCache = ((await res.json()) as FallbackFile).pool;
  }
  return fallbackCache;
}

export function pickFallbackQuestions(pool: Question[], n: number, exclude: Set<string>): Question[] {
  const usable = pool.filter((q) => !exclude.has(q.text));
  const source = usable.length >= n ? usable : pool;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/**
 * §7.4 セッション終了時、回答値の絶対値が最大だったカテゴリを提示する。
 * LLMには推論させない。絶対値の最大が1以下の場合は提示しない。
 */
export function inferCategory(answers: AnswerRecord[]): Category | null {
  let best: { category: Category; abs: number } | null = null;
  for (const a of answers) {
    if (a.value === null || a.category === "unknown") continue;
    const abs = Math.abs(a.value);
    if (!best || abs > best.abs) best = { category: a.category, abs };
  }
  if (!best || best.abs <= 1) return null;
  return best.category;
}

/**
 * §7.3 第2層は、第1層で絶対値2の回答が出たカテゴリを対象にする。
 * 複数あれば絶対値が大きい順、同値なら回答が速かった順（確信度が高いとみなす）。
 * 該当がなければ第2層は生成せず unknown として終了する。
 */
export function pickLayer2Targets(layer1: AnswerRecord[]): Category[] {
  const hits = layer1.filter((a) => a.value !== null && Math.abs(a.value) === 2);
  hits.sort((a, b) => {
    const d = Math.abs(b.value!) - Math.abs(a.value!);
    if (d !== 0) return d;
    return a.latencyMs - b.latencyMs;
  });
  const seen = new Set<Category>();
  const out: Category[] = [];
  for (const h of hits) {
    if (h.category === "unknown" || seen.has(h.category)) continue;
    seen.add(h.category);
    out.push(h.category);
  }
  return out;
}

/**
 * §7.3 深掘りの安全上の上限
 * - ネガティブ方向の深掘りは1カテゴリ最大2問で打ち切る
 * - 対象が mood 単独の場合は全体を2問に制限する
 */
export function capLayer2(questions: Question[], targets: Category[]): Question[] {
  const moodOnly = targets.length === 1 && targets[0] === "mood";
  const perCategory = new Map<Category, number>();
  const out: Question[] = [];
  for (const q of questions) {
    const n = perCategory.get(q.category) ?? 0;
    if (n >= 2) continue; // 1カテゴリ最大2問
    perCategory.set(q.category, n + 1);
    out.push(q);
    if (moodOnly && out.length >= 2) break;
  }
  return moodOnly ? out.slice(0, 2) : out;
}

/**
 * §7.7 生成された質問文はクライアント側でも検証する。
 * 禁止語（診断名、自傷に関する語）を含む場合はフォールバックに切り替える。
 */
const FORBIDDEN = [
  "うつ", "鬱", "抑うつ", "診断", "障害", "症候群", "疾患", "病気", "発達障害",
  "統合失調", "双極", "不安障害", "パニック", "依存症", "服薬", "薬を", "通院", "病院",
  "死に", "死のう", "死んで", "自殺", "自傷", "消えたい", "いなくなりたい", "リストカット",
];

export function isQuestionSafe(text: string): boolean {
  if (!text || text.length > 30) return false;
  if (text.includes("？") || text.includes("?")) return false; // 命題形式の平叙文
  return !FORBIDDEN.some((w) => text.includes(w));
}

export function sanitizeGenerated(questions: unknown): Question[] | null {
  if (!Array.isArray(questions)) return null;
  const out: Question[] = [];
  for (const raw of questions) {
    if (typeof raw !== "object" || raw === null) return null;
    const q = raw as Record<string, unknown>;
    const text = typeof q.text === "string" ? q.text.trim() : "";
    const category = q.category as Category;
    const id = typeof q.id === "string" ? q.id : `g${out.length + 1}`;
    if (!isQuestionSafe(text)) return null;
    if (!CATEGORIES.includes(category)) return null;
    out.push({ id, text, category });
  }
  return out.length > 0 ? out : null;
}
