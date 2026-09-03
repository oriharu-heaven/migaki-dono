/**
 * §10.3 音声再生の制約
 * - 自動再生制限のため、ユーザー操作(click)を起点に一度 speak() して解禁する
 * - iOS Safari では getVoices() が非同期に埋まるため voiceschanged を待つ
 * - ja-JP が存在しない端末では読み上げをスキップし、画面表示のみにする
 */

let unlocked = false;
let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  if (voicesReady) return voicesReady;

  voicesReady = new Promise((resolve) => {
    const immediate = speechSynthesis.getVoices();
    if (immediate.length > 0) {
      resolve(immediate);
      return;
    }
    // iOS Safari: 非同期に埋まる。イベントを必ず待つ
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener("voiceschanged", done);
    // 一部端末で voiceschanged が発火しないため、上限を切る
    setTimeout(done, 2000);
  });
  return voicesReady;
}

export async function japaneseVoices(): Promise<SpeechSynthesisVoice[]> {
  const all = await loadVoices();
  return all.filter((v) => v.lang.toLowerCase().startsWith("ja"));
}

/** 日本語音声が使えるか。画面OFFモードの可否判定に使う（§10.3） */
export async function canSpeakJapanese(): Promise<boolean> {
  if (!speechSupported()) return false;
  return (await japaneseVoices()).length > 0;
}

/**
 * 「はじめる」の click ハンドラ内から呼ぶ。以降の連続再生を解禁する。
 * 無音の発話を1回通すのが目的なので、内容は空白でよい。
 */
export function unlockSpeech(): void {
  if (!speechSupported() || unlocked) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
    unlocked = true;
  } catch {
    /* 解禁に失敗しても読み上げなしで進行できる */
  }
  void loadVoices();
}

export interface SpeakOptions {
  rate: number;
  voiceURI: string | null;
  signal?: AbortSignal;
}

/**
 * 読み上げ、完了時に resolve する。
 * 読み上げできない場合（未対応・ja音声なし）は即 resolve し、呼び出し側は
 * そのまま画面表示のみで進行する。
 */
export async function speak(text: string, opts: SpeakOptions): Promise<void> {
  if (!speechSupported()) return;
  const jaVoices = await japaneseVoices();
  if (jaVoices.length === 0) return;
  if (opts.signal?.aborted) return;

  const voice = jaVoices.find((v) => v.voiceURI === opts.voiceURI) ?? jaVoices[0];

  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang || "ja-JP";
    u.rate = opts.rate;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    function onAbort() {
      speechSynthesis.cancel();
      finish();
    }

    u.onend = finish;
    u.onerror = finish;
    opts.signal?.addEventListener("abort", onAbort);

    speechSynthesis.cancel();
    speechSynthesis.speak(u);

    // 一部端末で onend が来ない。文字数から概算した上限で打ち切る。
    // ここが長すぎると読み上げ後の入力受付が遅れて1問8秒の予算(§7.3)を壊すため、
    // 余裕は 1.5 秒に留める（日本語はおよそ毎秒6文字 × rate）。
    const estimateMs = (text.length / (opts.rate * 6)) * 1000 + 1500;
    setTimeout(finish, estimateMs);
  });
}

export function cancelSpeech(): void {
  if (speechSupported()) speechSynthesis.cancel();
}
