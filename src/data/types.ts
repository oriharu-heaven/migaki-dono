export type Category = "sleep" | "body" | "mood" | "work" | "social" | "load" | "unknown";

export const CATEGORIES: Category[] = ["sleep", "body", "mood", "work", "social", "load"];

export const CATEGORY_LABEL: Record<Category, string> = {
  sleep: "睡眠",
  body: "体調",
  mood: "気分",
  work: "仕事",
  social: "人づきあい",
  load: "負荷",
  unknown: "不明",
};

export type Slot = "morning" | "night";
export type AnswerValue = -2 | -1 | 0 | 1 | 2;

/** §6.2 誤タップ傾向の分析用。画面上のどこを押したかを残す。 */
export interface SlotPosition {
  /** 要から見た角度（度）。負=左 正=右 */
  angleDeg: number;
  /** 要からの距離 / 扇の外半径 */
  radiusRatio: number;
  /** 押下された扇面のインデックス（左端0〜右端4）。ボタンUIでも同義で入る */
  sector: number;
  /** ビューポート上の押下座標 */
  x: number;
  y: number;
}

export interface AnswerRecord {
  questionId: string;
  questionText: string; // 生成質問は文面が毎回違うため保存必須
  category: Category;
  isGenerated: boolean;
  layer: 0 | 1 | 2; // 0=固定 1=第1層 2=第2層
  /** timeout = 20秒無操作で無回答として送られたもの */
  inputGesture: "tap" | "swipe" | "key" | "timeout";
  value: AnswerValue | null; // null は無回答
  latencyMs: number; // 読み上げ完了から押下まで
  corrected: boolean;
  order: number;
  slotPosition: SlotPosition | null;
}

export interface CheckInSession {
  id: string; // uuid
  date: string; // "2026-09-04" 日付キー
  slot: Slot;
  startedAt: number; // epoch ms
  completedAt: number | null;
  inputMethod: "tap" | "external";
  screenOffMode: boolean;
  inferredCategory: Category | null;
  generationLatencyMs: number | null;
  usedFallback: boolean;
  endedBy: "timer" | "maxQuestions" | "abandoned";
  brushDurationMs: number; // 実際の歯磨き時間。個人差の把握に使う
  answers: AnswerRecord[];
}

export interface Question {
  id: string;
  text: string;
  category: Category;
}

export interface GeneratedQuestion extends Question {
  layer: 1 | 2;
}
