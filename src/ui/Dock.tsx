import { CHILD_TASKS, TASKS } from '../sim/content';
import { formatClock, SAFETY_CUTOFF } from '../sim/constants';
import { currentIncident, earliness } from '../sim/engine';
import type { Action, GameState } from '../sim/types';

function leaveWarning(s: GameState): string {
  const missing = CHILD_TASKS.concat(['lunch', 'parentReady'])
    .filter((t) => s.objectives[t].status !== 'done')
    .map((t) => TASKS[t].missing.toLowerCase());
  if (missing.length === 0) return 'Everything important is done.';
  return `Not done: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : '.'}`;
}

function wakeWarning(s: GameState): string {
  const e = earliness(s);
  return `More time together. ${e > 0.66 ? 'Likely to be very tired.' : e > 0.33 ? "She'll probably be tired." : 'Slightly early.'}`;
}

/** Sticky strip along the bottom of the console: clock, latest log line, and the leave (or wake) key. */
export function Dock({ s, act }: { s: GameState; act: (a: Action) => void }) {
  const inc = currentIncident(s);
  const leaving = s.childAwake;
  // You can walk out on most problems, but not the one at the door; waking her waits for quiet.
  const disabled = !!inc && (!leaving || inc.id === 'bathroom');
  const left = s.departureDeadline - s.minute;
  const last = s.history[s.history.length - 1];

  return (
    <div className="dock frame screen">
      <div className="dock-time">
        <span className={left < 0 ? 'red' : 'amber'}>{formatClock(s.minute)}</span>
        <span className="micro">{left >= 0 ? `${left} min to leave` : `${-left} min over`}</span>
      </div>
      <div className="dock-text" aria-live="polite">
        <div className="dock-log">
          <strong>{formatClock(last.minute)}</strong> &nbsp; {last.text}
          {s.minute >= SAFETY_CUTOFF - 15 && ' It is getting very late.'}
        </div>
        <div className="warning">{leaving ? leaveWarning(s) : wakeWarning(s)}</div>
      </div>
      <button
        className={`dock-key ${leaving ? 'tone-red' : 'tone-amber'}`}
        disabled={disabled}
        onClick={() => act(leaving ? { type: 'leave' } : { type: 'wakeNow' })}
      >
        {leaving ? 'Leave now' : 'Wake her'}
      </button>
    </div>
  );
}
