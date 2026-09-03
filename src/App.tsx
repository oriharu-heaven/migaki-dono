import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Home } from "./screens/Home";
import { CheckIn } from "./screens/CheckIn";
import { Complete } from "./screens/Complete";
import { Settings } from "./screens/Settings";

/**
 * §9 起動レイテンシ 1秒以内。サマリで使う Recharts は重いので、
 * 履歴を開いたときにだけ読み込む。ホームの初期表示には乗せない。
 */
const History = lazy(() => import("./screens/History").then((m) => ({ default: m.History })));
import type { CheckInSession, Slot } from "./data/types";
import { currentSlot, loadSettings, type Settings as S } from "./lib/settings";
import { applySlotTheme } from "./lib/theme";

type Screen = "home" | "checkin" | "complete" | "history" | "settings";

export default function App() {
  const [settings, setSettings] = useState<S>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>("home");
  const [slot, setSlot] = useState<Slot>(() => currentSlot(loadSettings()));
  const [finished, setFinished] = useState<CheckInSession | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  /** §4.2 テーマはスロットに応じて自動切替 */
  useEffect(() => {
    applySlotTheme(slot);
  }, [slot]);

  /** 日付やスロットの境界をまたいでもホームの表示が古びないようにする */
  useEffect(() => {
    if (screen !== "home") return;
    const id = window.setInterval(() => setSlot(currentSlot(settings)), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setSlot(currentSlot(settings));
        setRefreshKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [screen, settings]);

  const handleDone = useCallback((session: CheckInSession) => {
    setFinished(session);
    setRefreshKey((k) => k + 1);
    setScreen(session.endedBy === "abandoned" ? "home" : "complete");
  }, []);

  switch (screen) {
    case "checkin":
      return (
        <CheckIn
          settings={settings}
          slot={slot}
          onDone={handleDone}
          onAbort={() => setScreen("home")}
        />
      );
    case "complete":
      return finished ? (
        <Complete
          session={finished}
          onHistory={() => setScreen("history")}
          onHome={() => setScreen("home")}
        />
      ) : (
        <Home
          settings={settings} slot={slot} refreshKey={refreshKey}
          onStart={() => setScreen("checkin")}
          onHistory={() => setScreen("history")}
          onSettings={() => setScreen("settings")}
        />
      );
    case "history":
      return (
        <Suspense fallback={<div className="screen" />}>
          <History onBack={() => setScreen("home")} />
        </Suspense>
      );
    case "settings":
      return (
        <Settings
          settings={settings}
          onChange={(s) => {
            setSettings(s);
            setSlot(currentSlot(s));
          }}
          onBack={() => setScreen("home")}
        />
      );
    default:
      return (
        <Home
          settings={settings} slot={slot} refreshKey={refreshKey}
          onStart={() => setScreen("checkin")}
          onHistory={() => setScreen("history")}
          onSettings={() => setScreen("settings")}
        />
      );
  }
}
