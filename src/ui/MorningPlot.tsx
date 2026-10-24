import { TASKS } from '../sim/content';
import { formatClock, SCHOOL_START, START_MINUTE } from '../sim/constants';
import { childRate, childStalled, currentIncident, parentRate, taskDuration } from '../sim/engine';
import type { GameState, Span } from '../sim/types';

// The plot runs from 06:30 to 08:15 in 15-minute columns.
const END = START_MINUTE + 105;
const pct = (m: number) => `${(Math.max(START_MINUTE, Math.min(END, m)) - START_MINUTE) * (100 / (END - START_MINUTE))}%`;
const width = (a: number, b: number) =>
  `${(Math.min(END, b) - Math.max(START_MINUTE, a)) * (100 / (END - START_MINUTE))}%`;

function spanTitle(sp: Span): string {
  const range = `${formatClock(sp.start)}–${formatClock(sp.end)}`;
  if (sp.kind === 'incident') return `${range} Dealing with a problem`;
  if (sp.kind === 'blocked') return `${range} ${sp.task ? TASKS[sp.task].doing : ''} (stopped)`;
  if (sp.kind === 'help') return `${range} Helping her${sp.task ? `: ${TASKS[sp.task].doing.toLowerCase()}` : ''}`;
  return `${range} ${sp.task ? TASKS[sp.task].doing : ''}`;
}

/** Where the current activity would end if nothing interrupts it. */
function projections(s: GameState) {
  const out: { lane: Span['lane']; end: number }[] = [];
  const pa = s.parentActivity;
  if (pa && pa !== 'help') {
    out.push({ lane: 'parent', end: s.minute + (taskDuration(s, pa) - s.objectives[pa].progress) / parentRate(s) });
  }
  const ca = s.childActivity;
  if (s.childAwake && ca && s.objectives[ca].status === 'active' && !childStalled(s, ca)) {
    const end = s.minute + (taskDuration(s, ca) - s.objectives[ca].progress) / childRate(s);
    out.push({ lane: 'child', end });
    if (pa === 'help') out.push({ lane: 'parent', end });
  }
  return out;
}

function Lane({ s, lane }: { s: GameState; lane: Span['lane'] }) {
  const wake = s.wokenAt ?? s.wakeMinute;
  // An open problem shows as a hostile contact on her lane (or yours, before she's up).
  const inc = currentIncident(s);
  const contactLane = s.childAwake ? 'child' : 'parent';
  return (
    <div className="track">
      {lane === 'child' && <div className="span asleep" style={{ left: 0, width: width(START_MINUTE, Math.min(wake, s.minute)) }} title="Asleep" />}
      {s.spans
        .filter((sp) => sp.lane === lane)
        .map((sp, i) => (
          <div key={i} className={`span ${sp.kind}`} style={{ left: pct(sp.start), width: width(sp.start, sp.end) }} title={spanTitle(sp)} />
        ))}
      {!s.ended &&
        projections(s)
          .filter((p) => p.lane === lane)
          .map((p, i) => (
            <div key={`p${i}`} className="span projected" style={{ left: pct(s.minute), width: width(s.minute, p.end) }} title={`Done around ${formatClock(p.end)}`} />
          ))}
      {lane === 'child' && !s.childAwake && <div className="mark" style={{ left: pct(s.wakeMinute) }} title={`Usually wakes ${formatClock(s.wakeMinute)}`} />}
      <div className="mark leave" style={{ left: pct(s.departureDeadline) }} />
      <div className="mark school" style={{ left: pct(SCHOOL_START) }} />
      {!s.ended && <div className="sweep" style={{ width: pct(s.minute) }} />}
      {!s.ended && <div className="mark now" style={{ left: pct(s.minute) }} />}
      {inc && lane === contactLane && <div className="contact" style={{ left: pct(s.minute) }} title="Problem" />}
      {lane === 'child' && s.wave && !s.ended && (
        <div className="inbound" style={{ left: pct(s.wave.at) }} title={`${s.wave.size} contacts inbound, landing ${formatClock(s.wave.at)}.`}>
          <span className="inbound-trail" style={{ width: width(s.minute, s.wave.at) }} />
          <span className="inbound-label">
            ×{s.wave.size} · {s.wave.at - s.minute}m
          </span>
        </div>
      )}
    </div>
  );
}

export function MorningPlot({ s }: { s: GameState }) {
  const ticks: number[] = [];
  for (let m = START_MINUTE; m <= END - 15; m += 15) ticks.push(m);
  return (
    <div className="plot frame" aria-label="Timeline of the morning">
      <div className="plot-tabs">
        <span className="plot-tab solid">Morning plot</span>
        <span className="plot-tab optional">06:30 – 08:15</span>
        <span className="plot-tab spacer" />
        <span className="plot-tab optional">You · her</span>
        <span className="plot-tab">{s.ended ? 'Complete' : formatClock(s.minute)}</span>
      </div>
      <div className="plot-grid">
        <span />
        <div className="track axis">
          {ticks.map((m) => {
            const leave = m === s.departureDeadline;
            const bell = m === SCHOOL_START;
            // On small screens only the start, whole hours and the two deadlines keep labels.
            const cls = leave ? 'leave' : bell ? 'school' : m === START_MINUTE || m % 60 === 0 ? '' : 'minor';
            return (
              <span key={m} className={`tick ${cls}`} style={{ left: pct(m) }}>
                {leave || bell ? (
                  <>
                    {leave ? 'LEAVE' : 'BELL'}
                    <span className="tick-time"> {formatClock(m)}</span>
                  </>
                ) : (
                  formatClock(m)
                )}
              </span>
            );
          })}
        </div>
        <span className="plot-label">You</span>
        <Lane s={s} lane="parent" />
        <span className="plot-label">Her</span>
        <Lane s={s} lane="child" />
      </div>
    </div>
  );
}

export function Ring({ value, paused, label }: { value: number; paused?: boolean; label: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`ring ${paused ? 'paused' : ''}`} width="38" height="38" viewBox="0 0 38 38" aria-hidden>
      <circle className="bg" cx="19" cy="19" r={r} />
      <circle
        className="fg"
        cx="19"
        cy="19"
        r={r}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        transform="rotate(-90 19 19)"
      />
      <text x="19" y="22" textAnchor="middle">
        {label}
      </text>
    </svg>
  );
}
