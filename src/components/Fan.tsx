import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnswerValue, SlotPosition } from "../data/types";
import "./Fan.css";

export interface AnswerEvent {
  value: AnswerValue;
  gesture: "tap" | "swipe" | "key";
  position: SlotPosition | null;
}

interface Props {
  disabled: boolean;
  steps: 5 | 3;
  handedness: "right" | "left";
  showLabels: boolean;
  /** §S-5 画面OFFモード：回答領域は無地のまま */
  blank: boolean;
  onAnswer: (e: AnswerEvent) => void;
  /** 外部ボタン（キーボード）入力を受け付けるか */
  keyboardEnabled: boolean;
}

/* §S-2 開き角は約160度 */
const SPREAD_DEG = 160;
/* §S-2 要から半径70px以内は無効領域。親指の付け根での誤爆を防ぐ */
const DEAD_ZONE_PX = 70;
/* スワイプと判定する移動量 */
const SWIPE_THRESHOLD_PX = 24;

const LABELS_5 = ["当てはまらない", "やや", "どちらとも", "やや", "当てはまる"];
const LABELS_3 = ["当てはまらない", "どちらとも", "当てはまる"];
const VALUES_5: AnswerValue[] = [-2, -1, 0, 1, 2];
const VALUES_3: AnswerValue[] = [-2, 0, 2];

