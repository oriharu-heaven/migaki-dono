import type { AnswerValue, SlotPosition } from "../data/types";
import type { AnswerEvent } from "./Fan";
import { useEffect, useRef, useState } from "react";
import "./ButtonScale.css";

interface Props {
  disabled: boolean;
  steps: 5 | 3;
  blank: boolean;
  onAnswer: (e: AnswerEvent) => void;
  keyboardEnabled: boolean;
}

const OPTIONS_5: { value: AnswerValue; label: string }[] = [
  { value: 2, label: "当てはまる" },
  { value: 1, label: "やや当てはまる" },
  { value: 0, label: "どちらとも言えない・わからない" },
  { value: -1, label: "やや当てはまらない" },
  { value: -2, label: "当てはまらない" },
];
const OPTIONS_3: { value: AnswerValue; label: string }[] = [
  { value: 2, label: "当てはまる" },
  { value: 0, label: "どちらとも言えない・わからない" },
  { value: -2, label: "当てはまらない" },
];

/**
 * Phase 1 の縦並びボタン。§13-8「扇と縦ボタンのどちらが押しやすいか」を
 * 実測で比較できるよう、扇と切り替え可能な状態で残す。
 */
export function ButtonScale({ disabled, steps, blank, onAnswer, keyboardEnabled }: Props) {
  const options = steps === 5 ? OPTIONS_5 : OPTIONS_3;
  const [cursor, setCursor] = useState(Math.floor(options.length / 2));
  const busy = useRef(false);

  useEffect(() => setCursor(Math.floor(options.length / 2)), [options.length]);

  const commit = (index: number, gesture: "tap" | "key", position: SlotPosition | null) => {
    if (busy.current || disabled) return;
    busy.current = true;
    onAnswer({ value: options[index].value, gesture, position });
    setTimeout(() => (busy.current = false), 150);
  };

  useEffect(() => {
    if (!keyboardEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (disabled || busy.current) return;
      if (["ArrowDown", "AudioVolumeDown", "VolumeDown"].includes(e.key)) {
        e.preventDefault();
        setCursor((c) => Math.min(options.length - 1, c + 1));
      } else if (["ArrowUp", "AudioVolumeUp", "VolumeUp"].includes(e.key)) {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        commit(cursor, "key", null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardEnabled, disabled, cursor, options.length]);

  return (
    <div className="scale" role="group" aria-label="5段階で回答">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          aria-label={o.label}
          className={`scale__button ${keyboardEnabled && cursor === i ? "is-cursor" : ""}`}
          onPointerUp={(e) =>
            commit(i, "tap", {
              angleDeg: 0,
              radiusRatio: 0,
              sector: i,
              x: Math.round(e.clientX),
              y: Math.round(e.clientY),
            })
          }
        >
          <span className="answer-label">{blank ? "" : o.label}</span>
        </button>
      ))}
    </div>
  );
}
