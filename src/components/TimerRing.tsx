import { useEffect, useState } from "react";
import "./TimerRing.css";

interface Props {
  /** 残り時間の割合 0..1 */
  remaining: number;
}

/**
 * §S-2 画面外周を1周する細線＝歯磨きタイマーの残り時間。金茶。
 * §S-2 進捗ドットは置かず、この細線の残量だけで進捗を示す。
 *
 * viewBox を引き伸ばすと dasharray が縦横で不均等に消費され、
 * 残量表示が実時間と一致しなくなる。実ピクセルで矩形を描くこと。
 */
export function TimerRing({ remaining }: Props) {
  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  const clamped = Math.min(1, Math.max(0, remaining));
  const inset = 1.5;

  return (
    <svg
      className="timer-ring"
      viewBox={`0 0 ${size.w} ${size.h}`}
      width={size.w}
      height={size.h}
      aria-hidden="true"
    >
      <rect
        x={inset}
        y={inset}
        width={Math.max(0, size.w - inset * 2)}
        height={Math.max(0, size.h - inset * 2)}
        rx={3}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - clamped}
      />
    </svg>
  );
}