const A11Y_LABEL: Record<AnswerValue, string> = {
  [-2]: "当てはまらない",
  [-1]: "やや当てはまらない",
  [0]: "どちらとも言えない・わからない",
  [1]: "やや当てはまる",
  [2]: "当てはまる",
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/** 極座標(要基準・上が0度・右が正)から SVG 座標へ */
function polar(px: number, py: number, r: number, deg: number) {
  return { x: px + r * Math.sin(rad(deg)), y: py - r * Math.cos(rad(deg)) };
}

/** 扇面（環状セクタ）のパス */
function sectorPath(px: number, py: number, r0: number, r1: number, a0: number, a1: number): string {
  const p1 = polar(px, py, r1, a0);
  const p2 = polar(px, py, r1, a1);
  const p3 = polar(px, py, r0, a1);
  const p4 = polar(px, py, r0, a0);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${r1} ${r1} 0 0 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${r0} ${r0} 0 0 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

type Phase = "open" | "selected" | "folding" | "opening";

export function Fan({
  disabled, steps, handedness, showLabels, blank, onAnswer, keyboardEnabled,
}: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [active, setActive] = useState<number | null>(null); // スワイプ中のハイライト
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("open");
  const [cursor, setCursor] = useState(Math.floor(steps / 2)); // 外部ボタン用カーソル
  const pointer = useRef<{ startX: number; startY: number; moved: number } | null>(null);
  const busy = useRef(false);

  const values = steps === 5 ? VALUES_5 : VALUES_3;
  const labels = steps === 5 ? LABELS_5 : LABELS_3;
  const n = steps;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const { w, h } = box;
    // §S-2 要は画面下端。既定は右利き（要が画面下端のやや右）
    const px = w * (handedness === "right" ? 0.54 : 0.46);
    const py = h;
    // §S-2 半径は画面幅の0.9倍。画面外にはみ出す分はクリップされる
    const rOuter = w * 0.9;
    return { px, py, rOuter, rInner: DEAD_ZONE_PX, w, h };
  }, [box, handedness]);

  /**
   * 家紋を置く半径。全段階で共通の1つの弧に乗せる。
   * 段階ごとに半径がばらつくと「角度で選ぶ」という前提が崩れ、
   * 位置の身体化（§S-2）が効かなくなるため、最も外側の段階が画面に
   * 収まる半径を全段階に使う。
   */
  const markRadius = useMemo(() => {
    const { px, rOuter, w, h } = geo;
    if (w === 0) return 0;
    const step = SPREAD_DEG / n;
    const outerMid = Math.abs(-SPREAD_DEG / 2 + step / 2); // 端の扇面の中心角
    const sinMax = Math.sin(rad(outerMid));
    const cosMax = Math.cos(rad(outerMid));
    const limits = [rOuter];
    if (sinMax > 0.001) {
      limits.push((w - 20 - px) / sinMax); // 右端がはみ出さないこと
      limits.push((px - 20) / sinMax); // 左端がはみ出さないこと
    }
    if (cosMax > 0.001) limits.push((h - 20) / cosMax);
    return Math.max(DEAD_ZONE_PX + 30, Math.min(...limits));
  }, [geo, n]);

  const sectors = useMemo(() => {
    const { px, py, rInner, rOuter } = geo;
    const step = SPREAD_DEG / n;
    return Array.from({ length: n }, (_, i) => {
      const a0 = -SPREAD_DEG / 2 + i * step;
      const a1 = a0 + step;
      const mid = (a0 + a1) / 2;
      const mr = markRadius;
      return {
        i,
        value: values[i],
        label: labels[i],
        path: sectorPath(px, py, rInner, rOuter, a0 + 0.6, a1 - 0.6),
        mark: polar(px, py, mr, mid),
        labelPos: (() => {
          const raw = polar(px, py, Math.max(DEAD_ZONE_PX + 6, mr - 46), mid);
          // 端の扇面のラベルが画面外に切れないよう、テキスト幅ぶん内側に寄せる
          const halfW = (labels[i].length * 18) / 2;
          return { x: Math.min(geo.w - halfW - 6, Math.max(halfW + 6, raw.x)), y: raw.y };
        })(),
        /* 塗りの量で段階を示す（空円 / 1/4 / 半分 / 3/4 / 満円） */
        fillRatio: i / (n - 1),
      };
    });
  }, [geo, n, values, labels, markRadius]);

  /** ビューポート座標から扇面を引く。無効領域・範囲外は null */
  const hitTest = useCallback(
    (clientX: number, clientY: number) => {
      const el = areaRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const px = rect.left + geo.px;
      const py = rect.top + geo.py;
      const dx = clientX - px;
      const dy = py - clientY; // 上を正にする
      const r = Math.hypot(dx, dy);
      if (r < DEAD_ZONE_PX) return null; // 要から70px以内は無効
      const angle = (Math.atan2(dx, dy) * 180) / Math.PI;
      if (Math.abs(angle) > SPREAD_DEG / 2) return null;
      const idx = Math.min(n - 1, Math.floor(((angle + SPREAD_DEG / 2) / SPREAD_DEG) * n));
      return {
        index: idx,
        position: {
          angleDeg: angle,
          radiusRatio: geo.rOuter > 0 ? r / geo.rOuter : 0,
          sector: idx,
          x: Math.round(clientX),
          y: Math.round(clientY),
        } satisfies SlotPosition,
      };
    },
    [geo, n],
  );

  const reducedMotion = useMemo(
    () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  /**
   * §4.4 回答した瞬間に扇面が金茶に染まり(0.1s)、要に向かって畳まれる(0.15s)。
   * 畳み終わってから親に通知し、次の質問で開き直す(0.2s)。
   */
  const commit = useCallback(
    (index: number, gesture: "tap" | "swipe" | "key", position: SlotPosition | null) => {
      if (busy.current || disabled) return;
      busy.current = true;
      setActive(null);
      setSelected(index);
      setPhase("selected");

      const dye = reducedMotion ? 0 : 100;
      const fold = reducedMotion ? 0 : 150;
      const open = reducedMotion ? 0 : 200;

      setTimeout(() => setPhase("folding"), dye);
      setTimeout(() => {
        onAnswer({ value: values[index], gesture, position });
        setSelected(null);
        setPhase("opening");
        setTimeout(() => {
          setPhase("open");
          busy.current = false;
        }, open);
      }, dye + fold);
    },
    [disabled, onAnswer, reducedMotion, values],
  );

  /* ---- ポインタ操作。(1)扇面をタップ (2)要から指を滑らせ角度で離す ---- */
  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || busy.current) return;
    // 捕捉できない環境（ポインタIDが実在しない等）でも入力は続けられるようにする
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
    pointer.current = { startX: e.clientX, startY: e.clientY, moved: 0 };
    setActive(hitTest(e.clientX, e.clientY)?.index ?? null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointer.current;
    if (!p || disabled || busy.current) return;
    p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.startX, e.clientY - p.startY));
    setActive(hitTest(e.clientX, e.clientY)?.index ?? null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointer.current;
    pointer.current = null;
    if (!p || disabled || busy.current) {
      setActive(null);
      return;
    }
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) {
      setActive(null); // 無効領域で離した。回答としない
      return;
    }
    commit(hit.index, p.moved > SWIPE_THRESHOLD_PX ? "swipe" : "tap", hit.position);
  };

  const onPointerCancel = () => {
    pointer.current = null;
    setActive(null);
  };

  /* ---- §S-5 外部ボタン。Bluetoothシャッターリモコンは外部キーボードとして認識される ---- */
  useEffect(() => {
    if (!keyboardEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (disabled || busy.current) return;
      const dec = ["ArrowLeft", "ArrowDown", "AudioVolumeDown", "VolumeDown"];
      const inc = ["ArrowRight", "ArrowUp", "AudioVolumeUp", "VolumeUp"];
      if (dec.includes(e.key)) {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (inc.includes(e.key)) {
        e.preventDefault();
        setCursor((c) => Math.min(n - 1, c + 1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        commit(cursor, "key", null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboardEnabled, disabled, cursor, n, commit]);

  useEffect(() => {
    setCursor(Math.floor(n / 2));
  }, [n]);

  const highlight = selected ?? active ?? (keyboardEnabled ? cursor : null);

  return (
    <div
      ref={areaRef}
      className={`fan fan--${phase} ${disabled ? "fan--disabled" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      role="group"
      aria-label="5段階で回答"
    >
      <svg className="fan__svg" width={geo.w} height={geo.h} aria-hidden="true" focusable="false">
        <g
          className="fan__blades"
          style={{ transformOrigin: `${geo.px}px ${geo.py}px` }}
        >
          {sectors.map((s) => (
            <g key={s.i}>
              <path
                d={s.path}
                className={`fan__blade ${highlight === s.i ? "is-active" : ""} ${
                  selected === s.i ? "is-selected" : ""
                }`}
              />
              {!blank && (
                <>
                  {/* 家紋（円）。塗りの量で段階を示す */}
                  <circle cx={s.mark.x} cy={s.mark.y} r={17} className="fan__crest-bg" />
                  <clipPath id={`fan-clip-${s.i}`}>
                    <rect
                      x={s.mark.x - 18}
                      y={s.mark.y + 17 - 34 * s.fillRatio}
                      width={36}
                      height={34 * s.fillRatio}
                    />
                  </clipPath>
                  <circle
                    cx={s.mark.x}
                    cy={s.mark.y}
                    r={17}
                    className="fan__crest-fill"
                    clipPath={`url(#fan-clip-${s.i})`}
                  />
                  {showLabels && (
                    <text
                      x={s.labelPos.x}
                      y={s.labelPos.y}
                      className="fan__label"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {s.label}
                    </text>
                  )}
                </>
              )}
            </g>
          ))}
        </g>
      </svg>

      {/* スクリーンリーダー・キーボード用の等価な操作手段（§9 アクセシビリティ） */}
      <div className="fan__a11y">
        {sectors.map((s) => (
          <button
            key={s.i}
            type="button"
            disabled={disabled}
            aria-label={A11Y_LABEL[s.value]}
            onClick={() => commit(s.i, "tap", null)}
          />
        ))}
      </div>
    </div>
  );
}
