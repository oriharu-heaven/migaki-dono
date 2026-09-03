import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getAllSessions } from "../data/db";
import { CATEGORY_LABEL, type CheckInSession } from "../data/types";
import { categoryShare, dailyScores, fixedScore, shouldShowSupportNotice } from "../lib/stats";
import { downloadCsv } from "../lib/csv";
import "./History.css";

interface Props {
  onBack: () => void;
}

/** §S-4 履歴・サマリ */
export function History({ onBack }: Props) {
  const [sessions, setSessions] = useState<CheckInSession[] | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);

  useEffect(() => {
    void getAllSessions().then(setSessions);
  }, []);

  const points = useMemo(() => (sessions ? dailyScores(sessions, 7) : []), [sessions]);
  const shares = useMemo(() => (sessions ? categoryShare(sessions) : []), [sessions]);
  const showSupport = useMemo(() => (sessions ? shouldShowSupportNotice(sessions) : false), [sessions]);

  const daySessions = useMemo(
    () => (sessions && openDate ? sessions.filter((s) => s.date === openDate) : []),
    [sessions, openDate],
  );

  if (!sessions) {
    return (
      <div className="screen history">
        <header className="history__top">
          <button type="button" className="text-button" onClick={onBack}>戻る</button>
        </header>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="screen history">
        <header className="history__top">
          <button type="button" className="text-button" onClick={onBack}>戻る</button>
          <h1 className="history__title">今週の記録</h1>
          <span />
        </header>
        <p className="dono-line history__empty">記録はまだない。まずは一度、答えてみよ</p>
      </div>
    );
  }

  return (
    <div className="screen history">
      <header className="history__top">
        <button type="button" className="text-button" onClick={onBack}>戻る</button>
        <h1 className="history__title">今週の記録</h1>
        <button type="button" className="text-button" onClick={() => downloadCsv(sessions)}>
          書き出す
        </button>
      </header>

      <section className="history__section">
        <h2 className="history__heading">朝夜のスコア</h2>
        <div className="history__chart">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -24 }}>
              <CartesianGrid stroke="var(--surface)" vertical={false} />
              <XAxis dataKey="label" padding={{ left: 8, right: 8 }} tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis domain={[-6, 6]} ticks={[-6, -3, 0, 3, 6]} tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "var(--surface)", border: "none", borderRadius: 8, color: "var(--text)" }}
                formatter={(v: number, name: string) => [v, name === "morning" ? "朝" : "夜"]}
              />
              <Line type="monotone" dataKey="morning" name="morning" stroke="var(--kincha)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="night" name="night" stroke="var(--figure)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="muted history__note">スコアは固定パートの合計（-6〜+6）</p>
      </section>

      <section className="history__section">
        <h2 className="history__heading">カテゴリの出現割合</h2>
        <ul className="history__bars">
          {shares.map((s) => (
            <li key={s.category}>
              <span className="history__bar-label">{CATEGORY_LABEL[s.category]}</span>
              <span className="history__bar-track">
                <span className="history__bar-fill" style={{ width: `${Math.round(s.ratio * 100)}%` }} />
              </span>
              <span className="history__bar-value muted">{Math.round(s.ratio * 100)}%</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="history__section">
        <h2 className="history__heading">日ごとの記録</h2>
        <ul className="history__days">
          {points
            .filter((p) => p.morning !== null || p.night !== null)
            .reverse()
            .map((p) => (
              <li key={p.date}>
                <button
                  type="button"
                  className="history__day"
                  aria-expanded={openDate === p.date}
                  onClick={() => setOpenDate(openDate === p.date ? null : p.date)}
                >
                  <span>{p.label}</span>
                  <span className="muted">
                    朝 {p.morning ?? "—"} / 夜 {p.night ?? "—"}
                  </span>
                </button>
                {openDate === p.date && (
                  <div className="history__detail">
                    {daySessions.map((s) => (
                      <div key={s.id} className="history__session">
                        <p className="history__session-head muted">
                          {s.slot === "morning" ? "朝" : "夜"}・
                          {new Date(s.startedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                          ・スコア {fixedScore(s) ?? "—"}
                          {s.usedFallback && "・用意した問い"}
                        </p>
                        <ol className="history__answers">
                          {s.answers.map((a) => (
                            <li key={`${s.id}-${a.order}`}>
                              <span className="history__answer-text">{a.questionText}</span>
                              <span className="history__answer-value">
                                {a.value === null ? "無回答" : a.value > 0 ? `+${a.value}` : a.value}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
        </ul>
      </section>

      <p className="muted history__export-hint">
        記録は端末内にのみ残る。週に一度は書き出して控えを取ること。
      </p>

      {/* §7.7 ポップアップやモーダルにはしない。静かに置く */}
      {showSupport && (
        <aside className="history__support">
          <p className="muted">
            気分の記録が続けて低い。話を聞いてくれる窓口がある。
          </p>
          <p className="muted">
            こころの健康相談統一ダイヤル 0570-064-556 ／
            よりそいホットライン 0120-279-338
          </p>
        </aside>
      )}
    </div>
  );
}
