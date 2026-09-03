import { useEffect, useState } from "react";
import "./InstallHint.css";

const DISMISSED_KEY = "migaki.installHintDismissed.v1";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * §2 ユーザーには「ホーム画面に追加してから使う」よう案内する。
 * §8 ホーム画面に追加していないと、Safariのストレージポリシーで
 * IndexedDB が破棄される場合がある。案内は必須。
 */
export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <aside className="install-hint">
      <p>
        ホーム画面に追加してから使うこと。
        追加しておらぬと、記録が消えることがある。
      </p>
      <button
        type="button"
        className="text-button"
        onClick={() => {
          try {
            localStorage.setItem(DISMISSED_KEY, "1");
          } catch {
            /* noop */
          }
          setShow(false);
        }}
      >
        承知した
      </button>
    </aside>
  );
}
