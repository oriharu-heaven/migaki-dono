/**
 * §9 チェックイン中は Screen Wake Lock API で消灯を抑止する。
 * 非対応時はフォールバックを置かず、消灯を許容する（仕様どおり）。
 */
let sentinel: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<void> {
  if (!("wakeLock" in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request("screen");
    // タブ復帰時に自動で取り直す
    document.addEventListener("visibilitychange", reacquire);
  } catch {
    /* 非対応・拒否。消灯を許容する */
  }
}

async function reacquire() {
  if (document.visibilityState === "visible" && sentinel?.released !== false) {
    try {
      sentinel = await navigator.wakeLock.request("screen");
    } catch {
      /* noop */
    }
  }
}

export async function releaseWakeLock(): Promise<void> {
  document.removeEventListener("visibilitychange", reacquire);
  try {
    await sentinel?.release();
  } catch {
    /* noop */
  }
  sentinel = null;
}
