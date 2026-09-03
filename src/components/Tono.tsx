import type { Slot } from "../data/types";
import "./Tono.css";

export type TonoState = "idle" | "speaking" | "done";

interface Props {
  state: TonoState;
  slot: Slot;
  /** 高さ(px)。S-2では小さく扱う */
  size?: number;
}

/**
 * §4.1 キャラクター「殿」
 * ちょんまげが歯ブラシになっているのが唯一かつ最大のアイデンティティ。
 * 画像ファイルを持たず、インラインSVGで構成する。線(stroke)は使わず面(fill)のみ。
 *
 * 重要な制約：殿は回答内容に反応しない（§4.1）。
 * state に回答値を渡してはいけない。社会的望ましさバイアスで記録が歪む。
 */
export function Tono({ state, slot, size = 160 }: Props) {
  return (
    <svg
      className={`tono tono--${state}`}
      viewBox="0 0 100 132"
      height={size}
      role="img"
      aria-label="殿"
      focusable="false"
    >
      {/* 肩衣（かたぎぬ）。三角に張り出す */}
      <path d="M50 96 L96 132 L4 132 Z" fill="var(--figure)" />

      {/* 柄。まげの根本にあたる */}
      <rect className="tono__handle" x="45" y="23" width="10" height="24" rx="3" fill="var(--kincha)" />

      {/* ブラシ部（毛束） */}
      <rect className="tono__bristles" x="33" y="3" width="34" height="23" rx="6" fill="var(--kinari)" />

      {/* 顔。まん丸 */}
      <circle cx="50" cy="72" r="26" fill="var(--kinari)" />

      {/* 眉。太く短い */}
      <rect x="33" y="60" width="12" height="4" rx="2" fill="var(--sumi)" />
      <rect x="55" y="60" width="12" height="4" rx="2" fill="var(--sumi)" />

      {/* 目 */}
      <g className="tono__eyes">
        <circle cx="39" cy="72" r="3.4" fill="var(--sumi)" />
        <circle cx="61" cy="72" r="3.4" fill="var(--sumi)" />
      </g>

      {/* 夜スロット：まぶたが半分下がる */}
      {slot === "night" && (
        <>
          <rect x="34" y="66" width="11" height="6" fill="var(--kinari)" />
          <rect x="55" y="66" width="11" height="6" fill="var(--kinari)" />
        </>
      )}

      {/* 口。開閉で発話を表現 */}
      <rect className="tono__mouth" x="44" y="82" width="12" height="3" rx="1.5" fill="var(--sumi)" />

      {/* 完了：ブラシの毛先に泡が1〜2粒つく */}
      {state === "done" && (
        <g className="tono__bubbles">
          <circle cx="33" cy="8" r="4" fill="var(--kinari)" opacity="0.9" />
          <circle cx="68" cy="14" r="2.6" fill="var(--kinari)" opacity="0.75" />
        </g>
      )}
    </svg>
  );
}
