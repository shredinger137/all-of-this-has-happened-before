import { CHILD_TASKS, TASKS } from '../sim/content';
import { formatClock, SAFETY_CUTOFF } from '../sim/constants';
import { currentIncident, earliness, isGroggy, type Results } from '../sim/engine';
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

/** Indicator lamps on the console housing. */
function Lamps({ s }: { s: GameState }) {
  const lamps = [
    { label: s.childAwake ? 'Awake' : 'Asleep', on: s.childAwake, tone: 'green' },
    { label: 'Groggy', on: isGroggy(s), tone: 'amber' },
    { label: 'Coffee', on: s.coffeeBuffer, tone: 'amber' },
    { label: 'Problem', on: !!currentIncident(s), tone: 'alarm' },
    { label: 'Late', on: s.minute >= s.departureDeadline, tone: 'alarm' },
  ];
  return (
    <div className="lamps" aria-hidden>
      {lamps.map((l) => (
        <span key={l.label} className={`lamp ${l.on ? `on ${l.tone}` : ''}`}>
          <i />
          {l.label}
        </span>
      ))}
    </div>
  );
}

type Props = {
  s: GameState;
  r?: Results;
  act: (a: Action) => void;
  onRetry: () => void;
  onReplay: () => void;
};

/** Status bar along the bottom of the console: lamps, latest message, and the leave (or wake) key. */
export function Dock({ s, r, act, onRetry, onReplay }: Props) {
  if (r) {
    return (
      <div className="dock frame screen ended">
        <div className="dock-text">
          <div className="dock-log">
            <strong>{formatClock(r.arrived)}</strong> &nbsp;{' '}
            {r.lateness > 0 ? 'Morning over. School has begun.' : 'Morning over. The bell has not gone yet.'}
          </div>
        </div>
        <div className="dock-keys">
          <button className="dock-key tone-salmon" onClick={onReplay} title="Same surprises, if you make the same choices">
            Same again
          </button>
          <button className="dock-key tone-amber" onClick={onRetry} title="New seed, new surprises">
            New morning
          </button>
        </div>
      </div>
    );
  }

  const inc = currentIncident(s);
  const leaving = s.childAwake;
  // You can walk out on most problems, but not the one at the door; waking her waits for quiet.
  const disabled = !!inc && (!leaving || inc.id === 'bathroom');
  const last = s.history[s.history.length - 1];

  return (
    <div className="dock frame screen">
      <Lamps s={s} />
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
