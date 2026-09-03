import { useEffect, useState } from "react";
import { Tono } from "../components/Tono";
import { InstallHint } from "../components/InstallHint";
import { isSlotDone } from "../data/db";
import type { Slot } from "../data/types";
import { dateKey, type Settings } from "../lib/settings";
import "./Home.css";

interface Props {
  settings: Settings;
  slot: Slot;
  onStart: () => void;
  onHistory: () => void;
  onSettings: () => void;
  /** チェックイン完了直後に再判定させるためのキー */
  refreshKey: number;
}

/** §S-1 ホーム */
export function Home({ settings, slot, onStart, onHistory, onSettings, refreshKey }: Props) {
  const [done, setDone] = useState<Record<Slot, boolean>>({ morning: false, night: false });
  const today = dateKey();

  useEffect(() => {
    let alive = true;
    void Promise.all([isSlotDone(today, "morning"), isSlotDone(today, "night")]).then(([m, n]) => {
      if (alive) setDone({ morning: m, night: n });
    });
    return () => {
      alive = false;
    };
  }, [today, refreshKey]);

  const currentDone = done[slot];

  return (
    <div className="screen home">
      <div className="home__figure">
        <Tono state="idle" slot={slot} size={180} />
      </div>

      <p className="dono-line home__line">
        {currentDone ? "本日は聞き届けた" : "本日はまだであるな"}
      </p>

      <div className="home__slots">
        {(["morning", "night"] as Slot[]).map((s) => (
          <div key={s} className={`home__slot ${s === slot ? "is-current" : ""}`}>
            <span className="answer-label">{s === "morning" ? "朝" : "夜"}</span>
            <span
              className={`home__dot ${done[s] ? "is-done" : ""}`}
              role="img"
              aria-label={done[s] ? "完了" : "未完了"}
            />
          </div>
        ))}
      </div>

      <div className="home__action">
        <button type="button" className="primary-button" onClick={onStart}>
          {currentDone ? "もう一度答える" : "はじめる"}
        </button>
        {settings.timerEnabled && (
          <p className="muted home__hint">
            歯磨き{Math.round(settings.timerSeconds / 60 * 10) / 10}分ぶん
          </p>
        )}
      </div>

      <nav className="home__nav">
        <button type="button" className="text-button" onClick={onHistory}>履歴</button>
        <button type="button" className="text-button" onClick={onSettings}>設定</button>
      </nav>

      <InstallHint />
    </div>
  );
}
