import { MOOD_LABELS } from '../sim/content';
import { formatClock } from '../sim/constants';
import type { Results } from '../sim/engine';

type Props = { r: Results; seed: number; label: string };

export function Debrief({ r, seed, label }: Props) {
  const late = r.lateness > 0;
  return (
    <div className="report-wrap">
      <div className="paper frame report-doc">
        <div className="doc-head">
          <span>After-action report</span>
          <span className="code">MORNING {String(seed).padStart(6, '0')}</span>
        </div>
        <div className="report-title">
          <div>
            <div className="context">{label}</div>
            <h2>Morning complete</h2>
            <p>Everyone got out of the house.</p>
            {r.revealed.length > 0 && <p className="revealed">{r.revealed.join(' ')}</p>}
          </div>
          <div className={`stamp ${late ? 'late' : 'ok'}`}>
            {late ? 'Late' : 'On time'}
            <small>{late ? `+${r.lateness} min` : formatClock(r.arrived)}</small>
          </div>
        </div>

        <div className="facts">
          <div className="fact">
            <div className="k">Left home</div>
            <div className="n">{formatClock(r.departed)}</div>
          </div>
          <div className="fact">
            <div className="k">Arrived</div>
            <div className={`n ${late ? 'bad' : 'good'}`}>{formatClock(r.arrived)}</div>
          </div>
          <div className="fact">
            <div className="k">Household mood</div>
            <div className="n word">
              {MOOD_LABELS[r.mood]}
            </div>
          </div>
          <div className="fact">
            <div className="k">Assessment</div>
            <div className="n">
              {r.score}
              <span className="grade">{r.grade}</span>
            </div>
          </div>
        </div>

        <div className="report-cols">
          <div>
            <h3>Completed · {r.completed.length}</h3>
            <ul>
              {r.completed.length === 0 && <li>Nothing.</li>}
              {r.completed.map((c) => (
                <li key={c}>
                  <span className="node done" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Left behind · {r.misses.length}</h3>
            <ul>
              {r.misses.length === 0 && <li>Nothing.</li>}
              {r.misses.map((m) => (
                <li key={m.id} className={m.severity}>
                  <span className="node" />
                  {m.missing}
                  {m.severity === 'severe' && <span className="sev">Serious</span>}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Notes</h3>
            <ul>
              {r.notes.map((n, i) => (
                <li key={i}>
                  <span className="t">{formatClock(n.minute)}</span>
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="report-summary">{r.summary}</p>
        <div className="doc-foot">
          <span>End of report</span>
          <span className="code">FILED {formatClock(r.arrived)} · 1/1</span>
        </div>
      </div>
    </div>
  );
}
