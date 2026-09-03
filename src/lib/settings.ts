import type { Slot } from "../data/types";

export interface Settings {
  /** §S-5 テーマ・スロット切替の境界 */
  morningStartHour: number; // 既定 4
  nightStartHour: number; // 既定 14
  speechEnabled: boolean;
  speechRate: number; // SpeechSynthesisUtterance.rate
  voiceURI: string | null; // 端末の日本語音声から選択
  screenOffMode: boolean;
  timerEnabled: boolean;
  timerSeconds: number; // 既定 120
  deepDive: "on" | "nightOnly" | "off";
  inputMethod: "tap" | "external";
  /** §S-2 扇 or 縦ボタン。Phase 1.5 の比較用に両方残す */
  answerUI: "fan" | "buttons";
  /** §S-2 利き手。既定は右利き（要が画面下端のやや右） */
  handedness: "right" | "left";
  /** 最初の3セッションは自動表示。ONで常時表示に戻せる */
  alwaysShowLabels: boolean;
  /** §6.3 訂正率15%超で3段階に落とす判断のための切替スイッチ */
  scaleSteps: 5 | 3;
}

const DEFAULTS: Settings = {
  morningStartHour: 4,
  nightStartHour: 14,
  speechEnabled: true,
  speechRate: 0.9,
  voiceURI: null,
  screenOffMode: false,
  timerEnabled: true,
  timerSeconds: 120,
  deepDive: "nightOnly", // §7.3 発動条件(v0.1)：夜スロットのみ
  inputMethod: "tap",
  answerUI: "fan",
  handedness: "right",
  alwaysShowLabels: false,
  scaleSteps: 5,
};

const KEY = "migaki.settings.v1";

/**
 * 設定は起動レイテンシ要件(1秒以内)のため同期読み出しできる localStorage に置く。
 * 記録データ本体は §8 のとおり IndexedDB。
 */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* プライベートモード等。設定が保存できなくても動作は続ける */
  }
}

export function resetSettings(): Settings {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
  return { ...DEFAULTS };
}

/** 完了セッション数。ラベル表示の判定(最初の3セッション)に使う */
const SESSION_COUNT_KEY = "migaki.completedSessions.v1";
export function getCompletedCount(): number {
  const n = Number(localStorage.getItem(SESSION_COUNT_KEY) ?? "0");
  return Number.isFinite(n) ? n : 0;
}
export function bumpCompletedCount(): void {
  try {
    localStorage.setItem(SESSION_COUNT_KEY, String(getCompletedCount() + 1));
  } catch {
    /* noop */
  }
}

/** §S-1 現在時刻が04:00〜14:00なら朝スロット、それ以外は夜スロット */
export function currentSlot(s: Settings, now = new Date()): Slot {
  const h = now.getHours() + now.getMinutes() / 60;
  return h >= s.morningStartHour && h < s.nightStartHour ? "morning" : "night";
}

/** 日付キー "2026-09-04"。ローカル時刻基準 */
export function dateKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
