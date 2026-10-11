import { MOOD_LABELS } from '../sim/content';
import { formatClock } from '../sim/constants';
import type { Results } from '../sim/engine';
import { MoodBar } from './StatusPanel';

type Props = { r: Results; onRetry: () => void; onReplay: () => void };

export function Debrief({ r, onRetry, onReplay }: Props) {
  const late = r.lateness > 0;
  return (
    <>
      <div className="bigresult">
        <div className="result">
          <div className="eyebrow">Left home</div>
          <div className="num">{formatClock(r.departed)}</div>
        </div>
        <div className="result">
          <div className="eyebrow">Arrived</div>
          <div className="num">{formatClock(r.arrived)}</div>
        </div>
        <div className={`result ${late ? 'negative' : 'positive'}`}>
          <div className="eyebrow">Time</div>
          <div className="num">{late ? `+${String(r.lateness).padStart(2, '0')}m` : 'ON TIME'}</div>
        </div>
        <div className="result">
          <div className="eyebrow">Assessment</div>
          <div className="num">{r.score}</div>
          <div className="small">{r.grade}</div>
        </div>
      </div>
      <div className="workarea">
        <div className="panel">
          <div className="sectionhead">
            <span className="sectitle">What got done</span>
            <span className="status green">{r.completed.length} complete</span>
          </div>
          {r.completed.length === 0 && <div className="row muted">Nothing, really.</div>}
          {r.completed.map((c) => (
            <div className="row" key={c}>
              <span className="k">
                <span className="glyph green">✓</span>
                {c}
              </span>
            </div>
          ))}
          <div className="sectionhead spaced">
            <span className="sectitle">Left behind</span>
            <span className={`status ${r.leftBehind.length ? 'amber' : 'green'}`}>{r.leftBehind.length} items</span>
          </div>
          {r.leftBehind.length === 0 && <div className="row muted">Nothing.</div>}
          {r.leftBehind.map((c) => (
            <div className="row" key={c}>
              <span className="k">
                <span className="glyph muted">·</span>
                {c}
              </span>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="sectionhead">
            <span className="sectitle">How it went</span>
            <span className="status">Household mood · {MOOD_LABELS[r.mood]}</span>
          </div>
          <MoodBar mood={r.mood} />
          <div className="report" style={{ marginTop: 16 }}>
            <div className="eyebrow">Morning notes</div>
            {r.notes.map((n, i) => (
              <p key={i}>
                <span className="muted">{formatClock(n.minute)}</span> &nbsp; {n.text}
              </p>
            ))}
          </div>
          <p className="summary" style={{ marginTop: 20 }}>
            {r.summary}
          </p>
          <button className="btnline" onClick={onRetry}>
            <span className="label">Try another morning</span>
            <span className="cost">→</span>
          </button>
          <button className="btnline" onClick={onReplay}>
            <span>
              <span className="label">Same morning again</span>
              <span className="sub">Same seed. Same surprises, if you make the same choices</span>
            </span>
            <span className="cost">↺</span>
          </button>
        </div>
      </div>
    </>
  );
}
