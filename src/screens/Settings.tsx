import { useEffect, useState } from "react";
import { deleteAllData, getAllSessions } from "../data/db";
import { canSpeakJapanese, japaneseVoices } from "../lib/speech";
import { computeMetrics, type Metrics } from "../lib/stats";
import { resetSettings, saveSettings, type Settings as S } from "../lib/settings";
import "./Settings.css";

interface Props {
  settings: S;
  onChange: (s: S) => void;
  onBack: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** §S-5 設定 */
export function Settings({ settings, onChange, onBack }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [jaAvailable, setJaAvailable] = useState(true);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    void japaneseVoices().then(setVoices);
    void canSpeakJapanese().then(setJaAvailable);
    void getAllSessions().then((s) => setMetrics(computeMetrics(s)));
  }, []);

  const set = <K extends keyof S>(key: K, value: S[K]) => {
    const next = { ...settings, [key]: value };
    saveSettings(next);
    onChange(next);
  };

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="screen settings">
      <header className="settings__top">
        <button type="button" className="text-button" onClick={onBack}>戻る</button>
        <h1 className="settings__title">設定</h1>
        <span />
      </header>

      <section className="settings__group">
        <h2>スロット</h2>
        <label>
          <span>朝スロットの開始時刻</span>
          <select
            value={settings.morningStartHour}
            onChange={(e) => set("morningStartHour", Number(e.target.value))}
          >
            {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
          </select>
        </label>
        <label>
          <span>夜スロットの開始時刻</span>
          <select
            value={settings.nightStartHour}
            onChange={(e) => set("nightStartHour", Number(e.target.value))}
          >
            {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
          </select>
        </label>
      </section>

      <section className="settings__group">
        <h2>音声</h2>
        <label>
          <span>音声読み上げ</span>
          <input
            type="checkbox"
            checked={settings.speechEnabled}
            onChange={(e) => set("speechEnabled", e.target.checked)}
          />
        </label>
        <label>
          <span>読み上げ速度 {settings.speechRate.toFixed(1)}</span>
          <input
            type="range" min={0.5} max={1.5} step={0.1}
            value={settings.speechRate}
            onChange={(e) => set("speechRate", Number(e.target.value))}
          />
        </label>
        <label>
          <span>読み上げ音声</span>
          <select
            value={settings.voiceURI ?? ""}
            onChange={(e) => set("voiceURI", e.target.value || null)}
          >
            <option value="">端末の既定</option>
            {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
          </select>
        </label>
        {!jaAvailable && (
          <p className="muted settings__warn">
            この端末に日本語音声がない。読み上げは行わず、質問文の表示のみで進む。
          </p>
        )}
      </section>

      <section className="settings__group">
        <h2>進行</h2>
        <label>
          <span>画面OFFモード</span>
          <input
            type="checkbox"
            checked={settings.screenOffMode}
            /* §10.3 画面OFFモードは音声が前提。日本語音声が使えない端末では無効化する */
            disabled={!jaAvailable || !settings.speechEnabled}
            onChange={(e) => set("screenOffMode", e.target.checked)}
          />
        </label>
        <p className="muted settings__hint">
          質問文を表示せず、音声のみで進行する。ハードウェア版の予行演習になる。
        </p>
        <label>
          <span>歯磨きタイマー</span>
          <input
            type="checkbox"
            checked={settings.timerEnabled}
            onChange={(e) => set("timerEnabled", e.target.checked)}
          />
        </label>
        <label>
          <span>タイマーの長さ</span>
          <select
            value={settings.timerSeconds}
            onChange={(e) => set("timerSeconds", Number(e.target.value))}
          >
            {[60, 90, 120, 150, 180].map((s) => (
              <option key={s} value={s}>{s / 60}分</option>
            ))}
          </select>
        </label>
        <label>
          <span>深掘りパート</span>
          <select
            value={settings.deepDive}
            onChange={(e) => set("deepDive", e.target.value as S["deepDive"])}
          >
            <option value="on">ON</option>
            <option value="nightOnly">夜のみ</option>
            <option value="off">OFF</option>
          </select>
        </label>
      </section>

      <section className="settings__group">
        <h2>入力</h2>
        <label>
          <span>入力方式</span>
          <select
            value={settings.inputMethod}
            onChange={(e) => set("inputMethod", e.target.value as S["inputMethod"])}
          >
            <option value="tap">画面タップ</option>
            <option value="external">外部ボタン</option>
          </select>
        </label>
        <label>
          <span>回答UI</span>
          <select
            value={settings.answerUI}
            onChange={(e) => set("answerUI", e.target.value as S["answerUI"])}
          >
            <option value="fan">扇</option>
            <option value="buttons">縦ボタン</option>
          </select>
        </label>
        <label>
          <span>利き手</span>
          <select
            value={settings.handedness}
            onChange={(e) => set("handedness", e.target.value as S["handedness"])}
          >
            <option value="right">右利き</option>
            <option value="left">左利き</option>
          </select>
        </label>
        <label>
          <span>段階</span>
          <select
            value={settings.scaleSteps}
            onChange={(e) => set("scaleSteps", Number(e.target.value) as S["scaleSteps"])}
          >
            <option value={5}>5段階</option>
            <option value={3}>3段階</option>
          </select>
        </label>
        <label>
          <span>ラベルを常に表示</span>
          <input
            type="checkbox"
            checked={settings.alwaysShowLabels}
            onChange={(e) => set("alwaysShowLabels", e.target.checked)}
          />
        </label>
      </section>

      {/* §12 検証指標。テスト中に自分で確認できるようにしておく */}
      {metrics && metrics.sessions > 0 && (
        <section className="settings__group">
          <h2>これまでの計測</h2>
          <dl className="settings__metrics">
            <div><dt>セッション数</dt><dd>{metrics.sessions}</dd></div>
            <div><dt>完了率（朝）</dt><dd>{pct(metrics.completionRate.morning)}</dd></div>
            <div><dt>完了率（夜）</dt><dd>{pct(metrics.completionRate.night)}</dd></div>
            <div><dt>平均レイテンシ</dt><dd>{(metrics.avgLatencyMs / 1000).toFixed(1)}秒</dd></div>
            <div><dt>訂正率</dt><dd>{pct(metrics.correctionRate)}</dd></div>
            <div><dt>無回答率</dt><dd>{pct(metrics.noAnswerRate)}</dd></div>
            <div><dt>スワイプ選択率</dt><dd>{pct(metrics.swipeRate)}</dd></div>
            <div><dt>平均問数</dt><dd>{metrics.avgQuestionsPerSession.toFixed(1)}</dd></div>
            <div><dt>平均歯磨き時間</dt><dd>{(metrics.avgBrushDurationMs / 1000).toFixed(0)}秒</dd></div>
          </dl>
          {metrics.correctionRate > 0.15 && (
            <p className="muted settings__warn">
              訂正率が15%を超えている。3段階への切替を検討すること。
            </p>
          )}
        </section>
      )}

      <section className="settings__group">
        <h2>データ</h2>
        <button
          type="button"
          className="settings__danger"
          onClick={() => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              return;
            }
            void deleteAllData().then(() => {
              setConfirmDelete(false);
              setMetrics(null);
            });
          }}
        >
          {confirmDelete ? "本当に消す。取り消せぬ" : "記録をすべて削除"}
        </button>
        {confirmDelete && (
          <button type="button" className="text-button" onClick={() => setConfirmDelete(false)}>
            やめる
          </button>
        )}
        <button type="button" className="text-button" onClick={() => onChange(resetSettings())}>
          設定を初期値に戻す
        </button>
      </section>
    </div>
  );
}
