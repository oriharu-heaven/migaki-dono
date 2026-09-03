import { useEffect, useMemo } from "react";
import { Fan, type AnswerEvent } from "../components/Fan";
import { ButtonScale } from "../components/ButtonScale";
import { TimerRing } from "../components/TimerRing";
import { Tono } from "../components/Tono";
import type { CheckInSession, Slot } from "../data/types";
import { useCheckInSession } from "../lib/session";
import { getCompletedCount, type Settings } from "../lib/settings";
import "./CheckIn.css";

interface Props {
  settings: Settings;
  slot: Slot;
  onDone: (session: CheckInSession) => void;
  onAbort: () => void;
}

/** §S-2 チェックイン */
export function CheckIn({ settings, slot, onDone, onAbort }: Props) {
  const { state, start, answer, undo, abandon } = useCheckInSession(settings, slot);

  useEffect(() => {
    void start();
    // start は1回だけ。依存に入れると再入する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.session) onDone(state.session);
  }, [state.session, onDone]);

  /**
   * §S-2 最初の3セッションは扇面にラベルを表示し、以降は家紋のみに切り替える。
   * 設定で常時表示に戻せる。
   */
  const showLabels = useMemo(
    () => settings.alwaysShowLabels || getCompletedCount() < 3,
    [settings.alwaysShowLabels],
  );

  const speaking = state.phase === "speaking";
  const disabled = speaking || state.phase === "ended" || state.phase === "idle";

  const handleAnswer = (e: AnswerEvent) => {
    void answer(e.value, e.gesture, e.position);
  };

  const answerProps = {
    disabled,
    steps: settings.scaleSteps,
    blank: settings.screenOffMode,
    onAnswer: handleAnswer,
    keyboardEnabled: settings.inputMethod === "external",
  };

  return (
    <div className="screen checkin">
      {settings.timerEnabled && <TimerRing remaining={state.remainingRatio} />}

      <header className="checkin__top">
        {/* 「戻す」は画面左上に小さく置く。頻度の低い操作なので目立たせない */}
        <button
          type="button"
          className="text-button checkin__undo"
          disabled={!state.canUndo}
          onClick={undo}
        >
          戻す
        </button>
        {/* 殿は画面上部に小さく置く。発話中のみ口が動く */}
        <Tono state={speaking ? "speaking" : "idle"} slot={slot} size={64} />
        <button
          type="button"
          className="text-button checkin__quit"
          onClick={() => {
            void abandon();
            onAbort();
          }}
        >
          やめる
        </button>
      </header>

      <div className="checkin__question">
        {state.usedFallback && (
          <p className="muted checkin__notice">つながらぬ。用意した問いで続ける</p>
        )}
        {/* §S-5 画面OFFモード：質問文を画面に表示せず、音声のみで進行する */}
        {settings.screenOffMode ? (
          <p className="visually-hidden" aria-live="polite">{state.question?.text ?? ""}</p>
        ) : (
          <p className="question-text" aria-live="polite">{state.question?.text ?? ""}</p>
        )}
      </div>

      {settings.answerUI === "fan" ? (
        <Fan {...answerProps} handedness={settings.handedness} showLabels={showLabels} />
      ) : (
        <ButtonScale {...answerProps} />
      )}
    </div>
  );
}
