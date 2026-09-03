import { Tono } from "../components/Tono";
import { CATEGORY_LABEL, type CheckInSession } from "../data/types";
import "./Complete.css";

interface Props {
  session: CheckInSession;
  onHistory: () => void;
  onHome: () => void;
}

function duration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

/** §S-3 完了 */
export function Complete({ session, onHistory, onHome }: Props) {
  const answered = session.answers.length;

  return (
    <div className="screen complete">
      <div className="complete__figure">
        <Tono state="done" slot={session.slot} size={170} />
      </div>

      <p className="dono-line">うむ、聞き届けた</p>

      {/* §7.4 特定できない場合はこのブロックを出さない */}
      {session.inferredCategory && (
        <div className="complete__factor">
          <p className="muted complete__factor-lead">今日効いていそうなのは</p>
          <p className="complete__factor-name serif">
            「{CATEGORY_LABEL[session.inferredCategory]}」
          </p>
        </div>
      )}

      <p className="muted complete__stat">
        {duration(session.brushDurationMs)} / {answered}問
      </p>

      <div className="complete__actions">
        <button type="button" className="primary-button" onClick={onHistory}>記録を見る</button>
        <button type="button" className="text-button" onClick={onHome}>戻る</button>
      </div>
    </div>
  );
}
